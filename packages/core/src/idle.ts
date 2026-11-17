import { Rng } from './clock';
import { lineStarts, pickConversation } from './conversations';
import { isWalkable } from './route';
import { MEETING, PLANTS, Point } from './stations';

/**
 * Idle life: what an avatar does with itself when nothing needs it.
 *
 * The office always has a few avatars in it (`DirectorOptions.idleLife`).
 * Residents belong to no session, and a lead whose session has gone quiet
 * joins them. Each one with nothing to do picks an activity from
 * `IDLE_ACTIVITIES` at random — never the same one twice running — plays its
 * steps, rests a moment, and picks again. The list is the extension point:
 * an activity is a weight and a `plan`, which turns the office as it is now
 * into steps for one avatar (or, for a chat, one list per person).
 *
 * A step is a spot to walk to and what to do there for how long. It says
 * nothing of pixels: `act` names a pose, `prop` what is in hand, `faceTo`
 * what it looks at, and `seated` that it sits down there. Like the rest of
 * core, it is pure: all chance comes from the injected `Rng`.
 */

/** What an avatar is doing on a step, which the renderer poses. */
export type IdleAct =
  | 'study' // looking something over, a finger raised: the board, a meeting
  | 'read' // a book open in both hands
  | 'eat' // a snack, a bite now and then
  | 'drink' // a cup, a sip now and then
  | 'brew' // working the coffee machine
  | 'grab' // reaching into the fridge or the snack cupboard
  | 'water' // a watering can tipped over a plant
  | 'gaze' // looking out of the window
  | 'reach' // pulling a blind's cord
  | 'nap' // asleep
  | 'chat' // talking with someone, taking turns
  | 'pace' // walking up and down, thinking
  | 'sit' // the human, sat on a sofa or in a chair
  | 'hug' // the human, on the floor against the wall, hugging their knees
  | 'sway'; // standing about at ease, swaying gently, the arms swinging loose

/**
 * How the arms swing while an avatar stands swaying. They always swing
 * together, both the same way at once; `with` the body's sway, trailing it a
 * beat like loose pendulums, or `against` it, out the other way. Picked fresh
 * each time, so two avatars unwinding side by side rarely move alike.
 */
export type ArmSwing = 'with' | 'against';

/** What an avatar can be holding. */
export type IdleProp = 'book' | 'mug' | 'cup' | 'snack' | 'can';

/** The walls with windows in them, by the way their outside faces. */
export type WindowWall = '-x' | '+y' | '+x';

/** One window segment, and where to stand at it. */
export interface WindowSpot {
  wall: WindowWall;
  /** Where along its wall the segment's middle is, in tiles. */
  along: number;
  spot: Point;
  /** A point out past the glass, to look at. */
  out: Point;
}

export interface IdleStep {
  spot: Point;
  act: IdleAct;
  /** How long it is held once there, ms. */
  ms: number;
  prop?: IdleProp;
  /** What it faces while it is there. */
  faceTo?: Point;
  /** Sits down there (a sofa, a chair, a desk). */
  seated?: boolean;
  /** Standing there swaying (`act: 'sway'`): how the arms swing with it. */
  arms?: ArmSwing;
  /** Walks there pacing, deep in thought, rather than strolling. */
  pace?: boolean;
  /**
   * A point on clear floor to come in by, and leave by: a seat that can only
   * be reached past a table is reached round it, not over it.
   */
  via?: Point;
  /** The window whose blind this step works. */
  blind?: WindowSpot;
  /** In a chat: which turns are this person's to talk. */
  turn?: 0 | 1;
  /**
   * In a chat: the whole conversation, read in turns from the first line, so
   * this person says every line whose index matches `turn` in parity.
   */
  lines?: readonly string[];
}

export interface IdlePlanContext {
  rng: Rng;
  /** Where the avatar is now. */
  from: Point;
  /** Its own desk seat, for a lead; a resident has none. */
  desk?: Point;
  /** Desk seats nobody owns or is headed for, which a resident may borrow. */
  freeDesks: readonly Point[];
  /** Is someone already at, or headed for, this spot? */
  taken(spot: Point): boolean;
  /** Was a conversation opening this way had lately? So the office's jokes do not repeat. */
  heard?(opening: string): boolean;
}

