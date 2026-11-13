import { Actor, CABINET_SPOTS, DESKS, GRID, Point } from '@agentopia/core';

import { DESK_SEAT_GAP } from './objects';

/**
 * Which way a character faces on the isometric floor.
 *
 * Core keeps a facing along tile x only, which was enough when the office was
 * seen face on. On the sheet a character can face any of the four floor
 * directions, and two of them turn its back to you. Nobody faces you for its
 * own sake: a walker faces where it is going, and someone standing still faces
 * what it is there for — its monitor, its lead's desk, the speaker, a cabinet,
 * whoever it is talking to.
 */
export type Heading = '+x' | '+y' | '-x' | '-y';

/** How each heading reads on screen: which way the face turns, and whether we see a back. */
export const HEADING_VIEW: Record<Heading, { facing: 1 | -1; back: boolean }> = {
  // Toward the lower right: three-quarter front, turned right.
  '+x': { facing: 1, back: false },
  // Toward the lower left: three-quarter front, turned left.
  '+y': { facing: -1, back: false },
  // Toward the upper left, away from you.
  '-x': { facing: -1, back: true },
  // Toward the upper right, away from you.
  '-y': { facing: 1, back: true },
};

/** The heading nearest a floor direction. */
export function headingOf(dx: number, dy: number): Heading {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? '+x' : '-x';
  }
  return dy >= 0 ? '+y' : '-y';
}

const near = (a: Point, b: Point, r: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/** Where each desk stands, which is what its seat and helper spots face. */
const DESK_CENTRES: Point[] = DESKS.map((desk) => ({
  x: desk.seat.x,
  y: desk.seat.y - DESK_SEAT_GAP,
}));

function nearestDesk(at: Point): Point {
  let best = DESK_CENTRES[0];
  for (const centre of DESK_CENTRES) {
    if (Math.hypot(centre.x - at.x, centre.y - at.y) < Math.hypot(best.x - at.x, best.y - at.y)) {
      best = centre;
    }
  }
  return best;
}

/**
 * What a standing character faces, or null to keep facing the way it was.
 * `others` is everyone else on the floor this frame.
 */
export function restingHeading(actor: Actor, others: readonly Actor[]): Heading | null {
  const at = actor.pos;
  if (actor.state === 'talking') {
    // Face whoever from the same session is closest: a briefing is two-way.
    let partner: Actor | null = null;
    for (const other of others) {
      if (other.id === actor.id || other.bus !== actor.bus) {
        continue;
      }
      if (
        !partner ||
        Math.hypot(other.pos.x - at.x, other.pos.y - at.y) <
          Math.hypot(partner.pos.x - at.x, partner.pos.y - at.y)
      ) {
        partner = other;
      }
    }
    if (partner && near(partner.pos, at, 4)) {
      return headingOf(partner.pos.x - at.x, partner.pos.y - at.y);
    }
  }
  switch (actor.station) {
    case 'speaker':
    case 'printers':
    case 'copiers':
    case 'shutter':
      // All hung on, or stood against, the far wall.
      return '-y';
    case 'cabinets':
      return CABINET_SPOTS.some((spot) => near(spot, at, 0.6) && spot.x < GRID.width / 2)
        ? '-x'
        : '+x';
    case 'door':
      return '+y';
    default:
      break;
  }
  // At or around a desk: a lead in its seat faces its monitor; a helper at a
  // spot beside the desk faces the desk.
  const desk = nearestDesk(at);
  if (near(desk, at, 3)) {
    const seat = { x: desk.x, y: desk.y + DESK_SEAT_GAP };
    if (near(seat, at, 0.4)) {
      return '-y';
    }
    return headingOf(desk.x - at.x, desk.y - at.y);
  }
  return null;
}

/**
 * The heading for this frame: the way it moved since the last frame if it
 * moved, else what it is standing at, else whatever it faced before.
 */
export function nextHeading(
  actor: Actor,
  last: Point,
  previous: Heading,
  others: readonly Actor[]
): Heading {
  const dx = actor.pos.x - last.x;
  const dy = actor.pos.y - last.y;
  if (Math.hypot(dx, dy) > 0.004) {
    return headingOf(dx, dy);
  }
  return restingHeading(actor, others) ?? previous;
}
