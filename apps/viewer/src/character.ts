import { Actor } from '@agentopia/core';
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';

import { C, S, SHADOW_DIR, INK as SHEET_INK, V2, V3, hull } from './kit/iso';
import { MAT, Mat, SHEET, mix } from './kit/palette';
import { DESK_SEAT_GAP, KEYBOARD } from './objects/desk';

/**
 * The Claude character, as a posed rig drawn in canvas 2D.
 *
 * The look follows T's reference cartoon of orange starburst agents, banded
 * the office's way: Colorfigures-style flat tones (a soft darker rim on the
 * shaded side, the body colour, a lit cap toward the light) under a thin
 * outline in the body's own darker orange rather than the sheet's heavy ink,
 * with ink only on the face. A state is a *pose*, and the
 * pose is drawn fresh each frame into the character's own small canvas, which
 * the renderer composites as a sprite.
 *
 * `poseFor` is a pure function of `(state, facing, t)`. It never reads a clock
 * or an rng, which is what keeps replays reproducible and golden-frame
 * snapshots stable. When real sprite art arrives each part swaps to a textured
 * `Sprite` behind this same rig and the pose function is untouched.
 *
 * One rule the drawing has to respect: limbs are drawn *behind* the body, so
 * only the length that clears the silhouette is visible. Drawn in front they
 * cross the body mass and blend into the rays, and the character reads as a
 * tangle rather than a figure. The corollary is that a posed hand only exists
 * if it lands outside the body — `reach` is the helper that guarantees it.
 */

// ---- tuning dials ----------------------------------------------------------
//
// Every proportion of the avatar is in this block: how big it is, the shape of
// the body, the size of the face, the weight of every line. Changing how the
// character *looks* means editing here and nothing else.
//
// What is deliberately not here is where the limbs go in each state. Those
// coordinates sit with the state they belong to, in `poseFor` and its helpers,
// because they are choreography rather than proportion — a hand's resting
// place is a dial (`HAND_X`), but the arc it swings through while walking
// belongs next to `walking`.
//
// Colours are `CLAUDE` and `CLAUDE_SLUMP` below, three tones each, in the
// office's marker palette (`kit/palette.ts`); the ink is the sheet's ink.
//
// Lengths are in the rig's own units, which `RIG_SCALE` maps onto the 32px
// tile. Y is negative upward from the floor, so the body sits at a negative y
// and the feet rest near zero.

/**
 * How big the character draws against the 32px tile. The rig is authored at
 * one natural size and the root is scaled, so retuning the character's size
 * never means re-deriving everything below.
 */
const RIG_SCALE = 1.55;

// -- body ---------------------------------------------------------------------

/**
 * The head's rays, after the reference cartoon: thick, even-width rays with
 * round ends, radiating from a round core, not tapered spikes. Each ray has a
 * bearing in degrees clockwise from straight up and a reach from the head
 * centre to the end of its round tip. Every ray is full length — no short
 * stubs — and there are none underneath, where the head runs straight on
 * into the torso. Slightly uneven bearings and reaches, the top one tallest,
 * keep it hand-drawn.
 */
const RAYS: readonly { deg: number; len: number }[] = [
  { deg: 0, len: 16 },
  { deg: 43, len: 15.8 },
  { deg: 81, len: 15.6 },
  { deg: 117, len: 14.8 },
  { deg: 241, len: 15 },
  { deg: 277, len: 14.8 },
  { deg: 318, len: 14.4 },
];
/** Ray width where it leaves the core, and at its round end. Barely tapered. */
const RAY_W0 = 3.4;
const RAY_W1 = 3.1;
/**
 * Ray roots: rays closer than `ROOT_NEIGHBOUR_DEG` flare to meet halfway, in a
 * V whose bottom sits `ROOT_NOTCH` outside the core; the flare blends into the
 * ray's own width `ROOT_LEN` outside the core. A ray with no near neighbour
 * flares by `ROOT_FLARE_DEG` either side instead.
 */
const ROOT_NEIGHBOUR_DEG = 60;
const ROOT_NOTCH = 0.2;
const ROOT_LEN = 2.2;
const ROOT_FLARE_DEG = 10;
/** Radius of the round core the rays leave from. */
const CORE_R = 7.9;
/** The furthest any ray reaches: the top of the head, for the thought dots. */
const BODY_R = Math.max(...RAYS.map((ray) => ray.len));
/**
 * Outline weight on the body, in rig units. A stroke straddles its path, so
 * this is the full width of the visible band, half of it outside the body.
 * Thin, and in the body's own darker orange (`edge`) rather than the sheet's
 * heavy ink: the reference cartoon draws its starbursts that way, and it is
 * what keeps the character soft next to the inked furniture.
 */
const LINE = 1;

// -- face ---------------------------------------------------------------------

/**
 * How far the whole face slides toward the side the actor faces. On the
 * isometric floor nobody looks straight out at you, so the face sits well
 * round toward where it is headed: a three-quarter view.
 */
const FACE_TURN = 2.8;
/** Eye centres, mirrored either side of the face's midline. */
const EYE_X = 2.65;
const EYE_Y = 3;
/** Eye ellipse radii, and the wider pair the `wide` look uses. */
const EYE_RX = 0.82;
const EYE_RY = 1.22;
const EYE_WIDE_RX = 1;
const EYE_WIDE_RY = 1.45;
/** A drooping eye is the same width, squashed flat and sitting lower. */
const EYE_DROOP_RY = 0.7;
/** Closed and half-lidded eyes are strokes: half-width, and the curve's dip. */
const LID_HALF = 1.6;
const LID_DIP = 1.3;
/** Mouth, measured down from the eyes. */
const MOUTH_DROP = 2.2;
const MOUTH_HALF = 1.1;
/** How far a smile bows down; a frown mirrors it. */
const MOUTH_CURVE = 1.1;
/** An open mouth is an outlined ellipse rather than a stroke. */
const MOUTH_OPEN_RX = 1.15;
const MOUTH_OPEN_RY = 1.35;
/** Stroke weight for lids and mouth. */
const FACE_LINE = 0.7;
/**
 * The resting smile is a small open D: a filled half-oval this wide and deep,
 * with a band of white teeth across its top, as in the cartoon.
 */
