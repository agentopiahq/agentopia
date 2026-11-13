import { Actor, DESKS } from '@agentopia/core';

import { DESK_CHAIR_TUCK, DESK_STANCE, OBJECTS } from '../objects';
import {
  HEADING_SPIN,
  SIT_BACK,
  TYPING_SWIVEL_MAX,
  chairOverSitter,
  deskSpin,
  easeAngle,
  easeToward,
  seatSlotOf,
  sitterOffset,
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

  it.each<[string, '-y' | '+x' | '+y', number, boolean]>([
    ['typing, seen from behind, the chair back covers the lead', '-y', 0, true],
    ['turned away from the desk, the lead covers its chair', '+x', 0, false],
    ['turned round to face the room, the lead covers its chair', '+y', 0, false],
    ['from the far side, a typing lead covers its chair', '-y', Math.PI, false],
  ])('%s', (_name, heading, yaw, over) => {
    expect(chairOverSitter(heading, yaw)).toBe(over);
  });

  it('turns a typing lead squarely away from the home view', () => {
    // Away from the viewer at home is world (-1, -1): an eighth of a turn off the desk.
    expect(deskSpin(0)).toBeCloseTo(-Math.PI / 4);
  });

  it.each<[number]>([[Math.PI / 2], [Math.PI], [-Math.PI / 3]])(
    'never swivels a typing chair more than an eighth of a turn off its desk (yaw %d)',
    (yaw) => {
      expect(Math.abs(deskSpin(yaw))).toBeLessThanOrEqual(TYPING_SWIVEL_MAX + 1e-9);
    }
  );

  it.each<[string, number, boolean, number, number]>([
    ['facing the desk from the front', 0, false, 0, SIT_BACK.front],
    ['facing the desk from behind', 0, true, 0, SIT_BACK.behind],
    ['swivelled to +x', HEADING_SPIN['+x'], false, -SIT_BACK.front, 0],
  ])('sits back against the backrest %s', (_name, spin, behind, x, y) => {
    const at = sitterOffset(spin, behind);
    expect(at.x).toBeCloseTo(x);
    expect(at.y).toBeCloseTo(y);
  });
});
