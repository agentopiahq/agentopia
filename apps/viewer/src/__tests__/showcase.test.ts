import {
  Actor,
  Director,
  EVENT_KINDS,
  choreographyFor,
  manualClock,
  seededRng,
} from '@agentopia/core';

import { showcaseScenario } from '../__stories__/lib/scenarios';

/** Every actor frame the scenario produces, sampled like the story player. */
function play(): Actor[][] {
  const scenario = showcaseScenario();
  const start = scenario.events[0].event.ts;
  const clock = manualClock(start);
  const director = new Director({
    clock,
    rng: seededRng(7),
    choreography: choreographyFor('claude'),
  });
  let next = 0;
  const frames: Actor[][] = [];
  for (let t = 0; t <= scenario.durationMs; t += 50) {
    clock.set(start + t);
    while (next < scenario.events.length && scenario.events[next].event.ts <= start + t) {
      director.ingest({ seq: next, event: scenario.events[next].event });
      next += 1;
    }
    frames.push(director.frame().actors);
  }
  return frames;
}

describe('showcase scenario', () => {
  const scenario = showcaseScenario();

  it('covers every event kind, so a new one cannot be added without staging it', () => {
    const seen = new Set(scenario.events.map((timed) => timed.event.kind));
    expect([...EVENT_KINDS].filter((kind) => !seen.has(kind))).toEqual([]);
  });

  it('runs its events in order and finishes inside the story duration', () => {
    const offsets = scenario.events.map((timed) => timed.event.ts);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    const last = offsets[offsets.length - 1] - offsets[0];
    expect(last).toBeLessThan(scenario.durationMs);
  });

  it('pairs every tool start with an end that shares its id', () => {
    const opened = new Map<string, string>();
    for (const { event } of scenario.events) {
      const id = event.tool?.id;
      if (!id) {
        continue;
      }
      if (event.kind === 'tool.start') {
        expect(opened.has(id)).toBe(false);
        opened.set(id, event.worker);
      } else if (event.kind === 'tool.end') {
        expect(opened.get(id)).toBe(event.worker);
        opened.delete(id);
      }
    }
    expect([...opened.keys()]).toEqual([]);
  });

  // The scenario is only a showcase if it actually stages a busy office, and
  // the events alone do not prove that — the director decides what is staged.
  describe('played through the real director', () => {
    const frames = play();
    const everyActor = frames.flat();

    it('fills the office, sends the helpers home, and empties the desk at the end', () => {
      expect(Math.max(...frames.map((actors) => actors.length))).toBeGreaterThanOrEqual(3);
      // Only hired help leaves mid-session; the lead goes when the session ends.
      const leadAlone = frames.findIndex(
        (actors, i) => i > 0 && actors.length === 1 && actors[0].worker === 'lead'
      );
      expect(leadAlone).toBeGreaterThan(0);
      expect(frames[frames.length - 1]).toEqual([]);
    });

    it('works at the desk, asks at the speaker, and files at the cabinets', () => {
      const stations = new Set(everyActor.map((actor) => actor.station).filter(Boolean));
      expect([...stations].sort()).toEqual(['cabinets', 'own_desk', 'speaker']);
    });

    it('shows walking, working and the slump the failed tool call earns', () => {
      const states = new Set(everyActor.map((actor) => actor.state));
      for (const state of ['walking', 'working', 'slump'] as const) {
        expect([...states]).toContain(state);
      }
    });
  });
});
