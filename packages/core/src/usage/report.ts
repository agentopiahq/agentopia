import { USAGE_ADAPTERS } from './adapters';
import { LEAD_AGENT, UsageEntry, totalTokens } from './entry';
import { PriceTable, costIn } from './prices';

/**
 * Usage, added up the way ccusage does it — by day, by week and by month —
 * and, within each period, by harness, by agent, by session and by model.
 * Every harness's entries add up the same way; rows are kept apart by
 * harness (a Claude Code lead and a Codex lead are two rows).
 *
 * Pure: the clock and the time zone are handed in. Periods are calendar
 * days in the caller's local time, so `offsetOf` says how far that time is
 * from UTC at a moment (it is a function because daylight saving moves it).
 */

export type UsageSpan = 'day' | 'week' | 'month';

export interface UsageTotals {
  /** Dollars at API rates. */
  cost: number;
  input: number;
  output: number;
  /** Cache writes, both TTLs. */
  cacheWrite: number;
  cacheRead: number;
  /** Every token above. */
  tokens: number;
  /** API responses. */
  requests: number;
}

export interface UsageRow extends UsageTotals {
  /** Unique within its breakdown: `<harness>:<id>` for agents, sessions and models. */
  id: string;
  /** The harness the row's work was done in. */
  harness: string;
  label: string;
  /** A second line: a session's project, or an agent's harness when there are several. */
  detail?: string;
}

export interface UsagePeriod extends UsageTotals {
  /** `2026-11-14` for a day or the Monday a week starts, `2026-11` for a month. */
  key: string;
  /** Short: `Nov 14`, `Nov 10`, `Nov`. */
  label: string;
  /** Most expensive first. */
  harnesses: UsageRow[];
  agents: UsageRow[];
  sessions: UsageRow[];
  models: UsageRow[];
  /** Sessions past the ones listed. */
  moreSessions: number;
}

export interface UsageReport {
  /** When it was added up. */
  at: number;
  /** Oldest first, ending with the current one; periods with nothing in them included. */
  days: UsagePeriod[];
  weeks: UsagePeriod[];
  months: UsagePeriod[];
  /** Every entry ever read. */
  allTime: UsageTotals;
  /** Models seen that have no price, so their cost reads as 0. */
  unpriced: string[];
  /** Every harness with usage, by id, with the name the ledger shows. */
  harnesses: Array<{ id: string; label: string }>;
  /** Where the prices came from: `models.dev` (fetched `at`), or the tables bundled in code. */
  prices: UsagePricesSource;
}

export interface UsagePricesSource {
  source: 'models.dev' | 'bundled';
  /** When they were fetched. */
  at?: number;
}

