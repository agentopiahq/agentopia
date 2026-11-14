import { LEAD_AGENT, UsageEntry, totalTokens } from './transcript';

/**
 * Usage, added up the way ccusage does it — by day, by week and by month —
 * and, within each period, by agent, by session and by model.
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
  id: string;
  label: string;
  /** A second line: a session's project. */
  detail?: string;
}

export interface UsagePeriod extends UsageTotals {
  /** `2026-11-14` for a day or the Monday a week starts, `2026-11` for a month. */
  key: string;
  /** Short: `Nov 14`, `Nov 10`, `Nov`. */
  label: string;
  /** Most expensive first. */
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
}

export interface UsageReportOptions {
  now: number;
  /** Minutes the local clock is ahead of UTC at a moment (`-new Date(ts).getTimezoneOffset()`). */
  offsetOf?: (ts: number) => number;
  /** A session's name and project, for its row. */
  sessionLabel?: (id: string) => { label: string; detail?: string };
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

function add(into: UsageTotals, e: UsageEntry): void {
  into.cost += e.cost;
  into.input += e.tokens.input;
  into.output += e.tokens.output;
  into.cacheWrite += e.tokens.cacheWrite5m + e.tokens.cacheWrite1h;
  into.cacheRead += e.tokens.cacheRead;
  into.tokens += totalTokens(e.tokens);
  into.requests += 1;
}

/** A period being added up: its totals and a row per agent, session and model. */
interface Tally {
  totals: UsageTotals;
  agents: Map<string, UsageTotals>;
  sessions: Map<string, UsageTotals>;
  models: Map<string, UsageTotals>;
}

const tally = (): Tally => ({
  totals: emptyTotals(),
  agents: new Map(),
  sessions: new Map(),
  models: new Map(),
});

function bump(rows: Map<string, UsageTotals>, id: string, e: UsageEntry): void {
  let row = rows.get(id);
  if (!row) {
    row = emptyTotals();
    rows.set(id, row);
  }
  add(row, e);
}

/** Most expensive first; ties by tokens, then by id, so the order is stable. */
const byCost = (a: UsageRow, b: UsageRow): number =>
  b.cost - a.cost || b.tokens - a.tokens || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** `lead` reads as the session's own agent; a subagent's type reads as itself. */
export const agentLabel = (agent: string): string => (agent === LEAD_AGENT ? 'Lead' : agent);

export function buildUsageReport(
  entries: Iterable<UsageEntry>,
  options: UsageReportOptions
): UsageReport {
  const offsetOf = options.offsetOf ?? ((): number => 0);
  const sessionLabel =
    options.sessionLabel ?? ((id: string): { label: string } => ({ label: id.slice(0, 8) }));
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

  const into = (map: Map<number, Tally>, at: number, e: UsageEntry): void => {
    let t = map.get(at);
    if (!t) {
      t = tally();
      map.set(at, t);
    }
    add(t.totals, e);
    bump(t.agents, e.agent, e);
    bump(t.sessions, e.session, e);
    bump(t.models, e.model, e);
  };

  for (const e of entries) {
    add(allTime, e);
    if (!e.priced) {
      unpriced.add(e.model);
    }
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

  const rows = (
    map: Map<string, UsageTotals>,
    label: (id: string) => { label: string; detail?: string }
  ): UsageRow[] => [...map].map(([id, totals]) => ({ id, ...label(id), ...totals })).sort(byCost);

  const period = (key: string, label: string, t: Tally | undefined): UsagePeriod => {
    const sessions = t ? rows(t.sessions, sessionLabel) : [];
    return {
      key,
      label,
      ...(t?.totals ?? emptyTotals()),
      agents: t ? rows(t.agents, (id) => ({ label: agentLabel(id) })) : [],
      sessions: sessions.slice(0, topSessions),
      models: t ? rows(t.models, (id) => ({ label: id.replace(/^claude-/, '') })) : [],
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
  };
}
