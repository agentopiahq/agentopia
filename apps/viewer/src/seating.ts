import { Actor, DESKS } from '@agentopia/core';

import { Heading, headingView } from './heading';

/**
 * Sitting down at a desk: who is seated where, how far down they are, and
 * which way their chair is swivelled.
 *
 * A lead at its own desk sits in the desk's task chair whatever it is doing
 * there — typing, thinking, napping — and stands to go anywhere else. Core
 * knows nothing of this: it puts a lead at its seat, and the office decides
 * that someone still at a seat is sitting. Sitting down and getting up ease
 * over `SIT_S`, and the chair slides in under the lead on the same curve, so
 * neither ever cuts.
 */

/** How long sitting down (or getting up) takes, in seconds. */
export const SIT_S = 0.45;
/** How fast a seated lead's chair swivels to follow it, in radians per second. */
export const SPIN_PER_S = 6;

/** States that carry someone across the floor: nobody sits through these. */
const MOVING: ReadonlySet<Actor['state']> = new Set(['walking', 'sprinting', 'pacing']);

/** How near its seat a lead has to be to sit, in tiles. */
const AT_SEAT = 0.05;

/**
 * The desk a lead is sitting at — at its seat and not on the move — or -1.
 * Helpers never sit: they stand round the desk.
 */
export function seatSlotOf(actor: Actor): number {
  if (actor.role !== 'lead' || MOVING.has(actor.state)) {
    return -1;
  }
  return DESKS.findIndex(
    (desk) => Math.hypot(desk.seat.x - actor.pos.x, desk.seat.y - actor.pos.y) < AT_SEAT
  );
}

/** A number a step of `dt` ms toward `want`, covering `perSec` a second. */
export function easeToward(cur: number, want: number, dt: number, perSec: number): number {
  const step = (perSec * Math.max(0, dt)) / 1000;
  return Math.abs(want - cur) <= step ? want : cur + Math.sign(want - cur) * step;
}

/** An angle a step of `dt` ms toward `want`, the short way round. */
export function easeAngle(cur: number, want: number, dt: number, perSec: number): number {
  const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
  return easeToward(cur, cur + diff, dt, perSec);
}

/** A smooth 0..1 ease, the curve sitting down and the chair's slide follow. */
export const smooth = (k: number): number => {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
};

/**
 * How far a desk chair swivels from facing its desk (`-y`) to face the way
 * its sitter does. Desk chairs stand a half turn round in the room, so these
 * are turns in the chair's own frame: a quarter either way to face along the
 * row, a half to face the room behind.
 */
export const HEADING_SPIN: Record<Heading, number> = {
  '-y': 0,
  '+x': Math.PI / 2,
  '+y': Math.PI,
  '-x': -Math.PI / 2,
};

/**
 * How far back in its chair a sitter sits, in tiles from the chair's centre
 * toward its backrest. The avatar is a flat figure, so where it has to stand
 * to read as *in* the chair depends on which side it is seen from: from the
 * front, a little back, so its legs hang over the seat's front edge; from
 * behind, right against the backrest, so the backrest is centred across its
 * torso with its head above. Off to one side of the body, the backrest reads
 * as an empty chair standing in front of it.
 */
export const SIT_BACK = { front: 0.1, behind: 0.26 } as const;

/**
 * Where a sitter's body sits relative to its chair's centre, in world tiles,
 * for a desk chair swivelled `spin` (desk chairs stand facing `-y`, so the
 * sitter faces world (sin spin, -cos spin) and the backrest is opposite),
 * seen from behind or not.
 */
export function sitterOffset(spin: number, behind: boolean): { x: number; y: number } {
  const back = behind ? SIT_BACK.behind : SIT_BACK.front;
  return { x: -Math.sin(spin) * back, y: Math.cos(spin) * back };
}

/**
 * How far a chair facing its desk swivels, typing, to turn its back squarely
 * to the viewer: toward straight away from them, at most an eighth of a turn
 * off the desk. Seen squarely from behind, its backrest runs straight across
 * under the sitter's head and hides the body; seen at an angle, it slants
 * off to one side and reads as an empty chair in front of someone standing.
 */
export const TYPING_SWIVEL_MAX = Math.PI / 4;

export function deskSpin(yaw: number): number {
  // Away from the viewer, in the world: the opposite of `viewToward`.
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const away = { x: -(c + s), y: -(c - s) };
  // A desk chair swivelled `a` faces world (sin a, -cos a).
  const a = Math.atan2(away.x, -away.y);
  return Math.max(-TYPING_SWIVEL_MAX, Math.min(TYPING_SWIVEL_MAX, a));
}

/**
 * Whether a seated lead's chair draws over it. Sitting *in* the chair their
 * footprints overlap, so depth can't tell; the chair's back is behind the
 * sitter, so seen from behind (its back to the viewer) the chair is nearer
 * and covers it, and seen from the front or the side the sitter covers its
 * chair.
 */
export function chairOverSitter(heading: Heading, yaw: number): boolean {
  return headingView(heading, yaw).back;
}
