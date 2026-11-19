import { spawn } from 'node:child_process';

import { paint } from '../format';
import { Harness } from '../harness';
import { busPath, findViewerDist, pluginDirFor } from '../paths';
import { RunningServer, startOfficeServer } from '../server';
import { createSession } from '../session';
import { refreshInstall } from './install';
import { openBrowser } from './watch';

/**
 * The prefix command: `agentopia claude [args...]`.
 *
 * Mints a session, points the harness at our plugin for this run only, and
 * execs it with stdio untouched so the agent's own TUI behaves exactly as it
 * would unwrapped.
 */
export async function runHarness(harness: Harness, userArgs: string[]): Promise<number> {
  const pluginDir = pluginDirFor(harness.id);
  if (!pluginDir) {
    process.stderr.write(
      `agentopia: could not find plugins/${harness.id}. Set AGENTOPIA_PLUGINS_DIR to the plugins directory.\n`
    );
    return 1;
  }

  const { id: sessionId } = createSession(harness.id, userArgs);
  // With the plugin installed for good, the agent loads it anyway and the
  // wrapper only names the bus; loading it here too would record every event
  // twice.
  const args = refreshInstall(harness) ? userArgs : harness.launchArgs(pluginDir, userArgs);

  // The office is cosmetic: a missing viewer build or busy port must never
  // stop the agent from launching.
  let office: RunningServer | null = null;
  if (process.env.AGENTOPIA_NO_SERVER !== '1') {
    const viewerDist = findViewerDist();
    if (viewerDist) {
      try {
        office = await startOfficeServer({ viewerDist });
        const url = `${office.url}/?session=${sessionId}`;
        process.stderr.write(`${paint.bold('agentopia office:')} ${url}\n`);
        if (process.env.AGENTOPIA_NO_OPEN !== '1') {
          openBrowser(url);
        }
      } catch {
        process.stderr.write(paint.dim('agentopia: office server failed to start; continuing\n'));
      }
    } else {
      process.stderr.write(
        paint.dim(`agentopia: recording session ${sessionId} (viewer not built)\n`)
      );
    }
  }

  return new Promise((resolve) => {
    const child = spawn(harness.bin, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        AGENTOPIA_BUS: busPath(sessionId),
        AGENTOPIA_SESSION: sessionId,
      },
    });

    child.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') {
        process.stderr.write(`agentopia: ${harness.bin} is not on your PATH.\n`);
      } else {
        process.stderr.write(`agentopia: failed to start ${harness.bin}: ${err.message}\n`);
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
