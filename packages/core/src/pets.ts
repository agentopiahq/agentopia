import { Rng } from './clock';
import { LOITER_SPOTS, between, pick } from './idle';
import { isWalkable } from './route';
import { CAT_TOWER, DOG_BED, FURNITURE, PET_BOWLS, Point, TowerLevel } from './stations';

/**
 * The office pets: a cat and a dog who live on the floor all the time.
 *
 * They work the way idle avatars do (`idle.ts`): each one with nothing to do
 * picks an activity from `PET_ACTIVITIES` at random — weighted, never the
 * same one twice running — plays its steps, rests a moment where it is, and
 * picks again. The list is the extension point: an activity says which pets
 * do it, how likely it is, and how to `plan` it from the office as it is now
 * into steps.
 *
 * A step is a floor spot to go to and what to do there for how long. It can
 * also send the pet up onto something (`perch`: the cat onto a bookshelf, the
 * dog into its bed), which the director animates as a jump up when it gets
 * there and a jump down when it moves on, or keep it beside an avatar for the
 * step's length (`follow`). Like the rest of core, it is pure and
 * pixel-free: all chance comes from the injected `Rng`.
 */

export type PetKind = 'cat' | 'dog';

/** What a pet is doing on a step, which the renderer poses. */
export type PetAct =
  | 'sniff' // nose to the floor, having a look round
  | 'sit' // sat up, tail round its feet
  | 'gaze' // sat up, looking out at something: the window, the room below
  | 'loaf' // lying down, paws tucked, awake
  | 'nap' // curled up asleep
  | 'eat' // head down in the food bowl
  | 'drink' // lapping at the water bowl
  | 'stretch' // a long play-bow stretch, front paws out, tail up
  | 'play' // pouncing, batting at a toy
  | 'groom' // licking a paw (the cat)
  | 'beg' // sat up at someone, looking up, tail going
  | 'scratch' // up on its hind legs, claws in a scratching post (the cat)
  | 'bat'; // sat up, swiping a paw at a toy hung over it (the cat)

/** Somewhere a pet jumps up onto, and where it jumps from. */
export interface Perch {
  id: string;
  /** Where on the thing it settles, on the floor plan. */
  at: Point;
  /** How high its top is, in tiles. */
  z: number;
  /** The clear floor it jumps up from, and back down to. */
  base: Point;
  /** What it looks at up there. */
  faceTo: Point;
  /**
   * The climbing frame it is a level of, if any (the cat tower). Between two
   * levels of one frame a pet climbs straight across, never down to the floor.
   */
  tower?: string;
}

export interface PetStep {
  /** The floor spot it goes to (for a perch, the floor it jumps up from). */
  spot: Point;
  act: PetAct;
  /** How long it is held once there, ms. */
  ms: number;
  /** What it faces while it is there. */
  faceTo?: Point;
  /** Jumps up onto this there, and back down when the step is over. */
  perch?: Perch;
  /** Keeps beside this avatar for the step's length (it is gone: the step ends). */
  follow?: string;
  /** Goes there at a run. */
  trot?: boolean;
}

/** An avatar on the floor, as a pet sees it. */
export interface PetAvatar {
  avatar: string;
  pos: Point;
  /** Has nothing on: a resident, or a lead off doing something of its own. */
  idle: boolean;
}

export interface PetPlanContext {
  rng: Rng;
  kind: PetKind;
  /** Where the pet is now. */
  from: Point;
  /** Every avatar on the floor. */
  avatars: readonly PetAvatar[];
  /** Is someone (an avatar or the other pet) already at, or headed for, this spot? */
  taken(spot: Point): boolean;
}

export interface PetActivity {
  id: string;
  /** What it is, in a few words. */
  label: string;
  /** Which pets do it. */
  kinds: readonly PetKind[];
  /** How likely it is picked against the others. */
  weight: number;
  /** The steps, or null when it can't happen right now. */
  plan(ctx: PetPlanContext): PetStep[] | null;
}

// ---- where things are -------------------------------------------------------

/** How far from a bowl a pet stands to eat from it: its head reaches the rest. */
export const BOWL_REACH: Record<PetKind, number> = { cat: 0.5, dog: 0.62 };

/** Where each pet stands at each of its bowls, facing the wall. */
export function bowlSpot(kind: PetKind, bowl: 'food' | 'water'): Point {
  const b = PET_BOWLS[kind][bowl];
  return { x: Math.round((b.x - BOWL_REACH[kind]) * 100) / 100, y: b.y };
}

