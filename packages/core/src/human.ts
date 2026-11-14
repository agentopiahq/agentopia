import { Rng, seededRng } from './clock';
import type { Actor } from './director';
import { CAFE_SEATS, SOFA_SEATS, Seat, between } from './idle';
import { isWalkable, route } from './route';
import { Point, WALK_TILES_PER_SEC } from './stations';

/**
 * You, in the office: the human the agents work for.
 *
 * One human lives on the floor, after the project's reference cartoon (a
 * messy mop of dark hair, a black hoodie, dark jeans, white socks). Most of
 * the time they sit on a sofa or in a chair; now and then they sit on the
 * floor against the far wall, knees pulled up and hugged, the way the
 * cartoon's last panel has it. They are who the agents answer to: a prompt is
 * the human talking (`turn.user`), and a lead that needs approval walks over
 * to wherever they are sitting and asks (the `human` station).
 *
 * The human is always there, idle life or not, because an approval needs
 * someone to walk to. Without idle life they stay on the corner sofa; with it
 * they move between their spots every minute or two, never while a lead is on
 * its way over or asking, and never to a seat someone else is in or headed
 * for. Like the rest of core this is pure: chance comes from the injected
 * `Rng` (a stream of the human's own, so the avatars' idle life does not
 * depend on what the human does), time from the director's clock.
 */

/** How the human sits at a spot: on a seat, or on the floor hugging their knees. */
export type HumanPose = 'seat' | 'floor';

/** Somewhere the human sits. */
export interface HumanSpot extends Seat {
  pose: HumanPose;
  /** How likely it is picked, against the others. */
  weight: number;
}

/** The armchair at the side of the lounge, facing the sofas. */
export const ARMCHAIR_SEAT: Seat = { spot: { x: 21.05, y: 19.6 }, faceTo: { x: 20.05, y: 19.6 } };

/**
 * On the floor against the window wall, between the back row of desks and
 * the corner sofa: back to the glass, facing into the room. The far walls'
 * other bare stretches are all hidden from the home view, behind the booths,
 * the copier or the desk monitors.
 */
export const FLOOR_SPOT: Seat = { spot: { x: 0.95, y: 17.4 }, faceTo: { x: 1.95, y: 17.4 } };

/**
 * Where the human sits, the corner sofa first: their home, where they sit
 * when the office has no idle life. Seats are most of it; the floor is now
 * and then.
 */
export const HUMAN_SPOTS: HumanSpot[] = [
  { ...SOFA_SEATS[0], pose: 'seat', weight: 3 },
  { ...SOFA_SEATS[1], pose: 'seat', weight: 1.5 },
  { ...ARMCHAIR_SEAT, pose: 'seat', weight: 2 },
  { ...SOFA_SEATS[2], pose: 'seat', weight: 1 },
  { ...SOFA_SEATS[3], pose: 'seat', weight: 1 },
  { ...CAFE_SEATS[0][0], pose: 'seat', weight: 1 },
  { ...FLOOR_SPOT, pose: 'floor', weight: 1.2 },
];

export const HUMAN_HOME: HumanSpot = HUMAN_SPOTS[0];

/** The human's actor id, and the figure's identity. */
export const HUMAN_ID = 'human';

/** How long the human stays put at a spot, ms. */
const STAY_MS: Record<HumanPose, [number, number]> = {
  seat: [45_000, 110_000],
  floor: [25_000, 50_000],
};
/** How long the human waits after a lead has asked before they think of moving. */
const SETTLE_MS = 6_000;
/** The human strolls, unhurried. */
const STROLL = 0.7;
/** How long the human speaks for when a prompt lands. */
export const HUMAN_TALK_MS = 2_600;
/** How long a prompt's words stay over the human's head. */
const BUBBLE_MS = 3_500;
/** The longest prompt shown in full in the bubble; longer ones are cut. */
const BUBBLE_CHARS = 48;

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function unit(from: Point, to: Point): Point {
  const d = dist(from, to);
  return d < 1e-9 ? { x: 0, y: 1 } : { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
}

/** The nearest clear floor to a point, searching outward a little at a time. */
export function clearFloorNear(p: Point, prefer?: Point): Point {
  if (isWalkable(p)) {
    return p;
  }
  for (const r of [0.4, 0.6, 0.8, 1, 1.25, 1.5, 2, 2.5]) {
    let best: Point | null = null;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (isWalkable(q) && (!best || (prefer && dist(q, prefer) < dist(best, prefer)))) {
        best = q;
        if (!prefer) {
          break;
        }
      }
    }
    if (best) {
      return best;
    }
  }
  return p;
}

