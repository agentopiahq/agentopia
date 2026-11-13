import { Actor } from '@agentopia/core';
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';

import { C, S, SHADOW_DIR, INK as SHEET_INK, V2, V3, hull } from './kit/iso';
import { MAT, Mat, SHEET, mix } from './kit/palette';
import { DESK_SEAT_GAP, KEYBOARD } from './objects/desk';

/**
 * The Claude character, as a posed rig drawn in canvas 2D.
 *
 * The look is the office's: Colorfigures-style flat banding (a dark rim on
 * the shaded side, the body colour, a lit cap toward the light) under a heavy
 * ink silhouette, with finer ink on the face. A state is a *pose*, and the
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
 * Uniform size of the whole starburst — core, spikes and tips together. This
 * is the knob for "bigger head".
 *
 * A multiplier on the three radii rather than a transform on the drawn shape,
 * because the joints, `reach` and the thought dots are all derived from
 * `BODY_R`. Scaling the drawing alone would leave every one of them behind,
 * and arms would attach in mid-air.
 */
const HEAD_SCALE = 1;

/** Radius out to a spike tip. The starburst *is* the character's head. */
const BODY_R = 15 * HEAD_SCALE;
/** Odd, so the silhouette never reads as mechanically symmetric. */
const RAYS = 11;
/** Radius of the solid core the face sits on. Raise it for shorter spikes. */
const CORE_R = 8.6 * HEAD_SCALE;
/** Radius of a spike's round tip. Smaller than its base, so spikes taper. */
const TIP_R = 1.15 * HEAD_SCALE;
/** Half the angular width of a spike where it leaves the core. */
const RAY_BASE = (13 * Math.PI) / 180;
/**
 * Silhouette weight on the body, in rig units. A stroke straddles its path, so
 * this is the full width of the visible dark band, half of it outside the body.
 * It matches the office's heavy outline at office scale.
 */
const LINE = SHEET_INK.silhouette / RIG_SCALE;

// -- face ---------------------------------------------------------------------

/**
 * How far the whole face slides toward the side the actor faces. On the
 * isometric floor nobody looks straight out at you, so the face sits well
 * round toward where it is headed: a three-quarter view.
 */
const FACE_TURN = 2.1;
/** Eye centres, mirrored either side of the face's midline. */
const EYE_X = 2.4;
const EYE_Y = -1.5;
/** Eye ellipse radii, and the wider pair the `wide` look uses. */
const EYE_RX = 1.05;
const EYE_RY = 1.45;
const EYE_WIDE_RX = 1.35;
const EYE_WIDE_RY = 1.8;
/** A drooping eye is the same width, squashed flat and sitting lower. */
const EYE_DROOP_RY = 0.7;
/** Closed and half-lidded eyes are strokes: half-width, and the curve's dip. */
const LID_HALF = 1.4;
const LID_DIP = 1.2;
/** Mouth, measured down from the eyes. */
const MOUTH_DROP = 3.9;
const MOUTH_HALF = 1.35;
/** How far a smile bows down; a frown mirrors it. */
const MOUTH_CURVE = 1.1;
/** An open mouth is an outlined ellipse rather than a stroke. */
const MOUTH_OPEN_RX = 1.2;
const MOUTH_OPEN_RY = 1.45;
/** Stroke weight for lids and mouth. */
const FACE_LINE = 0.62;
/**
 * Uniform size of the features — eyes, mouth, lids and their spacing together,
 * *within* the head. For a bigger head, see `HEAD_SCALE`.
 *
 * A transform on the face layer, which works here precisely because nothing
 * else is derived from these numbers.
 *
 * Above about 1.6 the outermost feature passes `CORE_R` and lands in the gap
 * between two spikes, floating on the floor colour.
 */
const FEATURE_SCALE = 1;

// -- limbs --------------------------------------------------------------------

/**
 * Contour weight on the limbs, total across both sides. Limbs are thin enough
 * that the body's full line would double their apparent width.
 */
const CONTOUR = 1.5;

/** Where feet meet the floor — just above the contact shadow. */
const GROUND_Y = -2;
/**
 * Clear floor below the head's lowest spike. Legs read only in this gap, so it
 * is the dial for how long they look.
 */