const GRIN_HALF = 1.6;
const GRIN_DEPTH = 1.7;
const GRIN_TEETH = 0.3;
/**
 * Uniform size of the features — eyes, mouth, lids and their spacing together,
 * *within* the head. For a bigger head, see `RAYS` and `CORE_R`.
 *
 * A transform on the face layer, which works here precisely because nothing
 * else is derived from these numbers.
 *
 * Much above 1.5 the eyes start to crowd the rays.
 */
const FEATURE_SCALE = 1;
/**
 * A blink: open eyes shut for `BLINK_FOR` seconds once every `BLINK_EVERY`.
 * Each actor blinks on its own phase, hashed from its id, so a row of leads
 * never blinks in unison. Still a pure function of `(actor, t)`.
 */
const BLINK_EVERY = 4.3;
const BLINK_FOR = 0.13;

// -- limbs --------------------------------------------------------------------

/**
 * Outline showing outside the limbs. Limbs are stroked and then filled over
 * (see `silhouette`), so only the outer half of the line survives; half the
 * body's `LINE` makes the two read as one weight.
 */
const CONTOUR = LINE / 2;

/** Where feet meet the floor — just above the contact shadow. */
const GROUND_Y = -2;
/**
 * The torso: a slim rounded block the head runs straight on into — one shape, no
 * neck and no line between them, as in the cartoon. Half-width, half-height,
 * and how far its centre sits below the head's.
 */
const TORSO_RX = 5.1;
const TORSO_RY = 7.2;
const TORSO_DROP = 10.2;
/** Radius of the torso's bottom corners, where the legs leave it. */
const TORSO_CORNER = 2.2;
/**
 * Clear floor below the torso. Legs read only in this gap, so it is the dial
 * for how long they look.
 */
const LEG_GAP = 3.3;
/**
 * Head centre while standing — derived, so resizing the torso or the legs
 * lifts the figure instead of burying it in the floor.
 */
const STAND_Y = GROUND_Y - LEG_GAP - TORSO_DROP - TORSO_RY;

/**
 * Joints, relative to the head centre, sit inside the torso; a limb only
 * appears where it exits. Arms leave the torso's upper sides, legs its base.
 */
const SHOULDER_X = TORSO_RX * 0.7;
const SHOULDER_Y = TORSO_DROP - TORSO_RY * 0.25;
const HIP_X = 3;
const HIP_Y = TORSO_DROP + TORSO_RY * 0.7;

/**
 * Limbs taper, as in the reference cartoon: legs are stout stubs narrowing
 * from hip to ankle, arms thinner and narrowing to the wrist. Widths at the
 * joint end, then at the far end.
 */
const LEG_W0 = 3.2;
const LEG_W1 = 2.9;
const ARM_W0 = 2.5;
const ARM_W1 = 2.2;
/** How far each limb bows out from the straight line to its end point. */
const ARM_BOW = 1.2;
const LEG_BOW = 0.3;

/** Mitten hands: a round palm with a thumb nub on its upper side. */
const HAND_R = 1.9;
const THUMB_R = 0.85;
/**
 * The index finger a thinking or talking hand raises: off-centre toward the
 * body, tapering, with the thumb stuck out on the far side. A finger centred
 * on a round fist reads as quite a different gesture.
 */
const FINGER_LEN = 2.3;
const FINGER_W0 = 1.4;
const FINGER_W1 = 1.15;
/** Feet are short flat ovals under the ankle, toes turned a little out. */
const FOOT_RX = 1.8;
const FOOT_RY = 1.15;
const FOOT_TOE_OUT = 0.6;

/** Resting hand and foot placement, mirrored left and right. */
const HAND_X = 9.8;
const HAND_Y = -11;
/**
 * The resting arm, as a length and a bearing from the shoulder. A walk swings
 * the hand around this arc rather than sliding it sideways, so the limb keeps
 * its length instead of stretching as the hand moves away from the shoulder.
 */
const ARM_LEN = Math.hypot(HAND_X - SHOULDER_X, HAND_Y - (STAND_Y + SHOULDER_Y));
const ARM_REST = Math.atan2(HAND_Y - (STAND_Y + SHOULDER_Y), HAND_X - SHOULDER_X);
/** How far the arm swings either side of rest while walking, in radians. */
const ARM_SWING = 0.26;
const FOOT_X = 3.2;

// -- props and effects --------------------------------------------------------

/** Thought dots: the nearest one's offset, then how each next one steps out. */
const THOUGHT_X = 12;
const THOUGHT_RISE = 7;
const THOUGHT_STEP_X = 8;
const THOUGHT_STEP_Y = 6.5;
const THOUGHT_R = 3;

/**
 * The cast shadow: a floor disc this wide under the feet, thrown by a body
 * this high, and how much it tightens as the character leaves the floor.
 * Rig units, like everything else here.
 */
const SHADOW_R = 9;
const SHADOW_HEIGHT = 22;
const SHADOW_LIFT = 0.03;

/**
 * The canvas each character is drawn into, in rig units around its feet. Big
 * enough for the thought dots up and to the right, and the shadow down-left.
 */
const BOX = { x0: -44, y0: -74, x1: 40, y1: 12 };

/** The body's three flat tones plus the darker orange its outline is drawn in. */
export interface Tone extends Mat {
  edge: string;
}

/** The body, close to flat warm orange as in the cartoon; and the washed-out tint of a slump. */
export const CLAUDE: Tone = { l: '#f39446', m: '#f0873c', d: '#e47834', edge: '#ad4a16' };
export const CLAUDE_SLUMP: Tone = { l: '#ecc0a2', m: '#dc9a72', d: '#c9855e', edge: '#9a5d3c' };

