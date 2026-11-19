import { BusReader, IDLE_LEAVE_MS } from '@agentopia/core';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';

import { ContextSource, OfficeContext } from './context';
import { StopFollowing, followFile } from './follow';
import { Harness, contextReaders, harnessFor, usageReaders } from './harness';
import { busPath } from './paths';
import {
  SessionSummary,
  latestHarnessSession,
  listSessions,
  liveSessions,
  readSessionSummary,
  readSummaryFromBus,
  resolveSessionId,
} from './session';
import { ModelsDevPrices, OfficeUsage, UsageSource } from './usage';
import { VERSION } from './version';
import { ViewerBundle } from './viewerBundle';

/**
 * The office server: the viewer's static bundle plus a Server-Sent-Events
 * stream of normalized session events. Deliberately dumb — no animation state
 * lives here; the browser runs the director. Binds to 127.0.0.1: session
 * recordings are private by default.
 *
 * Two shapes of stream. `/events?session=<id>` is one bus, which is what the
 * scrubber and replay want. Bare `/events` is the floor: every live bus
 * multiplexed on one stream, each event tagged with its bus, new buses picked
 * up as they appear. One stream rather than one per session because browsers
 * cap open connections per host at about six, and each stream holds one.
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** How often the floor stream looks for buses that appeared since it started. */
export const DISCOVERY_INTERVAL_MS = 2000;

export interface OfficeServerOptions {
  viewerDist: string;
  port?: number;
  host?: string;
  /**
   * Serve this bus file under this session id (`watch --bus`). Fixed at
   * startup on purpose: the id is just a label for the URL, and a network
   * request can never name a filesystem path.
   */
  busOverride?: { session: string; path: string };
  /** Test hook: how often the floor stream rescans for new buses. */
  discoveryIntervalMs?: number;
  /**
   * Where `/api/usage` reads token usage from: every harness's own records
   * (`usageReaders`) unless told otherwise, or nowhere (`null`, a 404).
   */
  usage?: UsageSource | null;
  /**
   * Where `/api/context` reads each session's context from: every harness's
   * own records (`contextReaders`) unless told otherwise, or nowhere (`null`).
   */
  context?: ContextSource | null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function serveStatic(
  res: ServerResponse,
  root: string,
  urlPath: string,
  bundle: ViewerBundle | null
): void {
  if (bundle) {
    const file = bundle.get(urlPath);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file.path)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(file.body);
    return;
  }

  const clean = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, clean === '/' || clean === '.' ? 'index.html' : clean);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    // SPA fallback: unknown paths get the shell.
    file = join(root, 'index.html');
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}

function openStream(res: ServerResponse): () => void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);
  heartbeat.unref?.();
  return () => clearInterval(heartbeat);
}

/**
 * Tail one bus onto a stream, tagging every event with the bus it came from
 * and the harness that recorded it.
 */
function followBus(
  res: ServerResponse,
  bus: string,
  path: string,
  harness: Harness
): StopFollowing {
  // One reader per bus per connection so seq is always counted from line 0.
  const reader = new BusReader((record) => harness.normalize(record));
  return followFile({ path }, (line, live) => {
    const sequenced = reader.push(line);
    if (sequenced) {
      res.write(`data: ${JSON.stringify({ ...sequenced, bus, harness: harness.id, live })}\n\n`);
    }
  });
}

function streamOne(res: ServerResponse, bus: string, path: string, harness: Harness): () => void {
  const closeStream = openStream(res);
  const stop = followBus(res, bus, path, harness);
  return () => {
    closeStream();
    stop();
  };
}

/**
 * How recently a bus must have been written to join the floor. The office
 * walks a session out once it has been quiet this long, so a bus quieter
 * than that has nobody at a desk: catching it up on connect would only seat
 * it again for another spell after every reload. Harnesses do not always say
 * goodbye (archiving a Claude Code thread fires no SessionEnd), so this,
 * not `ended`, is what keeps an old session off a fresh page. A quiet bus
 * that is written again is picked up by the next scan, like a new one.
 */
export const FLOOR_WINDOW_MS = IDLE_LEAVE_MS;

/**
 * The floor: every bus written within `FLOOR_WINDOW_MS`, most recently
 * written first, so the office seats the freshest sessions when there are
 * more than it has desks for. A bus that appears later (a new session, or a
 * quiet one resuming) is picked up on the next scan; one that goes quiet
 * keeps its follower, which backs off on its own, so a resumed session
 * continues on the same seq numbering.
 */
function streamAll(res: ServerResponse, options: OfficeServerOptions): () => void {
  const closeStream = openStream(res);
  const followers = new Map<string, StopFollowing>();

  const attach = (summary: SessionSummary): void => {
    if (followers.has(summary.id)) {
      return;
    }
    // A bus from a harness this build does not know is left off the floor
    // rather than read with another harness's adapter.
    const harness = harnessFor(summary.harness);
    if (!harness) {
      return;
    }
    followers.set(summary.id, followBus(res, summary.id, busPath(summary.id), harness));
  };

  const scan = (): void => {
    for (const summary of liveSessions(Date.now(), FLOOR_WINDOW_MS)) {
      attach(summary);
    }
  };
  scan();
  const discovery = setInterval(scan, options.discoveryIntervalMs ?? DISCOVERY_INTERVAL_MS);
  discovery.unref?.();

  return () => {
    clearInterval(discovery);
    closeStream();
    for (const stop of followers.values()) {
      stop();
    }
  };
}

/**
 * Resolve a request's `session` parameter to a bus file: the override wins
 * when it matches, then a named session, then the most recently written one.
 */