export interface IdleActivity {
  id: string;
  /** What it is, in a few words. */
  label: string;
  /** How likely it is picked against the others. */
  weight: number;
  /** How many take part: 1, or 2 for a chat. */
  people: 1 | 2;
  /**
   * The steps, one list per person, or null when it can't happen right now
   * (every seat taken, nobody to talk to).
   */
  plan(ctx: IdlePlanContext): IdleStep[][] | null;
}

// ---- where things are -------------------------------------------------------

/** Where to stand at the far wall's kitchen run: the coffee machine, the fridge, the snacks, the water. */
export const KITCHEN = {
  coffee: { x: 19.1, y: 2.5 },
  fridge: { x: 20.3, y: 2.5 },
  snacks: { x: 21.1, y: 2.5 },
  water: { x: 16.75, y: 2.5 },
} as const;
const AT_COUNTER = (spot: Point): Point => ({ x: spot.x, y: 1.2 });

/** A seat, and which way whoever sits in it faces. */
export interface Seat {
  spot: Point;
  faceTo: Point;
  /** Clear floor to come in by, when the straight way in crosses a table. */
  via?: Point;
}

const seat = (x: number, y: number, fx: number, fy: number, via?: Point): Seat => ({
  spot: { x, y },
  faceTo: { x: x + fx, y: y + fy },
  ...(via ? { via } : {}),
});

/** The sofas: the corner sofa under the window, and the front lounge sofa facing the screen. */
export const SOFA_SEATS: Seat[] = [
  seat(1.2, 19.3, 1, 0),
  // The near end of the corner sofa is reached along the wall, under the end
  // of its coffee table.
  seat(1.2, 20.6, 1, 0, { x: 3.5, y: 20.85 }),
  seat(17.95, 19.5, 0, -1),
  seat(19.25, 19.5, 0, -1),
];

/** The café chairs, in facing pairs across their tables. */
export const CAFE_SEATS: Array<[Seat, Seat]> = [
  [seat(14.4, 6.8, 1, 0), seat(16.0, 6.8, -1, 0)],
  [seat(16.8, 7.9, 1, 0), seat(18.4, 7.9, -1, 0)],
  [seat(19.4, 6.4, 1, 0), seat(21.0, 6.4, -1, 0)],
];

const MEETING_CX = (MEETING.x0 + MEETING.x1) / 2;
const MEETING_CY = (MEETING.y0 + MEETING.y1) / 2;
/** The meeting room's six chairs, each facing the table. */
export const MEETING_SEATS: Seat[] = [
  seat(MEETING_CX - 1.0, MEETING_CY - 0.95, 0, 1),
  seat(MEETING_CX + 1.0, MEETING_CY - 0.95, 0, 1),
  seat(MEETING_CX - 1.95, MEETING_CY, 1, 0),
  seat(MEETING_CX - 1.0, MEETING_CY + 0.95, 0, -1),
  seat(MEETING_CX + 1.0, MEETING_CY + 0.95, 0, -1),
  seat(MEETING_CX + 1.95, MEETING_CY, -1, 0),
];

/** Where to stand reading the sprint board, either side of the huddle table. */
const BOARD = { x: 16.4, y: 10.3 };
export const BOARD_SPOTS: Point[] = [
  { x: 14.6, y: 11.25 },
  { x: 18.2, y: 11.25 },
];

/** Round the standing table by the kitchen: two ends facing, and its front. */
const BAR = { x: 18.6, y: 5.0 };
export const BAR_SPOTS: Point[] = [
  { x: 17.3, y: 5.0 },
  { x: 19.9, y: 5.0 },
  { x: 18.6, y: 4.2 },
];

/**
 * Window segments worth standing at: on the window wall the home view looks
 * at (the near walls are cut away there), with clear floor in front and no
 * desk between them and the viewer.
 */
