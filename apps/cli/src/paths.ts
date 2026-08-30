import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** Everything cubicle writes lives here. Overridable for tests and throwaway runs. */
export function cubicleHome(): string {
  return process.env.CUBICLE_HOME ?? join(homedir(), '.cubicle');
}

export function sessionsDir(): string {
  return join(cubicleHome(), 'sessions');
}

export function sessionDir(id: string): string {
  return join(sessionsDir(), id);
}

export function busPath(id: string): string {
  return join(sessionDir(id), 'bus.jsonl');
}

/**
 * Where this process was launched from.
 *
 * Deliberately derived from argv[1] rather than `import.meta.url`: the CLI is
 * bundled to ESM for release but compiled to CJS under ts-jest, and `import.meta`
 * is a syntax error in the latter.
 */
function launchAnchor(): string {
  const entry = process.argv[1];
  return entry ? dirname(resolve(entry)) : process.cwd();
}

/**
 * Find the `plugins/` tree by walking up from the running bundle.
 *
 * This resolves correctly both in the repo (`apps/cli/dist` -> repo root) and
 * from an npm install (`<pkg>/dist` -> `<pkg>`), without either layout being
 * hardcoded.
 */
export function findPluginsRoot(start: string = launchAnchor()): string | null {
  if (process.env.CUBICLE_PLUGINS_DIR) {
    return process.env.CUBICLE_PLUGINS_DIR;
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
  if (process.env.CUBICLE_VIEWER_DIR) {
    return process.env.CUBICLE_VIEWER_DIR;
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
