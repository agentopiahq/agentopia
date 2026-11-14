import { BOWL_REACH, CAT_PERCHES } from '@agentopia/core';
import { ROOMS } from '@agentopia/core';

import { HUMAN_HEIGHT, HUMAN_HIPS } from '../human';
import { BOWL } from '../objects';
import { SEAT_TOP_Z, SEAT_Z, TASK } from '../objects/chair';
import { DESK_TOP_Z } from '../objects/desk';
import { DOORWAY } from '../objects/door';
import { COFFEE_BUTTONS_Z, WORKTOP_Z } from '../objects/kitchen';
import { SOFA_DEPTH, SOFA_SEAT_W } from '../objects/lounge';
import {
  BOOTH,
  BOOTH_DOOR,
  BOOTH_SWING,
  LEAF_SWING,
  MEETING_DOOR,
  TABLE,
} from '../objects/meeting';
import { PETS } from '../objects/scale';
import { AVATAR, HUMAN } from '../objects/scale';
import { petHeight, petReach } from '../pet';

/**
 * Everything in the office is built to the avatar, so that walking in,
 * sitting down and using things can be animated without resizing anything.
 */
describe('the office at the avatar’s scale', () => {
  it('seats it at its hip height', () => {
    expect(SEAT_Z).toBeCloseTo(AVATAR.hip, 2);
  });

  it('fits it into a task chair: between the armrests, against a backrest wider than it', () => {
    expect(TASK.seat * 2).toBeGreaterThan(AVATAR.hips);
    expect(TASK.back * 2).toBeGreaterThan(AVATAR.hips);
    expect(TASK.arm * 2 - 0.07).toBeGreaterThan(AVATAR.hips);
    // Up the back to where its head begins, half a tile above the cushion.
    expect(TASK.backTop - SEAT_TOP_Z).toBeGreaterThan(0.45);
  });

  it.each<[string, number]>([
    ['the desk top', DESK_TOP_Z],
    ['the kitchen worktop', WORKTOP_Z],
  ])('puts %s at its hands', (_name, z) => {
    expect(Math.abs(z - AVATAR.hand)).toBeLessThan(0.08);
  });

  it('gives it a whole seat on a sofa, deep enough to sit back in', () => {
    expect(SOFA_SEAT_W).toBeGreaterThanOrEqual(AVATAR.width);
    expect(SOFA_DEPTH).toBeGreaterThanOrEqual(AVATAR.width * 0.7);
  });

  it('puts the meeting table where a seated avatar’s hands land', () => {
    expect(TABLE.z).toBeGreaterThan(SEAT_Z + 0.25);
    expect(TABLE.z).toBeLessThan(AVATAR.hand);
  });

  it('keeps the coffee machine’s buttons in its reach', () => {
    expect(COFFEE_BUTTONS_Z).toBeLessThanOrEqual(AVATAR.reach);
  });

  it.each<[string, { width: number; height: number }]>([
    ['the front door', DOORWAY],
    ['the meeting room’s door', MEETING_DOOR],
    ['a phone booth’s door', BOOTH_DOOR],
  ])('lets it through %s', (_name, door) => {
    expect(door.width).toBeGreaterThanOrEqual(AVATAR.width);
    expect(door.height).toBeGreaterThan(AVATAR.height);
  });

  it.each<[string, number]>([
    // Each leaf of the double door is a tile wide and swings in from its outer edge.
    ['the meeting room’s doors', MEETING_DOOR.width - 2 * Math.cos((LEAF_SWING * Math.PI) / 180)],
    // The booth's one leaf is the whole opening wide, hinged at one side.
    ['a phone booth’s door', BOOTH_DOOR.width * (1 - Math.cos((BOOTH_SWING * Math.PI) / 180))],
  ])('lets it through %s once they are swung open', (_name, clear) => {
    expect(clear).toBeGreaterThanOrEqual(AVATAR.width);
  });

  it('fits it inside a phone booth, where core lays one out', () => {
    for (const room of ROOMS.filter((r) => r.kind === 'booth')) {
      expect(room.x1 - room.x0).toBeCloseTo(2 * BOOTH.hx, 1);
      expect(room.y1 - room.y0).toBeCloseTo(2 * BOOTH.hy, 1);
    }
    expect(2 * BOOTH.hx - 0.14).toBeGreaterThanOrEqual(AVATAR.width);
  });

  it('leaves it a walkway round the meeting table', () => {
    const meeting = ROOMS.find((r) => r.kind === 'meeting');
    expect(meeting).toBeDefined();
    if (!meeting) {
      return;
    }
    // Chairs stand 0.95 out from the long sides and 1.95 from the ends,
    // each about 0.25 deep; past them, the avatar must fit.
    const clearY = (meeting.y1 - meeting.y0) / 2 - (TABLE.hy + 0.45 + 0.25);
    const clearX = (meeting.x1 - meeting.x0) / 2 - (TABLE.hx + 0.45 + 0.25);
    expect(Math.min(clearX, clearY)).toBeGreaterThanOrEqual(AVATAR.width * 0.75);
  });
});

describe('the pets, to the avatar', () => {
  it.each(['cat', 'dog'] as const)('sizes the %s as its rig draws it', (kind) => {
    expect(petHeight(kind)).toBeCloseTo(PETS[kind].height, 1);
  });

  it('brings the dog up to about the avatar’s hand, and the cat a little lower', () => {
    expect(PETS.dog.height).toBeGreaterThan(AVATAR.hip * 2);
    expect(PETS.dog.height).toBeLessThanOrEqual(AVATAR.hand + 0.05);
    expect(PETS.cat.height).toBeLessThan(PETS.dog.height);
  });

  it.each(CAT_PERCHES.map((p): [string, number] => [p.id, p.z]))(
    'puts the %s perch within a cat’s jump',
    (_id, z) => {
      expect(z).toBeLessThan(PETS.cat.height * 2);
    }
  );

  it.each(['cat', 'dog'] as const)('puts the %s’s bowls under its nose', (kind) => {
    expect(petReach(kind)).toBeCloseTo(PETS[kind].reach, 1);
    // Standing at the bowl, head down, its nose is over the bowl.
    expect(Math.abs(BOWL_REACH[kind] - PETS[kind].reach)).toBeLessThan(BOWL[kind]);
  });
});

describe('the human at the office’s scale', () => {
  it('sizes the human as their rig draws them, about as tall as the avatar', () => {
    expect(Math.abs(HUMAN_HEIGHT - HUMAN.height)).toBeLessThan(0.05);
    expect(HUMAN_HIPS).toBeCloseTo(HUMAN.hips, 1);
    expect(Math.abs(HUMAN.height - AVATAR.height)).toBeLessThan(0.15);
  });

  it('gives the human a whole sofa seat, wider than their hips', () => {
    expect(SOFA_SEAT_W).toBeGreaterThan(HUMAN.hips * 2);
  });

  it('fits the human inside a phone booth', () => {
    expect(BOOTH.h).toBeGreaterThan(HUMAN.height + 0.2);
  });
});
