/**
 * What Claude's tokens cost on the API, per million, by model.
 *
 * Claude Code on a subscription bills nothing per token, so this is the
 * API-equivalent cost: what the same work would have cost on the Claude API
 * at its first-party rates. That is what ccusage reports too, and it is the
 * only cost a transcript can tell you.
 *
 * Kept in code rather than fetched, on purpose: the office never reaches the
 * network. A model this table does not know costs nothing and is reported as
 * unpriced, so a new model shows up as a gap rather than a wrong number.
 */

export interface Price {
  input: number;
  output: number;
  /** A 5-minute cache write. */
  write5m: number;
  /** A 1-hour cache write. */
  write1h: number;
  /** A cache read. */
  read: number;
  /**
   * Prompts longer than this many tokens (input, cache reads and writes
   * together) bill at `long` instead. Only Haiku 5.5 has a long-prompt rate.
   */
  longAbove?: number;
  long?: Omit<Price, 'longAbove' | 'long'>;
}

/** The usual cache multipliers on an input rate: writes 1.25x (5m) and 2x (1h), reads 0.1x. */
const priced = (input: number, output: number, read = input * 0.1): Price => ({
  input,
  output,
  write5m: input * 1.25,
  write1h: input * 2,
  read,
});

/**
 * Model ids, without the `claude-` prefix, matched by the longest prefix of
 * the transcript's model id, so a dated snapshot (`haiku-4-5-20251001`)
 * finds its family. Order does not matter.
 */
export const PRICES: Readonly<Record<string, Price>> = {
  'fable-5-2': priced(8, 40, 0.2),
  'mythos-5-2': priced(8, 40, 0.2),
  'fable-5-1': priced(10, 50, 0.25),
  'mythos-5-1': priced(10, 50, 0.25),
  'fable-5': priced(10, 50, 1),
  'mythos-5': priced(10, 50, 1),
  'mythos-preview': priced(10, 50, 1),
  'opus-5-5': priced(4, 20, 0.2),
  'opus-5': priced(5, 25),
  'opus-4-8': priced(5, 25),
  'opus-4-7': priced(5, 25),
  'opus-4-6': priced(5, 25),
  'opus-4-5': priced(5, 25),
  'opus-4-1': priced(15, 75),
  'opus-4': priced(15, 75),
  'sonnet-5-5': priced(2, 10, 0.1),
  'sonnet-5': priced(2, 10),
  'sonnet-4-6': priced(3, 15),
  'sonnet-4-5': priced(3, 15),
  'sonnet-4': priced(3, 15),
  'haiku-5-5': { ...priced(0.1, 0.5), longAbove: 100_000, long: priced(0.5, 2.5) },
  'haiku-4-5': priced(1, 5),
  '3-7-sonnet': priced(3, 15),
  '3-5-sonnet': priced(3, 15),
  '3-5-haiku': priced(0.8, 4),
  '3-opus': priced(15, 75),
  '3-haiku': priced(0.25, 1.25),
};

/** Fast mode bills at twice the model's standard rates. */
export const FAST_MULTIPLIER = 2;

const KEYS = Object.keys(PRICES).sort((a, b) => b.length - a.length);

/** The price of a model id as a transcript records it, or null for one this table does not know. */
export function priceFor(model: string): Price | null {
  const id = model.toLowerCase().replace(/^claude-/, '');
  for (const key of KEYS) {
    // A whole segment only: `opus-4` must not price `opus-45`.
    if (id === key || id.startsWith(`${key}-`) || id.startsWith(`${key}[`)) {
      return PRICES[key];
    }
  }
  return null;
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

/** What one request's tokens cost, in dollars, or null when the model is unpriced. */
export function costOf(model: string, tokens: TokenCounts, fast = false): number | null {
  const base = priceFor(model);
  if (!base) {
    return null;
  }
  const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite5m + tokens.cacheWrite1h;
  const p = base.long && base.longAbove !== undefined && prompt > base.longAbove ? base.long : base;
  const dollars =
    (tokens.input * p.input +
      tokens.output * p.output +
      tokens.cacheWrite5m * p.write5m +
      tokens.cacheWrite1h * p.write1h +
      tokens.cacheRead * p.read) /
    1_000_000;
  return fast ? dollars * FAST_MULTIPLIER : dollars;
}
