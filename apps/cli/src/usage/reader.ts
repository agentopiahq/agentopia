import {
  UsageAdapter,
  UsageEntry,
  UsageLineContext,
  UsageReport,
  buildUsageReport,
} from '@agentopia/core';
import { basename } from 'node:path';

import { JsonlFollower } from './follow';
import { PriceSource, bundledPrices } from './prices';

/**
 * Usage for the office's usage board, read from each agent's own records,
 * since no hook carries a token count.
 *
 * Each harness has a reader: the I/O half (where its records are and how to
 * follow them), over the harness's usage adapter in core, the pure half
 * (what a line means). The office adds every reader's entries up into one
 * report. Nothing is written anywhere and nothing leaves the machine: the
 * report goes only to the office server's own 127.0.0.1 page.
 *
 * To add a harness: a `UsageAdapter` in `packages/core/src/usage/adapters/`,
 * a reader here (usually a `JsonlUsageReader` saying which files to follow),
 * and `usage` on its `Harness` in `harness.ts`.
 */

/** One harness's usage, read incrementally. */
export interface UsageReader {
  /** The harness id, as on its entries. */
  readonly harness: string;
  /** Read whatever is new since the last refresh. Never throws. */
  refresh(): Promise<void>;
  /** Every response read so far, each once. */
  entries(): Iterable<UsageEntry>;
  /** A session's name, and the project it ran in, for its row. */
  sessionLabel(session: string): { label: string; detail?: string };
}

/** A file of a harness's records to follow, and what the file says about its lines. */
export interface UsageFile {
  path: string;
  context?: UsageLineContext;
}

/**
 * A reader for a harness that logs to append-only JSONL files, which is all
 * of them so far: say which files (`files`), and optionally where to find a
 * name for a session that names none itself (`nameOf`). Following, keeping
 * one entry per key, and naming sessions are done here.
 */
export abstract class JsonlUsageReader implements UsageReader {
  private follower = new JsonlFollower();
  private byKey = new Map<string, UsageEntry>();
  private titles = new Map<string, string>();
  private cwds = new Map<string, string>();
  /** Names found elsewhere, looked up once per session (undefined: none). */
  private named = new Map<string, string | undefined>();
  private refreshing: Promise<void> | null = null;

  constructor(protected readonly adapter: UsageAdapter) {}

  get harness(): string {
    return this.adapter.harness;
  }

  /** The files to follow now: every refresh lists them again, so new ones are picked up. */
  protected abstract files(): AsyncIterable<UsageFile>;

  /** A name for a session whose records give it none. */
  protected nameOf(_session: string): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  refresh(): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = this.read().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  entries(): Iterable<UsageEntry> {
    return this.byKey.values();
  }

  /** How many responses have been read, for tests and diagnostics. */
  get size(): number {
    return this.byKey.size;
  }

  sessionLabel(session: string): { label: string; detail?: string } {
    const cwd = this.cwds.get(session);
    const project = cwd ? basename(cwd) : undefined;
    const label =
      this.titles.get(session) ?? this.named.get(session) ?? project ?? session.slice(0, 8);
    return { label, detail: project };
  }

  private async read(): Promise<void> {
    try {
      for await (const file of this.files()) {
        await this.follower.follow(file.path, (line) => this.take(line, file.context));
      }
      for (const entry of this.byKey.values()) {
        const id = entry.session;
        if (!this.titles.has(id) && !this.named.has(id)) {
          this.named.set(id, await this.nameOf(id));
        }
      }
    } catch {
      // Whatever was read before the failure stays read; the next refresh tries again.
    }
  }

  private take(line: string, context: UsageLineContext | undefined): void {
    const fact = this.adapter.read(line, context);
    if (fact?.kind === 'usage') {
      const { entry } = fact;
      if (!this.byKey.has(entry.key)) {
        this.byKey.set(entry.key, entry);
      }
      if (entry.cwd && !this.cwds.has(entry.session)) {
        this.cwds.set(entry.session, entry.cwd);
      }
    } else if (fact?.kind === 'title') {
      this.titles.set(fact.session, fact.title);
    }
  }
}

/** The source of a usage report, so the server can be tested without any records. */
export interface UsageSource {
  report(now: number): Promise<UsageReport>;
}

/** A refresh within this long of the last one reuses it. */
export const USAGE_REFRESH_MS = 15_000;

/** Every harness's usage, added up into one report. */
export class OfficeUsage implements UsageSource {
  private refreshedAt = -Infinity;
  private readonly byHarness: Map<string, UsageReader>;

  constructor(
    private readonly readers: UsageReader[],
    private readonly prices: PriceSource = bundledPrices,
    private readonly refreshMs = USAGE_REFRESH_MS
  ) {
    this.byHarness = new Map(readers.map((r) => [r.harness, r]));
  }

  async report(now: number): Promise<UsageReport> {
    if (now - this.refreshedAt >= this.refreshMs) {
      await Promise.all([...this.readers.map((r) => r.refresh()), this.prices.refresh(now)]);
      this.refreshedAt = now;
    }
    const readers = this.readers;
    return buildUsageReport(
      (function* (): Iterable<UsageEntry> {
        for (const reader of readers) {
          yield* reader.entries();
        }
      })(),
      {
        now,
        offsetOf: (ts) => -new Date(ts).getTimezoneOffset(),
        pricesFor: (harness) => this.prices.tableFor(harness),
        prices: this.prices.source(),
        sessionLabel: (harness, id) =>
          this.byHarness.get(harness)?.sessionLabel(id) ?? { label: id.slice(0, 8) },
      }
    );
  }
}
