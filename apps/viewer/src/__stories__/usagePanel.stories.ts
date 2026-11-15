import {
  CLAUDE_PRICES,
  LEAD_AGENT,
  UsageEntry,
  buildUsageReport,
  costIn,
  seededRng,
} from '@agentopia/core';

import { UsagePanel } from '../usagePanel';

/**
 * The usage ledger the usage board opens, over a made-up month of work: a
 * few sessions a day, the lead doing most of it with subagents helping.
 * Seeded and dated, so the story draws the same every time.
 */

const NOW = Date.parse('2026-11-14T17:00:00Z');
const DAY = 86_400_000;
const SESSIONS = [
  'Fix the flaky login test',
  'Add CSV export',
  'Redesign the settings page',
  'Speed up search',
  'Write the release notes',
];
const AGENTS = [LEAD_AGENT, LEAD_AGENT, LEAD_AGENT, 'Explore', 'general-purpose', 'Plan'];
const MODELS = ['claude-opus-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2'];

function sampleEntries(): UsageEntry[] {
  const rng = seededRng(14);
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const out: UsageEntry[] = [];
  for (let d = 0; d < 120; d++) {
    const busy = rng() < 0.8 ? 20 + Math.floor(rng() * 90) : 0;
    for (let i = 0; i < busy; i++) {
      const model = pick(MODELS);
      const tokens = {
        input: Math.floor(rng() * 40),
        output: Math.floor(500 + rng() * 3000),
        cacheWrite5m: 0,
        cacheWrite1h: Math.floor(rng() * 20_000),
        cacheRead: Math.floor(60_000 + rng() * 200_000),
      };
      out.push({
        harness: 'claude',
        key: `${d}-${i}`,
        ts: NOW - d * DAY - Math.floor(rng() * 8 * 3_600_000),
        session: `s${(d * 3 + Math.floor(rng() * 3)) % 40}`,
        agent: pick(AGENTS),
        model,
        tokens,
      });
    }
  }
  return out;
}

export default {
  title: 'Office/Usage ledger',
  parameters: { layout: 'fullscreen' },
};

export const Ledger = {
  render: () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:relative;width:100%;height:100vh;background:#e3dac6;';
    const report = buildUsageReport(sampleEntries(), {
      now: NOW,
      prices: { source: 'models.dev', at: NOW },
      sessionLabel: (_, id) => ({
        label: SESSIONS[Number(id.slice(1)) % SESSIONS.length],
        detail: 'demo',
      }),
    });
    const panel = new UsagePanel(host, { onClose: () => panel.open() });
    panel.update(report);
    panel.open();
    return host;
  },
};
