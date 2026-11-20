import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * Staging a plugin for a standing install.
 *
 * The agent never loads the plugin from the npm package: that path moves with
 * every Node version and every `npx` cache. `agentopia install` copies it to a
 * fixed place under the agentopia home instead, with two changes made on the
 * way:
 *
 * - every hook runs the Node that ran the install, by absolute path, because
 *   an app started from the Dock often has no version manager on its PATH;
 * - the manifest's version is the CLI's, plus a hash of what was staged, so
 *   the agent sees a new version (and updates its cached copy) whenever the
 *   files or that Node change, and only then.
 */

/** The hooks' command prefix in the repo's plugins: plain `node` from PATH. */
const NODE_PREFIX = /^node(?=\s)/;

/** Every file under `dir`, as sorted paths relative to it. */
function listFiles(dir: string, base: string = dir): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? listFiles(path, base) : [relative(base, path)];
    })
    .sort();
}

/** Point every hook command that starts with `node` at `nodePath` instead. */
export function pinNode(hooks: unknown, nodePath: string): unknown {
  if (Array.isArray(hooks)) {
    return hooks.map((item) => pinNode(item, nodePath));
  }
  if (hooks && typeof hooks === 'object') {
    return Object.fromEntries(
      Object.entries(hooks).map(([key, value]) => [
        key,
        key === 'command' && typeof value === 'string'
          ? value.replace(NODE_PREFIX, JSON.stringify(nodePath))
          : pinNode(value, nodePath),
      ])
    );
  }
  return hooks;
}

/** A staged file's contents: text where staging rewrote it, else the bytes as shipped. */
export type StagedFile = string | Buffer;

export interface StageOptions {
  /** The plugin as shipped: `plugins/<harness>` in the repo or the package. */
  from: string;
  /** Relative to the plugin: its manifest, whose `version` is stamped. */
  manifest: string;
  /** Relative to the plugin: its hook wiring, whose commands are pinned. */
  hooks: string;
  nodePath: string;
  /** The CLI's version, the stamped version's base. */
  version: string;
}

/**
 * The staged files' contents, keyed by path, and the version they stamp.
 * Pure apart from reading `from`, so a refresh can tell whether anything
 * changed without writing.
 */
export function planStage(options: StageOptions): {
  files: Map<string, StagedFile>;
  version: string;
} {
  // Read as bytes: the plugin ships an icon beside its text files.
  const files = new Map<string, StagedFile>();
  for (const path of listFiles(options.from)) {
    files.set(path, readFileSync(join(options.from, path)));
  }

  const hooks = files.get(options.hooks);
  if (hooks !== undefined) {
    const pinned = pinNode(JSON.parse(hooks.toString()), options.nodePath);
    files.set(options.hooks, `${JSON.stringify(pinned, null, 2)}\n`);
  }

  // Hash everything but the version itself, which is derived from the hash.
  const manifest = JSON.parse(files.get(options.manifest)?.toString() ?? '{}') as Record<
    string,
    unknown
  >;
  delete manifest.version;
  const hash = createHash('sha256');
  for (const [path, content] of files) {
    hash.update(path).update('\0');
    hash.update(path === options.manifest ? JSON.stringify(manifest) : content).update('\0');
  }
  const version = `${options.version}+${hash.digest('hex').slice(0, 8)}`;
  files.set(options.manifest, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);

  return { files, version };
}

/** Write the plan from `planStage` to `to`, replacing whatever was there. */
export function writeStage(to: string, files: Map<string, StagedFile>): void {
  rmSync(to, { recursive: true, force: true });
  for (const [path, content] of files) {
    const target = join(to, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
