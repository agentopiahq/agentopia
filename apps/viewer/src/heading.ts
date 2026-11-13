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

const DIRECTION: Record<Heading, [number, number]> = {
  '+x': [1, 0],
  '+y': [0, 1],
  '-x': [-1, 0],
  '-y': [0, -1],
};

/**
 * How a heading reads on screen from a yaw: which way the face turns (toward
 * screen right or left), and whether we see its back (it is headed away from
 * the viewer, up the sheet). At the home view `+x` and `+y` are three-quarter
 * fronts turned right and left, `-y` and `-x` backs.
 */
export function headingView(heading: Heading, yaw: number): { facing: 1 | -1; back: boolean } {
  const [dx, dy] = DIRECTION[heading];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const vx = dx * c - dy * s;
  const vy = dx * s + dy * c;
  return { facing: vx - vy >= 0 ? 1 : -1, back: vx + vy < -1e-6 };
}

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

/**
 * The desk someone at `at` belongs to: the nearest one in front of them.
 * Everyone works facing their desk — the lead at its seat, helpers behind
 * the lead — so a desk behind someone (the next row back) is never theirs,
 * however close.
 */
function nearestDesk(at: Point): Point {
  const ahead = DESK_CENTRES.filter((centre) => centre.y <= at.y + 0.05);
  const pool = ahead.length > 0 ? ahead : DESK_CENTRES;
  let best = pool[0];
  for (const centre of pool) {
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
  // spot behind the lead faces the desk.
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
