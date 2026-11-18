import { ContextAdapter, ContextGlance, ContextHints, ContextReport } from '@agentopia/core';

import { JsonlFollower } from '../usage/follow';

/**
 * How full each session's context is, for the monitors on the office's desks
 * and the breakdown that opens from one, read from each agent's own records
 * since no hook says. Like usage, each harness has a reader (the I/O half:
 * which file is a session's, and following it) over its context adapter in
 * core (the pure half: what the lines add up to). Nothing is written and
 * nothing leaves the machine.
 *
 * To add a harness: a `ContextAdapter` in `packages/core/src/context/adapters/`,
 * a reader here (usually a `JsonlContextReader` saying where a session's file
 * is), and `context` on its `Harness` in `harness.ts`.
 */

/** One harness's sessions' context. */
export interface ContextReader {
  readonly harness: string;
  /** A harness session's context as of its records now, or null where there is none. Never throws. */
  report(session: string): Promise<ContextReport | null>;
}

/** How many sessions a reader keeps folded at once; the least recently asked about goes first. */
export const CONTEXT_SESSIONS_KEPT = 48;

interface Followed {
  path: string;
  fold: ReturnType<ContextAdapter['fold']>;
  follower: JsonlFollower;
}

/**
 * A reader for a harness that writes one append-only JSONL file per session:
 * say where a session's file is (`locate`) and anything its settings know
 * (`hints`); following and folding are done here, reading only what was
 * appended since the last ask.
 */
export abstract class JsonlContextReader implements ContextReader {
  private sessions = new Map<string, Followed>();

  constructor(protected readonly adapter: ContextAdapter) {}

  get harness(): string {
    return this.adapter.harness;
  }

  /** The file a harness session's records are in, or null if it cannot be found. */
  protected abstract locate(session: string): Promise<string | null>;

  /** What the harness's settings say that its records do not. */
  protected hints(): Promise<ContextHints> {
    return Promise.resolve({});
  }

  async report(session: string): Promise<ContextReport | null> {
    try {
      let followed = this.sessions.get(session);
      if (!followed) {
        const path = await this.locate(session);
        if (!path) {
          return null;
        }
        followed = { path, fold: this.adapter.fold(session), follower: new JsonlFollower() };
      }
      // Re-inserted, so the map's order is least recently asked about first.
      this.sessions.delete(session);
      this.sessions.set(session, followed);
      while (this.sessions.size > CONTEXT_SESSIONS_KEPT) {
        const [oldest] = this.sessions.keys();
        this.sessions.delete(oldest);
      }
      const { fold } = followed;
      await followed.follower.follow(followed.path, (line) => fold.take(line));
      return fold.report(await this.hints());
    } catch {
      return null;
    }
  }
}

/** Where a bus's context comes from: its harness, and the harness session it is on now. */
export type BusSessionResolver = (bus: string) => { harness: string; session: string } | null;

/** The source of context reports, so the server can be tested without any records. */
export interface ContextSource {
  /** One bus's context, in full. */
  report(bus: string): Promise<ContextReport | null>;
  /** How full each of these buses' contexts is, for those that have one. */
  glances(buses: string[]): Promise<Record<string, ContextGlance>>;
}

/** Every harness's context, by bus. */
export class OfficeContext implements ContextSource {
  private readonly byHarness: Map<string, ContextReader>;

  constructor(
    readers: ContextReader[],
    private readonly resolve: BusSessionResolver
  ) {
    this.byHarness = new Map(readers.map((r) => [r.harness, r]));
  }

  async report(bus: string): Promise<ContextReport | null> {
    const target = this.resolve(bus);
    const reader = target ? this.byHarness.get(target.harness) : undefined;
    return target && reader ? reader.report(target.session) : null;
  }

  async glances(buses: string[]): Promise<Record<string, ContextGlance>> {
    const out: Record<string, ContextGlance> = {};
    for (const bus of buses) {
      const report = await this.report(bus);
      if (report) {
        out[bus] = { used: report.used, window: report.window };
      }
    }
    return out;
  }
}