export interface Vec {
  x: number;
  y: number;
}

type Eyes = 'open' | 'wide' | 'closed' | 'droop';
type Mouth = 'grin' | 'smile' | 'flat' | 'frown' | 'open';

interface Look {
  eyes: Eyes;
  mouth: Mouth;
}

/** One frame of the character, in local pixels. Everything the rig needs. */
interface Pose {
  body: Vec;
  tilt: number;
  /** Vertical scale; the rig widens to match, so the blob keeps its volume. */
  squash: number;
  hands: [Vec, Vec];
  feet: [Vec, Vec];
  look: Look;
  /** Seen from behind, facing its monitor: no face. */
  back: boolean;
  thought: boolean;
  /** Which hand, if any, is raised with a finger pointing up. */
  point: 0 | 1 | null;
}

// ---- poses -----------------------------------------------------------------

/**
 * Push a point out past the body's silhouette, along its own direction from
 * the body centre. Limbs draw behind the body, so a hand posed inside the
 * silhouette is simply invisible; every reaching pose goes through here rather
 * than hand-checking its own coordinates.
 */
function reach(body: Vec, to: Vec, clearance = 3): Vec {
  const dx = to.x - body.x;
  const dy = to.y - body.y;
  const len = Math.hypot(dx, dy) || 1;
  const want = silhouetteAt(Math.atan2(dy, dx)) + clearance;
  if (len >= want) {
    return to;
  }
  return { x: body.x + (dx / len) * want, y: body.y + (dy / len) * want };
}

/**
 * How far the silhouette reaches along a bearing from the head centre (canvas
 * angles: 0 is right, positive is down): out along any ray that bearing runs
 * down, else to the edge of the core, or of the torso where it passes through
 * that. A hand raised beside a long ray has further to go than one held out
 * in a gap between rays.
 */
function silhouetteAt(angle: number): number {
  let reachOut = CORE_R;
  for (const ray of RAYS) {
    const bearing = ((ray.deg - 90) * Math.PI) / 180;
    const off = Math.abs(Math.atan2(Math.sin(angle - bearing), Math.cos(angle - bearing)));
    if (off < Math.atan2(RAY_W0 / 2, ray.len)) {
      reachOut = Math.max(reachOut, ray.len);
    }
  }
  // Where the bearing leaves the torso ellipse, if it passes through it.
  const c = Math.cos(angle) / TORSO_RX;
  const sn = Math.sin(angle) / TORSO_RY;
  const k = TORSO_DROP / TORSO_RY;
  const a = c * c + sn * sn;
  const b = -2 * sn * k;
  const det = b * b - 4 * a * (k * k - 1);
  if (det >= 0) {
    reachOut = Math.max(reachOut, (-b + Math.sqrt(det)) / (2 * a));
  }
  return reachOut;
}

/** Walk, run, or pace: scissoring legs, counter-swinging arms, a bob. */
function stride(pose: Pose, state: Actor['state'], t: number, facing: 1 | -1): void {
  const fast = state === 'sprinting';
  const speed = fast ? 15 : state === 'pacing' ? 5 : 9;
  const reachX = fast ? 8 : state === 'pacing' ? 4 : 6;
  const swing = Math.sin(t * speed);
  pose.body.y = STAND_Y - Math.abs(swing) * (fast ? 4 : 2.5);
  pose.tilt = facing * (fast ? 0.16 : 0.05);
  // The trailing foot leaves the floor; the planted one stays down.
  pose.feet = [
    { x: -swing * reachX, y: GROUND_Y - Math.max(0, -swing) * 5 },
    { x: swing * reachX, y: GROUND_Y - Math.max(0, swing) * 5 },
  ];
  // Arms counter-swing the legs on the same side, rotating about the shoulder
  // so the limb never stretches. The shoulder rides the body's bob, so the
  // hands pick that up without a term of their own.
  const arm = (side: -1 | 1, turn: number): Vec => {
    const bearing = ARM_REST + turn;
    return {
      x: side * (SHOULDER_X + Math.cos(bearing) * ARM_LEN),
      y: pose.body.y + SHOULDER_Y + Math.sin(bearing) * ARM_LEN,
    };
  };
  pose.hands = [arm(-1, swing * ARM_SWING), arm(1, -swing * ARM_SWING)];
  if (fast) {
    pose.look = { eyes: 'wide', mouth: 'open' };
  }
}

/**
 * Where a lead stands while it types, relative to its seat, in tiles. Core's
 * seat is a step in front of the desk; the lead steps right up to it, so its
 * stubby arms reach the keys, and a little to the left of the keyboard so its
 * hands land on the keys beside its body rather than hidden behind it.
 */
export const DESK_STANCE = { x: -0.3, y: -0.55 } as const;

/**
 * The longest a typing arm stretches, shoulder to hand, in rig units. If the
 * office's view puts the keys further off than this, the hand stops short
 * along the line to them: a stub arm stretched across the desk reads as
 * something other than typing.
 */
const TYPING_REACH = 9;

/** Screen pixels per tile, as the office draws them; rig units are pixels / RIG_SCALE. */
const TILE_PX = 32;

/**
 * A point on the desk's keyboard, as a world offset in tiles from a lead
 * standing at `DESK_STANCE`. `along` runs 0..1 across the keyboard, left to right.
 */
function keyOffset(along: number): V3 {
  const kx = KEYBOARD.x0 + (KEYBOARD.x1 - KEYBOARD.x0) * along;
  const ky = (KEYBOARD.y0 + KEYBOARD.y1) / 2;
  // Desk-local to stance-local: the desk's centre is DESK_SEAT_GAP behind the seat.
  return [kx - DESK_STANCE.x, ky - DESK_SEAT_GAP - DESK_STANCE.y, KEYBOARD.z];
}

/**
 * The two keys the hands rest on — the middle of the keyboard and its right
 * end — as world offsets from the lead. The office projects them for its
 * current view and hands the result to `update`.
 */