/**
 * Where a lead stands to ask the human something: a step in front of them,
 * on clear floor, as near straight ahead as the furniture allows.
 */
export function askSpotFor(seat: Seat): Point {
  const f = unit(seat.spot, seat.faceTo);
  for (const d of [1.5, 1.8, 2.1, 2.4]) {
    const q = { x: seat.spot.x + f.x * d, y: seat.spot.y + f.y * d };
    if (isWalkable(q)) {
      return q;
    }
  }
  const ahead = { x: seat.spot.x + f.x * 1.2, y: seat.spot.y + f.y * 1.2 };
  return clearFloorNear(ahead, ahead);
}

/** Where the human comes in to a spot by, and leaves it by: clear floor next to it. */
function doorstepOf(seat: Seat): Point {
  if (seat.via) {
    return seat.via;
  }
  const f = unit(seat.spot, seat.faceTo);
  const ahead = { x: seat.spot.x + f.x * 0.7, y: seat.spot.y + f.y * 0.7 };
  return clearFloorNear(ahead, ahead);
}

/** Cut a prompt to fit the bubble. */
export function promptLine(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length <= BUBBLE_CHARS ? one : `${one.slice(0, BUBBLE_CHARS - 1).trimEnd()}…`;
}

/** What the director tells the human each frame. */
export interface HumanCues {
  /** Someone is on the way over to ask, or asking: stay put. */
  pinned: boolean;
  /** Someone is standing in front of the human asking: they think it over. */
  asked: boolean;
  /** Is someone else at, or headed for, this spot? */
  taken(spot: Point): boolean;
}

export class HumanLife {
  private pos: Point;
  private facing: 1 | -1 = 1;
  private at: HumanSpot;
  /** Getting there: out to the doorstep of the old spot, along a route, in from the new one's. */
  private legs: Point[] = [];
  private path: Point[] = [];
  private seated = true;
  private stayUntil: number;
  private talkUntil = 0;
  private bubble?: string;
  private bubbleUntil = 0;
  private state: Actor['state'] = 'idle';
  private stateSince: number;
  private seq = 0;
  /** How long to stay at the spot being walked to, once there. */
  private pendingStay = 0;
  private readonly rng: Rng | null;

  /**
   * `roam`: move between spots (the office has idle life). Off, the human
   * stays at home and draws no chance at all, so nothing else's changes.
   */
  constructor(rng: Rng | null, now: number) {
    this.rng = rng ? seededRng(Math.floor(rng() * 2 ** 32)) : null;
    this.at = HUMAN_HOME;
    this.pos = { ...HUMAN_HOME.spot };
    this.stateSince = now;
    this.stayUntil = this.rng ? now + between(this.rng, 15_000, 40_000) : Infinity;
  }

  /** Where the human sits, or is on the way to sit. */
  get spot(): HumanSpot {
    return this.at;
  }

  /** Where a lead stands to ask the human something, wherever they are headed. */
  askSpot(): Point {
    return askSpotFor(this.at);
  }

  /** Where the human is now, and where they are going to be: nobody else plans either. */
  claims(): Point[] {
    return [this.pos, this.at.spot];
  }

