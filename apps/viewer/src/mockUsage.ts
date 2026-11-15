import {
  CLAUDE_HARNESS,
  LEAD_AGENT,
  UsageEntry,
  UsageReport,
  buildUsageReport,
  seededRng,
} from '@agentopia/core';

/**
 * A made-up four months of Claude Code work, for wherever the office has no
 * server to read real usage from: the marketing site's demo and the stories.
 * A few sessions most days, the lead doing most of the work with subagents
 * helping, mostly on Opus. Seeded, and dated back from `now`, so it always
 * ends today and reads the same on every visit that day.
 */

const DAY = 86_400_000;
const SESSIONS = [
  'Tidy up the office',
  'Fix the flaky login test',
  'Add CSV export',
  'Redesign the settings page',
  'Speed up search',
  'Write the release notes',
  'Migrate the billing webhooks',
  'Dark mode for the dashboard',
];
const PROJECTS = ['acme-web', 'acme-api', 'acme-web', 'acme-docs'];
const AGENTS = [
  LEAD_AGENT,
  LEAD_AGENT,
  LEAD_AGENT,
  LEAD_AGENT,
  'Explore',
  'general-purpose',
  'Plan',
];
const MODELS = ['claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5'];

export function mockUsageEntries(now: number, days = 120): UsageEntry[] {
  const rng = seededRng(14);
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const out: UsageEntry[] = [];
  for (let d = 0; d < days; d++) {
    // Most days busy, weekends lighter, the odd day off.
    const busy = rng() < 0.82 ? 20 + Math.floor(rng() * 90) : 0;
    for (let i = 0; i < busy; i++) {
      const n = (d * 3 + Math.floor(rng() * 3)) % 40;
      out.push({
        harness: CLAUDE_HARNESS,
        key: `mock-${d}-${i}`,
        ts: now - d * DAY - Math.floor(rng() * 8 * 3_600_000) - 60_000,
        session: `mock-${n}`,
        cwd: `/Users/you/code/${PROJECTS[n % PROJECTS.length]}`,
        agent: pick(AGENTS),
        model: pick(MODELS),
        tokens: {
          input: Math.floor(rng() * 40),
          output: Math.floor(500 + rng() * 3000),
          cacheWrite5m: 0,
          cacheWrite1h: Math.floor(rng() * 20_000),
          cacheRead: Math.floor(60_000 + rng() * 200_000),
        },
      });
    }
  }
  return out;
}

/** The mock usage, added up as the office server would, in the viewer's own time zone. */
export function mockUsageReport(now: number): UsageReport {
  return buildUsageReport(mockUsageEntries(now), {
    now,
    offsetOf: (ts) => -new Date(ts).getTimezoneOffset(),
    sessionLabel: (_, id) => {
      const n = Number(id.replace('mock-', ''));
      return { label: SESSIONS[n % SESSIONS.length], detail: PROJECTS[n % PROJECTS.length] };
    },
  });
}
