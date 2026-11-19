import { pathToFileURL } from 'node:url';

import { bundleDir } from '../paths';
import { VERSION } from '../version';
import { isNewer } from './semver';
import { VersionStore } from './store';
import { isCheckout } from './updater';

/**
 * The bundle a command should run instead of this one: the version store's
 * `current`, when it is newer than this copy. Null to run this copy: nothing
 * newer is stored, this is a checkout of the repo (which always runs its own
 * code), or `AGENTOPIA_NO_HANDOFF=1`.
 *
 * Only ever newer, so a hand-off can never loop: the copy handed to is
 * `current` itself, and hands off to nothing.
 */
export function handOffTarget(
  store: VersionStore = new VersionStore(),
  version: string = VERSION,
  env: Record<string, string | undefined> = process.env,
  here: string | null = bundleDir()
): string | null {
  if (env.AGENTOPIA_NO_HANDOFF === '1' || (here !== null && isCheckout(here))) {
    return null;
  }
  const current = store.current();
  return current && isNewer(current, version) ? store.bundle(current) : null;
}

/**
 * Run the newer copy in this process, in place of this one: it reads the
 * same arguments, and `process.argv[1]` is pointed at it so anything that
 * re-runs agentopia (`start` spawning the server) runs it too. Resolves
 * false when there is nothing to hand off to.
 */
export async function handOff(): Promise<boolean> {
  let target: string | null;
  try {
    target = handOffTarget();
  } catch {
    return false;
  }
  if (!target) {
    return false;
  }
  process.argv[1] = target;
  await import(pathToFileURL(target).href);
  return true;
}