const LEG_GAP = 6.1;
/**
 * How far the lowest spike hangs below the head centre. No spike points
 * straight down at an odd `RAYS`, so this is the nearest one's reach.
 */
const HEAD_DROP =
  BODY_R *
  Math.max(
    ...Array.from({ length: RAYS }, (_, i) => Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / RAYS))
  );
/**
 * Head centre while standing — derived, so raising `HEAD_SCALE` lifts the
 * figure instead of burying its spikes in the floor.
 */
const STAND_Y = GROUND_Y - LEG_GAP - HEAD_DROP;

/** Joints sit inside the body; a limb only appears where it exits. */
const SHOULDER_X = BODY_R * 0.45;
const SHOULDER_Y = BODY_R * 0.5;
const HIP_X = 2.6;
const HIP_Y = BODY_R * 0.6;

const ARM_W = 2.1;
const LEG_W = 2.4;
/** How far each limb bows out from the straight line to its end point. */
const ARM_BOW = 3;
const LEG_BOW = 0.8;

/** Hands are round; feet are the same dot stretched sideways into an oval. */
const HAND_R = 2.6;
const FOOT_R = 2.2;
const HAND_STRETCH = 0.8;
const FOOT_STRETCH = 3.2;

/** Resting hand and foot placement, mirrored left and right. */
const HAND_X = 14;
const HAND_Y = -8;
/**
 * The resting arm, as a length and a bearing from the shoulder. A walk swings
 * the hand around this arc rather than sliding it sideways, so the limb keeps
 * its length instead of stretching as the hand moves away from the shoulder.
 */
const ARM_LEN = Math.hypot(HAND_X - SHOULDER_X, HAND_Y - (STAND_Y + SHOULDER_Y));
const ARM_REST = Math.atan2(HAND_Y - (STAND_Y + SHOULDER_Y), HAND_X - SHOULDER_X);
/** How far the arm swings either side of rest while walking, in radians. */
const ARM_SWING = 0.26;
const FOOT_X = 3.4;

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

/** The body, in three flat tones; and the washed-out tint of a slump. */
export const CLAUDE: Mat = { l: '#f7a46e', m: '#e8773f', d: '#b24f25' };
export const CLAUDE_SLUMP: Mat = { l: '#e9bea2', m: '#d4936f', d: '#a5694a' };

export interface Vec {
  x: number;
  y: number;
}

type Eyes = 'open' | 'wide' | 'closed' | 'droop';
type Mouth = 'smile' | 'flat' | 'frown' | 'open';

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
}

// ---- poses -----------------------------------------------------------------

/**
 * Push a point out past the body's silhouette, along its own direction from
 * the body centre. Limbs draw behind the body, so a hand posed inside the
 * starburst is simply invisible; every reaching pose goes through here rather
 * than hand-checking its own coordinates.
 */
function reach(body: Vec, to: Vec, clearance = 3): Vec {
  const dx = to.x - body.x;
  const dy = to.y - body.y;
  const len = Math.hypot(dx, dy) || 1;
  const want = BODY_R + clearance;
  if (len >= want) {
    return to;
  }
  return { x: body.x + (dx / len) * want, y: body.y + (dy / len) * want };
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
 * seat is a step in front of the desk; the lead steps up to it, and a little
 * to the left of the keyboard so its hands land on the keys beside its body
 * rather than hidden behind it.
 */
export const DESK_STANCE = { x: -0.35, y: -0.3 } as const;

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
export const KEY_OFFSETS: readonly [V3, V3] = [keyOffset(0.5), keyOffset(0.92)];

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
  pose.hands = [
    { x: keys[0].x, y: keys[0].y - Math.abs(Math.sin(t * 13)) * 2.2 },
    { x: keys[1].x, y: keys[1].y - Math.abs(Math.sin(t * 13 + 1.7)) * 2.2 },
  ];
  pose.look = { eyes: 'open', mouth: 'flat' };
}

