import type { ContextReport } from '@agentopia/core';

import { fillColor, fillLevel, gridOf, percent, windowLabel } from '../context';
import { cellTip } from '../contextPanel';
import { mockContextGlance, mockContextReport } from '../mockContext';
import { clutterFor } from '../monitorClutter';

const report = (used: number, window: number, slices: Array<[string, number]>): ContextReport =>
  ({
    harness: 'claude',
    session: 's',
    used,
    window,
    slices: slices.map(([part, tokens]) => ({ part, label: part, tokens })),
    estimated: false,
    at: 0,
    turns: 0,
    compactions: 0,
    peak: used,
  }) as ContextReport;

describe('gridOf', () => {
  it.each([
    [
      report(100_000, 200_000, [
        ['system', 20_000],
        ['results', 80_000],
      ]),
      100,
    ],
    [
      report(1_000, 1_000_000, [
        ['system', 400],
        ['prompts', 600],
      ]),
      2,
    ],
    [
      report(199_000, 200_000, [
        ['tools', 99_500],
        ['results', 99_500],
      ]),
      199,
    ],
  ])('fills as many cells as the context is full, every part seen', (r, filled) => {
    const cells = gridOf(r, 200);
    expect(cells).toHaveLength(200);
    expect(cells.filter(Boolean)).toHaveLength(filled);
    for (const slice of r.slices) {
      expect(cells).toContain(slice.part);
    }
  });
});

describe('fill readings', () => {
  it.each([
    [0.1, 'calm', '10%'],
    [0.6, 'busy', '60%'],
    [0.9, 'full', '90%'],
    [0.002, 'calm', '<1%'],
  ])('reads %d as %s, %s', (fill, level, text) => {
    expect(fillLevel(fill)).toBe(level);
    expect(percent(fill)).toBe(text);
    expect(fillColor(fill)).toMatch(/^#/);
  });

  it.each([
    [1_000_000, '1M'],
    [200_000, '200k'],
  ])('says a %d-token window as %s', (window, label) => {
    expect(windowLabel(window)).toBe(label);
  });
});

describe('clutterFor', () => {
  const W = 110;
  const H = 55;
  const count = (f: number, busy = false): number => {
    const c = clutterFor(f, 42, W, H, busy);
    return c.windows.length + c.icons.length + c.notes.length + (c.alert ? 1 : 0);
  };

  it.each([[false], [true]])('only ever grows as the context fills (busy %s)', (busy) => {
    let last = -1;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const n = count(f, busy);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(count(1, busy)).toBeGreaterThan(count(0, busy));
  });

  it('keeps what was on the glass where it was as more piles on', () => {
    const before = clutterFor(0.5, 7, W, H);
    const after = clutterFor(0.9, 7, W, H);
    expect(after.windows.slice(0, before.windows.length)).toEqual(before.windows);
  });

  it('is the tidy desktop when empty, and warns when nearly full', () => {
    expect(clutterFor(0, 1, W, H)).toMatchObject({ notes: [], alert: null });
    expect(clutterFor(0, 1, W, H).windows).toHaveLength(2);
    expect(clutterFor(0, 1, W, H, true).windows).toHaveLength(0);
    expect(clutterFor(0.95, 1, W, H).alert).not.toBeNull();
  });

  it('differs desk to desk at the same fill', () => {
    expect(clutterFor(0.7, 1, W, H).windows).not.toEqual(clutterFor(0.7, 2, W, H).windows);
  });
});

describe('mock context', () => {
  it.each([['auto-demo-1'], ['auto-demo-2'], ['x']])('adds up for %s', (bus) => {
    const r = mockContextReport(bus, 0);
    expect(r.slices.reduce((a, s) => a + s.tokens, 0)).toBe(r.used);
    expect(mockContextGlance(bus)).toEqual({ used: r.used, window: r.window });
  });
});

describe('cellTip', () => {
  const r = report(100_000, 200_000, [
    ['system', 20_000],
    ['results', 80_000],
  ]);
  it.each([
    ['results', 'results', '80.0k tokens, 40% of the window'],
    [null, 'Free space', '100k tokens, 50% of the window'],
  ] as const)('names a %s square', (part, title, detail) => {
    expect(cellTip(r, part)).toEqual({ title, detail });
  });
});
