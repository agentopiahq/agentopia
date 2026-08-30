import { spawn } from 'node:child_process';

import { paint } from '../format';
import { Harness } from '../harness';
import { busPath, pluginDirFor } from '../paths';
import { createSession } from '../session';

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

  process.stderr.write(
    paint.dim(`cubicle: recording session ${sessionId} (cubicle tail to watch)\n`)
  );

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
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 0);
    });
  });
}
