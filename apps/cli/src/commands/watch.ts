import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { paint } from '../format';
import { findViewerDist } from '../paths';
import { startOfficeServer } from '../server';
import {
  ServerRecord,
  clearServerRecord,
  runningServer,
  stopServer,
  writeServerRecord,
} from '../serverRecord';
import { resolveSessionId } from '../session';
import { startAutoUpdate } from '../update/autoUpdate';
import { officeQuiet } from '../update/quiet';
import { VersionStore } from '../update/store';
import { VERSION } from '../version';
import { noteInstalls, refreshInstalls } from './install';
import { spawnServer } from './spawnServer';

export interface WatchOptions {
  session?: string;
  /** Serve this bus file directly instead of a session from the sessions dir. */
  bus?: string;
  port?: number;
  /** Open the default browser once serving. */
  open: boolean;
  /**
   * Re-animate the recording from the start instead of showing its final
   * scene. Playback speed is the viewer's own control, not a flag.
   */
  replay?: boolean;
}

/**
 * Parse `watch` arguments. Flag values must not be mistaken for the session
 * name — `watch --port 7788` is a port, not a session filter.
 */
export function parseWatchArgs(args: string[]): WatchOptions {
  const out: WatchOptions = { open: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port') {
      const value = Number(args[++i]);
      if (Number.isFinite(value)) {
        out.port = value;
      }
    } else if (arg === '--bus') {
      out.bus = args[++i];
    } else if (arg === '--replay') {
      out.replay = true;
    } else if (arg === '--no-open') {
      out.open = false;
    } else if (!arg.startsWith('-') && out.session === undefined) {
      out.session = arg;
    }
  }
  return out;
}

/**
 * A display id for a standalone bus file: the basename, kept URL- and
 * filesystem-safe since the viewer echoes it back as a query parameter.
 */
export function busSessionLabel(path: string): string {
  const label = basename(path)
    .replace(/\.jsonl$/, '')
    .replace(/[^A-Za-z0-9._-]/g, '-');
  return label || 'bus';
}

/**
 * Serve the office. With no session named, it is the floor: every live
 * session at once, live only. With one, it is that session, with the
 * scrubber — and `--replay` re-animates it from the start.
 */
