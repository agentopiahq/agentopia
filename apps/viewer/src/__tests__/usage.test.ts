import { UsagePeriod, UsageReport, emptyTotals } from '@agentopia/core';

import { mockUsageReport } from '../mockUsage';
import { usageStateOf } from '../objects/usageBoard';
import { SAMPLE_GLANCE, glanceOf, money, tokens, weekdayOf } from '../usage';
import { niceStep, periodTitle, pricesNote } from '../usagePanel';

const period = (key: string, label: string, cost: number): UsagePeriod => ({
  key,
  label,
  ...emptyTotals(),
  cost,
  tokens: cost * 1000,
  harnesses: [{ id: 'claude:claude', harness: 'claude', label: 'Claude Code', ...emptyTotals() }],
  agents: [
    { id: 'claude:lead', harness: 'claude', label: 'Lead', ...emptyTotals(), cost: cost * 0.75 },
    {
      id: 'claude:Explore',
      harness: 'claude',
      label: 'Explore',
      ...emptyTotals(),
      cost: cost * 0.25,
    },
  ],
  projects: [],
  models: [],
});

describe('money', () => {
  it.each([
    [0, '$0.00'],
    [0.424, '$0.42'],
    [0.005, '$0.01'],
    [18.4, '$18.40'],
    [412.4, '$412.40'],
    [1480.416, '$1,480.42'],
    [12_400, '$12,400.00'],
  ])('writes $%d as %s', (dollars, text) => {
    expect(money(dollars)).toBe(text);
  });
});

describe('tokens', () => {
  it.each([
    [950, '950'],
    [12_400, '12.4k'],
    [3_140_000, '3.1M'],
    [412_000_000, '412M'],
    [1_200_000_000, '1.2B'],
  ])('writes %d as %s', (n, text) => {
    expect(tokens(n)).toBe(text);
  });
});

describe('glanceOf', () => {
  it("reads today, the week, the month, the last seven days and today's top agents", () => {
    const days = Array.from({ length: 10 }, (_, i) =>
      period(`2026-11-${String(5 + i).padStart(2, '0')}`, `Nov ${5 + i}`, i + 1)
    );
    const report: UsageReport = {
      at: 0,
      days,
      weeks: [period('2026-11-09', 'Nov 9', 40)],
      months: [period('2026-10', 'Oct', 90), period('2026-11', 'Nov', 120)],
      allTime: emptyTotals(),
      unpriced: [],
      harnesses: [{ id: 'claude', label: 'Claude Code' }],
      prices: { source: 'bundled' },
    };
    const glance = glanceOf(report);
    expect(glance.today).toEqual({ cost: 10, tokens: 10_000 });
    expect(glance.week).toBe(40);
    expect(glance.month).toBe(120);
    // Sunday 8th to Saturday 14th.
    expect(glance.days.map((d) => d.label).join('')).toBe('SMTWTFS');
    expect(glance.days.map((d) => d.cost)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(glance.agents).toEqual([
      { label: 'Lead', cost: 7.5 },
      { label: 'Explore', cost: 2.5 },
    ]);
  });

  it('reads an empty report as nothing spent', () => {
    const empty: UsageReport = {
      at: 0,
      days: [],
      weeks: [],
      months: [],
      allTime: emptyTotals(),
      unpriced: [],
      harnesses: [],
      prices: { source: 'bundled' },
    };
    expect(glanceOf(empty)).toMatchObject({ today: { cost: 0 }, week: 0, days: [], agents: [] });
  });
});

describe('weekdayOf', () => {
  it.each([
    ['2026-11-14', 'S'],
    ['2026-11-16', 'M'],
    ['2026-11-18', 'W'],
  ])('reads %s as %s', (key, day) => {
    expect(weekdayOf(key)).toBe(day);
  });
});

describe('usageStateOf', () => {
  it('shows the sample day until told, then what it is told', () => {
    expect(usageStateOf()).toBe(SAMPLE_GLANCE);
    expect(usageStateOf({ usage: 'reading' })).toBe('reading');
    expect(usageStateOf({ usage: 'none' })).toBe('none');
    const glance = { ...SAMPLE_GLANCE, week: 1 };
    expect(usageStateOf({ usage: glance })).toBe(glance);
  });
});

describe('the ledger', () => {
  it.each([
    [7, 2],
    [140, 50],
    [300, 100],
    [0, 0.005],
  ])('rules a chart that peaks at $%d every $%d', (peak, step) => {
    expect(niceStep(peak)).toBeCloseTo(step);
  });

  it.each([
    ['days', period('2026-11-14', 'Nov 14', 1), 'Saturday, Nov 14'],
    ['weeks', period('2026-11-09', 'Nov 9', 1), 'Week of Nov 9'],
    ['months', period('2026-11', 'Nov', 1), 'November 2026'],
  ] as const)('heads a %s period', (view, p, title) => {
    expect(periodTitle(view, p)).toBe(title);
  });
});

describe('pricesNote', () => {
  it('says where the prices came from', () => {
    expect(pricesNote({ source: 'models.dev', at: Date.UTC(2026, 10, 14, 12) })).toMatch(
      /^API prices from models\.dev, Nov 1[45]$/
    );
    expect(pricesNote({ source: 'bundled' })).toBe('API prices built in (models.dev not reached)');
  });
});

describe('mockUsageReport', () => {
  const now = Date.parse('2026-11-14T17:00:00Z');

  it('is the same every time, and ends today with work in it', () => {
    const a = mockUsageReport(now);
    expect(mockUsageReport(now)).toEqual(a);
    const today = a.days[a.days.length - 1];
    expect(a.months[a.months.length - 1].cost).toBeGreaterThan(0);
    expect(a.weeks.filter((w) => w.cost > 0).length).toBeGreaterThan(8);
    expect(a.unpriced).toEqual([]);
    expect(a.harnesses).toEqual([{ id: 'claude', label: 'Claude Code' }]);
    expect(today.key).toBe(a.days[a.days.length - 1].key);
  });

  it('has subagents beside the lead, and named sessions in projects', () => {
    const month = mockUsageReport(now).months.at(-1)!;
    expect(month.agents.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Lead', 'Explore', 'general-purpose', 'Plan'])
    );
    const [top] = month.projects;
    expect(top.sessions[0].label).not.toMatch(/^mock-/);
    expect(top.sessionCount).toBeGreaterThan(1);
    expect(month.projects.map((r) => r.label).sort()).toEqual([
      'acme-api',
      'acme-docs',
      'acme-web',
    ]);
  });
});
