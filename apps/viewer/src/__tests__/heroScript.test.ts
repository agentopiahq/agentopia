import {
  Director,
  IDLE_LEAVE_MS,
  LEAD_WORKER,
  choreographyFor,
  manualClock,
  seededRng,
} from '@agentopia/core';

import { HERO_CYCLE_MS, HERO_EPOCH, heroCycle } from '../heroScript';

const CYCLES = 3;
const script = Array.from({ length: CYCLES }, (_, cycle) => heroCycle(cycle)).flat();

describe('heroScript', () => {
  it('stamps every event in order', () => {
    const stamps = script.map((event) => event.ts);
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
  });

  it.each([0, 1, 2])('keeps cycle %i inside its own window', (cycle) => {
    const turn = heroCycle(cycle).filter((event) => event.kind !== 'session.start');
    const start = HERO_EPOCH + cycle * HERO_CYCLE_MS;
    for (const event of turn) {
      expect(event.ts).toBeGreaterThanOrEqual(start);
      expect(event.ts).toBeLessThan(start + HERO_CYCLE_MS);
    }
  });

  it('opens the session once and never ends it', () => {
    expect(script.filter((event) => event.kind === 'session.start')).toHaveLength(1);
    expect(script.some((event) => event.kind === 'session.end')).toBe(false);
  });

  it('closes every tool call it opens, with ids unique across cycles', () => {
    const starts = script.filter((event) => event.kind === 'tool.start').map((e) => e.tool!.id);
    const ends = script.filter((event) => event.kind === 'tool.end').map((e) => e.tool!.id);
    expect(new Set(starts).size).toBe(starts.length);
    expect([...ends].sort()).toEqual([...starts].sort());
  });

  it('never goes quiet long enough for the lead to leave', () => {
    const gaps = script.slice(1).map((event, i) => event.ts - script[i].ts);
    expect(Math.max(...gaps)).toBeLessThan(IDLE_LEAVE_MS);
  });

  it('keeps the lead in the office through every cycle', () => {
    const clock = manualClock(script[0].ts);
    const director = new Director({
      clock,
      rng: seededRng(7),
      choreography: choreographyFor('claude'),
    });
    let next = 0;
    const end = HERO_EPOCH + CYCLES * HERO_CYCLE_MS;
    for (let t = script[0].ts; t <= end; t += 50) {
      clock.set(t);
      while (next < script.length && script[next].ts <= t) {
        director.ingest({ seq: next, event: script[next], bus: 'hero' });
        next += 1;
      }
      director.frame();
    }
    const frame = director.frame();
    expect(frame.actors.filter((actor) => actor.worker === LEAD_WORKER)).toHaveLength(1);
    expect(frame.desks.filter((desk) => desk.bus === 'hero')).toHaveLength(1);
  });
});
