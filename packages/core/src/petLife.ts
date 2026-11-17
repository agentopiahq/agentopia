import { Rng, seededRng } from './clock';
import { between } from './idle';
import {
  PET_ACTIVITIES,
  PET_HOMES,
  Perch,
  PetAct,
  PetActivity,
  PetAvatar,
  PetKind,
  PetPlanContext,
  PetStep,
  besideAvatar,
} from './pets';
import { isWalkable, route } from './route';
import { Point } from './stations';

/**
 * The pets' half of the director: where each pet is and what it is up to,
 * frame by frame. It runs each pet's plan from `PET_ACTIVITIES` the way
 * `Director` runs an idle avatar's from `IDLE_ACTIVITIES` — choose, walk
 * there round the furniture, hold the step, move on, rest — plus the two
 * things only pets do: jump up onto a perch and back down, and keep beside
 * an avatar that is on the move.
 *
 * Pets take part in nothing else. No beat waits for them and nobody walks
 * round them; they keep out of the avatars' way instead, by never planning a
 * spot an avatar is at or headed for.
 */

/** A pet as the renderer needs it. */
export interface PetView {
  id: string;
  kind: PetKind;
  /** Where it is on the floor plan (up on a perch: where on its top). */
  pos: Point;
  /** How high off the floor it is: up on a perch, or mid-jump. */
  z: number;
  /** Which way it faces along the floor, a unit vector. */
  dir: Point;
  /** What it is doing: an activity's act, or getting somewhere. */
  act: PetAct | 'stand' | 'walk' | 'trot' | 'jump' | 'climb';
  /** Which of `PET_ACTIVITIES` it is on, if any. */
  activity?: string;
  /** Milliseconds it has spent on `act`, for the renderer's loops. */
  phase: number;
  /** 0..1 through the step it is holding (or the jump). */
  progress: number;
}

/** How fast each pet walks, and runs, in tiles a second. */
export const PET_SPEED: Record<PetKind, { walk: number; trot: number }> = {
  cat: { walk: 1.25, trot: 3.1 },
  dog: { walk: 1.45, trot: 3.3 },
};

/** How long a jump up onto a perch (or down off one) takes, ms. */
export const PET_JUMP_MS = 520;
/** How long a climb up to the next level of a climbing frame takes, ms. */
export const PET_CLIMB_MS = 640;
/** How high above the higher end a jump arcs, in tiles. */
const JUMP_ARC = 0.28;
/** Keeping beside someone, a pet closes the gap once it has opened this far. */
const FOLLOW_SLACK = 0.45;
/** How far a target can move before the route to it is planned again, in tiles. */
const REROUTE = 0.3;

interface Jump {
  from: Point;
  to: Point;
  z0: number;
  z1: number;
  at: number;
  /** How long it takes, ms. */
  ms: number;
}

interface PetMind {
  activity: string | null;
  steps: PetStep[];
  index: number;
  heldSince: number | null;
  restUntil: number;
  last: string | null;
}

interface PetBody {
  id: string;
  kind: PetKind;
  pos: Point;
  z: number;
  dir: Point;
  act: PetView['act'];
  /** When it started on `act`. */
  actSince: number;
  target: Point;
  path: Point[];
  pathFor: Point | null;
  /** The perch it is up on, if any. */
  perch: Perch | null;
  jump: Jump | null;
  mind: PetMind;
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function unit(dx: number, dy: number, fallback: Point): Point {
  const len = Math.hypot(dx, dy);
  return len < 1e-9 ? fallback : { x: dx / len, y: dy / len };
}

export class PetLife {
  private readonly pets: PetBody[];
  private readonly rng: Rng;

  /**
   * The pets draw their chance from a stream of their own, seeded once from
   * the office's, so what the avatars do never depends on what the pets do.
   */
  constructor(kinds: readonly PetKind[], rng: Rng, now: number) {
    this.rng = seededRng(Math.floor(rng() * 2 ** 32));
    const seen = new Map<PetKind, number>();
    this.pets = kinds.map((kind) => {
      const n = (seen.get(kind) ?? 0) + 1;
      seen.set(kind, n);
      const home = PET_HOMES[kind];
      const at = n === 1 ? home : { x: home.x + 0.6 * (n - 1), y: home.y };
      return {
        id: n === 1 ? `pet/${kind}` : `pet/${kind}${n}`,
        kind,
        pos: { ...at },
        z: 0,
        dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
        act: 'loaf',
        actSince: now,
        target: { ...at },
        path: [],
        pathFor: null,
        perch: null,
        jump: null,
        mind: {
          activity: null,
          steps: [],
          index: 0,
          heldSince: null,
          restUntil: now + between(this.rng, 500, 4000),
          last: null,
        },
      };
    });
  }

