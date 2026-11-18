import type { ContextGlance, ContextPart, ContextReport } from '@agentopia/core';
import { contextFill } from '@agentopia/core';

import { MAT } from './kit/palette';

/**
 * How full each desk's context is, and what fills it: what the monitors draw
 * and what the breakdown that opens from one says.
 *
 * The office server reads each session's transcript (`/api/context`); this
 * file asks it, and says how a part of a context looks. Pure apart from the
 * fetches, so the monitors, the panel and their tests read one thing.
 */

/** Each part's colour, in the breakdown's grid and legend. */
export const PART_COLORS: Readonly<Record<ContextPart, string>> = {
  system: MAT.slate.m,
  tools: MAT.cobalt.m,
  mcp: MAT.teal.l,
  memory: MAT.mustard.m,
  skills: MAT.blush.m,
  summary: MAT.oat.d,
  prompts: MAT.tomato.m,
  replies: MAT.mint.m,
  calls: MAT.ochre.l,
  results: MAT.leaf.m,
  reminders: MAT.metal.m,
};

/** How full reads at a glance: fine, filling, nearly full. */
export type FillLevel = 'calm' | 'busy' | 'full';

export function fillLevel(fill: number): FillLevel {
  return fill >= 0.8 ? 'full' : fill >= 0.5 ? 'busy' : 'calm';
}

/** The colour a fill reads in: mint while there is room, mustard filling, tomato nearly full. */
export function fillColor(fill: number): string {
  const level = fillLevel(fill);
  return level === 'full' ? MAT.tomato.m : level === 'busy' ? MAT.mustard.m : MAT.mint.m;
}

/** `49%`, never `0%` for a context with anything in it. */
export function percent(fill: number): string {
  const p = Math.max(0, Math.min(1, fill)) * 100;
  return `${p > 0 && p < 1 ? '<1' : Math.round(p)}%`;
}

/** `1M`, `200k`: a window's size as people say it. */
export function windowLabel(window: number): string {
  return window >= 1e6 ? `${window / 1e6}M` : `${Math.round(window / 1e3)}k`;
}

export { contextFill };

/**
 * Lay a report out on a grid of `cells`, each cell a part's or free: whole
 * cells by largest remainder, so the grid always adds up, and any part with
 * tokens gets at least one cell to be seen by.
 */
export function gridOf(report: ContextReport, cells: number): Array<ContextPart | null> {
  const window = Math.max(report.window, report.used, 1);
  const exact = report.slices.map((s) => ({ part: s.part, n: (s.tokens / window) * cells }));
  const counts = exact.map((e) => Math.max(e.n > 0 ? 1 : 0, Math.floor(e.n)));
  // As many cells as the context is full, and never fewer than it has parts to show.
  const target = Math.max(Math.round((report.used / window) * cells), sum(counts));
  let left = Math.min(cells, target) - sum(counts);
  const order = exact
    .map((e, i) => ({ i, rest: e.n - Math.floor(e.n) }))
    .sort((a, b) => b.rest - a.rest);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length) {
    counts[order[k].i] += 1;
    left -= 1;
  }
  while (left < 0) {
    const biggest = counts.indexOf(Math.max(...counts));
    counts[biggest] -= 1;
    left += 1;
  }
  const out: Array<ContextPart | null> = [];
  exact.forEach((e, i) => {
    for (let c = 0; c < counts[i] && out.length < cells; c++) {
      out.push(e.part);
    }
  });
  while (out.length < cells) {
    out.push(null);
  }
  return out;
}

const sum = (list: number[]): number => list.reduce((a, b) => a + b, 0);

/** How often the floor asks how full every desk is. Transcripts are read only where they grew. */
export const CONTEXT_POLL_MS = 20_000;

/**
 * Ask the office server how full every live desk's context is, now and every
 * `CONTEXT_POLL_MS`, or say once that it has no context source (and stop).
 * Returns a stop function.
 */
export function pollContext(
  onGlances: (glances: Record<string, ContextGlance>) => void,
  onMissing: () => void = () => undefined,
  url = '/api/context'
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
        const body = (await res.json()) as { sessions?: Record<string, ContextGlance> };
        onGlances(body.sessions ?? {});
      }
    } catch {
      // The server went away: try again on the next tick.
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), CONTEXT_POLL_MS);
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

/** One desk's context in full, from the office server; null where it has none. */
export async function fetchContext(bus: string): Promise<ContextReport | null> {
  try {
    const res = await fetch(`/api/context?session=${encodeURIComponent(bus)}`, {
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as ContextReport) : null;
  } catch {
    return null;
  }
}
