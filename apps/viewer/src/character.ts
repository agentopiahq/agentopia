import { Actor } from '@agentopia/core';
import { Container, Graphics } from 'pixi.js';

import { THEME } from './theme';

/**
 * The Claude character, as a posed rig.
 *
 * Every part is its own display object, so a state is a *pose* rather than a
 * redraw: the starburst body and the face are built once and then translated,
 * rotated and squashed, while only the limbs — whose geometry genuinely
 * changes every frame — and the held terminal are rebuilt.
 *
 * `poseFor` is a pure function of `(state, facing, t)`. It never reads a clock
 * or an rng, which is what keeps replays reproducible and golden-frame
 * snapshots stable. When real sprite art arrives each part swaps to a textured
 * `Sprite` behind this same rig and the pose function is untouched.
 *
 * Two rules the drawing has to respect:
 *
 * - Limbs are drawn *behind* the body, so only the length that clears the
 *   silhouette is visible. Drawn in front they cross the body mass and blend
 *   into the rays, and the character reads as a tangle rather than a figure.
 *   The corollary is that a posed hand only exists if it lands outside the
 *   body — `reach` is the helper that guarantees it.
 * - Within one `Graphics`, all fills come before all strokes, because Pixi
 *   accumulates paths and a `fill()` after a `stroke()` fills their
 *   connection. Limbs sidestep it by being strokes all the way down — a
 *   round-capped zero-length line is a dot.
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
// Colours are in `theme.ts`, because the office shares that palette: `worker`,
// `workerLine` and `slumpTint` are the character's body, `eye` is its face.
//
// Lengths are in the rig's own units, which `RIG_SCALE` maps onto the 32px
// tile. Y is negative upward from the floor, so the body sits at a negative y
// and the feet rest near zero.

/**
 * How big the character draws against the 32px tile. The rig is authored at
 * one natural size and the root is scaled, so retuning the character's size
 * never means re-deriving everything below.
 */
const RIG_SCALE = 1.15;

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
 * Silhouette weight on the body. A Pixi stroke straddles its path, so this is
 * the full width of the visible dark band, not the part outside the shape —
 * which is why it has to be so much finer than it looks like it should be.
 */
const LINE = 0.6;

// -- face ---------------------------------------------------------------------

/** How far the whole face slides toward the side the actor faces. */
const FACE_TURN = 0.7;
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
const FACE_LINE = 0.5;
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
 * that the body's line would double their apparent width.
 */
const CONTOUR = 0.6;

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
const ARM_SWING = 0.5;
const FOOT_X = 3.4;

// -- props and effects --------------------------------------------------------

/** The held terminal: its keyboard line, height, width, and text line pitch. */
const TERMINAL_Y = -4;
const TERMINAL_H = 12;
const TERMINAL_W = 22;
const TERMINAL_LINE_H = 3;

/** The coffee mug, drawn at the raised hand. */
const MUG_W = 6.4;
const MUG_H = 6.6;

/** Thought dots: the nearest one's offset, then how each next one steps out. */
const THOUGHT_X = 12;
const THOUGHT_RISE = 7;
const THOUGHT_STEP_X = 8;
const THOUGHT_STEP_Y = 6.5;
const THOUGHT_R = 3;

/** Contact shadow, and how much it tightens as the character leaves the floor. */
const SHADOW_RX = 11;
const SHADOW_RY = 4;
const SHADOW_ALPHA = 0.18;
const SHADOW_LIFT = 0.03;