  /**
   * One frame: every pet moves on, and is reported. `claimed` is every spot
   * an avatar is at or headed for, which no pet plans to go to.
   */
  frame(
    now: number,
    dtMs: number,
    avatars: readonly PetAvatar[],
    claimed: readonly Point[]
  ): PetView[] {
    for (const pet of this.pets) {
      this.tick(pet, now, dtMs, avatars, claimed);
    }
    return this.pets.map((pet) => ({
      id: pet.id,
      kind: pet.kind,
      pos: { ...pet.pos },
      z: pet.z,
      dir: { ...pet.dir },
      act: pet.act,
      activity: pet.mind.activity ?? undefined,
      phase: now - pet.actSince,
      progress: this.progress(pet, now),
    }));
  }

  private progress(pet: PetBody, now: number): number {
    if (pet.jump) {
      return Math.min(1, (now - pet.jump.at) / pet.jump.ms);
    }
    const step = pet.mind.steps[pet.mind.index];
    if (!step || pet.mind.heldSince === null) {
      return 0;
    }
    return Math.min(1, (now - pet.mind.heldSince) / Math.max(1, step.ms));
  }

  private setAct(pet: PetBody, act: PetView['act'], now: number): void {
    if (pet.act !== act) {
      pet.act = act;
      pet.actSince = now;
    }
  }

  private context(
    pet: PetBody,
    avatars: readonly PetAvatar[],
    claimed: readonly Point[]
  ): PetPlanContext {
    const spots: Point[] = [...claimed];
    for (const other of this.pets) {
      if (other === pet) {
        continue;
      }
      spots.push(other.pos);
      for (let i = other.mind.index; i < other.mind.steps.length; i++) {
        spots.push(other.mind.steps[i].spot);
      }
    }
    return {
      rng: this.rng,
      kind: pet.kind,
      from: pet.perch ? pet.perch.base : pet.pos,
      avatars,
      taken: (spot) => spots.some((s) => dist(s, spot) < 0.7),
    };
  }

  /** Pick the next activity, weighted, never the last one, and plan it. */
  private choose(
    pet: PetBody,
    now: number,
    avatars: readonly PetAvatar[],
    claimed: readonly Point[]
  ): void {
    const mind = pet.mind;
    const ctx = this.context(pet, avatars, claimed);
    let pool = PET_ACTIVITIES.filter((a) => a.kinds.includes(pet.kind) && a.id !== mind.last);
    while (pool.length > 0) {
      const total = pool.reduce((sum, a) => sum + a.weight, 0);
      let r = this.rng() * total;
      let chosen: PetActivity = pool[pool.length - 1];
      for (const a of pool) {
        r -= a.weight;
        if (r < 0) {
          chosen = a;
          break;
        }
      }
      pool = pool.filter((a) => a !== chosen);
      const steps = chosen.plan(ctx);
      if (!steps || steps.length === 0) {
        continue;
      }
      mind.activity = chosen.id;
      mind.steps = steps;
      mind.index = 0;
      mind.heldSince = null;
      return;
    }
    mind.restUntil = now + 2000;
  }

  private finish(pet: PetBody, now: number): void {
    const mind = pet.mind;
    mind.last = mind.activity;
    mind.activity = null;
    mind.steps = [];
    mind.index = 0;
    mind.heldSince = null;
    mind.restUntil = now + between(this.rng, 1500, 6000);
  }

  /** Off into the air; `climb` for a scramble up to the next level of a climbing frame. */
  private startJump(pet: PetBody, to: Point, z1: number, now: number, climb = false): void {
    const ms = climb ? PET_CLIMB_MS : PET_JUMP_MS;
    pet.jump = { from: { ...pet.pos }, to: { ...to }, z0: pet.z, z1, at: now, ms };
    pet.dir = unit(to.x - pet.pos.x, to.y - pet.pos.y, pet.dir);
    this.setAct(pet, climb ? 'climb' : 'jump', now);
  }

  /** Mid-jump: along the arc. True while it is still in the air. */
  private stepJump(pet: PetBody, now: number): boolean {
    const jump = pet.jump;
    if (!jump) {
      return false;
    }
    const t = Math.min(1, (now - jump.at) / jump.ms);
    const e = t * t * (3 - 2 * t);
    pet.pos = {
      x: jump.from.x + (jump.to.x - jump.from.x) * e,
      y: jump.from.y + (jump.to.y - jump.from.y) * e,
    };
    pet.z = jump.z0 + (jump.z1 - jump.z0) * e + JUMP_ARC * Math.sin(Math.PI * t);
    if (t >= 1) {
      pet.pos = { ...jump.to };
      pet.z = jump.z1;
      pet.jump = null;
      pet.target = { ...pet.pos };
      pet.path = [];
      pet.pathFor = null;
      return false;
    }
    return true;
  }