export async function watchSession(options: WatchOptions): Promise<number> {
  let sessionId: string | null = null;
  let busOverride: { session: string; path: string } | undefined;

  if (options.bus) {
    const bus = resolve(options.bus);
    if (!existsSync(bus)) {
      process.stderr.write(`agentopia: no bus file at ${bus}\n`);
      return 1;
    }
    sessionId = busSessionLabel(bus);
    busOverride = { session: sessionId, path: bus };
  } else if (options.session) {
    sessionId = resolveSessionId(options.session);
    if (!sessionId) {
      process.stderr.write(`agentopia: no session matching "${options.session}"\n`);
      return 1;
    }
  } else if (options.replay) {
    process.stderr.write('agentopia: --replay needs a session or --bus; the floor is live only.\n');
    return 1;
  }

  const viewerDist = requireViewerDist();
  if (!viewerDist) {
    return 1;
  }

  // The floor is one per agentopia home: open the one already running, from
  // `agentopia start` or another terminal, rather than a second on the next port.
  if (!sessionId) {
    const existing = await floorToReuse();
    if (existing) {
      announceRunning(existing, options.open);
      return 0;
    }
  }

  const detached = process.env.AGENTOPIA_DETACHED === '1';
  const stamp = (): string => (detached ? `[${new Date().toISOString()}] ` : '');
  let running = await startOfficeServer({ viewerDist, port: options.port, busOverride });
  const replayParam = options.replay ? '&replay' : '';
  const url = sessionId ? `${running.url}/?session=${sessionId}${replayParam}` : `${running.url}/`;
  if (detached) {
    process.stdout.write(`${stamp()}agentopia ${VERSION}, pid ${process.pid}: `);
  }
  process.stdout.write(`${paint.bold('agentopia office:')} ${url}\n`);

  const record = (): void =>
    writeServerRecord({
      pid: process.pid,
      port: running.port,
      url: running.url,
      version: VERSION,
      startedAt: Date.now(),
      detached,
    });
  if (!sessionId) {
    record();
  }
  if (options.open) {
    openBrowser(url);
  }
  if (!sessionId) {
    if (detached) {
      // `start` set the plugin up before spawning this; a server that an
      // update started brings it up to date with its own version here.
      refreshInstalls();
    } else {
      noteInstalls();
    }
  }

  let switched = false;
  let finish: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
    process.on('SIGINT', () => resolve());
    process.on('SIGTERM', () => resolve());
    // Closing the terminal: shut down cleanly so the record goes with it.
    process.on('SIGHUP', () => resolve());
  });

  const updates = sessionId
    ? null
    : startAutoUpdate({
        detached,
        quiet: () => officeQuiet(),
        log: (line) => process.stdout.write(`${stamp()}${paint.dim(line)}\n`),
        switchTo: async (bundle, version) => {
          const port = running.port;
          running.close();
          clearServerRecord(process.pid);
          const next = spawnServer(bundle, port);
          const up = await next.ready;
          if (up && up !== 'exited') {
            process.stdout.write(
              `${stamp()}handed the office to agentopia ${version}, pid ${up.pid}\n`
            );
            switched = true;
            finish();
            return true;
          }
          // It would not start: never pick it again, and carry on as before.
          next.kill();
          const store = new VersionStore();
          store.markBad(version);
          store.setCurrent(store.has(VERSION) ? VERSION : null);
          process.stdout.write(
            `${stamp()}agentopia ${version} did not start; staying on ${VERSION}. ` +
              'It will not be tried again.\n'
          );
          running = await startOfficeServer({ viewerDist, port, busOverride });
          record();
          return false;
        },
      });

  await done;
  updates?.stop();
  if (!switched) {
    running.close();
    if (!sessionId) {
      clearServerRecord(process.pid);
    }
  }
  if (detached && !switched) {
    process.stdout.write(`${stamp()}stopped\n`);
  }
  return 0;
}

/** The built viewer, or null after saying how to build one. */
export function requireViewerDist(): string | null {
  const viewerDist = findViewerDist();
  if (!viewerDist) {
    process.stderr.write(
      'agentopia: viewer bundle not found. Build it with `yarn turbo build --filter=@agentopia/viewer`,\n' +
        'or set AGENTOPIA_VIEWER_DIR to a built viewer.\n'
    );
  }
  return viewerDist;
}

/**
 * The floor server to open instead of starting one: the one running now, if
 * it is this version. One left from another version is stopped, so an
 * upgrade never leaves the old office serving.
 */
export async function floorToReuse(): Promise<ServerRecord | null> {
  const existing = await runningServer();
  if (!existing || existing.version === VERSION) {
    return existing;
  }
  process.stdout.write(
    paint.dim(`Stopping the office from agentopia ${existing.version} (pid ${existing.pid}).\n`)
  );
  if (!(await stopServer(existing))) {
    process.stderr.write(
      `agentopia: could not stop the office at pid ${existing.pid}; leaving it running.\n`
    );
    return existing;
  }
  return null;
}

export function announceRunning(record: ServerRecord, open: boolean): void {
  const url = `${record.url}/`;
  process.stdout.write(
    `${paint.bold('agentopia office:')} ${url} ${paint.dim(`(already running, pid ${record.pid})`)}\n`
  );
  if (open) {
    openBrowser(url);
  }
}

export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
  // A missing opener (xdg-open-less Linux, or Windows where `start` is a cmd
  // builtin) must not crash the wrapper out from under a running agent.
  child.on('error', () => {
    process.stderr.write(`agentopia: could not open a browser; visit ${url} yourself\n`);
  });
  child.unref();
}