interface Vec {
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
  terminal: boolean;
  thought: boolean;
  mug: boolean;
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

/** Typing at the worker's own machine: the body is still, the hands work. */
function typing(pose: Pose, t: number): void {
  // Hands land just outside the keyboard, so the machine never hides them.
  const edge = TERMINAL_W / 2 + 3.5;
  pose.hands = [
    { x: -edge, y: TERMINAL_Y - 2 - Math.abs(Math.sin(t * 13)) * 3 },
    { x: edge, y: TERMINAL_Y - 2 - Math.abs(Math.sin(t * 13 + 1.7)) * 3 },
  ];
  pose.look = { eyes: 'open', mouth: 'flat' };
  pose.terminal = true;
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

function poseFor(actor: Actor, t: number, atOwnComputer: boolean): Pose {
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
    terminal: false,
    thought: false,
    mug: false,
  };

  switch (actor.state) {
    case 'walking':
    case 'sprinting':
    case 'pacing':
      stride(pose, actor.state, t, facing);
      break;

    case 'working':
      if (atOwnComputer) {
        typing(pose, t);
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

    case 'coffee': {
      const sip = Math.max(0, Math.sin(t * 0.8));
      const held = facing >= 0 ? 1 : 0;
      pose.hands[held] = reach(pose.body, { x: facing * 16, y: pose.body.y + 8 - sip * 7 });
      pose.look = { eyes: sip > 0.75 ? 'closed' : 'open', mouth: 'smile' };
      pose.mug = true;
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
  return pose;
}

// ---- drawing ---------------------------------------------------------------

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
 *
 * An earlier version drew the body as the union of constant-width rays, which
 * cannot taper: widening a ray's base tilts its flanks, and past a very small
 * tilt neighbouring flanks stop meeting and the spikes merge into a disc. The
 * core has to be an explicit circle for a taper to be possible at all.
 */
function starburst(g: Graphics, r: number, rays: number): void {
  const step = (Math.PI * 2) / rays;
  const spine = r - TIP_R;

  // Where a flank touches the tip circle, as an angle off the spike's axis.
  // Solved once: every spike is the same shape, only rotated.
  const base = { x: CORE_R * Math.cos(RAY_BASE), y: -CORE_R * Math.sin(RAY_BASE) };
  const toBase = { x: base.x - spine, y: base.y };
  const span = Math.hypot(toBase.x, toBase.y);
  const tangent = Math.atan2(toBase.y, toBase.x) + Math.acos(TIP_R / span);

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

/** A round-capped dot, as two strokes: contour under, fill over. */
function dot(g: Graphics, at: Vec, radius: number, wide: number, tone: number): void {
  const half = wide / 2;
  g.moveTo(at.x - half, at.y).lineTo(at.x + half, at.y);
  g.stroke({ color: THEME.workerLine, width: radius * 2 + CONTOUR, cap: 'round' });
  g.moveTo(at.x - half, at.y).lineTo(at.x + half, at.y);
  g.stroke({ color: tone, width: radius * 2, cap: 'round' });
}

/**
 * A mirrored pair of outlined limbs plus their end caps. Every contour is laid
 * down before any fill, so one limb's dark outline can never land on top of
 * the other's body.
 */
function limbPair(
  g: Graphics,
  joints: readonly [Vec, Vec],
  ends: readonly [Vec, Vec],
  bow: number,
  width: number,
  tone: number,
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

  for (const { from, via, to } of curves) {
    g.moveTo(from.x, from.y).quadraticCurveTo(via.x, via.y, to.x, to.y);
    g.stroke({ color: THEME.workerLine, width: width + CONTOUR, cap: 'round' });
  }
  for (const { from, via, to } of curves) {
    g.moveTo(from.x, from.y).quadraticCurveTo(via.x, via.y, to.x, to.y);
    g.stroke({ color: tone, width, cap: 'round' });
  }
  for (const at of ends) {
    dot(g, at, cap.radius, cap.wide, tone);
  }
}

/**
 * The face, in body-local space. Small, close-set eyes over a small mouth,
 * occupying only the middle of the core — the cartoon's features are far
 * tinier than they feel like they should be, and sizing them up is what makes
 * the character read as a sea urchin instead. The whole face stays inside the
 * valley radius so no feature can land in the gap between two rays.
 */
function drawFace(g: Graphics, look: Look, facing: 1 | -1): void {
  g.clear();
  const shift = facing * FACE_TURN;
  const eyes: readonly Vec[] = [
    { x: shift - EYE_X, y: EYE_Y },
    { x: shift + EYE_X, y: EYE_Y },
  ];
  const mouthY = EYE_Y + MOUTH_DROP;

  // Fills before strokes: Pixi accumulates paths, and a fill issued after a
  // stroke fills their connection too.
  if (look.eyes === 'open' || look.eyes === 'wide') {
    const rx = look.eyes === 'wide' ? EYE_WIDE_RX : EYE_RX;
    const ry = look.eyes === 'wide' ? EYE_WIDE_RY : EYE_RY;
    for (const eye of eyes) {
      g.ellipse(eye.x, eye.y, rx, ry).fill(THEME.eye);
    }
  } else if (look.eyes === 'droop') {
    for (const eye of eyes) {
      g.ellipse(eye.x, eye.y + EYE_DROOP_RY * 0.55, EYE_RX, EYE_DROOP_RY).fill(THEME.eye);
    }
  }
  if (look.mouth === 'open') {
    // Outlined rather than solid, so it reads as an open mouth and not as a
    // third eye. Filled and stroked here, in the fills section, because a
    // fill issued after a stroke would pick up the stroked path with it.
    g.ellipse(shift, mouthY, MOUTH_OPEN_RX, MOUTH_OPEN_RY)
      .fill(THEME.mouthOpen)
      .stroke({ color: THEME.eye, width: FACE_LINE });
  }

  if (look.eyes === 'closed') {
    for (const eye of eyes) {
      g.moveTo(eye.x - LID_HALF, eye.y - LID_DIP * 0.25)
        .quadraticCurveTo(eye.x, eye.y + LID_DIP, eye.x + LID_HALF, eye.y - LID_DIP * 0.25)
        .stroke({ color: THEME.eye, width: FACE_LINE, cap: 'round' });
    }
  }
  if (look.eyes === 'droop') {
    // Half-lids, sloping down toward the outside of the face.
    eyes.forEach((eye, i) => {
      const out = i === 0 ? -1 : 1;
      g.moveTo(eye.x - out * LID_HALF, eye.y - LID_DIP * 0.85)
        .lineTo(eye.x + out * LID_HALF, eye.y - LID_DIP * 0.35)
        .stroke({ color: THEME.eye, width: FACE_LINE, cap: 'round' });
    });
  }
  if (look.mouth === 'smile') {
    g.moveTo(shift - MOUTH_HALF, mouthY - MOUTH_CURVE * 0.45)
      .quadraticCurveTo(
        shift,
        mouthY + MOUTH_CURVE,
        shift + MOUTH_HALF,
        mouthY - MOUTH_CURVE * 0.45
      )
      .stroke({ color: THEME.eye, width: FACE_LINE, cap: 'round' });
  } else if (look.mouth === 'flat') {
    g.moveTo(shift - MOUTH_HALF * 0.9, mouthY)
      .lineTo(shift + MOUTH_HALF * 0.9, mouthY)
      .stroke({ color: THEME.eye, width: FACE_LINE, cap: 'round' });
  } else if (look.mouth === 'frown') {
    // The smile, mirrored.
    g.moveTo(shift - MOUTH_HALF, mouthY + MOUTH_CURVE * 0.45)
      .quadraticCurveTo(
        shift,
        mouthY - MOUTH_CURVE * 0.75,
        shift + MOUTH_HALF,
        mouthY + MOUTH_CURVE * 0.45
      )
      .stroke({ color: THEME.eye, width: FACE_LINE, cap: 'round' });
  }
}

/**
 * A little terminal held in front, with pseudo-random output scrolling up it.
 * Line widths are hashed from the scroll position and the actor id, so the
 * output churns without any real text — or any real randomness, so replays
 * stay identical.
 */
function drawTerminal(g: Graphics, t: number, seed: string): void {
  const top = TERMINAL_Y - TERMINAL_H;
  g.roundRect(-TERMINAL_W / 2, top, TERMINAL_W, TERMINAL_H, 3).fill(THEME.laptop);
  // Same light screen as the desks' own laptops — a dark slab reads as a
  // different object entirely.
  g.roundRect(-TERMINAL_W / 2 + 2, top + 2, TERMINAL_W - 4, TERMINAL_H - 5, 2).fill(
    THEME.laptopGlow
  );

  const scroll = t * 6;
  const offset = (scroll % 1) * TERMINAL_LINE_H;
  const base = Math.floor(scroll);
  let seedHash = 0;
  for (let i = 0; i < seed.length; i++) {
    seedHash = (seedHash * 31 + seed.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < 4; i++) {
    const hash = Math.abs((seedHash ^ ((base + i) * 2654435761)) % 1000) / 1000;
    const y = top + 3.5 + i * TERMINAL_LINE_H - offset;
    if (y < top + 3 || y > TERMINAL_Y - 4) {
      continue;
    }
    g.roundRect(-TERMINAL_W / 2 + 4, y, 4 + hash * (TERMINAL_W - 12), 1.2, 0.6).fill({
      color: THEME.screenText,
      alpha: 0.5 + hash * 0.4,
    });
  }
  g.roundRect(-TERMINAL_W / 2 - 1.5, TERMINAL_Y - 2, TERMINAL_W + 3, 3.5, 2).fill(THEME.laptop);
}

/** A mug in the raised hand, for the coffee break. */
function drawMug(g: Graphics, at: Vec): void {
  g.roundRect(at.x - MUG_W / 2, at.y - MUG_H - 0.9, MUG_W, MUG_H, 2).fill(THEME.mug);
  // A sliver of coffee at the rim.
  g.roundRect(at.x - MUG_W * 0.375, at.y - MUG_H - 1.3, MUG_W * 0.75, 1.3, 1).fill(
    THEME.laptopGlow
  );
}

/** Three thought dots rising over the head, fading in sequence. */
function drawThought(g: Graphics, t: number, top: number): void {
  const dots = [0, 1, 2].map((i) => ({
    x: THOUGHT_X + i * THOUGHT_STEP_X,
    y: top - THOUGHT_RISE - i * THOUGHT_STEP_Y,
    r: THOUGHT_R + i * 0.8,
    alpha: Math.sin(Math.max(0, (t * 1.6 - i * 0.33) % 1) * Math.PI),
  }));
  for (const d of dots) {
    g.circle(d.x, d.y, d.r).fill({ color: THEME.bubbleBg, alpha: d.alpha * 0.95 });
  }
  for (const d of dots) {
    g.circle(d.x, d.y, d.r).stroke({ color: THEME.bubbleLine, alpha: d.alpha * 0.9, width: 1 });
  }
}

// ---- the rig ---------------------------------------------------------------

export class AgentRig {
  readonly view = new Container();

  private shadow = new Graphics();
  private thought = new Graphics();
  private limbs = new Graphics();
  /** Carries the body's tilt and squash, so the face rides along with them. */
  private core = new Container();
  private blob = new Graphics();
  private face = new Graphics();
  private prop = new Graphics();
  /** Held props are fills, and the limbs are strokes; they cannot share a layer. */
  private held = new Graphics();

  /** Redraw caches: these two parts are static except when the pose changes. */
  private tone: number | null = null;
  private faceKey = '';

  constructor() {
    this.core.addChild(this.blob, this.face);
    this.face.scale.set(FEATURE_SCALE);
    // Back to front. Limbs go *behind* the body so only the length that clears
    // the silhouette shows; in front they cross the body mass and blend into
    // the rays. The terminal sits over the body, and hands are posed outside
    // its width so it never hides them.
    this.view.addChild(this.shadow, this.thought, this.limbs, this.core, this.prop, this.held);
    this.shadow.ellipse(0, -1, SHADOW_RX, SHADOW_RY).fill({
      color: THEME.shadow,
      alpha: SHADOW_ALPHA,
    });
    this.view.scale.set(RIG_SCALE);
  }

  update(actor: Actor, t: number, atOwnComputer: boolean): void {
    const pose = poseFor(actor, t, atOwnComputer);
    const tone = actor.state === 'slump' ? THEME.slumpTint : THEME.worker;

    // The body is geometry, not animation: rebuilt only when the tint changes.
    if (tone !== this.tone) {
      this.tone = tone;
      this.blob.clear();
      starburst(this.blob, BODY_R, RAYS);
      this.blob.fill(tone).stroke({ color: THEME.workerLine, width: LINE, join: 'round' });
    }

    this.core.position.set(pose.body.x, pose.body.y);
    this.core.rotation = pose.tilt;
    // Squashing vertically widens horizontally, so the blob keeps its volume.
    this.core.scale.set(1 / Math.sqrt(pose.squash), pose.squash);

    const faceKey = `${pose.look.eyes}|${pose.look.mouth}|${actor.facing}`;
    if (faceKey !== this.faceKey) {
      this.faceKey = faceKey;
      drawFace(this.face, pose.look, actor.facing);
    }

    // The shadow tightens as the character leaves the floor.
    const airborne = Math.max(0, STAND_Y - pose.body.y);
    this.shadow.scale.set(Math.max(0.6, 1 - airborne * SHADOW_LIFT));

    // Arms and legs share a layer: they are all strokes, and one pass keeps
    // every contour underneath every fill.
    this.limbs.clear();
    limbPair(
      this.limbs,
      [
        { x: pose.body.x - HIP_X, y: pose.body.y + HIP_Y },
        { x: pose.body.x + HIP_X, y: pose.body.y + HIP_Y },
      ],
      pose.feet,
      LEG_BOW,
      LEG_W,
      tone,
      { radius: FOOT_R, wide: FOOT_STRETCH }
    );
    limbPair(
      this.limbs,
      [
        { x: pose.body.x - SHOULDER_X, y: pose.body.y + SHOULDER_Y },
        { x: pose.body.x + SHOULDER_X, y: pose.body.y + SHOULDER_Y },
      ],
      pose.hands,
      ARM_BOW,
      ARM_W,
      tone,
      { radius: HAND_R, wide: HAND_STRETCH }
    );

    this.prop.clear();
    if (pose.terminal) {
      drawTerminal(this.prop, t, actor.id);
    }

    this.held.clear();
    if (pose.mug) {
      const held = actor.facing >= 0 ? 1 : 0;
      drawMug(this.held, pose.hands[held]);
    }

    this.thought.clear();
    if (pose.thought) {
      drawThought(this.thought, t, pose.body.y - BODY_R);
    }
  }
}