/** Patches of floor the sun falls on through the window wall: warm places to nap. */
export const SUN_SPOTS: Point[] = [
  { x: 2.3, y: 6.75 },
  { x: 1.65, y: 17.55 },
  { x: 2.4, y: 12.55 },
];

/** Right up against the window glass, to sit and watch the world go by. */
export const PET_WINDOW_SPOTS: Array<{ spot: Point; out: Point }> = [10.4, 13.4, 17.9].map((y) => ({
  spot: { x: 0.95, y },
  out: { x: -1, y },
}));

/** The dog's bed: it steps in and lies down on the cushion. */
export const DOG_BED_PERCH: Perch = {
  id: 'dog bed',
  at: { x: DOG_BED.x, y: DOG_BED.y },
  // The cushion's top.
  z: 0.14,
  base: { x: DOG_BED.x, y: DOG_BED.y - DOG_BED.r - 0.38 },
  faceTo: { x: DOG_BED.x + 2, y: DOG_BED.y + 1 },
};

/** The low cabinets' tops, and the bookshelf's: high places for the cat. */
export const CAT_PERCHES: Perch[] = [
  // The bookshelf by the front corner, either end of its top.
  ...[5.35, 6.7].map((x): Perch => ({
    id: `bookshelf ${x}`,
    at: { x, y: 20.6 },
    z: 1.05,
    base: { x, y: 21.3 },
    faceTo: { x: x + 1, y: 15 },
  })),
  // Every cabinet, from in front of its drawers.
  ...FURNITURE.filter((piece) => piece.kind === 'cabinet').map((piece): Perch => {
    const wall = piece.faces === '-x';
    return {
      id: `cabinet ${piece.at.x}, ${piece.at.y}`,
      at: { ...piece.at },
      z: 0.8,
      base: wall ? { x: 20.6, y: piece.at.y } : { x: piece.at.x, y: 8.0 },
      faceTo: wall ? { x: 15, y: piece.at.y + 1 } : { x: piece.at.x + 1, y: 14 },
    };
  }),
];

/** A point on the cat tower, from its middle, on the floor plan. */
const onTower = (x: number, y: number): Point => ({
  x: Math.round((CAT_TOWER.x + x) * 100) / 100,
  y: Math.round((CAT_TOWER.y + y) * 100) / 100,
});
const middleOf = (l: TowerLevel): Point => onTower((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2);

/**
 * The strip of floor between the cat tower and the wall: where the cat
 * scratches the post from, and climbs up from. It is in full view from the
 * home view, in front of everything.
 */
const TOWER_FLOOR_X = 21.38;

/** Where the cat climbs the tower from: the floor beside its den. */
export const CAT_TOWER_BASE: Point = { x: TOWER_FLOOR_X, y: middleOf(CAT_TOWER.levels.den).y };

/** Where the cat stands to scratch the post, and the post it faces. */
export const CAT_TOWER_SCRATCH: { spot: Point; post: Point } = {
  spot: { x: TOWER_FLOOR_X, y: onTower(0, CAT_TOWER.post.y).y },
  post: onTower(CAT_TOWER.post.x, CAT_TOWER.post.y),
};

/** Where the toy hangs, off the ledge's corner, just over the den. */
export const CAT_TOWER_TOY: Point = onTower(CAT_TOWER.toy.x, CAT_TOWER.toy.y);

/** The cat tower's three levels as perches, from the bottom up. */
export const TOWER_PERCHES: { den: Perch; ledge: Perch; bed: Perch } = (() => {
  const level = (id: 'den' | 'ledge' | 'bed', faceTo: Point): Perch => ({
    id: `cat tower ${id}`,
    at: middleOf(CAT_TOWER.levels[id]),
    z: CAT_TOWER.levels[id].z,
    base: CAT_TOWER_BASE,
    faceTo,
    tower: 'cat tower',
  });
  return {
    den: level('den', { x: 15, y: 17 }),
    ledge: level('ledge', { x: 14, y: 15 }),
    bed: level('bed', { x: 14, y: 18 }),
  };
})();

/** Open floor to wander between, sniffing about. */
export const PET_ROAM_SPOTS: Point[] = [
  ...LOITER_SPOTS.map((p) => ({ x: p.x + 0.55, y: p.y + 0.45 })),
  { x: 12.4, y: 6.6 },
  { x: 19.6, y: 12.6 },
  { x: 8.4, y: 19.7 },
  { x: 14.6, y: 18.0 },
  { x: 11.0, y: 4.6 },
  { x: 17.2, y: 3.6 },
  { x: 19.3, y: 16.2 },
];

/** A spot beside an avatar, on whichever side the pet is coming from. */
export function besideAvatar(avatar: Point, from: Point, gap = 0.75): Point {
  const dx = from.x - avatar.x;
  const dy = from.y - avatar.y;
  const len = Math.hypot(dx, dy) || 1;
  const toward = { x: dx / len, y: dy / len };
  // Straight toward the pet first, then swung round either way.
  for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const p = {
      x: avatar.x + (toward.x * c - toward.y * s) * gap,
      y: avatar.y + (toward.x * s + toward.y * c) * gap,
    };
    if (isWalkable(p)) {
      return p;
    }
  }
  return { ...avatar };
}

