import { TokenCounts } from './entry';

/**
 * What a model's tokens cost on its vendor's API, per million.
 *
 * Coding agents on a subscription bill nothing per token, so this is the
 * API-equivalent cost: what the same work would have cost on the API at
 * first-party rates. That is what ccusage reports too, and the only cost a
 * transcript can tell you.
 *
 * Kept in code rather than fetched, on purpose: the office never reaches the
 * network. A model a table does not know costs nothing and is reported as
 * unpriced, so a new model shows up as a gap rather than a wrong number.
 * Each harness's adapter brings the table for the models it runs.
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
   * together) bill at `long` instead.
   */
  longAbove?: number;
  long?: Omit<Price, 'longAbove' | 'long'>;
  /** What fast mode multiplies every rate by, where the model has one. */
  fast?: number;
}

/** A vendor's prices by model id. */
export interface PriceTable {
  /** Stripped from a model id before matching (`claude-`). */
  prefix?: string;
  /**
   * Keyed by model id without the prefix, matched by the longest key that
   * is the whole id or a whole leading part of it, so a dated snapshot
   * (`haiku-4-5-20251001`) finds its family.
   */
  models: Readonly<Record<string, Price>>;
}

/** An input and output rate, with the usual cache multipliers: writes 1.25x (5m) and 2x (1h), reads 0.1x. */
export const priced = (input: number, output: number, read = input * 0.1): Price => ({
  input,
  output,
  write5m: input * 1.25,
  write1h: input * 2,
  read,
});

const sortedKeys = new WeakMap<PriceTable, string[]>();

/** A model id's price in a table, or null for one it does not know. */
export function priceIn(table: PriceTable, model: string): Price | null {
  let keys = sortedKeys.get(table);
  if (!keys) {
    keys = Object.keys(table.models).sort((a, b) => b.length - a.length);
    sortedKeys.set(table, keys);
  }
  const lower = model.toLowerCase();
  const id =
    table.prefix && lower.startsWith(table.prefix) ? lower.slice(table.prefix.length) : lower;
  for (const key of keys) {
    // A whole segment only: `opus-4` must not price `opus-45`.
    if (id === key || id.startsWith(`${key}-`) || id.startsWith(`${key}[`)) {
      return table.models[key];
    }
  }
  return null;
}

/** What one response's tokens cost, in dollars, or null when the model is unpriced. */
export function costIn(
  table: PriceTable,
  model: string,
  tokens: TokenCounts,
  fast = false
): number | null {
  const base = priceIn(table, model);
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
  return fast ? dollars * (base.fast ?? 1) : dollars;
}
