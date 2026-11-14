import {
  Director,
  EVENT_KINDS,
  OFFICE_IDLE_LIFE,
  OfficeFrame,
  choreographyFor,
  manualClock,
  seededRng,
} from '@agentopia/core';

import { showcaseScenario } from '../__stories__/lib/scenarios';

/** Every frame the scenario produces, sampled like the story player. */
function play(): OfficeFrame[] {
  const scenario = showcaseScenario();
  const start = scenario.events[0].event.ts;
  const clock = manualClock(start);
  const director = new Director({
    clock,
    rng: seededRng(7),
    choreography: choreographyFor('claude'),
    idleLife: OFFICE_IDLE_LIFE,
  });
  let next = 0;
  const frames: OfficeFrame[] = [];
  for (let t = 0; t <= scenario.durationMs; t += 50) {
    clock.set(start + t);
    while (next < scenario.events.length && scenario.events[next].event.ts <= start + t) {
      const timed = scenario.events[next];
      director.ingest({ seq: next, event: timed.event, bus: timed.bus });
      next += 1;
    }
    frames.push(director.frame());
  }
  return frames;
}

describe('showcase scenario', () => {
  const scenario = showcaseScenario();

  it('covers every event kind on the followed session, so a new one cannot be added without staging it', () => {
    const seen = new Set(
      scenario.events.filter((timed) => timed.bus === 'a').map((timed) => timed.event.kind)
    );
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
    const everyActor = frames.flatMap((frame) => frame.actors);

    it('seats three sessions, fills the followed one, and empties its desk at the end', () => {
      expect(Math.max(...frames.map((frame) => frame.desks.length))).toBe(3);
      const helpers = frames.map(
        (frame) =>
          frame.actors.filter((actor) => actor.bus === 'a' && actor.role === 'helper').length
      );
      expect(Math.max(...helpers)).toBe(2);
      // Only hired help leaves mid-session; the lead goes when the session ends,
      // and the neighbours are still at their desks.
      const last = frames[frames.length - 1];
      expect(last.desks.map((desk) => desk.bus).sort()).toEqual(['b', 'c']);
      expect(last.actors.some((actor) => actor.bus === 'a')).toBe(false);
    });

    it("flips the neighbours' badges: one asks for approval, both end up waiting on you", () => {
      const phasesOf = (bus: string) =>
        new Set(
          frames.flatMap((frame) => frame.desks.filter((d) => d.bus === bus).map((d) => d.phase))
        );
      expect(phasesOf('c')).toContain('awaiting_approval');
      expect(phasesOf('c')).toContain('waiting_on_user');
      expect(phasesOf('b')).toContain('waiting_on_user');
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
