import { BusReader } from '@agentopia/core';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { followFile } from './follow';
import { Harness, harnessFor } from './harness';
import { busPath } from './paths';
import { listSessions, readSessionSummary, resolveSessionId } from './session';

/**
 * The office server: the viewer's static bundle plus a Server-Sent-Events
 * stream of normalized session events. Deliberately dumb — no animation state
 * lives here; the browser runs the director. Binds to 127.0.0.1: session
 * recordings are private by default.
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

export interface OfficeServerOptions {
  viewerDist: string;
  port?: number;
  host?: string;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function serveStatic(res: ServerResponse, root: string, urlPath: string): void {
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

function streamEvents(res: ServerResponse, sessionId: string, harness: Harness): () => void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');

  // One reader per connection so seq is always counted from line 0.
  const reader = new BusReader((record) => harness.normalize(record));
  const stop = followFile({ path: busPath(sessionId) }, (line, live) => {
    const sequenced = reader.push(line);
    if (sequenced) {
      res.write(`data: ${JSON.stringify({ ...sequenced, live })}\n\n`);
    }
  });

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);
  heartbeat.unref?.();

  return () => {
    clearInterval(heartbeat);
    stop();
  };
}

function handle(req: IncomingMessage, res: ServerResponse, options: OfficeServerOptions): void {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/sessions') {
    sendJson(res, 200, {
      sessions: listSessions(30).map((s) => ({
        id: s.id,
        harness: s.harness,
        cwd: s.cwd,
        startedAt: s.ts,
        harnessSession: s.harnessSession,
      })),
    });
    return;
  }

  if (url.pathname === '/events') {
    const requested = url.searchParams.get('session');
    const sessionId = requested ? resolveSessionId(requested) : (listSessions(1)[0]?.id ?? null);
    if (!sessionId || !existsSync(busPath(sessionId))) {
      sendJson(res, 404, { error: 'no such session' });
      return;
    }
    const summary = readSessionSummary(sessionId);
    const harness = harnessFor(summary?.harness ?? 'claude');
    if (!harness) {
      sendJson(res, 500, { error: `unknown harness ${summary?.harness}` });
      return;
    }
    const cleanup = streamEvents(res, sessionId, harness);
    req.on('close', cleanup);
    return;
  }

  serveStatic(res, options.viewerDist, url.pathname);
}

export interface RunningServer {
  server: Server;
  port: number;
  url: string;
  close(): void;
}

/** Start on the requested port, walking upward if it is taken. */
export function startOfficeServer(options: OfficeServerOptions): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  const basePort = options.port ?? 7777;

  const attempt = (port: number, remaining: number): Promise<RunningServer> =>
    new Promise((resolve, reject) => {
      const server = createServer((req, res) => handle(req, res, options));
      server.once('error', (err: Error & { code?: string }) => {
        if (err.code === 'EADDRINUSE' && remaining > 0) {
          resolve(attempt(port + 1, remaining - 1));
        } else {
          reject(err);
        }
      });
      server.listen(port, host, () => {
        resolve({
          server,
          port,
          url: `http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`,
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
