import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { agentopiaHome } from '../paths';
import { isNewer, isRelease } from './semver';

/**
 * The versions agentopia has downloaded for itself, under
 * `~/.agentopia/versions`:
 *
 *   versions/<v>/        a release, unpacked as npm ships it (dist/, viewer/, plugins/)
 *   versions/current     the version the `agentopia` command runs, one line
 *   versions/bad.json    versions that failed to start, never picked again
 *
 * A version is unpacked into `<v>.partial-<pid>` and renamed into place whole, so a
 * download cut short is never run. Nothing here is npm's: whichever copy of
 * agentopia is on PATH (global, the alias, npx) hands off to `current` when
 * it is newer than itself (`handoff.ts`), so no update ever writes to npm's
 * folders or needs sudo.
 */
export class VersionStore {
  constructor(readonly root: string = join(agentopiaHome(), 'versions')) {}

  dir(version: string): string {
    return join(this.root, version);
  }

  /** The CLI bundle of a stored version, or null when it is not (wholly) there. */
  bundle(version: string): string | null {
    if (!isRelease(version)) {
      return null;
    }
    const path = join(this.dir(version), 'dist', 'agentopia.mjs');
    return existsSync(path) ? path : null;
  }

  has(version: string): boolean {
    return this.bundle(version) !== null;
  }

  /** The version `current` names, if it is stored and not marked bad. */
  current(): string | null {
    try {
      const version = readFileSync(join(this.root, 'current'), 'utf8').trim();
      return this.has(version) && !this.isBad(version) ? version : null;
    } catch {
      return null;
    }
  }

  /** Point `current` at `version` (null: at nothing, so each command runs itself). */
  setCurrent(version: string | null): void {
    const path = join(this.root, 'current');
    if (version === null) {
      rmSync(path, { force: true });
      return;
    }
    mkdirSync(this.root, { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${version}\n`);
    renameSync(tmp, path);
  }

  private badList(): string[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(this.root, 'bad.json'), 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  isBad(version: string): boolean {
    return this.badList().includes(version);
  }

  /** Never pick `version` again: it was downloaded but would not start. */
  markBad(version: string): void {
    const list = this.badList();
    if (list.includes(version)) {
      return;
    }
    mkdirSync(this.root, { recursive: true });
    writeFileSync(join(this.root, 'bad.json'), `${JSON.stringify([...list, version])}\n`);
  }

  /** Write a release's files in as `version`, whole or not at all. */
  install(version: string, files: Map<string, Buffer>): void {
    if (!isRelease(version)) {
      throw new Error(`not a release: ${version}`);
    }
    if (!files.has('dist/agentopia.mjs')) {
      throw new Error(`agentopiahq ${version} has no dist/agentopia.mjs`);
    }
    // Per process, so a server and an `agentopia update` downloading at once never mix files.
    const partial = `${this.dir(version)}.partial-${process.pid}`;
    try {
      for (const [path, body] of files) {
        const target = join(partial, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, body);
      }
      rmSync(this.dir(version), { recursive: true, force: true });
      renameSync(partial, this.dir(version));
    } finally {
      rmSync(partial, { recursive: true, force: true });
    }
  }

  /** Every stored version, as directory names. */
  versions(): string[] {
    try {
      return readdirSync(this.root).filter((name) => isRelease(name));
    } catch {
      return [];
    }
  }

  /**
   * Remove every stored version but those in `keep` and the newest one
   * older than the current, which is what a rollback goes back to.
   */
  prune(keep: string[]): void {
    const current = this.current();
    const fallback = current
      ? this.versions()
          .filter((v) => isNewer(current, v) && !this.isBad(v))
          .sort((a, b) => (isNewer(a, b) ? -1 : 1))[0]
      : undefined;
    const kept = new Set([...keep, ...(current ? [current] : []), ...(fallback ? [fallback] : [])]);
    let entries: string[] = [];
    try {
      entries = readdirSync(this.root);
    } catch {
      return;
    }
    for (const name of entries) {
      if (isRelease(name) && !kept.has(name)) {
        rmSync(join(this.root, name), { recursive: true, force: true });
      }
    }
  }
}