export const KEY_OFFSETS: readonly [V3, V3] = [keyOffset(0.45), keyOffset(0.85)];

/** A world offset in tiles as rig coordinates, from the office's home view. */
function homeRig([x, y, z]: V3): Vec {
  return {
    x: ((x - y) * C * TILE_PX) / RIG_SCALE,
    y: ((x + y) * S * TILE_PX - z * TILE_PX) / RIG_SCALE,
  };
}

const HOME_KEYS: readonly [Vec, Vec] = [homeRig(KEY_OFFSETS[0]), homeRig(KEY_OFFSETS[1])];

/**
 * Typing at the worker's own desk: turned to face the monitor, leaning in a
 * touch toward the keys, both hands on the desk's keyboard and tapping.
 */
function typing(pose: Pose, t: number, keys: readonly [Vec, Vec]): void {
  pose.tilt = (keys[0].x + keys[1].x > 0 ? 1 : -1) * 0.08;
  const toward = (side: -1 | 1, key: Vec, lift: number): Vec => {
    const shoulder = { x: pose.body.x + side * SHOULDER_X, y: pose.body.y + SHOULDER_Y };
    const dx = key.x - shoulder.x;
    const dy = key.y - lift - shoulder.y;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, TYPING_REACH / len);
    return { x: shoulder.x + dx * k, y: shoulder.y + dy * k };
  };
  pose.hands = [
    toward(-1, keys[0], Math.abs(Math.sin(t * 13)) * 2.2),
    toward(1, keys[1], Math.abs(Math.sin(t * 13 + 1.7)) * 2.2),
  ];
  pose.look = { eyes: 'open', mouth: 'flat' };
}

/** Working a station: leaning in, one hand hammering away. */
function labour(pose: Pose, t: number, facing: 1 | -1): void {
  const beat = Math.abs(Math.sin(t * 9));
  pose.body.y = STAND_Y - beat * 3;
  pose.tilt = facing * 0.09;
  pose.hands = [
    reach(pose.body, { x: facing * 15, y: pose.body.y + 4 - beat * 6 }),
    reach(pose.body, { x: facing * 11, y: pose.body.y + 14 }),
  ];
  pose.look = { eyes: 'open', mouth: 'flat' };
}

function poseFor(
  actor: Actor,
  t: number,
  atOwnComputer: boolean,
  keys: readonly [Vec, Vec] = HOME_KEYS
): Pose {
  const facing = actor.facing;
  const pose: Pose = {
    // A shallow breath is the floor of every pose; nothing is ever fully still.
    body: { x: 0, y: STAND_Y + Math.sin(t * 1.6) * 0.8 },
    tilt: 0,
    squash: 1,
    hands: [
      { x: -HAND_X, y: HAND_Y },
      { x: HAND_X, y: HAND_Y },
    ],
    feet: [
      { x: -FOOT_X, y: GROUND_Y },
      { x: FOOT_X, y: GROUND_Y },
    ],
    look: { eyes: 'open', mouth: 'grin' },
    back: false,
    thought: false,
    point: null,
  };

  switch (actor.state) {
    case 'walking':
    case 'sprinting':
    case 'pacing':
      stride(pose, actor.state, t, facing);
      break;

    case 'working':
      if (atOwnComputer) {
        typing(pose, t, keys);
      } else {
        labour(pose, t, facing);
      }
      break;

    case 'thinking': {
      const sway = Math.sin(t * 1.5);
      pose.body.y = STAND_Y + sway * 1.4;
      pose.tilt = sway * 0.05;
      // One hand up beside the face — a finger raised, not a hand on the chin:
      // a hand *on* the chin sits inside the silhouette and cannot be seen.
      const up: 0 | 1 = facing >= 0 ? 1 : 0;
      pose.hands[up] = reach(pose.body, { x: facing * 12, y: pose.body.y - 3 });
      pose.point = up;
      pose.look = { eyes: 'open', mouth: 'grin' };
      pose.thought = true;
      break;
    }

    case 'slump':
      pose.body.y = STAND_Y + 3.5;
      pose.squash = 0.86;
      pose.hands = [
        { x: -9.5, y: GROUND_Y - 3 },
        { x: 9.5, y: GROUND_Y - 3 },
      ];
      pose.feet = [
        { x: -3, y: GROUND_Y },
        { x: 3, y: GROUND_Y },
      ];
      pose.look = { eyes: 'droop', mouth: 'frown' };
      break;

    case 'napping': {
      const breath = Math.sin(t * 0.9);
      pose.body.y = STAND_Y + 3 + breath * 0.8;
      pose.squash = 0.93;
      pose.hands = [
        reach(pose.body, { x: -12, y: pose.body.y + 12 }),
        reach(pose.body, { x: 12, y: pose.body.y + 12 }),
      ];
      pose.feet = [
        { x: -3.4, y: GROUND_Y },
        { x: 3.4, y: GROUND_Y },
      ];
      pose.look = { eyes: 'closed', mouth: 'smile' };
      break;
    }

    case 'talking': {
      // One hand up and gesturing, the mouth opening and closing on the beat.
      const beat = Math.sin(t * 7);
      pose.tilt = facing * 0.04;
      const up: 0 | 1 = facing >= 0 ? 1 : 0;
      pose.hands[up] = reach(pose.body, { x: facing * 13, y: pose.body.y + 1 - beat * 3 });
      pose.point = up;
      pose.look = { eyes: 'open', mouth: beat > 0 ? 'open' : 'grin' };
      break;
    }

    case 'waiting':
      // Hands held forward and low, waiting to be told what to do.
      pose.hands = [
        { x: -9, y: GROUND_Y - 5 },
        { x: 9, y: GROUND_Y - 5 },
      ];
      break;

    case 'idle':
      break;
  }

  // A backlog wipes the smile: strained at first, then properly worried. The
  // renderer draws the sweat; the face has to agree with it.
  if (actor.stress > 0.7) {
    pose.look = { eyes: 'wide', mouth: pose.look.mouth === 'open' ? 'open' : 'frown' };
  } else if (actor.stress > 0.3 && (pose.look.mouth === 'grin' || pose.look.mouth === 'smile')) {
    pose.look = { ...pose.look, mouth: 'flat' };
  }
  if (pose.look.eyes === 'open' && blinking(actor.id, t)) {
    pose.look = { ...pose.look, eyes: 'closed' };
  }
  return pose;
}

