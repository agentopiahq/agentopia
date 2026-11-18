/**
 * How full a session's context is, and what fills it, harness by harness in
 * one shape.
 *
 * No hook says how big a session's prompt has grown, so, like usage, it is
 * read from the agent's own records (Claude Code's JSONL transcripts). Each
 * harness has a context adapter (`adapters/`) that folds one session's
 * records, line by line, into a `ContextReport`; the CLI's reader finds and
 * follows the file, and the viewer draws the report. The total is measured
 * (the prompt size of the session's latest response); how it splits into
 * parts is worked out from the records' text, scaled to that total.
 */

/** The parts of a context, in the order a breakdown lists them. */
export const CONTEXT_PARTS = [
  'system',
  'tools',
  'mcp',
  'memory',
  'skills',
  'summary',
  'prompts',
  'replies',
  'calls',
  'results',
  'reminders',
] as const;

export type ContextPart = (typeof CONTEXT_PARTS)[number];

/** How a breakdown names each part. */
export const CONTEXT_PART_LABELS: Readonly<Record<ContextPart, string>> = {
  system: 'System prompt',
  tools: 'System tools',
  mcp: 'MCP tools',
  memory: 'Memory files',
  skills: 'Skills',
  summary: 'Compacted summary',
  prompts: 'Your messages',
  replies: 'Replies & thinking',
  calls: 'Tool calls',
  results: 'Tool results',
  reminders: 'Reminders',
};

/** The parts the harness sets up before the conversation; the rest are the conversation. */
export const SETUP_PARTS: ReadonlySet<ContextPart> = new Set([
  'system',
  'tools',
  'mcp',
  'memory',
  'skills',
]);

export interface ContextSlice {
  part: ContextPart;
  label: string;
  tokens: number;
}

export interface ContextReport {
  /** Which harness's session (`claude`). */
  harness: string;
  /** The harness's own session id. */
  session: string;
  /** The model of the latest response. */
  model?: string;
  /** Tokens in context now: the latest prompt plus the reply to it. Measured. */
  used: number;
  /** How many tokens the model's window holds. */
  window: number;
  /** What fills `used`, every part with any tokens, in `CONTEXT_PARTS` order. Sums to `used`. */
  slices: ContextSlice[];
  /**
   * Whether the set-up parts are a guess: the records did not say what the
   * harness sent before the conversation (older Claude Code), so the system
   * prompt and tools are one part, worked out from the first response.
   */
  estimated: boolean;
  /** When the latest response was written, ms since epoch. */
  at: number;
  /** Prompts typed so far (since the last compaction). */
  turns: number;
  /** Times the conversation has been compacted. */
  compactions: number;
  /** The fullest the context has been, in tokens. */
  peak: number;
}

/** What the office's monitors need of a report: how full each desk's context is. */
export interface ContextGlance {
  used: number;
  window: number;
}

/** A session's records folded so far. Feed it lines in order; ask for the report at any time. */
export interface ContextFold {
  /** One line of the session's records. Never throws. */
  take(line: string): void;
  /** The context as of the lines taken, or null before the first response. */
  report(hints?: ContextHints): ContextReport | null;
}

/** What the reader knows that the records do not. */
export interface ContextHints {
  /** The harness's configured window, where its settings say (Claude Code's `opus[1m]`). */
  window?: number;
}

/** A harness's context, line by line: the pure half of reading it. */
export interface ContextAdapter {
  /** The harness id (`claude`), matching its event and usage adapters. */
  harness: string;
  /** A fresh fold for one of its sessions. */
  fold(session: string): ContextFold;
}

/** How full a context is, 0 to 1. */
export const contextFill = (glance: ContextGlance): number =>
  glance.window > 0 ? Math.max(0, Math.min(1, glance.used / glance.window)) : 0;

/**
 * Split `total` tokens across weighted parts, in whole tokens that add up to
 * exactly `total` (largest remainders get the leftovers). Weights of zero
 * get nothing; all-zero weights give nothing to anyone.
 */
export function apportion<K extends string>(
  total: number,
  weights: ReadonlyArray<readonly [K, number]>
): Map<K, number> {
  const out = new Map<K, number>();
  const sum = weights.reduce((acc, [, w]) => acc + Math.max(0, w), 0);
  const whole = Math.max(0, Math.round(total));
  if (sum <= 0 || whole === 0) {
    return out;
  }
  const shares = weights.map(([key, w]) => {
    const exact = (whole * Math.max(0, w)) / sum;
    return { key, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = whole - shares.reduce((acc, s) => acc + s.floor, 0);
  for (const s of [...shares].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) {
      break;
    }
    s.floor += 1;
    left -= 1;
  }
  for (const s of shares) {
    if (s.floor > 0) {
      out.set(s.key, (out.get(s.key) ?? 0) + s.floor);
    }
  }
  return out;
}