  /** You spoke: the human talks, and says what they asked for. */
  speak(now: number, text?: string): void {
    this.talkUntil = now + HUMAN_TALK_MS;
    if (text && text.trim()) {
      this.bubble = promptLine(text);
      this.bubbleUntil = now + BUBBLE_MS;
    }
  }

  /** Talking right now: a prompt just landed. */
  speaking(now: number): boolean {
    return now < this.talkUntil;
  }

  frame(now: number, dtMs: number, cues: HumanCues): Actor {
    if (cues.pinned || cues.asked) {
      this.stayUntil = Math.max(this.stayUntil, now + SETTLE_MS);
    }
    if (this.seated && now >= this.stayUntil && this.rng) {
      this.moveOn(now, cues);
    }
    if (!this.seated) {
      this.walk(now, dtMs);
    }
    const state: Actor['state'] = !this.seated
      ? 'walking'
      : now < this.talkUntil
        ? 'talking'
        : cues.asked
          ? 'thinking'
          : 'idle';
    if (state !== this.state) {
      this.state = state;
      this.stateSince = now;
    }
    return {
      id: HUMAN_ID,
      avatar: HUMAN_ID,
      bus: '',
      worker: HUMAN_ID,
      role: 'human',
      label: 'you',
      pos: { ...this.pos },
      state,
      bubble: now < this.bubbleUntil ? this.bubble : undefined,
      progress: 0,
      facing: this.facing,
      stress: 0,
      phase: now - this.stateSince,
      tempo: 1,
      activity: this.seated
        ? {
            id: 'human',
            act: this.at.pose === 'floor' ? 'hug' : 'sit',
            faceTo: this.at.faceTo,
            seated: true,
            key: `${HUMAN_ID}#${this.seq}`,
          }
        : undefined,
    };
  }

  /** Get up and go and sit somewhere else, if anywhere is free. */
  private moveOn(now: number, cues: HumanCues): void {
    const rng = this.rng;
    if (!rng) {
      return;
    }
    const free = HUMAN_SPOTS.filter((s) => s !== this.at && !cues.taken(s.spot));
    if (free.length === 0) {
      this.stayUntil = now + 10_000;
      return;
    }
    const total = free.reduce((sum, s) => sum + s.weight, 0);
    let r = rng() * total;
    let next = free[free.length - 1];
    for (const s of free) {
      r -= s.weight;
      if (r < 0) {
        next = s;
        break;
      }
    }
    const [lo, hi] = STAY_MS[next.pose];
    this.stayUntil = Infinity;
    this.pendingStay = between(rng, lo, hi);
    this.legs = [doorstepOf(this.at), doorstepOf(next), next.spot];
    this.at = next;
    this.seated = false;
    this.seq += 1;
    // The first leg, out of the seat onto clear floor, is a straight step.
    this.path = [this.legs[0]];
  }

  /** One frame of the walk: out of the old spot, round the furniture, into the new. */
  private walk(now: number, dtMs: number): void {
    let left = (WALK_TILES_PER_SEC * STROLL * dtMs) / 1000;
    while (left > 0) {
      if (this.path.length === 0) {
        this.legs.shift();
        if (this.legs.length === 0) {
          this.seated = true;
          this.pos = { ...this.at.spot };
          this.stayUntil = now + this.pendingStay;
          return;
        }
        // Across the floor round the furniture; the last leg, into the seat, straight.
        this.path = this.legs.length === 1 ? [this.legs[0]] : route(this.pos, this.legs[0]);
        if (this.path.length === 0) {
          continue;
        }
      }
      const next = this.path[0];
      const d = dist(this.pos, next);
      if (Math.abs(next.x - this.pos.x) > 1e-6) {
        this.facing = next.x >= this.pos.x ? 1 : -1;
      }
      if (d <= left) {
        this.pos = { ...next };
        this.path.shift();
        left -= d;
      } else {
        this.pos = {
          x: this.pos.x + ((next.x - this.pos.x) * left) / d,
          y: this.pos.y + ((next.y - this.pos.y) * left) / d,
        };
        left = 0;
      }
    }
  }
}