/** Working a station: leaning in, one hand hammering away. */
function labour(pose: Pose, t: number, facing: 1 | -1): void {
  const beat = Math.abs(Math.sin(t * 9));
  pose.body.y = STAND_Y - beat * 3;
  pose.tilt = facing * 0.09;
  pose.hands = [
    reach(pose.body, { x: facing * 19, y: pose.body.y + 2 - beat * 7 }),
    reach(pose.body, { x: facing * 14, y: pose.body.y + 15 }),
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
    look: { eyes: 'open', mouth: 'smile' },
    back: false,
    thought: false,
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
      const up = facing >= 0 ? 1 : 0;
      pose.hands[up] = reach(pose.body, { x: facing * 15, y: pose.body.y - 7 });
      pose.look = { eyes: 'open', mouth: 'smile' };
      pose.thought = true;
      break;
    }

    case 'slump':
      pose.body.y = STAND_Y + 5;
      pose.squash = 0.86;
      pose.hands = [
        { x: -13, y: GROUND_Y - 3 },
        { x: 13, y: GROUND_Y - 3 },
      ];
      pose.feet = [
        { x: -3, y: GROUND_Y },
        { x: 3, y: GROUND_Y },
      ];
      pose.look = { eyes: 'droop', mouth: 'frown' };
      break;

    case 'napping': {
      const breath = Math.sin(t * 0.9);
      pose.body.y = STAND_Y + 6 + breath * 1.2;
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
      const up = facing >= 0 ? 1 : 0;
      pose.hands[up] = reach(pose.body, { x: facing * 17, y: pose.body.y - 2 - beat * 3 });
      pose.look = { eyes: 'open', mouth: beat > 0 ? 'open' : 'smile' };
      break;
    }

    case 'waiting':
      // Hands held forward and low, waiting to be told what to do.
      pose.hands = [
        { x: -12, y: GROUND_Y - 5 },
        { x: 12, y: GROUND_Y - 5 },
      ];
      break;

    case 'idle':
      break;
  }

  // A backlog wipes the smile: strained at first, then properly worried. The
  // renderer draws the sweat; the face has to agree with it.
  if (actor.stress > 0.7) {
    pose.look = { eyes: 'wide', mouth: pose.look.mouth === 'open' ? 'open' : 'frown' };
  } else if (actor.stress > 0.3 && pose.look.mouth === 'smile') {
    pose.look = { ...pose.look, mouth: 'flat' };
  }
  return pose;
}

// ---- drawing ---------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

const polar = (angle: number, radius: number): Vec => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius,
});

/**
 * The starburst body: a solid core with `RAYS` tapered spikes on it, each
 * leaving the core wide and narrowing to a small round tip.
 *
 * The path is exact rather than approximated. Each spike is two straight
 * flanks running from the core to the tangent points on its tip circle, closed
 * by a real `arc` for the cap — no quadratic can be an arc, and an approximate
 * one reads as a chopped-off wedge. Between spikes the outline runs along the
 * core circle, which is what makes the notches read as notches.
 */
function starburst(g: Ctx, r: number, rays: number): void {
  const step = (Math.PI * 2) / rays;
  const spine = r - TIP_R;

  // Where a flank touches the tip circle, as an angle off the spike's axis.
  // Solved once: every spike is the same shape, only rotated.
  const base = { x: CORE_R * Math.cos(RAY_BASE), y: -CORE_R * Math.sin(RAY_BASE) };
  const toBase = { x: base.x - spine, y: base.y };
  const span = Math.hypot(toBase.x, toBase.y);
  const tangent = Math.atan2(toBase.y, toBase.x) + Math.acos(TIP_R / span);

  g.beginPath();
  for (let i = 0; i < rays; i++) {
    const axis = -Math.PI / 2 + i * step;
    const b0 = polar(axis - RAY_BASE, CORE_R);
    if (i === 0) {
      g.moveTo(b0.x, b0.y);
    } else {
      g.lineTo(b0.x, b0.y);
    }
    const c = polar(axis, spine);
    const t0 = polar(axis + tangent, TIP_R);
    g.lineTo(c.x + t0.x, c.y + t0.y);
    g.arc(c.x, c.y, TIP_R, axis + tangent, axis - tangent);
    const b1 = polar(axis + RAY_BASE, CORE_R);
    g.lineTo(b1.x, b1.y);
    // Along the core to the next spike — the gap that makes a notch.
    g.arc(0, 0, CORE_R, axis + RAY_BASE, axis + step - RAY_BASE);
  }
  g.closePath();
}

/**
 * The body in its three bands: a dark rim on the shaded lower left, the body
 * colour, and a lit cap toward the light at the upper right — the same three
 * tones every solid in the office is cut into. Then the heavy silhouette.
 */
