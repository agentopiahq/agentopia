import type { UsagePeriod, UsageReport, UsageRow } from '@agentopia/core';

/**
 * What the usage board in the room shows, and how its numbers read.
 *
 * The office server adds usage up from Claude Code's transcripts
 * (`/api/usage`); this file turns that report into the handful of numbers
 * the board on the wall has room for, and formats money and tokens the same
 * way on the board and in the panel that opens from it. Pure, so the board,
 * the panel and their tests all read one thing.
 */

/** The board's numbers. */
export interface UsageGlance {
  today: { cost: number; tokens: number };
  week: number;
  month: number;
  /** The last seven days, oldest first, ending today. */
  days: Array<{ label: string; cost: number }>;
  /** Who spent the most today: up to three. */
  agents: Array<{ label: string; cost: number }>;
}

/**
 * What the board is told: its numbers, `reading` while the first report is
 * on its way, `none` where the page has no usage source (a replay of a
 * file, the marketing site's demo has a glance of its own).
 */
export type UsageBoardState = UsageGlance | 'reading' | 'none';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A day's initial, from its `YYYY-MM-DD` key. */
export function weekdayOf(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
  return WEEKDAYS[day] ?? '';
}

const last = <T>(list: T[]): T | undefined => list[list.length - 1];

export function glanceOf(report: UsageReport): UsageGlance {
  const today = last(report.days);
  return {
    today: { cost: today?.cost ?? 0, tokens: today?.tokens ?? 0 },
    week: last(report.weeks)?.cost ?? 0,
    month: last(report.months)?.cost ?? 0,
    days: report.days.slice(-7).map((d) => ({ label: weekdayOf(d.key), cost: d.cost })),
    agents: (today?.agents ?? []).slice(0, 3).map((a) => ({ label: a.label, cost: a.cost })),
  };
}

/** The board as authored: a believable day, for the stories and the marketing site's office. */
export const SAMPLE_GLANCE: UsageGlance = {
  today: { cost: 18.4, tokens: 31_200_000 },
  week: 96.2,
  month: 412,
  days: [
    { label: 'S', cost: 6.1 },
    { label: 'M', cost: 14.8 },
    { label: 'T', cost: 22.5 },
    { label: 'W', cost: 11.2 },
    { label: 'T', cost: 9.6 },
    { label: 'F', cost: 13.7 },
    { label: 'S', cost: 18.4 },
  ],
  agents: [
    { label: 'Lead', cost: 12.9 },
    { label: 'Explore', cost: 3.8 },
    { label: 'Plan', cost: 1.7 },
  ],
};

/** Always to the cent, thousands separated: `$0.42`, `$18.40`, `$1,480.42`. */
export function money(dollars: number): string {
  const d = Math.max(0, dollars);
  return `$${d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `950`, `12.4k`, `3.1M`, `1.2B`. */
export function tokens(n: number): string {
  const v = Math.max(0, n);
  const unit = (div: number, suffix: string): string => {
    const x = v / div;
    return `${x >= 100 ? Math.round(x) : x.toFixed(1)}${suffix}`;
  };
  if (v >= 1e9) {
    return unit(1e9, 'B');
  }
  if (v >= 1e6) {
    return unit(1e6, 'M');
  }
  if (v >= 1e3) {
    return unit(1e3, 'k');
  }
  return String(Math.round(v));
}

export type UsageView = 'days' | 'weeks' | 'months';
export type UsageDimension = 'harnesses' | 'agents' | 'projects' | 'sessions' | 'models';

/** A period's rows for one breakdown. */
export const rowsOf = (period: UsagePeriod, by: UsageDimension): UsageRow[] => period[by];

/** How long the page waits between reports: the server reads only what is new. */
export const USAGE_POLL_MS = 60_000;

/**
 * Ask the office server for usage now and every `USAGE_POLL_MS`, handing
 * each report on, or saying once that the server has no usage source (and
 * stopping). Returns a stop function.
 */
export function pollUsage(
  onReport: (report: UsageReport) => void,
  onMissing: () => void,
  url = '/api/usage'
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async (): Promise<void> => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 404) {
        onMissing();
        return;
      }
      if (res.ok) {
        onReport((await res.json()) as UsageReport);
      }
    } catch {
      // The server went away: try again on the next tick.
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), USAGE_POLL_MS);
    }
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}
