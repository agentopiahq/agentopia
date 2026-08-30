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
  const url = `${running.url}/?session=${sessionId}`;
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
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
}
