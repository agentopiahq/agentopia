import { claudeAgentTypeFromMeta, claudeCodeUsage } from '@agentopia/core';
import { Dirent } from 'node:fs';
import { open, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { busPath } from '../paths';
import { JsonlUsageReader, UsageFile } from './reader';

/**
 * Claude Code's usage, from its JSONL transcripts — the files ccusage reads.
 *
 * Under each projects root: a folder per project, a `<session>.jsonl` per
 * session, and the session's subagents in `<session>/subagents/agent-*.jsonl`
 * (a workflow's agents a folder or two further down), each beside a
 * `.meta.json` naming its type. The first read of a few gigabytes takes a
 * few seconds; after that only appended lines are read.
 */

/**
 * Where Claude Code keeps transcripts: `CLAUDE_CONFIG_DIR` (comma-separated,
 * as ccusage reads it) or both of its default homes.
 */
export function claudeProjectRoots(
  env: Record<string, string | undefined> = process.env
): string[] {
  const configured = env.CLAUDE_CONFIG_DIR?.split(',')
    .map((dir) => dir.trim())
    .filter(Boolean);
  const homes = configured?.length
    ? configured
    : [join(homedir(), '.config', 'claude'), join(homedir(), '.claude')];
  return homes.map((dir) => join(dir, 'projects'));
}

/**
 * A session's name from the office's own recording of it: the bus the hooks
 * write for a session (`auto-<id>`) carries Claude Code's title in its
 * records' `name`. The last one in the bus's tail, or undefined.
 */
export async function busName(session: string): Promise<string | undefined> {
  const path = busPath(`auto-${session}`);
  let handle;
  try {
    handle = await open(path, 'r');
  } catch {
    return undefined;
  }
  try {
    const { size } = await handle.stat();
    const window = Math.min(size, 256 * 1024);
    const buf = Buffer.alloc(window);
    await handle.read(buf, 0, window, size - window);
    const names = buf.toString('utf8').match(/"name":"((?:[^"\\]|\\.)*)"/g);
    const last = names?.[names.length - 1];
    return last ? (JSON.parse(`{${last}}`) as { name: string }).name : undefined;
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}

async function list(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export class ClaudeCodeUsage extends JsonlUsageReader {
  /** Each subagent transcript's type, read once from its `.meta.json`. */
  private agents = new Map<string, string | undefined>();

  constructor(
    private readonly roots: string[] = claudeProjectRoots(),
    private readonly names: (session: string) => Promise<string | undefined> = busName
  ) {
    super(claudeCodeUsage);
  }

  protected override nameOf(session: string): Promise<string | undefined> {
    return this.names(session);
  }

  protected override async *files(): AsyncIterable<UsageFile> {
    for (const root of this.roots) {
      for (const project of await list(root)) {
        if (!project.isDirectory()) {
          continue;
        }
        const dir = join(root, project.name);
        for (const item of await list(dir)) {
          if (item.isFile() && item.name.endsWith('.jsonl')) {
            yield { path: join(dir, item.name) };
          } else if (item.isDirectory()) {
            yield* this.subagents(join(dir, item.name, 'subagents'));
          }
        }
      }
    }
  }

  private async *subagents(dir: string, depth = 0): AsyncIterable<UsageFile> {
    for (const item of await list(dir)) {
      const path = join(dir, item.name);
      if (item.isDirectory() && depth < 3) {
        yield* this.subagents(path, depth + 1);
      } else if (item.isFile() && item.name.endsWith('.jsonl')) {
        if (!this.agents.has(path)) {
          const meta = await readFile(path.replace(/\.jsonl$/, '.meta.json'), 'utf8').catch(
            () => ''
          );
          this.agents.set(path, claudeAgentTypeFromMeta(meta));
        }
        yield { path, context: { agent: this.agents.get(path) } };
      }
    }
  }
}
