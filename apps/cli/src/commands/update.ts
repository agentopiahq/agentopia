import { spawnSync } from 'node:child_process';

import { paint } from '../format';
import { bundleDir } from '../paths';
import { runningServer } from '../serverRecord';
import { isNewer } from '../update/semver';
import { Updater, isCheckout } from '../update/updater';
import { VERSION } from '../version';

/**
 * `agentopia update` (or `upgrade`): update now, without waiting for the
 * background check or a quiet office. Downloads the latest release into the
 * version store, then restarts the office on it if one is running in the
 * background. `--check` only says whether there is one. Works whether or not
 * updates download on their own (`AGENTOPIA_AUTO_UPDATE`).
 */
export async function runUpdate(args: string[], updater: Updater = new Updater()): Promise<number> {
  const checkOnly = args.includes('--check');
  const here = bundleDir();
  if (here && isCheckout(here)) {
    process.stdout.write(
      `This agentopia (${VERSION}) is built from a clone of the repo, which never updates itself.\n` +
        paint.dim('Pull and rebuild instead: git pull && yarn --cwd apps/cli build\n')
    );
    return 1;
  }

  const result = await updater.check(Date.now(), true);
  if (result.kind === 'failed') {
    process.stderr.write(`agentopia: could not check for updates: ${result.error}\n`);
    return 1;
  }

  if (result.kind === 'available') {
    const { version } = result.release;
    if (checkOnly) {
      process.stdout.write(
        `agentopia ${version} is out (this is ${updater.newestHeld()}). ` +
          'agentopia update installs it.\n'
      );
      return 0;
    }
    process.stdout.write(`Downloading agentopia ${version}...\n`);
    try {
      await updater.prepare(result.release);
    } catch (err) {
      process.stderr.write(`agentopia: could not update: ${(err as Error).message}\n`);
      return 1;
    }
    process.stdout.write(`${paint.green('ok  ')} agentopia ${version} is installed.\n`);
  } else {
    process.stdout.write(`agentopia ${result.version} is the latest.\n`);
    if (checkOnly) {
      return 0;
    }
  }

  const newest = updater.newestHeld();
  const server = await runningServer();
  if (!server) {
    return 0;
  }
  if (!isNewer(newest, server.version)) {
    return 0;
  }
  if (!server.detached) {
    process.stdout.write(
      `The office in the foreground is still on ${server.version}; ` +
        'stop agentopia watch in its terminal and start it again to switch.\n'
    );
    return 0;
  }
  // `start` from the new version stops the old office and serves the new one
  // on the same port; every open tab offers to reload.
  const bundle = updater.store.bundle(newest) ?? process.argv[1];
  if (!bundle) {
    return 1;
  }
  process.stdout.write(`Restarting the office on agentopia ${newest}...\n`);
  const restart = spawnSync(
    process.execPath,
    [bundle, 'start', '--no-open', '--port', String(server.port)],
    {
      stdio: 'inherit',
      env: process.env,
    }
  );
  return restart.status ?? 1;
}