function drawBody(g: Ctx, tone: Mat): void {
  starburst(g, BODY_R, RAYS);
  g.save();
  g.clip();
  g.fillStyle = tone.d;
  g.fillRect(-BODY_R, -BODY_R, BODY_R * 2, BODY_R * 2);
  g.beginPath();
  g.arc(BODY_R * 0.16, -BODY_R * 0.14, BODY_R * 0.93, 0, Math.PI * 2);
  g.fillStyle = tone.m;
  g.fill();
  g.beginPath();
  g.arc(BODY_R * 0.42, -BODY_R * 0.44, BODY_R * 0.5, 0, Math.PI * 2);
  g.fillStyle = tone.l;
  g.fill();
  g.restore();
  starburst(g, BODY_R, RAYS);
  g.strokeStyle = SHEET.ink;
  g.lineWidth = LINE;
  g.lineJoin = 'round';
  g.stroke();
}

/**
 * A mirrored pair of outlined limbs plus their end caps. Every contour is laid
 * down before any fill, so one limb's dark outline can never land on top of
 * the other's body.
 */
function limbPair(
  g: Ctx,
  joints: readonly [Vec, Vec],
  ends: readonly [Vec, Vec],
  bow: number,
  width: number,
  tone: string,
  cap: { radius: number; wide: number }
): void {
  const curves = [0, 1].map((i) => {
    const from = joints[i];
    const to = ends[i];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const side = i === 0 ? -bow : bow;
    return {
      from,
      to,
      via: {
        x: (from.x + to.x) / 2 - (dy / len) * side,
        y: (from.y + to.y) / 2 + (dx / len) * side,
      },
    };
  });
  // Limb and cap widths differ, so ink both under, then colour both over.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = SHEET.ink;
  g.beginPath();
  for (const { from, via, to } of curves) {
    g.moveTo(from.x, from.y);
    g.quadraticCurveTo(via.x, via.y, to.x, to.y);
  }
  g.lineWidth = width + CONTOUR;
  g.stroke();
  g.beginPath();
  for (const at of ends) {
    g.moveTo(at.x - cap.wide / 2, at.y);
    g.lineTo(at.x + cap.wide / 2, at.y);
  }
  g.lineWidth = cap.radius * 2 + CONTOUR;
  g.stroke();
  g.strokeStyle = tone;
  g.beginPath();
  for (const { from, via, to } of curves) {
    g.moveTo(from.x, from.y);
    g.quadraticCurveTo(via.x, via.y, to.x, to.y);
  }
  g.lineWidth = width;
  g.stroke();
  for (const at of ends) {
    g.beginPath();
    g.moveTo(at.x - cap.wide / 2, at.y);
    g.lineTo(at.x + cap.wide / 2, at.y);
    g.lineWidth = cap.radius * 2;
    g.stroke();
  }
}

/**
 * The face, in body-local space. Small, close-set eyes over a small mouth,
 * occupying only the middle of the core — the cartoon's features are far
 * tinier than they feel like they should be, and sizing them up is what makes
 * the character read as a sea urchin instead. The whole face stays inside the
 * valley radius so no feature can land in the gap between two rays.
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

    // Arms and legs behind the body, so only what clears it shows.
    limbPair(
      g,
      [
        { x: pose.body.x - HIP_X, y: pose.body.y + HIP_Y },
        { x: pose.body.x + HIP_X, y: pose.body.y + HIP_Y },
      ],
      pose.feet,
      LEG_BOW,
      LEG_W,
      tone.m,
      { radius: FOOT_R, wide: FOOT_STRETCH }
    );
    limbPair(
      g,
      [
        { x: pose.body.x - SHOULDER_X, y: pose.body.y + SHOULDER_Y },
        { x: pose.body.x + SHOULDER_X, y: pose.body.y + SHOULDER_Y },
      ],
      pose.hands,
      ARM_BOW,
      ARM_W,
      mix(tone.m, tone.l, 0.25),
      { radius: HAND_R, wide: HAND_STRETCH }
    );

    g.save();
    g.translate(pose.body.x, pose.body.y);
    g.rotate(pose.tilt);
    // Squashing vertically widens horizontally, so the blob keeps its volume.
    g.scale(1 / Math.sqrt(pose.squash), pose.squash);
    drawBody(g, tone);
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
