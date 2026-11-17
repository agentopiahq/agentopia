import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Everything agentopia writes lives here. Overridable for tests and throwaway runs. */
export function agentopiaHome(): string {
  return process.env.AGENTOPIA_HOME ?? join(homedir(), '.agentopia');
}

export function sessionsDir(): string {
  return join(agentopiaHome(), 'sessions');
}

export function sessionDir(id: string): string {
  return join(sessionsDir(), id);
}

export function busPath(id: string): string {
  return join(sessionDir(id), 'bus.jsonl');
}

/**
 * Where the CLI bundle lives, which is where its viewer and plugins are found.
 *
 * The bundle's banner records its own `import.meta.url` (see scripts/build.mjs),
 * because `import.meta` itself is a syntax error under ts-jest's CJS. Without it
 * (tests, or an unbundled run) this falls back to the launched script, argv[1].
 * The banner matters for the `agentopia-town` alias, whose bin lives in another
 * package and imports this one.
 */
function launchAnchor(): string {
  const bundleUrl = (globalThis as { __agentopiaBundleUrl?: string }).__agentopiaBundleUrl;
  const entry = bundleUrl ? fileURLToPath(bundleUrl) : process.argv[1];
  if (!entry) {
    return process.cwd();
  }
  // Resolve symlinks: `agentopia` on PATH is typically a symlink into the repo
  // or package, and discovery must walk up from where the bundle really lives.
  try {
    return dirname(realpathSync(entry));
  } catch {
    return dirname(resolve(entry));
  }
}

/**
 * Find the `plugins/` tree by walking up from the running bundle.
 *
 * This resolves correctly both in the repo (`apps/cli/dist` -> repo root) and
 * from an npm install (`<pkg>/dist` -> `<pkg>`), without either layout being
 * hardcoded.
 */
export function findPluginsRoot(start: string = launchAnchor()): string | null {
  if (process.env.AGENTOPIA_PLUGINS_DIR) {
    return process.env.AGENTOPIA_PLUGINS_DIR;
  }
  let dir = start;
  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(dir, 'plugins');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * Find the viewer's built bundle. In the repo that is apps/viewer/dist; from an
 * npm install the dist ships inside the package. Same walk-up strategy as
 * plugin discovery so both layouts resolve without being hardcoded.
 */
export function findViewerDist(start: string = launchAnchor()): string | null {
  if (process.env.AGENTOPIA_VIEWER_DIR) {
    return process.env.AGENTOPIA_VIEWER_DIR;
  }
  let dir = start;
  for (let depth = 0; depth < 8; depth++) {
    for (const candidate of [join(dir, 'viewer'), join(dir, 'apps', 'viewer', 'dist')]) {
      // Demand a Vite build, not just any index.html — walking up from the CLI
      // bundle passes apps/viewer (the source) before the repo root, and its
      // raw index.html would serve /src/main.ts as octet-stream.
      if (existsSync(join(candidate, 'index.html')) && existsSync(join(candidate, 'assets'))) {
        return candidate;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

export function pluginDirFor(harnessId: string, start?: string): string | null {
  const root = findPluginsRoot(start);
  if (!root) {
    return null;
  }
  const dir = join(root, harnessId);
  return existsSync(dir) ? dir : null;
}