export interface UsageReportOptions {
  now: number;
  /** Minutes the local clock is ahead of UTC at a moment (`-new Date(ts).getTimezoneOffset()`). */
  offsetOf?: (ts: number) => number;
  /** A session's name and project, for its row. */
  sessionLabel?: (harness: string, id: string) => { label: string; detail?: string };
  /** A harness's name: its usage adapter's label unless told otherwise. */
  harnessLabel?: (harness: string) => string;
  /** A harness's prices: its usage adapter's bundled table unless told otherwise. */
  pricesFor?: (harness: string) => PriceTable | undefined;
  /** Where `pricesFor`'s prices came from, for the ledger to say. */
  prices?: UsagePricesSource;
  days?: number;
  weeks?: number;
  months?: number;
  /** How many sessions each period lists. */
  topSessions?: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;
const two = (n: number): string => String(n).padStart(2, '0');

/** A calendar date, as days since the epoch: the arithmetic stays in whole days. */
const dayKey = (day: number): string => {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
};
const dayLabel = (day: number): string => {
  const d = new Date(day * DAY_MS);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
/** The Monday on or before a day (the epoch was a Thursday). */
const weekStart = (day: number): number => day - ((day + 3) % 7);
/** A month as a count since year 0, so months subtract like days. */
const monthOf = (day: number): number => {
  const d = new Date(day * DAY_MS);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const monthKey = (m: number): string => `${Math.floor(m / 12)}-${two((m % 12) + 1)}`;

export const emptyTotals = (): UsageTotals => ({
  cost: 0,
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  tokens: 0,
  requests: 0,
});

/** An entry with its cost at the prices in force. */
interface Costed extends UsageEntry {
  cost: number;
}

function add(into: UsageTotals, e: Costed): void {
  into.cost += e.cost;
  into.input += e.tokens.input;
  into.output += e.tokens.output;
  into.cacheWrite += e.tokens.cacheWrite5m + e.tokens.cacheWrite1h;
  into.cacheRead += e.tokens.cacheRead;
  into.tokens += totalTokens(e.tokens);
  into.requests += 1;
}

/** One row being added up: whose it is, and its totals so far. */
interface Tallied {
  harness: string;
  id: string;
  totals: UsageTotals;
}

/** A period being added up: its totals and a row per harness, agent, session and model. */
interface Tally {
  totals: UsageTotals;
  harnesses: Map<string, Tallied>;
  agents: Map<string, Tallied>;
  sessions: Map<string, Tallied>;
  models: Map<string, Tallied>;
}

const tally = (): Tally => ({
  totals: emptyTotals(),
  harnesses: new Map(),
  agents: new Map(),
  sessions: new Map(),
  models: new Map(),
});

/** Count an entry into its row, keyed by its harness and `id` so harnesses never share a row. */
function bump(rows: Map<string, Tallied>, id: string, e: Costed): void {
  const key = `${e.harness}:${id}`;
  let row = rows.get(key);
  if (!row) {
    row = { harness: e.harness, id, totals: emptyTotals() };
    rows.set(key, row);
  }
  add(row.totals, e);
}

/** Most expensive first; ties by tokens, then by id, so the order is stable. */
const byCost = (a: UsageRow, b: UsageRow): number =>
  b.cost - a.cost || b.tokens - a.tokens || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** `lead` reads as the session's own agent; a subagent's type reads as itself. */
export const agentLabel = (agent: string): string => (agent === LEAD_AGENT ? 'Lead' : agent);

type Labeller = (harness: string, id: string) => { label: string; detail?: string };

export function buildUsageReport(
  entries: Iterable<UsageEntry>,
  options: UsageReportOptions
): UsageReport {
  const offsetOf = options.offsetOf ?? ((): number => 0);
  const sessionLabel: Labeller =
    options.sessionLabel ?? ((_, id): { label: string } => ({ label: id.slice(0, 8) }));
  const harnessLabel =
    options.harnessLabel ?? ((h: string): string => USAGE_ADAPTERS[h]?.label ?? h);
  const topSessions = options.topSessions ?? 25;
  const localDay = (ts: number): number => Math.floor((ts + offsetOf(ts) * 60_000) / DAY_MS);

  const today = localDay(options.now);
  const nDays = options.days ?? 31;
  const nWeeks = options.weeks ?? 12;
  const nMonths = options.months ?? 12;
  const firstDay = today - nDays + 1;
  const firstWeek = weekStart(today) - (nWeeks - 1) * 7;
  const thisMonth = monthOf(today);
  const firstMonth = thisMonth - nMonths + 1;

  const days = new Map<number, Tally>();
  const weeks = new Map<number, Tally>();
  const months = new Map<number, Tally>();
  const allTime = emptyTotals();
  const unpriced = new Set<string>();
  const seen = new Set<string>();

  const pricesFor =
    options.pricesFor ?? ((h: string): PriceTable | undefined => USAGE_ADAPTERS[h]?.prices);

  const into = (map: Map<number, Tally>, at: number, e: Costed): void => {
    let t = map.get(at);
    if (!t) {
      t = tally();
      map.set(at, t);
    }
    add(t.totals, e);
    bump(t.harnesses, e.harness, e);
    bump(t.agents, e.agent, e);
    bump(t.sessions, e.session, e);
    bump(t.models, e.model, e);
  };

  for (const entry of entries) {
    const table = pricesFor(entry.harness);
    const cost = table ? costIn(table, entry.model, entry.tokens, entry.fast) : null;
    if (cost === null) {
      unpriced.add(entry.model);
    }
    const e: Costed = { ...entry, cost: cost ?? 0 };
    add(allTime, e);
    seen.add(e.harness);
    const day = localDay(e.ts);
    if (day >= firstDay && day <= today) {
      into(days, day, e);
    }
    const week = weekStart(day);
    if (week >= firstWeek && day <= today) {
      into(weeks, week, e);
    }
    const month = monthOf(day);
    if (month >= firstMonth && day <= today) {
      into(months, month, e);
    }
  }

  // An agent's harness is worth a second line only when there is more than one.
  const several = seen.size > 1;
  const labels: Record<'harnesses' | 'agents' | 'models', Labeller> = {
    harnesses: (h) => ({ label: harnessLabel(h) }),
    agents: (h, id) => ({ label: agentLabel(id), detail: several ? harnessLabel(h) : undefined }),
    models: (h, id) => ({ label: USAGE_ADAPTERS[h]?.modelLabel?.(id) ?? id }),
  };

  const rows = (map: Map<string, Tallied>, label: Labeller): UsageRow[] =>
    [...map]
      .map(([key, row]) => ({
        id: key,
        harness: row.harness,
        ...label(row.harness, row.id),
        ...row.totals,
      }))
      .sort(byCost);

  const period = (key: string, label: string, t: Tally | undefined): UsagePeriod => {
    const sessions = t ? rows(t.sessions, sessionLabel) : [];
    return {
      key,
      label,
      ...(t?.totals ?? emptyTotals()),
      harnesses: t ? rows(t.harnesses, labels.harnesses) : [],
      agents: t ? rows(t.agents, labels.agents) : [],
      sessions: sessions.slice(0, topSessions),
      models: t ? rows(t.models, labels.models) : [],
      moreSessions: Math.max(0, sessions.length - topSessions),
    };
  };

  return {
    at: options.now,
    days: Array.from({ length: nDays }, (_, i) => {
      const day = firstDay + i;
      return period(dayKey(day), dayLabel(day), days.get(day));
    }),
    weeks: Array.from({ length: nWeeks }, (_, i) => {
      const week = firstWeek + i * 7;
      return period(dayKey(week), dayLabel(week), weeks.get(week));
    }),
    months: Array.from({ length: nMonths }, (_, i) => {
      const month = firstMonth + i;
      return period(monthKey(month), MONTHS[month % 12], months.get(month));
    }),
    allTime,
    unpriced: [...unpriced].sort(),
    harnesses: [...seen].sort().map((id) => ({ id, label: harnessLabel(id) })),
    prices: options.prices ?? { source: 'bundled' },
  };
}