export const WINDOW_SPOTS: WindowSpot[] = [7, 16, 17].map((y): WindowSpot => ({
  wall: '-x',
  along: y,
  spot: { x: 1.15, y },
  out: { x: -1, y },
}));

/**
 * Where to stand to water each plant: a step out from it toward the middle of
 * the room, on the first clear floor that way.
 */
export const PLANT_SPOTS: Array<{ plant: Point; spot: Point }> = PLANTS.map((plant) => {
  // Beside it as the home view sees it, so neither hides the other; then
  // behind it, then in front, whichever side is nearer the middle first.
  const sides: Point[] = [
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];
  const toMiddle = (d: Point): number => -(d.x * (11 - plant.x) + d.y * (11 - plant.y));
  const ordered = [
    ...sides.slice(0, 2).sort((a, b) => toMiddle(a) - toMiddle(b)),
    ...sides.slice(2),
  ];
  for (const d of ordered) {
    for (const reach of [0.75, 0.95]) {
      const len = Math.hypot(d.x, d.y);
      const spot = {
        x: Math.round((plant.x + (d.x / len) * reach) * 100) / 100,
        y: Math.round((plant.y + (d.y / len) * reach) * 100) / 100,
      };
      if (isWalkable(spot)) {
        return { plant, spot };
      }
    }
  }
  return { plant, spot: { x: plant.x, y: plant.y } };
});

/** Lanes across open floor to pace up and down. */
export const PACE_LANES: Array<[Point, Point]> = [
  [
    { x: 12.6, y: 8.2 },
    { x: 12.6, y: 14.2 },
  ],
  [
    { x: 13.6, y: 15.6 },
    { x: 17.6, y: 15.6 },
  ],
  [
    { x: 7.0, y: 18.6 },
    { x: 11.8, y: 18.6 },
  ],
];

/** Spots on the open floor where two can stand and talk, facing each other. */
export const CHAT_SPOTS: Array<[Point, Point]> = [
  [
    { x: 13.2, y: 16.6 },
    { x: 14.5, y: 16.6 },
  ],
  [
    { x: 8.5, y: 8.2 },
    { x: 9.8, y: 8.2 },
  ],
  [BAR_SPOTS[0], BAR_SPOTS[1]],
];

/** Where an avatar can loiter while it decides: open floor all round the office. */
export const LOITER_SPOTS: Point[] = [
  { x: 13.5, y: 9.0 },
  { x: 13.0, y: 15.2 },
  { x: 9.2, y: 18.4 },
  { x: 15.4, y: 15.0 },
  { x: 19.0, y: 14.5 },
  { x: 10.0, y: 7.9 },
];

/**
 * Which way to face, standing at ease somewhere: straight at the viewer as
 * the home view sees the office (down the floor's diagonal) half the time;
 * turned 45° to one side or the other of that (`+x` or `+y`) often; and now
 * and then away, back turned, looking off into the room.
 */
const AT_EASE_FACINGS: Array<[Point, number]> = [
  [{ x: 1, y: 1 }, 0.5],
  [{ x: 1, y: 0 }, 0.15],
  [{ x: 0, y: 1 }, 0.15],
  [{ x: -1, y: -1 }, 0.1],
  [{ x: -1, y: 0 }, 0.05],
  [{ x: 0, y: -1 }, 0.05],
];

// ---- planning helpers -------------------------------------------------------

/** A random whole-ms duration between `lo` and `hi`. */
export function between(rng: Rng, lo: number, hi: number): number {
  return Math.round(lo + (hi - lo) * rng());
}

/** A random member of a list, or undefined if it is empty. */
export function pick<T>(rng: Rng, items: readonly T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** A random member of a weighted list. */
function pickWeighted<T>(rng: Rng, items: ReadonlyArray<[T, number]>): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r < 0) {
      return item;
    }
  }
  return items[items.length - 1][0];
}

