import { spawn } from 'node:child_process';

import { paint } from '../format';
import { findViewerDist } from '../paths';
import { startOfficeServer } from '../server';
import { latestSessionId, resolveSessionId } from '../session';

export interface WatchOptions {
  session?: string;
  port?: number;
  /** Open the default browser once serving. */
  open: boolean;
  /** Re-animate the recording at this speed instead of showing its final scene. */
  replay?: number;
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
    } else if (arg === '--replay') {
      // Optional value: `--replay 2` is 2x speed, bare `--replay` is 1x.
      const peek = Number(args[i + 1]);
      if (Number.isFinite(peek) && !args[i + 1]?.startsWith('-')) {
        out.replay = peek;
        i++;
      } else {
        out.replay = 1;
      }
    } else if (arg === '--no-open') {
      out.open = false;
    } else if (!arg.startsWith('-') && out.session === undefined) {
      out.session = arg;
    }
  }
  return out;
}

/** Serve the office for an existing or still-running session. */
export async function watchSession(options: WatchOptions): Promise<number> {
  const sessionId = options.session ? resolveSessionId(options.session) : latestSessionId();
  if (options.session && !sessionId) {
    process.stderr.write(`cubicle: no session matching "${options.session}"\n`);
    return 1;
  }
  if (!sessionId) {
    process.stderr.write('cubicle: no sessions yet. Run `cubicle claude` first.\n');
    return 1;
  }

  const viewerDist = findViewerDist();
  if (!viewerDist) {
    process.stderr.write(
      'cubicle: viewer bundle not found. Build it with `yarn turbo build --filter=@cubicle/viewer`,\n' +
        'or set CUBICLE_VIEWER_DIR to a built viewer.\n'
    );
    return 1;
  }

  const running = await startOfficeServer({ viewerDist, port: options.port });
  const replayParam = options.replay ? `&replay=${options.replay}` : '';
  const url = `${running.url}/?session=${sessionId}${replayParam}`;
  process.stdout.write(`${paint.bold('cubicle office:')} ${url}\n`);

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
    process.stderr.write(`cubicle: could not open a browser; visit ${url} yourself\n`);
  });
  child.unref();
}