function resolveBus(
  requested: string,
  options: OfficeServerOptions
): { bus: string; path: string; summary: SessionSummary | null } | null {
  const override = options.busOverride;
  if (override && requested === override.session) {
    return {
      bus: override.session,
      path: override.path,
      summary: readSummaryFromBus(override.path, override.session),
    };
  }
  const sessionId = resolveSessionId(requested);
  if (!sessionId) {
    return null;
  }
  return { bus: sessionId, path: busPath(sessionId), summary: readSessionSummary(sessionId) };
}

/**
 * `/api/context?session=<bus>`: that desk's context in full, for the
 * breakdown. Bare `/api/context`: how full every live bus's context is, for
 * the monitors.
 */
function serveContext(res: ServerResponse, url: URL, context: ContextSource | null): void {
  if (!context) {
    sendJson(res, 404, { error: 'no context source' });
    return;
  }
  const requested = url.searchParams.get('session');
  if (requested) {
    context.report(requested).then(
      (report) =>
        report ? sendJson(res, 200, report) : sendJson(res, 404, { error: 'no context' }),
      () => sendJson(res, 500, { error: 'could not read context' })
    );
    return;
  }
  const buses = liveSessions(Date.now(), FLOOR_WINDOW_MS).map((s) => s.id);
  context.glances(buses).then(
    (sessions) => sendJson(res, 200, { sessions }),
    () => sendJson(res, 500, { error: 'could not read context' })
  );
}

function handle(
  req: IncomingMessage,
  res: ServerResponse,
  options: OfficeServerOptions,
  usage: UsageSource | null,
  context: ContextSource | null,
  bundle: ViewerBundle | null
): void {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/context') {
    serveContext(res, url, context);
    return;
  }

  if (url.pathname === '/api/usage') {
    if (!usage) {
      sendJson(res, 404, { error: 'no usage source' });
      return;
    }
    usage.report(Date.now()).then(
      (report) => sendJson(res, 200, report),
      () => sendJson(res, 500, { error: 'could not read usage' })
    );
    return;
  }

  if (url.pathname === '/api/server') {
    // Who is on this port: how `status` and `stop` know a server record's
    // pid is still this server, not a reused pid or another app.
    sendJson(res, 200, { pid: process.pid, version: VERSION });
    return;
  }

  if (url.pathname === '/api/sessions') {
    const now = Date.now();
    const live = new Set(liveSessions(now).map((s) => s.id));
    sendJson(res, 200, {
      sessions: listSessions(30).map((s) => ({
        id: s.id,
        harness: s.harness,
        cwd: s.cwd,
        startedAt: s.ts,
        updatedAt: s.updatedAt,
        ended: s.ended,
        live: live.has(s.id),
        harnessSession: s.harnessSession,
      })),
    });
    return;
  }

  if (url.pathname === '/events') {
    const requested = url.searchParams.get('session');
    if (!requested) {
      const cleanup = streamAll(res, options);
      req.on('close', cleanup);
      return;
    }

    const resolved = resolveBus(requested, options);
    if (!resolved || !existsSync(resolved.path)) {
      sendJson(res, 404, { error: 'no such session' });
      return;
    }
    const harness = resolved.summary ? harnessFor(resolved.summary.harness) : null;
    if (!harness) {
      sendJson(res, 500, {
        error: `unknown harness ${resolved.summary?.harness ?? '(empty bus)'}`,
      });
      return;
    }
    const cleanup = streamOne(res, resolved.bus, resolved.path, harness);
    req.on('close', cleanup);
    return;
  }

  serveStatic(res, options.viewerDist, url.pathname, bundle);
}

/** Every harness's usage reader, priced from models.dev when it can be reached. */
function defaultUsage(): OfficeUsage {
  const readers = usageReaders();
  return new OfficeUsage(readers, new ModelsDevPrices(readers.map((r) => r.harness)));
}

/** Every harness's context reader, each bus read on the harness session it is on now. */
function defaultContext(options: OfficeServerOptions): OfficeContext {
  return new OfficeContext(contextReaders(), (bus) => {
    const resolved = resolveBus(bus, options);
    const session = resolved ? latestHarnessSession(resolved.path) : undefined;
    return resolved?.summary && session ? { harness: resolved.summary.harness, session } : null;
  });
}

export interface RunningServer {
  server: Server;
  port: number;
  url: string;
  close(): void;
}

/** Start on the requested port, walking upward if it is taken. Port 0 asks the OS. */
export function startOfficeServer(options: OfficeServerOptions): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  const basePort = options.port ?? 7777;
  // One set of readers for the server's life, so records are read once and then followed.
  const usage = options.usage === undefined ? defaultUsage() : options.usage;
  const context = options.context === undefined ? defaultContext(options) : options.context;
  // Read once, so the server keeps serving its own viewer through an upgrade.
  const bundle = ViewerBundle.load(options.viewerDist);

  const attempt = (port: number, remaining: number): Promise<RunningServer> =>
    new Promise((resolve, reject) => {
      const server = createServer((req, res) => handle(req, res, options, usage, context, bundle));
      server.once('error', (err: Error & { code?: string }) => {
        if (err.code === 'EADDRINUSE' && remaining > 0 && port !== 0) {
          resolve(attempt(port + 1, remaining - 1));
        } else {
          reject(err);
        }
      });
      server.listen(port, host, () => {
        const bound = (server.address() as AddressInfo).port;
        resolve({
          server,
          port: bound,
          url: `http://${host === '127.0.0.1' ? 'localhost' : host}:${bound}`,
          close: () => {
            server.close();
            // An open office tab holds its SSE socket forever; without this
            // the wrapper never returns to the shell after the agent exits.
            server.closeAllConnections();
          },
        });
      });
    });

  return attempt(basePort, 20);
}
