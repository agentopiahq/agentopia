import { DeskView, LEAD_WORKER, SERVER_CAT_SPOTS, SequencedEvent } from '@agentopia/core';

import { armAt, boardScale, needleAngle } from '../objects/serverProps';
import { RACK, RACK_KINDS, rackSpecs } from '../objects/serverRack';
import { FLOOR, WALL } from '../room';
import {
  CAT_SPOTS,
  FIX_MS,
  FloorMeter,
  MAX_BLADES,
  Robot,
  SESSION_RACKS,
  SPIN_DOWN_MS,
  SessionRacks,
  along,
  bladesFor,
  faultRack,
  floorCelsius,
  floorTempo,
  frontOf,
  pathLength,
  rackNumber,
  rackTag,
} from '../serverLife';

const desk = (over: Partial<DeskView> = {}): DeskView => ({
  slot: 0,
  bus: 'a',
  phase: 'working',
  subagents: 0,
  stress: 0,
  lagMs: 0,
  screenSince: 0,
  ...over,
});

const tool = (
  ts: number,
  kind: 'tool.start' | 'tool.end',
  bus = 'a',
  failed = false
): SequencedEvent => ({
  seq: ts,
  bus,
  event: {
    ts,
    kind,
    session: bus,
    worker: LEAD_WORKER,
    tool: { id: `t${ts}`, name: 'Bash', kind: 'execute', status: failed ? 'failed' : 'completed' },
  },
});

describe('the floor follows the office', () => {
  it.each([
    [[], 0.45],
    [[desk({ phase: 'waiting_on_user' })], 0.45],
    [[desk()], 1.1],
    [[desk(), desk({ slot: 1 }), desk({ slot: 2 }), desk({ slot: 3 })], 2.4],
  ])('runs the lights at the office pace %#', (desks, tempo) => {
    expect(floorTempo(desks)).toBeCloseTo(tempo);
  });

  it('gives every desk a rack of its own, apart from the others', () => {
    expect(new Set(SESSION_RACKS).size).toBe(SESSION_RACKS.length);
    expect(SESSION_RACKS).toHaveLength(8);
    for (const rack of SESSION_RACKS) {
      expect(rack.name.startsWith('serverRack')).toBe(true);
    }
  });

  it("spins a session's rack down when it goes, then frees it", () => {
    const racks = new SessionRacks();
    expect(racks.update(0, [desk({ name: 'fix-bug', subagents: 2 })])).toMatchObject([
      { tag: 'fix-bug', blades: 2, downSince: null },
    ]);
    expect(racks.update(1000, [])).toMatchObject([{ downSince: 1000, blades: 0 }]);
    expect(racks.update(1000 + SPIN_DOWN_MS - 1, [])).toHaveLength(1);
    expect(racks.update(1000 + SPIN_DOWN_MS, [])).toHaveLength(0);
  });

  it.each([
    [0, 0],
    [2, 2],
    [9, MAX_BLADES],
  ])('slots %d helpers as %d blades', (helpers, blades) => {
    expect(bladesFor({ subagents: helpers })).toBe(blades);
  });

  it.each([
    [{ name: 'refactor-api', slot: 0 }, 'refactor-api'],
    [{ slot: 2 }, 'desk 3'],
    [{ name: 'a very long session name indeed', slot: 0 }, 'a very long session n…'],
  ])('tags a rack %#', (d, tag) => {
    expect(rackTag(d)).toBe(tag);
  });

  it('counts tool calls a minute for the board, oldest first', () => {
    const meter = new FloorMeter();
    for (const ts of [10_000, 20_000, 70_000, 130_000]) {
      meter.note(tool(ts, 'tool.start'));
    }
    expect(meter.perMinute(150_000, 3)).toEqual([2, 1, 1]);
    expect(meter.callsFor('a', 150_000)).toBe(4);
    expect(meter.callsFor('b', 150_000)).toBe(0);
  });

  it('remembers failed calls for a while, by session', () => {
    const meter = new FloorMeter();
    meter.note(tool(1000, 'tool.end', 'c', true));
    meter.note(tool(2000, 'tool.end', 'c'));
    expect(meter.faultsAt(1500)).toEqual([{ bus: 'c', at: 1000 }]);
    expect(meter.faultsAt(1000 + 60_000)).toEqual([]);
  });

  it("smokes a session's own rack, else the same rack every time", () => {
    const held = new SessionRacks().update(0, [desk({ bus: 'x', slot: 1 })]);
    expect(faultRack('x', held)).toBe(SESSION_RACKS[1]);
    expect(faultRack('nobody', held)).toBe(faultRack('nobody', []));
  });
});

