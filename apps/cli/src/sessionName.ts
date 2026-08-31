import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Resolve a harness session id to the name Claude Code itself uses for the
 * session, so the office can be titled "fix-flaky-tests" instead of a uuid.
 *
 * Two best-effort sources, both private Claude Code state, so every read
 * tolerates absence and malformed content by returning null:
 *
 *   1. The desktop app's session store — one JSON file per conversation,
 *      carrying the human-visible title ("Rename the project").
 *   2. The live-session registry (`~/.claude/sessions/<pid>.json`) — one file
 *      per running process, carrying the short derived name ("agentopia-a9").
 *
 * The title wins when both exist: it is what the user sees in their own UI.
 */

export interface SessionNameSources {
  /** Roots of the desktop app's per-account session store. */
  storeRoots: string[];
  /** The live-session registry directory. */
  registryDir: string;
}

export function defaultSessionNameSources(): SessionNameSources {
  const home = homedir();
  const storeRoots = [
    // macOS, Windows, Linux — whichever exists.
    join(home, 'Library', 'Application Support', 'Claude', 'claude-code-sessions'),
    process.env.APPDATA ? join(process.env.APPDATA, 'Claude', 'claude-code-sessions') : null,
    join(home, '.config', 'Claude', 'claude-code-sessions'),
  ].filter((root): root is string => root !== null);
  return { storeRoots, registryDir: join(home, '.claude', 'sessions') };
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function subdirsOf(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * The desktop store nests store/<account>/<org>/local_<store id>.json. The
 * store id is the app's own, not the CLI session id, so match each file's
 * `cliSessionId` field rather than constructing a file name.
 */
function titleFromStore(roots: string[], harnessSession: string): string | null {
  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }
    for (const account of subdirsOf(root)) {
      for (const org of subdirsOf(join(root, account))) {
        for (const file of subdirsOf(join(root, account, org))) {
          if (!file.startsWith('local_') || !file.endsWith('.json')) {
            continue;
          }
          const record = readJson(join(root, account, org, file));
          if (record?.cliSessionId === harnessSession) {
            const title = nonEmpty(record.title);
            if (title) {
              return title;
            }
          }
        }
      }
    }
  }
  return null;
}

/** Registry files are named by pid; match on the sessionId field inside. */
function nameFromRegistry(dir: string, harnessSession: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return null;
  }
  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const record = readJson(join(dir, file));
    if (record?.sessionId === harnessSession) {
      const name = nonEmpty(record.name);
      if (name) {
        return name;
      }
    }
  }
  return null;
}

export function claudeSessionName(
  harnessSession: string,
  sources: SessionNameSources = defaultSessionNameSources()
): string | null {
  return (
    titleFromStore(sources.storeRoots, harnessSession) ??
    nameFromRegistry(sources.registryDir, harnessSession)
  );
}
