import { Actor, DESKS } from '@agentopia/core';

import { DESK_CHAIR_TUCK, DESK_STANCE, OBJECTS } from '../objects';
import {
  HEADING_SPIN,
  SIT_BACK,
  chairOverSitter,
  deskSpin,
  easeAngle,
  easeToward,
  seatSlotOf,
  sitterOffset,
  sitterView,
} from '../seating';

const actor = (over: Partial<Actor>): Actor => ({
  id: 'a',
  bus: 'b',
  worker: 'lead',
  role: 'lead',
  label: 'lead',
  pos: { ...DESKS[2].seat },
  state: 'idle',
  progress: 0,
  facing: 1,
  stress: 0,
  ...over,
});

describe('seating', () => {
  it.each<[string, Partial<Actor>, number]>([
    ['a lead idling at its seat sits there', {}, 2],
    ['a lead typing at its seat sits there', { state: 'working', station: 'own_desk' }, 2],
    ['a lead napping at its seat sits there', { state: 'napping' }, 2],
    ['a lead walking through its seat does not sit', { state: 'walking' }, -1],
    ['a helper never sits', { role: 'helper' }, -1],
    ['a lead a step from its seat stands', { pos: { x: DESKS[2].seat.x + 1, y: 0 } }, -1],
  ])('%s', (_name, over, slot) => {
    expect(seatSlotOf(actor(over))).toBe(slot);
  });

  it('tucks the desk chair right under the working spot', () => {
    // The room stands desk chairs a half turn round, so local flips to world.
    const desk = DESKS[0];
    expect(desk.chair.x - DESK_CHAIR_TUCK[0]).toBeCloseTo(desk.seat.x + DESK_STANCE.x);
    expect(desk.chair.y - DESK_CHAIR_TUCK[1]).toBeCloseTo(desk.seat.y + DESK_STANCE.y);
  });

  it('moves the chair footprint with its tuck', () => {
    const chair = OBJECTS.deskChair;
    const aside = chair.footprintOf!({});
    const tucked = chair.footprintOf!({ tucked: 1 });
    expect(tucked[0][0] - aside[0][0]).toBeCloseTo(DESK_CHAIR_TUCK[0]);
    expect(tucked[0][1] - aside[0][1]).toBeCloseTo(DESK_CHAIR_TUCK[1]);
  });

  it.each<[number, number, number, number]>([
    [0, 1, 100, 0.5],
    [0.9, 1, 100, 1],
    [1, 0, 250, 0],
  ])('eases %d toward %d over %dms', (from, to, dt, expected) => {
    expect(easeToward(from, to, dt, 5)).toBeCloseTo(expected);
  });

  it('swivels a chair the short way round', () => {
    const next = easeAngle(HEADING_SPIN['-x'], HEADING_SPIN['+y'], 100, 6);
    // From -90° to 180° the short way is down through -180°, not up through 0.
    expect(next).toBeLessThan(HEADING_SPIN['-x']);
  });

  it.each<[string, number, number, boolean]>([
    ['typing, seen from behind, the chair back covers the lead', 0, 0, true],
    ['turned away from the desk, the lead covers its chair', HEADING_SPIN['+x'], 0, false],
    ['turned round to face the room, the lead covers its chair', HEADING_SPIN['+y'], 0, false],
    ['from the far side, a typing lead covers its chair', 0, Math.PI, false],
  ])('%s', (_name, spin, yaw, over) => {
    expect(chairOverSitter(spin, yaw)).toBe(over);
  });

  it('turns a typing lead squarely away from the home view', () => {
    // Away from the viewer at home is world (-1, -1): an eighth of a turn off the desk.
    expect(deskSpin(0)).toBeCloseTo(-Math.PI / 4);
  });

  it.each<[number]>([[0], [Math.PI / 4], [Math.PI / 2], [-Math.PI / 3]])(
    'keeps a typing chair square to the viewer from behind, a quarter turn off its desk at most (yaw %d)',
    (yaw) => {
      const spin = deskSpin(yaw);
      expect(Math.abs(spin)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
      if (chairOverSitter(0, yaw) && Math.abs(spin) < Math.PI / 2 - 1e-6) {
        // Its sitter faces straight away from the viewer.
        expect(sitterView(spin, yaw).back).toBe(true);
      }
    }
  );

  it.each<[string, number, number, number, number]>([
    ['facing the desk from the front', 0, Math.PI, 0, SIT_BACK.front],
    ['facing the desk from behind at a slant', 0, 0.6, 0, SIT_BACK.behind],
    [
      'facing the desk squarely from behind',
      -Math.PI / 4,
      0,
      Math.SQRT1_2 * SIT_BACK.behind,
      Math.SQRT1_2 * SIT_BACK.behind,
    ],
    ['swivelled to +x', HEADING_SPIN['+x'], 0, -SIT_BACK.front, 0],
  ])('sits back against the backrest %s', (_name, spin, yaw, x, y) => {
    const at = sitterOffset(spin, yaw);
    expect(at.x).toBeCloseTo(x);
    expect(at.y).toBeCloseTo(y);
  });

  it('swivels a typing chair smoothly as the view turns all the way round', () => {
    const steps = Array.from({ length: 128 }, (_, i) => deskSpin((i / 128) * Math.PI * 2));
    steps.forEach((spin, i) => {
      expect(Math.abs(spin - steps[(i + 1) % steps.length])).toBeLessThan(0.1);
    });
  });
});