describe('getting about the floor', () => {
  it('walks a path at the pace asked, and says when it is done', () => {
    const path: Array<[number, number]> = [
      [0, 0],
      [2, 0],
      [2, 3],
    ];
    expect(pathLength(path)).toBe(5);
    expect(along(path, 1)).toMatchObject({ at: [1, 0], heading: '+x', done: false });
    expect(along(path, 3.5)).toMatchObject({ at: [2, 1.5], heading: '+y', done: false });
    expect(along(path, 9)).toMatchObject({ at: [2, 3], done: true });
  });

  it.each(SESSION_RACKS.map((rack, i) => [i, rack]))(
    "stands off the front of desk %d's rack, clear of it",
    (_i, rack) => {
      const gap = Math.abs(frontOf(rack)[1] - rack.place.at[1]);
      expect(gap).toBeGreaterThan(RACK.d / 2);
    }
  );

  it("keeps the cat's warm spots on the floor, one for every spot core can pick", () => {
    expect(CAT_SPOTS).toHaveLength(SERVER_CAT_SPOTS);
    for (const [x, y] of CAT_SPOTS) {
      expect(x).toBeGreaterThan(FLOOR.x0 + WALL.t);
      expect(y).toBeLessThan(FLOOR.y1 - WALL.t);
    }
  });

  it('sends the robot to a smoking rack, and has it fixed in a while', () => {
    const robot = new Robot();
    const fault = { bus: 'c', at: 0, rack: SESSION_RACKS[3] };
    let at = 0;
    robot.step(at, 0, []);
    let fixedAt: number | null = null;
    for (let i = 0; i < 2000 && fixedAt === null; i++) {
      at += 100;
      const view = robot.step(at, 100, [fault]);
      if (robot.isFixed(fault)) {
        fixedAt = at;
      } else if (view.mode === 'fix') {
        expect(view.fixing).toBe(SESSION_RACKS[3]);
      }
    }
    expect(fixedAt).not.toBeNull();
    expect(fixedAt).toBeGreaterThanOrEqual(FIX_MS);
  });

  it('plays the robot the same way twice', () => {
    const run = () => {
      const robot = new Robot();
      return Array.from({ length: 300 }, (_, i) => robot.step(i * 100, 100, []).at);
    };
    expect(run()).toEqual(run());
  });
});

describe('what the floor shows', () => {
  it.each([
    [{ sun: 1, rain: 0, day: 1 }, 20.2],
    [{ sun: -1, rain: 0, day: 0 }, 16.4],
    [{ sun: 0, rain: 1, day: 0.5 }, 17.6],
  ])('reads the floor at %o as %d°', (sky, celsius) => {
    expect(floorCelsius(sky)).toBeCloseTo(celsius);
  });

  it('sweeps the dial from end to end over its range', () => {
    expect(needleAngle(14)).toBeCloseTo((-130 * Math.PI) / 180);
    expect(needleAngle(20)).toBeCloseTo(0);
    expect(needleAngle(40)).toBeCloseTo((130 * Math.PI) / 180);
  });

  it.each([
    [[], 10],
    [[3, 4], 10],
    [[22, 9], 30],
  ])('scales the board for %o to %d', (series, top) => {
    expect(boardScale(series)).toBe(top);
  });

  it.each(RACK_KINDS)('says what a %s rack holds', (kind) => {
    expect(rackSpecs(kind)).toMatch(/18U$/);
  });

  it('numbers the racks from B1-01', () => {
    expect(rackNumber(SESSION_RACKS[0])).toMatch(/^B1-\d\d$/);
  });

  it('moves the tape arm along its shelves and back', () => {
    const xs = Array.from({ length: 16 }, (_, f) => armAt(f).x);
    expect(new Set(xs).size).toBeGreaterThan(4);
    expect(armAt(0)).toEqual(armAt(16));
  });
});
