import { ROOMS } from '@agentopia/core';

import { SEAT_Z } from '../objects/chair';
import { DESK_TOP_Z } from '../objects/desk';
import { DOORWAY } from '../objects/door';
import { COFFEE_BUTTONS_Z, WORKTOP_Z } from '../objects/kitchen';
import { BOOTH, BOOTH_DOOR, MEETING_DOOR, TABLE } from '../objects/meeting';
import { AVATAR } from '../objects/scale';

/**
 * Everything in the office is built to the avatar, so that walking in,
 * sitting down and using things can be animated without resizing anything.
 */
describe('the office at the avatar’s scale', () => {
  it('seats it at its hip height', () => {
    expect(SEAT_Z).toBeCloseTo(AVATAR.hip, 2);
  });

  it.each<[string, number]>([
    ['the desk top', DESK_TOP_Z],
    ['the kitchen worktop', WORKTOP_Z],
  ])('puts %s at its hands', (_name, z) => {
    expect(Math.abs(z - AVATAR.hand)).toBeLessThan(0.08);
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