/** Whether an actor is mid-blink at `t`, on its own phase. */
function blinking(id: string, t: number): boolean {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  }
  // FNV-1a, then the low bits scattered over the cycle: ids differing only in
  // a trailing digit must still land far apart.
  const phase = (Math.imul(hash, 0x9e3779b1) >>> 0) / 0x100000000;
  const at = (t / BLINK_EVERY + phase) % 1;
  return at * BLINK_EVERY < BLINK_FOR;
}

// ---- drawing ---------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

const polar = (angle: number, radius: number): Vec => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius,
});

/**
 * The head and torso as overlapping shapes in body-local space: the core, a
 * round-ended ray per `RAYS`, and the torso under them. Laid down together by
 * `silhouette` they read as one figure with one outline.
 */
function bodyShapes(): Path2D[] {
  const shapes = [disc({ x: 0, y: 0 }, CORE_R), ...RAYS.map((_, i) => rayRoot(i))];
  for (const ray of RAYS) {
    const bearing = ((ray.deg - 90) * Math.PI) / 180;
    const end = ray.len - RAY_W1 / 2;
    shapes.push(
      taperedLimb(
        { x: 0, y: 0 },
        { x: Math.cos(bearing) * end, y: Math.sin(bearing) * end },
        0,
        RAY_W0,
        RAY_W1
      )
    );
  }
  const torso = new Path2D();
  const rx = TORSO_RX;
  const ry = TORSO_RY;
  const cy = TORSO_DROP;
  // A slim rounded block: straight sides running down into the legs, a nearly
  // flat base with round corners, and no belly bulging out at the bottom,
  // which made the figure read as fat. Wound anticlockwise like every other
  // shape, so the shapes clip as one union.
  const corner = TORSO_CORNER;
  torso.moveTo(0, cy - ry);
  torso.quadraticCurveTo(-rx, cy - ry, -rx, cy - ry * 0.4);
  torso.lineTo(-rx, cy + ry - corner);
  torso.quadraticCurveTo(-rx, cy + ry, -rx + corner, cy + ry);
  torso.lineTo(rx - corner, cy + ry);
  torso.quadraticCurveTo(rx, cy + ry, rx, cy + ry - corner);
  torso.lineTo(rx, cy - ry * 0.4);
  torso.quadraticCurveTo(rx, cy - ry, 0, cy - ry);
  torso.closePath();
  shapes.push(torso);
  // A neck in all but name, no wider than the torso: fills the join between
  // core and torso, so no pocket of floor can be enclosed there, while the
  // round underside of the head still shows either side of it.
  shapes.push(disc({ x: 0, y: TORSO_DROP * 0.55 }, TORSO_RX, TORSO_DROP * 0.55));
  return shapes;
}

/**
 * The flared root of ray `i`: a fan from the head centre that widens the ray
 * where it leaves the core until it meets its neighbours, so rays join in a
 * V at the head with no bare stretch of core between their roots, as in the
 * cartoon. Beside the torso gap, where there is no neighbour near, the root
 * flares by `ROOT_FLARE_DEG` only.
 */