/** A point to face from `spot`, standing at ease: mostly toward the viewer, often straight at them. */
export function atEaseFaceTo(rng: Rng, spot: Point): Point {
  const d = pickWeighted(rng, AT_EASE_FACINGS);
  return { x: spot.x + d.x, y: spot.y + d.y };
}

/** How the arms swing this time: either way, as likely as not. */
export function pickArmSwing(rng: Rng): ArmSwing {
  return rng() < 0.5 ? 'with' : 'against';
}

const freeSeats = (ctx: IdlePlanContext, seats: readonly Seat[]): Seat[] =>
  seats.filter((s) => !ctx.taken(s.spot));

/**
 * Somewhere to have a cup or a snack: a café chair or a place at the standing
 * table, facing the home view, so what is in hand is seen.
 */
function somewhereToSit(ctx: IdlePlanContext): Omit<IdleStep, 'act' | 'ms'> | null {
  const options: Array<Omit<IdleStep, 'act' | 'ms'>> = [
    ...freeSeats(
      ctx,
      CAFE_SEATS.map(([toward]) => toward)
    ).map((s) => ({
      spot: s.spot,
      faceTo: s.faceTo,
      via: s.via,
      seated: true,
    })),
    ...[BAR_SPOTS[0]].filter((s) => !ctx.taken(s)).map((s) => ({ spot: s, faceTo: BAR })),
  ];
  return pick(ctx.rng, options) ?? null;
}

/** Fetch something from the kitchen, then have it somewhere. */
function kitchenRun(
  ctx: IdlePlanContext,
  at: Point,
  first: Pick<IdleStep, 'act' | 'ms'>,
  then: Pick<IdleStep, 'act' | 'ms' | 'prop'>
): IdleStep[][] | null {
  if (ctx.taken(at)) {
    return null;
  }
  const after = somewhereToSit(ctx);
  if (!after) {
    return null;
  }
  return [
    [
      { spot: at, faceTo: AT_COUNTER(at), ...first },
      { ...after, ...then },
    ],
  ];
}

// ---- the list ---------------------------------------------------------------

/**
 * Everything an idle avatar might do. Add one here and every idle avatar
 * starts doing it: the director knows nothing of any one activity.
 */
