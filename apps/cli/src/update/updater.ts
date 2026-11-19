import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { agentopiaHome } from '../paths';
import { VERSION } from '../version';
import { Fetch, REGISTRY, Release, downloadRelease, fetchLatest } from './registry';
import { isNewer } from './semver';
import { VersionStore } from './store';
import { readTarball } from './tar';

/**
 * Keeping agentopia up to date: ask npm for the latest release at most every
 * `CHECK_TTL_MS`, download it into the version store, and point `current` at
 * it. The running server then switches over (`autoUpdate.ts`), and every
 * `agentopia` command runs the new copy (`handoff.ts`).
 */

/** How long npm's answer is good for between checks. */
export const CHECK_TTL_MS = 6 * 60 * 60 * 1000;
/** After a failed check, how long before trying again. */
export const CHECK_RETRY_MS = 60 * 60 * 1000;

type Env = Record<string, string | undefined>;

/** The registry to ask: npm's, or `AGENTOPIA_REGISTRY` (a mirror, or a test's). */
export function registryUrl(env: Env = process.env): string {
  return (env.AGENTOPIA_REGISTRY || REGISTRY).replace(/\/+$/, '');
}

/**
 * Why updates never download on their own here, or null when they may:
 * `AGENTOPIA_AUTO_UPDATE=0` (or `false`, `off`, `no`), or a CI run.
 * `agentopia update` still works either way.
 */
export function autoUpdateOff(env: Env = process.env): string | null {
  const setting = (env.AGENTOPIA_AUTO_UPDATE ?? '').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(setting)) {
    return 'AGENTOPIA_AUTO_UPDATE is off';
  }
  if (env.CI && env.CI !== '0' && env.CI !== 'false') {
    return 'running in CI';
  }
  return null;
}

/**
 * Is this CLI a build in a clone of the repo (`apps/cli/dist`) rather than
 * a published package? A checkout runs its own code: it never hands off and
 * never updates itself. Only a checkout has the sources beside its bundle.
 */
export function isCheckout(bundleDir: string): boolean {
  return existsSync(join(bundleDir, '..', 'src', 'index.ts'));
}

/** The last answer from npm, kept between runs. */
interface Checked {
  checkedAt: number;
  /** Null when the check failed. */
  latest: Release | null;
}

export interface UpdaterOptions {
  store?: VersionStore;
  fetch?: Fetch;
  registry?: string;
  /** Where npm's last answer is kept. */
  cachePath?: string;
  /** The version running now. */
  version?: string;
}

export type CheckResult =
  | { kind: 'latest'; version: string }
  | { kind: 'available'; release: Release }
  | { kind: 'failed'; error: string };

export class Updater {
  readonly store: VersionStore;
  readonly version: string;
  private readonly fetch: Fetch | undefined;
  private readonly registry: string;
  private readonly cachePath: string;

  constructor(options: UpdaterOptions = {}) {
    this.store = options.store ?? new VersionStore();
    this.fetch = options.fetch;
    this.registry = options.registry ?? registryUrl();
    this.cachePath = options.cachePath ?? join(agentopiaHome(), 'cache', 'update.json');
    this.version = options.version ?? VERSION;
  }

  private readChecked(): Checked | null {
    try {
      const parsed = JSON.parse(readFileSync(this.cachePath, 'utf8')) as Checked;
      return typeof parsed.checkedAt === 'number' ? parsed : null;
    } catch {
      return null;
    }
  }

  private writeChecked(checked: Checked): void {
    try {
      mkdirSync(dirname(this.cachePath), { recursive: true });
      writeFileSync(this.cachePath, `${JSON.stringify(checked)}\n`);
    } catch {
      // A cache that cannot be written only means asking npm again sooner.
    }
  }

  /**
   * Is there a release newer than both this version and the one already
   * downloaded? Asks npm only when its last answer is stale, unless `force`.
   * Never throws.
   */
  async check(now: number, force = false): Promise<CheckResult> {
    const kept = force ? null : this.readChecked();
    let latest: Release | null;
    if (kept && now - kept.checkedAt < (kept.latest ? CHECK_TTL_MS : CHECK_RETRY_MS)) {
      latest = kept.latest;
    } else {
      try {
        latest = await fetchLatest(this.fetch, this.registry);
        this.writeChecked({ checkedAt: now, latest });
      } catch (err) {
        this.writeChecked({ checkedAt: now, latest: null });
        return { kind: 'failed', error: (err as Error).message };
      }
    }
    if (!latest) {
      return { kind: 'failed', error: 'the last check failed' };
    }
    const have = this.newestHeld();
    if (isNewer(latest.version, have) && !this.store.isBad(latest.version)) {
      return { kind: 'available', release: latest };
    }
    return { kind: 'latest', version: have };
  }

  /** The newest version this machine can run now: this one, or the one downloaded. */
  newestHeld(): string {
    const current = this.store.current();
    return current && isNewer(current, this.version) ? current : this.version;
  }

  /**
   * Download, verify and unpack `release` (unless it is stored already),
   * then point `current` at it. Throws on a bad download; nothing changes then.
   */
  async prepare(release: Release): Promise<void> {
    if (!this.store.has(release.version)) {
      const tgz = await downloadRelease(release, this.fetch, this.registry);
      this.store.install(release.version, readTarball(tgz));
    }
    this.store.setCurrent(release.version);
    this.store.prune([this.version, release.version]);
  }
}