/** A few random spots of open floor near a point, for a romp. */
function romp(rng: Rng, from: Point, n: number): Point[] {
  const out: Point[] = [];
  let at = from;
  for (let tries = 0; out.length < n && tries < n * 12; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 1.2 + rng() * 1.8;
    const p = {
      x: Math.round((at.x + Math.cos(a) * r) * 100) / 100,
      y: Math.round((at.y + Math.sin(a) * r) * 100) / 100,
    };
    if (isWalkable(p)) {
      out.push(p);
      at = p;
    }
  }
  return out;
}

const nearest = <T extends { pos: Point }>(from: Point, items: readonly T[]): T | undefined =>
  [...items].sort(
    (a, b) =>
      Math.hypot(a.pos.x - from.x, a.pos.y - from.y) -
      Math.hypot(b.pos.x - from.x, b.pos.y - from.y)
  )[0];

// ---- the list ---------------------------------------------------------------

/**
 * Everything a pet might do. Add one here and the pets it names start doing
 * it: the director knows nothing of any one activity.
 */
export const PET_ACTIVITIES: PetActivity[] = [
  {
    id: 'eat',
    label: 'eat from the bowl',
    kinds: ['cat', 'dog'],
    weight: 1.1,
    plan(ctx) {
      const food = bowlSpot(ctx.kind, 'food');
      const bowl = PET_BOWLS[ctx.kind].food;
      const steps: PetStep[] = [
        { spot: food, faceTo: bowl, act: 'eat', ms: between(ctx.rng, 5000, 10000) },
      ];
      // As often as not, a drink to wash it down.
      if (ctx.rng() < 0.5) {
        steps.push({
          spot: bowlSpot(ctx.kind, 'water'),
          faceTo: PET_BOWLS[ctx.kind].water,
          act: 'drink',
          ms: between(ctx.rng, 2500, 5000),
        });
      }
      return steps;
    },
  },
  {
    id: 'drink',
    label: 'drink from the water bowl',
    kinds: ['cat', 'dog'],
    weight: 0.9,
    plan: (ctx) => [
      {
        spot: bowlSpot(ctx.kind, 'water'),
        faceTo: PET_BOWLS[ctx.kind].water,
        act: 'drink',
        ms: between(ctx.rng, 3000, 6000),
      },
    ],
  },
  {
    id: 'sun-nap',
    label: 'nap in a sunny spot',
    kinds: ['cat', 'dog'],
    weight: 1.2,
    plan(ctx) {
      const spot = pick(
        ctx.rng,
        SUN_SPOTS.filter((s) => !ctx.taken(s))
      );
      if (!spot) {
        return null;
      }
      return [
        { spot, act: 'loaf', ms: between(ctx.rng, 2000, 4000) },
        { spot, act: 'nap', ms: between(ctx.rng, 16000, 34000) },
        { spot, act: 'stretch', ms: between(ctx.rng, 1600, 2400) },
      ];
    },
  },
  {
    id: 'bed-nap',
    label: 'curl up in its bed',
    kinds: ['dog'],
    weight: 1.3,
    plan(ctx) {
      const bed = DOG_BED_PERCH;
      return [
        { spot: bed.base, perch: bed, act: 'loaf', ms: between(ctx.rng, 2500, 4500) },
        { spot: bed.base, perch: bed, act: 'nap', ms: between(ctx.rng, 18000, 36000) },
        { spot: bed.base, act: 'stretch', ms: between(ctx.rng, 1600, 2400) },
      ];
    },
  },
  {
    id: 'perch',
    label: 'sit up somewhere high',
    kinds: ['cat'],
    weight: 1.4,
    plan(ctx) {
      const perch = pick(
        ctx.rng,
        CAT_PERCHES.filter((p) => !ctx.taken(p.base))
      );
      if (!perch) {
        return null;
      }
      const settle: PetAct = ctx.rng() < 0.5 ? 'loaf' : 'nap';
      return [
        {
          spot: perch.base,
          perch,
          faceTo: perch.faceTo,
          act: 'gaze',
          ms: between(ctx.rng, 4000, 9000),
        },
        {
          spot: perch.base,
          perch,
          faceTo: perch.faceTo,
          act: settle,
          ms: between(ctx.rng, 8000, 22000),
        },
      ];
    },
  },
  {
    id: 'cat-tower',
    label: 'climb the cat tower',
    kinds: ['cat'],
    weight: 1.6,
    plan(ctx) {
      if (ctx.taken(CAT_TOWER_BASE)) {
        return null;
      }
      const { den, ledge, bed } = TOWER_PERCHES;
      const up = (perch: Perch, act: PetAct, ms: number): PetStep => ({
        spot: perch.base,
        perch,
        faceTo: perch.faceTo,
        act,
        ms,
      });
      // A look round from each level on the way up.
      const steps: PetStep[] = [
        up(den, 'gaze', between(ctx.rng, 1200, 2600)),
        up(ledge, 'gaze', between(ctx.rng, 2500, 6000)),
      ];
      if (ctx.rng() < 0.65) {
        // All the way to the top, for a nap in the bed.
        steps.push(
          up(bed, 'loaf', between(ctx.rng, 2500, 4500)),
          up(bed, 'nap', between(ctx.rng, 16000, 34000)),
          up(bed, 'stretch', between(ctx.rng, 1600, 2400)),
          up(ledge, 'sit', 500)
        );
      } else {
        // Or a while on the ledge, watching the room.
        steps.push(up(ledge, 'loaf', between(ctx.rng, 8000, 18000)));
      }
      // And back down the way it came, a level at a time.
      steps.push(up(den, 'sit', 500));
      return steps;
    },
  },
  {
    id: 'scratch',
    label: 'scratch the scratching post',
    kinds: ['cat'],
    weight: 1,
    plan(ctx) {
      const { spot, post } = CAT_TOWER_SCRATCH;
      if (ctx.taken(spot)) {
        return null;
      }
      const steps: PetStep[] = [
        { spot, faceTo: post, act: 'scratch', ms: between(ctx.rng, 3000, 6500) },
      ];
      // As often as not, a good stretch after.
      if (ctx.rng() < 0.5) {
        steps.push({ spot, faceTo: post, act: 'stretch', ms: between(ctx.rng, 1600, 2400) });
      }
      return steps;
    },
  },
  {
    id: 'tower-toy',
    label: 'bat at the toy on the cat tower',
    kinds: ['cat'],
    weight: 0.8,
    plan(ctx) {
      if (ctx.taken(CAT_TOWER_BASE)) {
        return null;
      }
      const den = TOWER_PERCHES.den;
      return [
        {
          spot: den.base,
          perch: den,
          faceTo: CAT_TOWER_TOY,
          act: 'bat',
          ms: between(ctx.rng, 3500, 7000),
        },
        {
          spot: den.base,
          perch: den,
          faceTo: den.faceTo,
          act: 'loaf',
          ms: between(ctx.rng, 4000, 9000),
        },
      ];
    },
  },
  {
    id: 'window',
    label: 'sit by the window',
    kinds: ['cat', 'dog'],
    weight: 1,
    plan(ctx) {
      const w = pick(
        ctx.rng,
        PET_WINDOW_SPOTS.filter((s) => !ctx.taken(s.spot))
      );
      if (!w) {
        return null;
      }
      return [{ spot: w.spot, faceTo: w.out, act: 'gaze', ms: between(ctx.rng, 7000, 16000) }];
    },
  },
  {
    id: 'wander',
    label: 'wander about, sniffing',
    kinds: ['cat', 'dog'],
    weight: 1.2,
    plan(ctx) {
      const free = PET_ROAM_SPOTS.filter((s) => !ctx.taken(s));
      const steps: PetStep[] = [];
      const n = 2 + Math.floor(ctx.rng() * 3);
      for (let i = 0; i < n; i++) {
        const spot = pick(
          ctx.rng,
          free.filter((s) => !steps.some((t) => t.spot === s))
        );
        if (!spot) {
          break;
        }
        steps.push({ spot, act: 'sniff', ms: between(ctx.rng, 1200, 3200) });
      }
      return steps.length > 0 ? steps : null;
    },
  },
  {
    id: 'visit',
    label: 'go and see someone',
    kinds: ['cat', 'dog'],
    weight: 1.2,
    plan(ctx) {
      // Somebody idle is better company than somebody at work.
      const idle = ctx.avatars.filter((a) => a.idle);
      const who = pick(ctx.rng, idle.length > 0 ? idle : ctx.avatars);
      if (!who) {
        return null;
      }
      return [
        {
          spot: besideAvatar(who.pos, ctx.from),
          follow: who.avatar,
          act: ctx.kind === 'dog' ? 'beg' : 'sit',
          ms: between(ctx.rng, 5000, 10000),
        },
      ];
    },
  },
  {
    id: 'follow',
    label: 'tag along after someone',
    kinds: ['dog', 'cat'],
    weight: 0.8,
    plan(ctx) {
      // Whoever is nearest: a pet tags along with whoever it bumps into.
      const who = nearest(ctx.from, ctx.avatars);
      if (!who) {
        return null;
      }
      return [
        {
          spot: besideAvatar(who.pos, ctx.from, 0.95),
          follow: who.avatar,
          act: 'sit',
          ms: between(ctx.rng, ctx.kind === 'dog' ? 9000 : 5000, ctx.kind === 'dog' ? 18000 : 9000),
        },
      ];
    },
  },
  {
    id: 'play',
    label: 'play, dashing about',
    kinds: ['cat', 'dog'],
    weight: 1,
    plan(ctx) {
      const spots = romp(ctx.rng, ctx.from, 2 + Math.floor(ctx.rng() * 3));
      if (spots.length === 0) {
        return null;
      }
      return [
        { spot: ctx.from, act: 'stretch', ms: 900 },
        ...spots.map((spot): PetStep => ({
          spot,
          act: 'play',
          trot: true,
          ms: between(ctx.rng, 900, 2200),
        })),
      ];
    },
  },
  {
    id: 'stretch',
    label: 'have a good stretch',
    kinds: ['cat', 'dog'],
    weight: 0.6,
    plan: (ctx) => [
      { spot: ctx.from, act: 'stretch', ms: between(ctx.rng, 1800, 2800) },
      { spot: ctx.from, act: 'sit', ms: between(ctx.rng, 2000, 5000) },
    ],
  },
  {
    id: 'groom',
    label: 'wash its face',
    kinds: ['cat'],
    weight: 0.9,
    plan: (ctx) => [{ spot: ctx.from, act: 'groom', ms: between(ctx.rng, 4000, 9000) }],
  },
];

/** Where each pet is first found: the cat in the sun, the dog by its bed. */
export const PET_HOMES: Record<PetKind, Point> = {
  cat: SUN_SPOTS[0],
  dog: DOG_BED_PERCH.base,
};

/** Every fixed spot any pet activity sends a pet to, for the floor-plan tests. */
export function petSpots(): Array<[string, Point]> {
  return [
    ...(['cat', 'dog'] as const).flatMap((kind) =>
      (['food', 'water'] as const).map((b): [string, Point] => [
        `${kind} ${b} bowl`,
        bowlSpot(kind, b),
      ])
    ),
    ...SUN_SPOTS.map((p, i): [string, Point] => [`sun ${i}`, p]),
    ...PET_WINDOW_SPOTS.map((w, i): [string, Point] => [`pet window ${i}`, w.spot]),
    ...PET_ROAM_SPOTS.map((p, i): [string, Point] => [`roam ${i}`, p]),
    ['dog bed base', DOG_BED_PERCH.base],
    ['cat tower base', CAT_TOWER_BASE],
    ['scratching post', CAT_TOWER_SCRATCH.spot],
    ...CAT_PERCHES.map((p): [string, Point] => [`${p.id} base`, p.base]),
  ];
}