  /** Walk toward the target round the furniture; true while still on the way. */
  private move(pet: PetBody, dtMs: number, speed: number): boolean {
    if (dist(pet.pos, pet.target) < 0.04) {
      pet.pos = { ...pet.target };
      return false;
    }
    // A target that only creeps (someone it walks beside) keeps its route.
    if (!pet.pathFor || dist(pet.pathFor, pet.target) > REROUTE) {
      pet.path = route(pet.pos, pet.target);
      pet.pathFor = { ...pet.target };
    }
    let left = (speed * dtMs) / 1000;
    let pos = pet.pos;
    const waypoints = [...pet.path, pet.target];
    while (left > 0 && waypoints.length > 0) {
      const w = waypoints[0];
      const d = dist(pos, w);
      if (d > left) {
        pos = { x: pos.x + ((w.x - pos.x) * left) / d, y: pos.y + ((w.y - pos.y) * left) / d };
        left = 0;
        break;
      }
      pos = { ...w };
      left -= d;
      waypoints.shift();
      if (pet.path.length > 0) {
        pet.path.shift();
      }
    }
    pet.dir = unit(pos.x - pet.pos.x, pos.y - pet.pos.y, pet.dir);
    pet.pos = pos;
    return dist(pet.pos, pet.target) >= 0.04;
  }

  private faceToward(pet: PetBody, at: Point | undefined): void {
    if (at) {
      pet.dir = unit(at.x - pet.pos.x, at.y - pet.pos.y, pet.dir);
    }
  }

  private tick(
    pet: PetBody,
    now: number,
    dtMs: number,
    avatars: readonly PetAvatar[],
    claimed: readonly Point[]
  ): void {
    if (this.stepJump(pet, now)) {
      return;
    }
    const mind = pet.mind;
    if (mind.steps.length === 0 && now >= mind.restUntil) {
      this.choose(pet, now, avatars, claimed);
    }
    const step = mind.steps[mind.index];

    // Up on one level of a climbing frame and the next step wants another:
    // straight across to it, up or down, never by way of the floor.
    const next = step?.perch;
    if (pet.perch && next && next !== pet.perch && next.tower && next.tower === pet.perch.tower) {
      const up = next.z > pet.perch.z;
      pet.perch = next;
      this.startJump(pet, next.at, next.z, now, up);
      return;
    }
    // Up on a perch that the next step does not want: down first.
    if (pet.perch && step?.perch !== pet.perch) {
      const down = pet.perch.base;
      pet.perch = null;
      this.startJump(pet, down, 0, now);
      return;
    }
    if (!step) {
      // Resting between activities, where it is.
      const sitting = pet.act === 'loaf' || pet.act === 'nap' || pet.act === 'sit';
      this.setAct(pet, sitting ? pet.act : 'stand', now);
      return;
    }

    if (step.follow !== undefined) {
      this.tickFollow(pet, step, now, dtMs, avatars);
      return;
    }

    if (dist(pet.target, step.spot) > 1e-9 && !pet.perch) {
      pet.target = { ...step.spot };
    }
    if (!pet.perch) {
      const speed = PET_SPEED[pet.kind][step.trot ? 'trot' : 'walk'];
      if (this.move(pet, dtMs, speed)) {
        this.setAct(pet, step.trot ? 'trot' : 'walk', now);
        return;
      }
      if (step.perch) {
        pet.perch = step.perch;
        this.startJump(pet, step.perch.at, step.perch.z, now);
        return;
      }
    }
    if (mind.heldSince === null) {
      mind.heldSince = now;
    }
    this.faceToward(pet, step.faceTo);
    this.setAct(pet, step.act, now);
    if (now - mind.heldSince >= step.ms) {
      this.advance(pet, now);
    }
  }

  private advance(pet: PetBody, now: number): void {
    const mind = pet.mind;
    mind.index += 1;
    mind.heldSince = null;
    if (mind.index >= mind.steps.length) {
      this.finish(pet, now);
    }
  }

  /** Keep beside an avatar for the step: trot after it, and sit by it when it stops. */
  private tickFollow(
    pet: PetBody,
    step: PetStep,
    now: number,
    dtMs: number,
    avatars: readonly PetAvatar[]
  ): void {
    const mind = pet.mind;
    const who = avatars.find((a) => a.avatar === step.follow);
    if (mind.heldSince === null) {
      mind.heldSince = now;
    }
    if (!who || now - mind.heldSince >= step.ms) {
      this.advance(pet, now);
      return;
    }
    const gap = step.act === 'beg' ? 0.75 : 0.95;
    const off = dist(pet.pos, who.pos);
    const moving = pet.act === 'walk' || pet.act === 'trot';
    if (off > gap + FOLLOW_SLACK || (moving && off > gap + 0.05)) {
      const spot = besideAvatar(who.pos, pet.pos, gap);
      // No clear floor beside them (they are going deep into a sofa): wait
      // where it is rather than follow them into the furniture.
      if (!isWalkable(spot)) {
        this.faceToward(pet, who.pos);
        this.setAct(pet, step.act, now);
        return;
      }
      pet.target = spot;
      const far = off > gap + 2.5;
      const speed = PET_SPEED[pet.kind][far ? 'trot' : 'walk'] * (far ? 1 : 1.35);
      if (this.move(pet, dtMs, speed)) {
        this.setAct(pet, far ? 'trot' : 'walk', now);
        return;
      }
    }
    this.faceToward(pet, who.pos);
    this.setAct(pet, step.act, now);
  }
}
