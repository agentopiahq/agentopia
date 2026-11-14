/**
 * Token usage, harness by harness, in one shape.
 *
 * No hook carries a token count, so usage is read from each agent's own
 * records of its work (Claude Code's JSONL transcripts, say). Each harness
 * has a usage adapter (`adapters/`) that turns one line of its records into
 * a `UsageFact`; everything past that — pricing, adding up, the board and
 * the ledger — is the same for every harness.
 */

/** Who did the work: the session's own agent, or a subagent of a type. */
export const LEAD_AGENT = 'lead';

export interface TokenCounts {
  /** Prompt tokens read fresh, not from a cache. */
  input: number;
  output: number;
  /** Prompt tokens written to a cache for 5 minutes, and for an hour. */
  cacheWrite5m: number;
  cacheWrite1h: number;
  /** Prompt tokens read from a cache. */
  cacheRead: number;
}

/** One model response's usage. */
export interface UsageEntry {
  /** Which harness did the work (`claude`): the same id as its event adapter's. */
  harness: string;
  /**
   * One per response, within its harness: count each key once. Harnesses
   * write the same response more than once (Claude Code: a line per content
   * block, and again when a session is resumed).
   */
  key: string;
  ts: number;
  /** The harness's session it belongs to (a subagent's is its parent's). */
  session: string;
  /** `LEAD_AGENT`, or the subagent's type (`Explore`, `general-purpose`). */
  agent: string;
  model: string;
  tokens: TokenCounts;
  /** Dollars at API rates, 0 when the model is unpriced (see `priced`). */
  cost: number;
  priced: boolean;
  /** The directory the session ran in, when the line says. */
  cwd?: string;
}

/** What one line of a harness's records says, if anything worth counting. */
export type UsageFact =
  | { kind: 'usage'; entry: UsageEntry }
  /** A session's own name: `/rename`, the desktop app's title. */
  | { kind: 'title'; session: string; title: string };

/** What the file a line came from says about it. */
export interface UsageLineContext {
  /** The subagent type, when the whole file is one subagent's. */
  agent?: string;
}

/**
 * A harness's usage, line by line: the pure half of reading it. The I/O
 * half — where the files are and how they are followed — lives with the
 * CLI's reader for the harness.
 */
export interface UsageAdapter {
  /** The harness id (`claude`), matching its event adapter and plugin. */
  harness: string;
  /** How the ledger names it: `Claude Code`. */
  label: string;
  /** One line of the harness's records, or null for a line with nothing to count. Never throws. */
  read(line: string, context?: UsageLineContext): UsageFact | null;
  /** How the ledger writes a model's id (`opus-5-5` for `claude-opus-5-5`); as it is, if left out. */
  modelLabel?(model: string): string;
}

/** Every token an entry counts. */
export const totalTokens = (t: TokenCounts): number =>
  t.input + t.output + t.cacheWrite5m + t.cacheWrite1h + t.cacheRead;
