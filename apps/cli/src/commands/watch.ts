import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { paint } from '../format';
import { findViewerDist } from '../paths';
import { startOfficeServer } from '../server';
import { latestSessionId, resolveSessionId } from '../session';

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

/** Serve the office for an existing or still-running session. */
export async function watchSession(options: WatchOptions): Promise<number> {
  let sessionId: string;
  let busOverride: { session: string; path: string } | undefined;

  if (options.bus) {
    const bus = resolve(options.bus);
    if (!existsSync(bus)) {
      process.stderr.write(`agentopia: no bus file at ${bus}\n`);
      return 1;
    }
    sessionId = busSessionLabel(bus);
    busOverride = { session: sessionId, path: bus };
  } else {
    const resolved = options.session ? resolveSessionId(options.session) : latestSessionId();
    if (options.session && !resolved) {
      process.stderr.write(`agentopia: no session matching "${options.session}"\n`);
      return 1;
    }
    if (!resolved) {
      process.stderr.write('agentopia: no sessions yet. Run `agentopia claude` first.\n');
      return 1;
    }
    sessionId = resolved;
  }

  const viewerDist = findViewerDist();
  if (!viewerDist) {
    process.stderr.write(
      'agentopia: viewer bundle not found. Build it with `yarn turbo build --filter=@agentopia/viewer`,\n' +
        'or set AGENTOPIA_VIEWER_DIR to a built viewer.\n'
    );
    return 1;
  }

  const running = await startOfficeServer({ viewerDist, port: options.port, busOverride });
  const replayParam = options.replay ? '&replay' : '';
  const url = `${running.url}/?session=${sessionId}${replayParam}`;
  process.stdout.write(`${paint.bold('agentopia office:')} ${url}\n`);

  if (options.open) {
    openBrowser(url);
  }

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => resolve());
    process.on('SIGTERM', () => resolve());
  });
  running.close();
  return 0;
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
