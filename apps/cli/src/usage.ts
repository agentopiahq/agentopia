import {
  UsageEntry,
  UsageReport,
  agentTypeFromMeta,
  buildUsageReport,
  titleFromLine,
  usageFromLine,
} from '@agentopia/core';
import { Dirent } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import { busPath } from './paths';

/**
 * Token usage for the office's usage board, read from Claude Code's own
 * transcripts — the files ccusage reads — since the hooks never see a token.
 *
 * Reading is incremental: each transcript is remembered by how far it has
 * been read, so a refresh only reads what was appended since, and the first
 * read of a few gigabytes happens once per server. Lines without usage are
 * skipped unparsed. Nothing is written anywhere, and nothing leaves the
 * machine: the report goes only to the office server's own 127.0.0.1 page.
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

/** The source of a usage report, so the server can be tested without transcripts. */
export interface UsageSource {
  report(now: number): Promise<UsageReport>;
}

interface Followed {
  /** Bytes read so far. */
  offset: number;
  /** A line not yet ended when the file was last read, as bytes: it may end mid-character. */
  rest: Buffer;
  /** The subagent type, for a subagent's transcript. */
  agent?: string;
}

/** Read this much of a file at a time. */
const CHUNK = 4 * 1024 * 1024;
const EMPTY = Buffer.alloc(0);
/** A refresh within this long of the last one reuses it. */
export const USAGE_REFRESH_MS = 15_000;

async function list(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export class TranscriptUsage implements UsageSource {
  private files = new Map<string, Followed>();
  private entries = new Map<string, UsageEntry>();
  private titles = new Map<string, string>();
  private cwds = new Map<string, string>();
  /** Names from the office's recordings, looked up once per session (undefined: none). */
  private named = new Map<string, string | undefined>();
  private refreshing: Promise<void> | null = null;
  private refreshedAt = -Infinity;

  constructor(
    private readonly roots: string[] = claudeProjectRoots(),
    private readonly refreshMs = USAGE_REFRESH_MS,
    private readonly nameOf: (session: string) => Promise<string | undefined> = busName
  ) {}

  async report(now: number): Promise<UsageReport> {
    if (now - this.refreshedAt >= this.refreshMs) {
      await this.refresh();
      await this.lookUpNames();
      this.refreshedAt = now;
    }
    return buildUsageReport(this.entries.values(), {
      now,
      offsetOf: (ts) => -new Date(ts).getTimezoneOffset(),
      sessionLabel: (id) => this.sessionLabel(id),
    });
  }

  /** Read whatever was appended to every transcript since the last refresh. Never throws. */
  refresh(): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = this.scan().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  /** How many API responses have been read, for tests and diagnostics. */
  get size(): number {
    return this.entries.size;
  }

  private sessionLabel(id: string): { label: string; detail?: string } {
    const cwd = this.cwds.get(id);
    const project = cwd ? basename(cwd) : undefined;
    const label = this.titles.get(id) ?? this.named.get(id) ?? project ?? id.slice(0, 8);
    return { label, detail: project };
  }

  /** Name every session without a title of its own from the office's recording of it. */
  private async lookUpNames(): Promise<void> {
    const sessions = new Set<string>();
    for (const entry of this.entries.values()) {
      sessions.add(entry.session);
    }
    for (const id of sessions) {
      if (!this.titles.has(id) && !this.named.has(id)) {
        this.named.set(id, await this.nameOf(id));
      }
    }
  }

  private async scan(): Promise<void> {
    for (const root of this.roots) {
      for (const project of await list(root)) {
        if (!project.isDirectory()) {
          continue;
        }
        const dir = join(root, project.name);
        for (const item of await list(dir)) {
          if (item.isFile() && item.name.endsWith('.jsonl')) {
            await this.follow(join(dir, item.name));
          } else if (item.isDirectory()) {
            await this.followSubagents(join(dir, item.name, 'subagents'));
          }
        }
      }
    }
  }

  private async followSubagents(dir: string): Promise<void> {
    for (const item of await list(dir)) {
      if (item.isFile() && item.name.endsWith('.jsonl')) {
        const path = join(dir, item.name);
        if (!this.files.has(path)) {
          const meta = await readFile(path.replace(/\.jsonl$/, '.meta.json'), 'utf8').catch(
            () => ''
          );
          this.files.set(path, { offset: 0, rest: EMPTY, agent: agentTypeFromMeta(meta) });
        }
        await this.follow(path);
      }
    }
  }

  private async follow(path: string): Promise<void> {
    let followed = this.files.get(path);
    if (!followed) {
      followed = { offset: 0, rest: EMPTY };
      this.files.set(path, followed);
    }
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      return;
    }
    if (size < followed.offset) {
      // Rewritten from the start: read it again. Keys keep the count right.
      followed.offset = 0;
      followed.rest = EMPTY;
    }
    if (size === followed.offset) {
      return;
    }
    let handle;
    try {
      handle = await open(path, 'r');
    } catch {
      return;
    }
    try {
      const buf = Buffer.alloc(Math.min(CHUNK, size - followed.offset));
      while (followed.offset < size) {
        const { bytesRead } = await handle.read(buf, 0, buf.length, followed.offset);
        if (bytesRead === 0) {
          break;
        }
        followed.offset += bytesRead;
        const bytes = Buffer.concat([followed.rest, buf.subarray(0, bytesRead)]);
        const end = bytes.lastIndexOf(0x0a);
        // Copied, not sliced: the read buffer is reused for the next chunk.
        followed.rest = Buffer.from(bytes.subarray(end + 1));
        if (end >= 0) {
          for (const line of bytes.toString('utf8', 0, end).split('\n')) {
            this.take(line, followed.agent);
          }
        }
      }
    } catch {
      // A file that vanished mid-read: whatever was read stays counted.
    } finally {
      await handle.close();
    }
  }

  private take(line: string, agent: string | undefined): void {
    const entry = usageFromLine(line, { agent });
    if (entry) {
      if (!this.entries.has(entry.key)) {
        this.entries.set(entry.key, entry);
      }
      if (entry.cwd && !this.cwds.has(entry.session)) {
        this.cwds.set(entry.session, entry.cwd);
      }
      return;
    }
    const title = titleFromLine(line);
    if (title) {
      this.titles.set(title.session, title.title);
    }
  }
}
