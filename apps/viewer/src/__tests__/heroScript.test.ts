import {
  Director,
  LEAD_WORKER,
  OfficeFrame,
  choreographyFor,
  manualClock,
  seededRng,
} from '@agentopia/core';

import {
  HERO_EPOCH,
  HERO_IDLE_LIFE,
  HERO_SLOTS,
  HERO_TASKS,
  HeroEvent,
  HeroScript,
} from '../heroScript';

const HOUR = 60 * 60_000;

/** The script's events over a stretch, read as the hero reads them: a frame at a time. */
function play(seed: number, ms: number, step = 1000): HeroEvent[] {
  const script = new HeroScript(seededRng(seed));
  const out: HeroEvent[] = [];
  for (let t = HERO_EPOCH - 2000; t <= HERO_EPOCH + ms; t += step) {
    out.push(...script.due(t));
  }
  return out;
}

const events = play(7, HOUR);

/** How many sessions are open at a time. */
function openAt(all: HeroEvent[], t: number): number {
  const open = new Set<string>();
  for (const { bus, event } of all) {
    if (event.ts > t) {
      break;
    }
    if (event.kind === 'session.start') {
      open.add(bus);
    } else if (event.kind === 'session.end') {
      open.delete(bus);
    }
  }
  return open.size;
}

describe('HeroScript', () => {
  it('hands out every event once, in order', () => {
    const stamps = events.map(({ event }) => event.ts);
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
    expect(new Set(events).size).toBe(events.length);
  });

  it('keeps one to three agents at work, nearly all the time', () => {
    let busy = 0;
    let samples = 0;
    for (let t = HERO_EPOCH + 60_000; t < HERO_EPOCH + HOUR - 60_000; t += 5000) {
      const open = openAt(events, t);
      expect(open).toBeLessThanOrEqual(HERO_SLOTS);
      busy += open >= 1 ? 1 : 0;
      samples += 1;
    }
    expect(busy / samples).toBeGreaterThan(0.95);
    // And the headcount changes: sometimes one, sometimes two, sometimes three.
    const counts = new Set(
      Array.from({ length: 120 }, (_, i) => openAt(events, HERO_EPOCH + i * 30_000))
    );
    expect(counts).toEqual(expect.objectContaining(new Set([1, 2, 3])));
    expect([1, 2, 3].every((c) => counts.has(c))).toBe(true);
  });

  it('opens and closes each session once, on its own bus, with a real task', () => {
    const buses = new Map<string, string[]>();
    for (const { bus, event } of events) {
      buses.set(bus, [...(buses.get(bus) ?? []), event.kind]);
      expect(event.session).toBe(`s-${bus}`);
    }
    const names = new Set(HERO_TASKS.map((t) => t.name));
    for (const { event } of events.filter(({ event }) => event.kind === 'session.start')) {
      expect(names.has(String(event.meta?.sessionName))).toBe(true);
    }
    for (const kinds of buses.values()) {
      expect(kinds[0]).toBe('session.start');
      expect(kinds.filter((k) => k === 'session.start')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'session.end').length).toBeLessThanOrEqual(1);
    }
    expect(buses.size).toBeGreaterThan(20);
  });

  it('has the human ask nicely, in a line that fits their bubble', () => {
    const asks = events
      .filter(({ event }) => event.kind === 'turn.user')
      .map(({ event }) => String(event.meta?.text));
    expect(asks.length).toBeGreaterThan(20);
    for (const ask of asks) {
      expect(ask).toMatch(/please|could you|may I/i);
      expect(ask.length).toBeLessThanOrEqual(48);
    }
  });

  it('works through many different tasks, never the same one at two desks', () => {
    const started = events.filter(({ event }) => event.kind === 'session.start');
    const tasks = started.map(({ event }) => event.meta?.sessionName);
    expect(new Set(tasks).size).toBeGreaterThan(15);
    const open = new Map<string, string>();
    for (const { bus, event } of events) {
      if (event.kind === 'session.start') {
        const name = String(event.meta?.sessionName);
        expect([...open.values()]).not.toContain(name);
        open.set(bus, name);
      } else if (event.kind === 'session.end') {
        open.delete(bus);
      }
    }
  });

  it('closes every tool call it opens, with ids unique across the hour', () => {
    // Calls still running when the hour is up end after it.
    const settled = HERO_EPOCH + HOUR - 60_000;
    const starts = events.filter(({ event }) => event.kind === 'tool.start' && event.ts < settled);
    const ends = events.filter(
      ({ event }) =>
        event.kind === 'tool.end' && starts.some((s) => s.event.tool!.id === event.tool!.id)
    );
    const ids = starts.map(({ event }) => event.tool!.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ends.map(({ event }) => event.tool!.id).sort()).toEqual([...ids].sort());
    // Some runs fail first, as real ones do.
    expect(ends.some(({ event }) => event.tool!.status === 'failed')).toBe(true);
  });

  it('brings in helpers, asks for approval, and stops every helper it starts', () => {
    const kinds = events.map(({ event }) => event.kind);
    expect(kinds).toContain('approval.request');
    const started = events.filter(({ event }) => event.kind === 'worker.start');
    const stopped = events.filter(({ event }) => event.kind === 'worker.stop');
    expect(started.length).toBeGreaterThan(5);
    expect(stopped.map(({ event }) => event.worker).sort()).toEqual(
      started.map(({ event }) => event.worker).sort()
    );
    // Each is briefed with what it is asked to do, and not all alike.
    const briefs = started.map(({ event }) => String(event.meta?.brief ?? ''));
    expect(briefs.every((b) => b.length > 0 && !b.includes(': go'))).toBe(true);
    for (const brief of briefs) {
      expect(brief).toMatch(/please|could you|would you|thanks/i);
    }
    expect(new Set(briefs).size).toBeGreaterThan(briefs.length / 2);
  });

  it('plays a different office for a different seed, and the same for the same', () => {
    const name = (all: HeroEvent[]) =>
      all.filter(({ event }) => event.kind === 'session.start').map(({ event }) => event.meta);
    expect(name(play(7, 10 * 60_000))).toEqual(name(play(7, 10 * 60_000)));
    expect(name(play(8, 10 * 60_000))).not.toEqual(name(play(7, 10 * 60_000)));
  });

  it('seats at most three leads in the hero office, with the rest about', () => {
    const clock = manualClock(HERO_EPOCH - 1500);
    const rng = seededRng(7);
    const script = new HeroScript(rng);
    const director = new Director({
      clock,
      rng,
      choreography: choreographyFor('claude'),
      idleLife: HERO_IDLE_LIFE,
    });
    let seq = 0;
    let frame: OfficeFrame = director.frame();
    let most = 0;
    for (let t = 0; t < 20 * 60_000; t += 100) {
      clock.advance(100);
      for (const { bus, event } of script.due(clock.now())) {
        director.ingest({ seq: seq++, event, bus });
      }
      frame = director.frame();
      const leads = frame.actors.filter((a) => a.worker === LEAD_WORKER).length;
      most = Math.max(most, leads);
      // Six figures about, however the leads and residents split them.
      const figures = frame.actors.filter((a) => a.role === 'lead' || a.role === 'resident');
      expect(figures.length).toBe(HERO_IDLE_LIFE.residents);
    }
    expect(most).toBeGreaterThanOrEqual(2);
    expect(frame.desks.length).toBeLessThanOrEqual(HERO_SLOTS);
  });
});