export const IDLE_ACTIVITIES: IdleActivity[] = [
  {
    id: 'meeting',
    label: 'drop into the meeting room',
    weight: 1,
    people: 1,
    plan(ctx) {
      const s = pick(ctx.rng, freeSeats(ctx, MEETING_SEATS));
      if (!s) {
        return null;
      }
      return [
        [
          {
            spot: s.spot,
            faceTo: s.faceTo,
            via: s.via,
            seated: true,
            act: 'study',
            ms: between(ctx.rng, 9000, 18000),
          },
        ],
      ];
    },
  },
  {
    id: 'whiteboard',
    label: 'read the sprint board',
    weight: 1.2,
    people: 1,
    plan(ctx) {
      const spot = pick(
        ctx.rng,
        BOARD_SPOTS.filter((s) => !ctx.taken(s))
      );
      if (!spot) {
        return null;
      }
      return [[{ spot, faceTo: BOARD, act: 'study', ms: between(ctx.rng, 6000, 13000) }]];
    },
  },
  {
    id: 'sofa-read',
    label: 'read a book on the sofa',
    weight: 1.2,
    people: 1,
    plan(ctx) {
      const s = pick(ctx.rng, freeSeats(ctx, SOFA_SEATS));
      if (!s) {
        return null;
      }
      return [
        [
          {
            spot: s.spot,
            faceTo: s.faceTo,
            via: s.via,
            seated: true,
            act: 'read',
            prop: 'book',
            ms: between(ctx.rng, 12000, 26000),
          },
        ],
      ];
    },
  },
  {
    id: 'snack',
    label: 'grab a snack',
    weight: 1,
    people: 1,
    plan: (ctx) =>
      kitchenRun(
        ctx,
        KITCHEN.snacks,
        { act: 'grab', ms: between(ctx.rng, 1400, 2400) },
        { act: 'eat', prop: 'snack', ms: between(ctx.rng, 6000, 11000) }
      ),
  },
  {
    id: 'drink',
    label: 'get a drink',
    weight: 1,
    people: 1,
    plan: (ctx) =>
      kitchenRun(
        ctx,
        ctx.rng() < 0.5 ? KITCHEN.fridge : KITCHEN.water,
        { act: 'grab', ms: between(ctx.rng, 1200, 2200) },
        { act: 'drink', prop: 'cup', ms: between(ctx.rng, 5000, 10000) }
      ),
  },
  {
    id: 'coffee',
    label: 'brew a coffee and drink it',
    weight: 1.3,
    people: 1,
    plan: (ctx) =>
      kitchenRun(
        ctx,
        KITCHEN.coffee,
        { act: 'brew', ms: between(ctx.rng, 4500, 8000) },
        { act: 'drink', prop: 'mug', ms: between(ctx.rng, 8000, 15000) }
      ),
  },
  {
    id: 'desk-nap',
    label: 'nap at a desk',
    weight: 0.8,
    people: 1,
    plan(ctx) {
      const desk = ctx.desk ?? pick(ctx.rng, ctx.freeDesks);
      if (!desk) {
        return null;
      }
      return [[{ spot: desk, act: 'nap', seated: true, ms: between(ctx.rng, 14000, 30000) }]];
    },
  },
  {
    id: 'sofa-nap',
    label: 'nap on the sofa',
    weight: 0.7,
    people: 1,
    plan(ctx) {
      const s = pick(ctx.rng, freeSeats(ctx, SOFA_SEATS));
      if (!s) {
        return null;
      }
      return [
        [
          {
            spot: s.spot,
            faceTo: s.faceTo,
            via: s.via,
            seated: true,
            act: 'nap',
            ms: between(ctx.rng, 15000, 30000),
          },
        ],
      ];
    },
  },
  {
    id: 'pace',
    label: 'pace up and down, thinking',
    weight: 1,
    people: 1,
    plan(ctx) {
      const lane = pick(
        ctx.rng,
        PACE_LANES.filter(([a, b]) => !ctx.taken(a) && !ctx.taken(b))
      );
      if (!lane) {
        return null;
      }
      // Start from the nearer end, and turn at each end a moment.
      const [a, b] =
        Math.hypot(lane[0].x - ctx.from.x, lane[0].y - ctx.from.y) <=
        Math.hypot(lane[1].x - ctx.from.x, lane[1].y - ctx.from.y)
          ? lane
          : [lane[1], lane[0]];
      const laps = 2 + Math.floor(ctx.rng() * 3);
      const steps: IdleStep[] = [{ spot: a, act: 'study', faceTo: b, ms: 800 }];
      for (let i = 0; i < laps; i++) {
        const [to, back] = i % 2 === 0 ? [b, a] : [a, b];
        steps.push({
          spot: to,
          act: 'study',
          faceTo: back,
          pace: true,
          ms: between(ctx.rng, 700, 1600),
        });
      }
      return [steps];
    },
  },
  {
    id: 'unwind',
    label: 'stand about at ease, swaying',
    weight: 1,
    people: 1,
    plan(ctx) {
      const spot = pick(
        ctx.rng,
        LOITER_SPOTS.filter((s) => !ctx.taken(s))
      );
      if (!spot) {
        return null;
      }
      return [
        [
          {
            spot,
            faceTo: atEaseFaceTo(ctx.rng, spot),
            act: 'sway',
            arms: pickArmSwing(ctx.rng),
            ms: between(ctx.rng, 8000, 16000),
          },
        ],
      ];
    },
  },
  {
    id: 'window',
    label: 'look out of the window',
    weight: 1,
    people: 1,
    plan(ctx) {
      const w = pick(
        ctx.rng,
        WINDOW_SPOTS.filter((s) => !ctx.taken(s.spot))
      );
      if (!w) {
        return null;
      }
      return [[{ spot: w.spot, faceTo: w.out, act: 'gaze', ms: between(ctx.rng, 7000, 15000) }]];
    },
  },
  {
    id: 'plants',
    label: 'water the plants',
    weight: 0.8,
    people: 1,
    plan(ctx) {
      const free = PLANT_SPOTS.filter((p) => !ctx.taken(p.spot));
      const first = pick(ctx.rng, free);
      if (!first) {
        return null;
      }
      // Then, as often as not, the nearest other one too.
      const rest = free
        .filter((p) => p !== first)
        .sort(
          (p, q) =>
            Math.hypot(p.spot.x - first.spot.x, p.spot.y - first.spot.y) -
            Math.hypot(q.spot.x - first.spot.x, q.spot.y - first.spot.y)
        );
      const plants = rest.length > 0 && ctx.rng() < 0.5 ? [first, rest[0]] : [first];
      return [
        plants.map((p): IdleStep => ({
          spot: p.spot,
          faceTo: p.plant,
          act: 'water',
          prop: 'can',
          ms: between(ctx.rng, 3000, 5000),
        })),
      ];
    },
  },
  {
    id: 'blinds',
    label: 'raise or lower a blind',
    weight: 0.8,
    people: 1,
    plan(ctx) {
      const w = pick(
        ctx.rng,
        WINDOW_SPOTS.filter((s) => !ctx.taken(s.spot))
      );
      if (!w) {
        return null;
      }
      return [
        [
          { spot: w.spot, faceTo: w.out, act: 'reach', blind: w, ms: between(ctx.rng, 1800, 2600) },
          { spot: w.spot, faceTo: w.out, act: 'gaze', ms: between(ctx.rng, 3000, 7000) },
        ],
      ];
    },
  },
  {
    id: 'chat',
    label: 'chat with someone',
    // Twice anything else: an office of agents on a break mostly talks shop.
    weight: 3,
    people: 2,
    plan(ctx) {
      const venues: Array<[Seat, Seat, boolean]> = [
        ...CAFE_SEATS.map(([a, b]): [Seat, Seat, boolean] => [a, b, true]),
        [MEETING_SEATS[0], MEETING_SEATS[3], true],
        ...CHAT_SPOTS.map(([a, b]): [Seat, Seat, boolean] => [
          { spot: a, faceTo: b },
          { spot: b, faceTo: a },
          false,
        ]),
      ];
      const venue = pick(
        ctx.rng,
        venues.filter(([a, b]) => !ctx.taken(a.spot) && !ctx.taken(b.spot))
      );
      if (!venue) {
        return null;
      }
      const lines = pickConversation(ctx.rng, ctx.heard);
      // The whole script, and a beat after the last line to let it land.
      const starts = lineStarts(lines);
      const ms = starts[starts.length - 1] + 1200;
      const [a, b, seated] = venue;
      return [0, 1].map((turn) => {
        const s = turn === 0 ? a : b;
        return [
          {
            spot: s.spot,
            faceTo: s.faceTo,
            seated,
            act: 'chat',
            turn: turn as 0 | 1,
            lines,
            ms,
          },
        ];
      });
    },
  },
];

/** Every spot any activity sends someone to, for the floor-plan tests. */
export function idleSpots(): Array<[string, Point]> {
  return [
    ...Object.entries(KITCHEN).map(([name, p]): [string, Point] => [`kitchen ${name}`, p]),
    ...BOARD_SPOTS.map((p, i): [string, Point] => [`board ${i}`, p]),
    ...BAR_SPOTS.map((p, i): [string, Point] => [`bar ${i}`, p]),
    ...WINDOW_SPOTS.map((w): [string, Point] => [`window ${w.wall} ${w.along}`, w.spot]),
    ...PLANT_SPOTS.map((p, i): [string, Point] => [`plant ${i}`, p.spot]),
    ...PACE_LANES.flat().map((p, i): [string, Point] => [`pace ${i}`, p]),
    ...CHAT_SPOTS.flat().map((p, i): [string, Point] => [`chat ${i}`, p]),
    ...LOITER_SPOTS.map((p, i): [string, Point] => [`loiter ${i}`, p]),
  ];
}
