import { spawn } from 'node:child_process';

import { paint } from '../format';
import { Harness } from '../harness';
import { busPath, findViewerDist, pluginDirFor } from '../paths';
import { RunningServer, startOfficeServer } from '../server';
import { createSession } from '../session';
import { openBrowser } from './watch';

/**
 * The prefix command: `cubicle claude [args...]`.
 *
 * Mints a session, points the harness at our plugin for this run only, and
 * execs it with stdio untouched so the agent's own TUI behaves exactly as it
 * would unwrapped.
 */
export async function runHarness(harness: Harness, userArgs: string[]): Promise<number> {
  const pluginDir = pluginDirFor(harness.id);
  if (!pluginDir) {
    process.stderr.write(
      `cubicle: could not find plugins/${harness.id}. Set CUBICLE_PLUGINS_DIR to the plugins directory.\n`
    );
    return 1;
  }

  const { id: sessionId } = createSession(harness.id, userArgs);
  const args = harness.launchArgs(pluginDir, userArgs);

  // The office is cosmetic: a missing viewer build or busy port must never
  // stop the agent from launching.
  let office: RunningServer | null = null;
  if (process.env.CUBICLE_NO_SERVER !== '1') {
    const viewerDist = findViewerDist();
    if (viewerDist) {
      try {
        office = await startOfficeServer({ viewerDist });
        const url = `${office.url}/?session=${sessionId}`;
        process.stderr.write(`${paint.bold('cubicle office:')} ${url}\n`);
        if (process.env.CUBICLE_NO_OPEN !== '1') {
          openBrowser(url);
        }
      } catch {
        process.stderr.write(paint.dim('cubicle: office server failed to start; continuing\n'));
      }
    } else {
      process.stderr.write(
        paint.dim(
          `cubicle: recording session ${sessionId} (viewer not built; cubicle tail to watch)\n`
        )
      );
    }
  }

  return new Promise((resolve) => {
    const child = spawn(harness.bin, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        CUBICLE_BUS: busPath(sessionId),
        CUBICLE_SESSION: sessionId,
      },
    });

    child.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') {
        process.stderr.write(`cubicle: ${harness.bin} is not on your PATH.\n`);
      } else {
        process.stderr.write(`cubicle: failed to start ${harness.bin}: ${err.message}\n`);
      }
      resolve(1);
    });

    child.on('exit', (code, signal) => {
      office?.close();
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 0);
    });
  });
}