function rayRoot(i: number): Path2D {
  const n = RAYS.length;
  const gap = (a: number, b: number): number => (((b - a) % 360) + 360) % 360;
  const before = gap(RAYS[(i + n - 1) % n].deg, RAYS[i].deg);
  const after = gap(RAYS[i].deg, RAYS[(i + 1) % n].deg);
  const spanBefore = before <= ROOT_NEIGHBOUR_DEG ? before / 2 : ROOT_FLARE_DEG;
  const spanAfter = after <= ROOT_NEIGHBOUR_DEG ? after / 2 : ROOT_FLARE_DEG;
  const rad = (deg: number): number => ((deg - 90) * Math.PI) / 180;
  const b = rad(RAYS[i].deg);
  const dir = { x: Math.cos(b), y: Math.sin(b) };
  // Toward the previous ray (a smaller bearing) and toward the next.
  const toBefore = { x: dir.y, y: -dir.x };
  const at = (deg: number, radius: number): Vec => ({
    x: Math.cos(rad(deg)) * radius,
    y: Math.sin(rad(deg)) * radius,
  });
  const half = RAY_W0 / 2;
  const reachOut = CORE_R + ROOT_LEN;
  const points: Vec[] = [
    { x: 0, y: 0 },
    at(RAYS[i].deg - spanBefore, CORE_R + ROOT_NOTCH),
    { x: dir.x * reachOut + toBefore.x * half, y: dir.y * reachOut + toBefore.y * half },
    { x: dir.x * reachOut - toBefore.x * half, y: dir.y * reachOut - toBefore.y * half },
    at(RAYS[i].deg + spanAfter, CORE_R + ROOT_NOTCH),
  ];
  // Wind it like every other shape (negative signed area on screen), so the
  // union clip adds it rather than cutting a hole.
  let area = 0;
  points.forEach((p, k) => {
    const q = points[(k + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  });
  if (area > 0) {
    points.reverse();
  }
  const path = new Path2D();
  points.forEach((p, k) => (k === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  path.closePath();
  return path;
}

/**
 * Paint the head and torso in the body's three bands: a darker rim on the
 * shaded lower left, the body colour over most of it, and a lit cap at the
 * upper right. Clipped once to the union of every shape — never shape by
 * shape, whose antialiased edges would leave faint seams inside the figure.
 */
function bandedFill(g: Ctx, shapes: readonly Path2D[], tone: Tone): void {
  const union = new Path2D();
  for (const shape of shapes) {
    union.addPath(shape);
  }
  g.save();
  g.clip(union, 'nonzero');
  // The body colour first and everywhere, then the rim only outside its
  // ellipse. Painting the rim under the body colour instead would leave a
  // faint dark seam wherever the figure's edge crosses a limb drawn beneath
  // it — the belly over the legs, the shoulders over the arms — because both
  // layers' antialiased edges land on the same pixels.
  const top = -BODY_R - 2;
  g.fillStyle = tone.m;
  g.fillRect(-BODY_R - 2, top, (BODY_R + 2) * 2, BODY_R * 2 + TORSO_DROP + TORSO_RY);
  g.beginPath();
  g.rect(-BODY_R - 2, top, (BODY_R + 2) * 2, BODY_R * 2 + TORSO_DROP + TORSO_RY);
  g.ellipse(1.4, 1.6, BODY_R + 0.6, BODY_R + TORSO_RY * 0.5, 0, 0, Math.PI * 2);
  g.fillStyle = tone.d;
  g.fill('evenodd');
  g.beginPath();
  g.arc(BODY_R * 0.5, -BODY_R * 0.55, BODY_R * 0.36, 0, Math.PI * 2);
  g.fillStyle = tone.l;
  g.fill();
  g.restore();
}

/**
 * A limb as one closed outline: a quadratic from `from` to `to`, bowed
 * sideways by `bow`, tapering from width `w0` to `w1`, with round ends.
 */
function taperedLimb(from: Vec, to: Vec, bow: number, w0: number, w1: number): Path2D {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const via = {
    x: (from.x + to.x) / 2 - (dy / len) * bow,
    y: (from.y + to.y) / 2 + (dx / len) * bow,
  };
  const steps = 10;
  const left: Vec[] = [];
  const right: Vec[] = [];
  let a0 = 0;
  let a1 = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const p = {
      x: u * u * from.x + 2 * u * t * via.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * via.y + t * t * to.y,
    };
    const d = {
      x: 2 * u * (via.x - from.x) + 2 * t * (to.x - via.x),
      y: 2 * u * (via.y - from.y) + 2 * t * (to.y - via.y),
    };
    const angle = Math.atan2(d.y, d.x);
    if (i === 0) {
      a0 = angle;
    }
    a1 = angle;
    const half = (w0 + (w1 - w0) * t) / 2;
    const n = { x: -Math.sin(angle), y: Math.cos(angle) };
    left.push({ x: p.x + n.x * half, y: p.y + n.y * half });
    right.push({ x: p.x - n.x * half, y: p.y - n.y * half });
  }
  const path = new Path2D();
  path.moveTo(left[0].x, left[0].y);
  for (const at of left) {
    path.lineTo(at.x, at.y);
  }
  // Round over the far end, back down the other flank, round over the near end.
  path.arc(to.x, to.y, w1 / 2, a1 + Math.PI / 2, a1 - Math.PI / 2, true);
  for (let i = right.length - 1; i >= 0; i--) {
    path.lineTo(right[i].x, right[i].y);
  }
  path.arc(from.x, from.y, w0 / 2, a0 - Math.PI / 2, a0 + Math.PI / 2 - Math.PI * 2, true);
  path.closePath();
  return path;
}

const disc = (at: Vec, rx: number, ry = rx): Path2D => {
  const path = new Path2D();
  // Anticlockwise, the same winding as `taperedLimb`, so overlapping shapes
  // add up under the nonzero rule instead of cancelling into holes.
  path.ellipse(at.x, at.y, rx, ry, 0, Math.PI * 2, 0, true);
  return path;
};

/** Both legs, each a tapering stub ending in a flat, toe-out foot. */
function legShapes(hips: readonly [Vec, Vec], feet: readonly [Vec, Vec]): Path2D[] {
  return [0, 1].flatMap((i) => {
    const side = i === 0 ? -1 : 1;
    const foot = feet[i];
    const ankle = { x: foot.x, y: foot.y - FOOT_RY * 0.5 };
    return [
      taperedLimb(hips[i], ankle, side * LEG_BOW, LEG_W0, LEG_W1),
      disc({ x: foot.x + side * FOOT_TOE_OUT, y: foot.y - FOOT_RY * 0.2 }, FOOT_RX, FOOT_RY),
    ];
  });
}

/**
 * Both arms, each a tapering stub ending in a mitten: a round palm with a
 * thumb nub on its upper side, or — on the `point` hand — a finger raised
 * straight up.
 */
function armShapes(
  shoulders: readonly [Vec, Vec],
  hands: readonly [Vec, Vec],
  point: 0 | 1 | null
): Path2D[] {
  return [0, 1].flatMap((i) => {
    const side = i === 0 ? -1 : 1;
    const hand = hands[i];
    const from = shoulders[i];
    const len = Math.hypot(hand.x - from.x, hand.y - from.y) || 1;
    const dir = { x: (hand.x - from.x) / len, y: (hand.y - from.y) / len };
    // Of the two sides of the wrist, the thumb sits on the one facing up.
    const perp = dir.x * side >= 0 ? { x: dir.y, y: -dir.x } : { x: -dir.y, y: dir.x };
    const thumb = perp.y <= 0 ? perp : { x: -perp.x, y: -perp.y };
    const arm = taperedLimb(from, hand, side * ARM_BOW, ARM_W0, ARM_W1);
    if (point === i) {
      // Index up on the inner edge of the fist, thumb out flat on the outer.
      const base = { x: hand.x - side * HAND_R * 0.45, y: hand.y - HAND_R * 0.3 };
      const tip = { x: base.x + side * 0.35, y: hand.y - HAND_R - FINGER_LEN };
      return [
        arm,
        disc(hand, HAND_R),
        disc({ x: hand.x + side * HAND_R * 0.95, y: hand.y - 0.15 }, THUMB_R * 1.25, THUMB_R),
        taperedLimb(base, tip, 0, FINGER_W0, FINGER_W1),
      ];
    }
    return [
      arm,
      disc(hand, HAND_R),
      disc({ x: hand.x + thumb.x * HAND_R * 0.8, y: hand.y + thumb.y * HAND_R * 0.8 }, THUMB_R),
    ];
  });
}

/**
 * The face, in body-local space: small upright dot eyes with a catchlight
 * over an open grin, kept tiny and set low on the core under the tall crown,
 * which is most of what makes the character read as cute rather than as a
 * sea urchin. The whole face stays inside the valley radius so no feature can
 * land in the gap between two rays.
 */
function drawFace(g: Ctx, look: Look, facing: 1 | -1): void {
  g.save();
  g.scale(FEATURE_SCALE, FEATURE_SCALE);
  const shift = facing * FACE_TURN;
  const eyes: readonly Vec[] = [
    { x: shift - EYE_X, y: EYE_Y },
    { x: shift + EYE_X, y: EYE_Y },
  ];
  const mouthY = EYE_Y + MOUTH_DROP;
  const ink = SHEET.ink;
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineWidth = FACE_LINE;
  g.lineCap = 'round';

  const oval = (x: number, y: number, rx: number, ry: number): void => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  };
  if (look.eyes === 'open' || look.eyes === 'wide') {
    const rx = look.eyes === 'wide' ? EYE_WIDE_RX : EYE_RX;
    const ry = look.eyes === 'wide' ? EYE_WIDE_RY : EYE_RY;
    for (const eye of eyes) {
      oval(eye.x, eye.y, rx, ry);
      g.fill();
      // A catchlight, up toward the light.
      oval(eye.x + rx * 0.35, eye.y - ry * 0.4, rx * 0.32, rx * 0.32);
      g.fillStyle = '#fffdf6';
      g.fill();
      g.fillStyle = ink;
    }
  } else if (look.eyes === 'droop') {
    for (const eye of eyes) {
      oval(eye.x, eye.y + EYE_DROOP_RY * 0.55, EYE_RX, EYE_DROOP_RY);
      g.fill();
    }
    // Half-lids, sloping down toward the outside of the face.
    eyes.forEach((eye, i) => {
      const out = i === 0 ? -1 : 1;
      g.beginPath();
      g.moveTo(eye.x - out * LID_HALF, eye.y - LID_DIP * 0.85);
      g.lineTo(eye.x + out * LID_HALF, eye.y - LID_DIP * 0.35);
      g.stroke();
    });
  } else {
    for (const eye of eyes) {
      g.beginPath();
      g.moveTo(eye.x - LID_HALF, eye.y - LID_DIP * 0.25);
      g.quadraticCurveTo(eye.x, eye.y + LID_DIP, eye.x + LID_HALF, eye.y - LID_DIP * 0.25);
      g.stroke();
    }
  }

  g.beginPath();
  if (look.mouth === 'open') {
    // Outlined rather than solid, so it reads as an open mouth and not as a
    // third eye.
    oval(shift, mouthY, MOUTH_OPEN_RX, MOUTH_OPEN_RY);
    g.fillStyle = MAT.tomato.d;
    g.fill();
    g.stroke();
  } else if (look.mouth === 'grin') {
    // A small D on its back — flat across the top, round underneath, in ink —
    // with a band of teeth across the top.
    const top = mouthY - GRIN_DEPTH * 0.5;
    g.ellipse(shift, top, GRIN_HALF, GRIN_DEPTH, 0, 0, Math.PI);
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = '#fffdf6';
    g.fillRect(shift - GRIN_HALF, top, GRIN_HALF * 2, GRIN_DEPTH * GRIN_TEETH);
    g.restore();
  } else if (look.mouth === 'smile') {
    g.moveTo(shift - MOUTH_HALF, mouthY - MOUTH_CURVE * 0.45);
    g.quadraticCurveTo(
      shift,
      mouthY + MOUTH_CURVE,
      shift + MOUTH_HALF,
      mouthY - MOUTH_CURVE * 0.45
    );
    g.stroke();
  } else if (look.mouth === 'flat') {
    g.moveTo(shift - MOUTH_HALF * 0.9, mouthY);
    g.lineTo(shift + MOUTH_HALF * 0.9, mouthY);
    g.stroke();
  } else {
    // The smile, mirrored.
    g.moveTo(shift - MOUTH_HALF, mouthY + MOUTH_CURVE * 0.45);
    g.quadraticCurveTo(
      shift,
      mouthY - MOUTH_CURVE * 0.75,
      shift + MOUTH_HALF,
      mouthY + MOUTH_CURVE * 0.45
    );
    g.stroke();
  }
  g.restore();
}

/** Three thought dots rising over the head, fading in sequence. */
function drawThought(g: Ctx, t: number, top: number): void {
  for (let i = 0; i < 3; i++) {
    const alpha = Math.sin(Math.max(0, (t * 1.6 - i * 0.33) % 1) * Math.PI);
    if (alpha <= 0.02) {
      continue;
    }
    g.globalAlpha = alpha;
    g.beginPath();
    g.arc(
      THOUGHT_X + i * THOUGHT_STEP_X,
      top - THOUGHT_RISE - i * THOUGHT_STEP_Y,
      THOUGHT_R + i * 0.8,
      0,
      Math.PI * 2
    );
    g.fillStyle = SHEET.pill;
    g.fill();
    g.strokeStyle = SHEET.ink;
    g.lineWidth = SHEET_INK.detail / RIG_SCALE;
    g.stroke();
  }
  g.globalAlpha = 1;
}

/**
 * The flat blue cast shadow, in rig space: the floor disc under the feet
 * swept toward the lower left as far as a body this tall throws it. The
 * office paints every actor's shadow onto its floor layer with this same
 * outline (`shadowOutline`); the rig draws its own only when asked, for the
 * character sheet, which has no floor.
 */
export function shadowOutline(airborne: number): V2[] {
  const shrink = Math.max(0.6, 1 - airborne * SHADOW_LIFT);
  const r = SHADOW_R * shrink;
  const cos = Math.cos(Math.PI / 6);
  const sin = Math.sin(Math.PI / 6);
  // A floor point (dx, dy) in tiles-ish rig units, as rig screen space.
  const floor = (x: number, y: number): V2 => [(x - y) * cos, (x + y) * sin];
  const h = SHADOW_HEIGHT * shrink;
  const throwX = h * SHADOW_DIR[0];
  const throwY = h * SHADOW_DIR[1];
  const pts: V2[] = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * r * 0.82;
    const y = Math.sin(a) * r * 0.82;
    pts.push(floor(x, y), floor(x + throwX, y + throwY));
  }
  return pts;
}

// ---- the rig ---------------------------------------------------------------

/** How the office sees the character this frame. */
export interface RigView {
  /** Turned away from the viewer: drawn from behind, with no face. */
  back?: boolean;
  /** Where the desk's keys are, in rig coordinates, while it types there. */
  keys?: readonly [Vec, Vec];
}

export interface RigOptions {
  /** Draw the character's own cast shadow (for sheets with no floor). */
  shadow?: boolean;
}

/** The pose's height off the floor, for its shadow. */
export function airborneOf(actor: Actor, t: number, atOwnComputer: boolean): number {
  return Math.max(0, STAND_Y - poseFor(actor, t, atOwnComputer).body.y);
}

export { RIG_SCALE };

export class AgentRig {
  readonly view = new Container();

  private readonly canvas = document.createElement('canvas');
  private readonly sprite = new Sprite();
  private source: CanvasSource | null = null;
  private resolution = 0;
  private readonly withShadow: boolean;

  constructor(options: RigOptions = {}) {
    this.withShadow = options.shadow === true;
    this.sprite.position.set(BOX.x0 * RIG_SCALE, BOX.y0 * RIG_SCALE);
    this.view.addChild(this.sprite);
  }

  /** Size the canvas for a device resolution (screen pixels per rig pixel). */
  private ensure(resolution: number): void {
    const res = Math.max(1, Math.min(4, Math.round(resolution * 4) / 4));
    if (res === this.resolution && this.source) {
      return;
    }
    this.resolution = res;
    this.canvas.width = Math.ceil((BOX.x1 - BOX.x0) * RIG_SCALE * res);
    this.canvas.height = Math.ceil((BOX.y1 - BOX.y0) * RIG_SCALE * res);
    const old = this.sprite.texture;
    this.source = new CanvasSource({ resource: this.canvas, resolution: res });
    this.sprite.texture = new Texture({ source: this.source });
    if (old && old !== Texture.EMPTY) {
      old.destroy(true);
    }
  }

  /**
   * Pose and draw one frame. `resolution` is how many device pixels one
   * screen pixel of the rig covers (the camera's zoom times the display's
   * density), so the character stays crisp at any zoom. `view` says whether
   * it is seen from behind, and where the desk's keys are for typing.
   */
  update(
    actor: Actor,
    t: number,
    atOwnComputer: boolean,
    resolution = 2,
    view: RigView = {}
  ): void {
    this.ensure(resolution);
    const pose = poseFor(actor, t, atOwnComputer, view.keys);
    // Turned away from the viewer: the office decides that from where the
    // character is headed; the pose itself only knows typing faces the monitor.
    pose.back = view.back === true;
    const tone = actor.state === 'slump' ? CLAUDE_SLUMP : CLAUDE;
    const g = this.canvas.getContext('2d') as Ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.resolution * RIG_SCALE;
    g.setTransform(k, 0, 0, k, -BOX.x0 * k, -BOX.y0 * k);

    if (this.withShadow) {
      const outline = shadowOutline(Math.max(0, STAND_Y - pose.body.y));
      g.beginPath();
      const hullPts = hull(outline);
      hullPts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath();
      g.globalAlpha = SHEET.shadowAlpha;
      g.fillStyle = SHEET.shadow;
      g.fill();
      g.globalAlpha = 1;
    }

    if (pose.thought) {
      drawThought(g, t, pose.body.y - BODY_R);
    }

    const limbs = [
      ...legShapes(
        [
          { x: pose.body.x - HIP_X, y: pose.body.y + HIP_Y * pose.squash },
          { x: pose.body.x + HIP_X, y: pose.body.y + HIP_Y * pose.squash },
        ],
        pose.feet
      ),
      ...armShapes(
        [
          { x: pose.body.x - SHOULDER_X, y: pose.body.y + SHOULDER_Y * pose.squash },
          { x: pose.body.x + SHOULDER_X, y: pose.body.y + SHOULDER_Y * pose.squash },
        ],
        pose.hands,
        pose.point
      ),
    ];
    const body = bodyShapes();
    const toBody = (): void => {
      g.translate(pose.body.x, pose.body.y);
      g.rotate(pose.tilt);
      // Squashing vertically widens horizontally, so the blob keeps its volume.
      g.scale(1 / Math.sqrt(pose.squash), pose.squash);
    };

    // One silhouette for the whole figure: every outline first, then every
    // fill over them, so where shapes overlap — ray on core, head on torso,
    // hand on arm — the inner outlines vanish and only the outer edge stays.
    // A stroke straddles its path, so twice the visible weight.
    g.strokeStyle = tone.edge;
    g.lineJoin = 'round';
    g.lineWidth = CONTOUR * 2;
    for (const shape of limbs) {
      g.stroke(shape);
    }
    g.save();
    toBody();
    g.lineWidth = LINE;
    for (const shape of body) {
      g.stroke(shape);
    }
    g.restore();
    g.fillStyle = tone.m;
    for (const shape of limbs) {
      g.fill(shape);
    }

    g.save();
    toBody();
    bandedFill(g, body, tone);
    if (!pose.back) {
      drawFace(g, pose.look, actor.facing);
    }
    g.restore();
    this.source?.update();
  }

  destroy(): void {
    this.sprite.texture.destroy(true);
    this.view.destroy({ children: true });
  }
}
