import {
  CONTEXT_PART_LABELS,
  ContextGlance,
  ContextPart,
  ContextReport,
  apportion,
} from '@agentopia/core';

/**
 * A made-up context for a desk in the marketing site's office, which has no
 * server and no transcripts: each mock session gets a fill of its own (from
 * its bus id, so a desk keeps its fill) and a believable breakdown of it.
 */

const WINDOW = 200_000;

/** Set-up, in tokens, as a fresh Claude Code session has it. */
const SETUP: ReadonlyArray<readonly [ContextPart, number]> = [
  ['system', 6_200],
  ['tools', 11_800],
  ['mcp', 4_100],
  ['memory', 2_300],
  ['skills', 1_600],
];

/** How a conversation's share splits, by weight. */
const TALK: ReadonlyArray<readonly [ContextPart, number]> = [
  ['prompts', 4],
  ['replies', 13],
  ['calls', 21],
  ['results', 55],
  ['reminders', 7],
];

function hashOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

/** A mock desk's fill, 0.14 to 0.94, the same every time for its bus. */
export function mockFill(bus: string): number {
  return 0.14 + 0.8 * ((hashOf(bus) % 1000) / 1000);
}

export function mockContextGlance(bus: string): ContextGlance {
  return { used: Math.round(mockFill(bus) * WINDOW), window: WINDOW };
}

export function mockContextReport(bus: string, now: number): ContextReport {
  const { used } = mockContextGlance(bus);
  const setup = SETUP.reduce((acc, [, n]) => acc + n, 0);
  const parts = new Map<ContextPart, number>(SETUP);
  for (const [part, n] of apportion(Math.max(0, used - setup), TALK)) {
    parts.set(part, n);
  }
  return {
    harness: 'claude',
    session: bus,
    model: 'claude-opus-5-5',
    used,
    window: WINDOW,
    slices: [...parts].map(([part, tokens]) => ({
      part,
      label: CONTEXT_PART_LABELS[part],
      tokens,
    })),
    estimated: false,
    at: now,
    turns: 2 + (hashOf(bus) % 9),
    compactions: 0,
    peak: used,
  };
}
