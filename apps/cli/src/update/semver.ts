/**
 * Just enough of semver for updating: plain `major.minor.patch` releases,
 * compared by number. A prerelease (`1.2.0-next.1`) or anything else is not a
 * release, and the updater never moves to one on its own.
 */

const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Is `version` a plain release, such as `0.3.0`? */
export function isRelease(version: string): boolean {
  return RELEASE.test(version);
}

function parts(version: string): [number, number, number] | null {
  const match = RELEASE.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/**
 * Below zero when `a` is older than `b`, above when newer, zero when the same.
 * Anything that is not a plain release sorts below every release.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) {
    return (pa ? 1 : 0) - (pb ? 1 : 0);
  }
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
}

/** Is `a` a release strictly newer than `b`? */
export function isNewer(a: string, b: string): boolean {
  return isRelease(a) && compareVersions(a, b) > 0;
}
