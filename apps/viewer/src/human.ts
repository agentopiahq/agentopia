import { Actor, ArmSwing, CYCLE_MS } from '@agentopia/core';

import type { RigView, Vec } from './character';
import { SWAY_S, armSwing } from './idlePose';
import { SEAT_Z } from './objects/chair';

/**
 * The human — you — as a posed rig drawn in canvas 2D, after the project's
 * reference cartoon: a big-headed chibi with a messy mop of dark hair, a
 * black hoodie with its hood bunched at the neck, dark jeans and white socks,
 * in soft dark outlines over flat colour, the way the Claude rig is drawn.
 *
 * It works like `AgentRig`: a pose is a pure function of what the human is
 * doing and the animation clock, drawn fresh each frame into the rig's own
 * small canvas, which the renderer composites as a sprite. The figure is
 * authored facing screen right in a three-quarter front view (or from
 * behind), and mirrored to face left.
 *
 * The limbs follow the Claude rig: each arm and leg one stub, drawn behind
 * the body. Sitting is the human's resting state: on a seat (a sofa, the
 * armchair), the hem on the cushion and the legs hanging off its front, as
 * the Claude rig sits in its chair; on the floor against a wall, legs drawn
 * up and both arms round them, as in the cartoon's last panel; and standing,
 * to walk between the two. Talking (a
 * prompt landing) points the near hand ahead, as the cartoon's agentic
 * panel does; thinking (a lead asking) is a hand under the chin.
 */

// ---- proportions -----------------------------------------------------------
//
// Lengths are in rig units, the same as the Claude rig's: `RIG_SCALE` maps
// them onto the 32px tile, so a tile is `UNIT` rig units. Y is negative
// upward from the floor; the figure faces +x.
//
// The limbs are drawn the way the Claude rig draws its own: each arm and each
// leg one short tapered stub, with a mitten or a sock on the end, laid down
// behind the body so only what clears it shows. No elbows or knees, except on
// the floor, where the legs fold up (and a third joins them, as in the
// cartoon) and the arms wrap round them.

export const RIG_SCALE = 1.55;
const TILE_PX = 32;
/** Rig units in a tile. */
const UNIT = TILE_PX / RIG_SCALE;

/** A leg stub, hip to ankle, and the ankle's height off the floor over the sock's foot. */
const LEG_LEN = 5.2;
const ANKLE = 1.4;
/** The hips' height standing: where the hoodie's hem meets the legs. */
const HIP_STAND = LEG_LEN + ANKLE;
/** Hip to the line of the shoulders. */
const TORSO = 10.4;
/** How far above the shoulder line the head's centre is. */
const NECK = 7.0;
/**
 * The head is authored at radius `HEAD_R` and drawn `HEAD_SCALE` of that:
 * big, as chibis go, as in the cartoon.
 */
const HEAD_R = 8.2;
const HEAD_SCALE = 1.0;
/** Half the hoodie's width at the hem, and at the shoulders. */
const HEM_HALF = 5.2;
const SHOULDER_HALF = 5.8;
/** Where the legs leave the hem, either side of its middle. */
const HIP_HALF = 2.5;
/** Where the arms leave the body, either side, and below the shoulder line. */
const ARM_X = 4.6;
const ARM_DROP = 2.2;
/** A leg's half-width at the hip and the ankle; an arm's at the shoulder and the wrist. */
const LEG_R = [1.95, 1.75] as const;
const ARM_R = [1.7, 1.35] as const;
/** How long an arm hangs, shoulder to hand. */
const ARM_LEN = 7.6;
const HAND_R = 1.6;
/** The outline every part is drawn in, as wide as the Claude rig's. */
const LINE = 1.0;

/** The seat's top, in rig units: the hoodie's hem rests on it. */
const SEAT_TOP = SEAT_Z * UNIT;
/** How far below the seat a dangling foot hangs: down to the floor. */
const DANGLE = SEAT_TOP - ANKLE;
/** On the floor: the hem on the floor, set back toward the wall. */
const FLOOR_BACK = -2.4;
/**
 * Hugging the knees: each knee's x (far, near) and their height, and the
 * height the forearms wrap round the shins at.
 */
const HUG = { kneeX: [-1.2, 5.0], kneeY: -9.0, kneeR: 2.2, armY: -7.6 } as const;

/** How many tiles one full stride covers. */
const STRIDE_TILES = 0.9;
/** How long a change of pose takes to settle, in seconds. */
export const BLEND_S = 0.3;

/** The region the rig draws into, in rig units round its feet. */
export const BOX = { x0: -26, y0: -46, x1: 26, y1: 6 };

/** The figure's height standing, feet to the top of the hair, in tiles. */
export const HUMAN_HEIGHT = (HIP_STAND + TORSO + NECK + 12.6 * HEAD_SCALE) / UNIT;
/** Across its hips, in tiles: what a seat it sits in must be wider than. */
export const HUMAN_HIPS = (HEM_HALF * 2) / UNIT;

// ---- colours -----------------------------------------------------------------

/** One material: its flat fill, a shade for folds, and its outline. */
interface Paint {
  fill: string;
  shade: string;
  line: string;
}

export const HUMAN_COLOURS = {
  skin: { fill: '#f8dcc3', shade: '#efc6a6', line: '#7c5040' },
  hair: { fill: '#2b221e', shade: '#3d312b', line: '#151010' },
  hoodie: { fill: '#2e2c32', shade: '#232126', line: '#121014' },
  jeans: { fill: '#2f3c57', shade: '#27324a', line: '#131a2a' },
  socks: { fill: '#f6f4f0', shade: '#e2ded8', line: '#5f5a55' },
  /** The drawstrings, and the ink of the face. */
  string: '#c9c6cf',
  ink: '#241a17',
  blush: '#f29b8c',
} as const satisfies Record<string, Paint | string>;

const C = HUMAN_COLOURS;

// ---- poses -------------------------------------------------------------------

type Face = 'smile' | 'open' | 'flat' | 'worried';

/**
 * One frame of the human, in rig units. Index 0 is the far limb, 1 the near.
 * Like the Claude rig's pose, it says where the body is and where each hand
 * and foot is; each limb is one stub from the body to there.
 */
export interface HumanPose {
  /** The middle of the hoodie's hem: the hips. */
  hip: Vec;
  /** The torso's lean from upright, toward the facing side, radians. */
  lean: number;
  /** The head's own tilt, radians, and how far it is set forward of the neck. */
  nod: number;
  headAhead: number;
  /** Shorten the torso: a hunch. */
  hunch: number;
  feet: [Vec, Vec];
  hands: [Vec, Vec];
  /**
   * Bent limbs, for the pose on the floor: where each knee and elbow is. Left
   * out, a limb is the one straight stub every other pose draws.
   */
  knees?: [Vec, Vec];
  elbows?: [Vec, Vec];
  /** Which hand points, its finger out ahead. */
  point: 0 | 1 | null;
  /** The near hand is up under the chin, in front of the face. */
  chin: boolean;
  /** On the floor hugging the legs: legs and arms in front of the body. */
  hug: boolean;
  /** Sat down: from behind, the legs are out of sight in front. */
  seated: boolean;
  /**
   * Seen at 45°, the arms in depth: the arm on the side nearer you is drawn
   * over the body and the other behind it, so arms swinging forward and back
   * pass in front of the body and behind it rather than out to its sides.
   */
  quarter: boolean;
  face: Face;
  eyesClosed: boolean;
  /** The pupils looking up, from under the fringe. */
  lookUp: boolean;
}

const v = (x: number, y: number): Vec => ({ x, y });
const midpoint = (a: Vec, b: Vec): Vec => v((a.x + b.x) / 2, (a.y + b.y) / 2);

/** Where the shoulder line is, for a pose: up the leaning torso from the hips. */
function shoulderOf(pose: HumanPose): Vec {
  const len = TORSO - pose.hunch;
  return v(pose.hip.x + Math.sin(pose.lean) * len, pose.hip.y - Math.cos(pose.lean) * len);
}

/** Where the head's centre is, for a pose. */
export function headOf(pose: HumanPose): Vec {
  const s = shoulderOf(pose);
  return v(s.x + Math.sin(pose.lean) * NECK + pose.headAhead, s.y - Math.cos(pose.lean) * NECK);
}

/** Where an arm leaves the body, either side, just under the shoulder line. */
function shoulderAt(pose: HumanPose, side: 0 | 1): Vec {
  const s = shoulderOf(pose);
  const dx = side === 1 ? ARM_X : -ARM_X;
  return v(s.x + dx * Math.cos(pose.lean), s.y + ARM_DROP + dx * Math.sin(pose.lean));
}

/** Where a leg leaves the hem, either side of its middle. */
function hipAt(pose: HumanPose, side: 0 | 1): Vec {
  const dx = side === 1 ? HIP_HALF : -HIP_HALF;
  return v(pose.hip.x + dx * Math.cos(pose.lean), pose.hip.y + dx * Math.sin(pose.lean));
}

/** Where each knee is: bent where the pose says, else halfway down the straight stub. */
function kneesOf(pose: HumanPose): [Vec, Vec] {
  if (pose.knees) {
    return pose.knees;
  }
  const mid = (side: 0 | 1): Vec => {
    const h = hipAt(pose, side);
    const f = pose.feet[side];
    return v((h.x + f.x) / 2, (h.y + f.y) / 2);
  };
  return [mid(0), mid(1)];
}

/** Where each elbow is: bent where the pose says, else halfway down the straight stub. */
function elbowsOf(pose: HumanPose): [Vec, Vec] {
  if (pose.elbows) {
    return pose.elbows;
  }
  const mid = (side: 0 | 1): Vec => {
    const s = shoulderAt(pose, side);
    const h = pose.hands[side];
    return v((s.x + h.x) / 2, (s.y + h.y) / 2);
  };
  return [mid(0), mid(1)];
}

/** Hands hanging at the sides, just clear of the body, swinging `swing` either way. */
function hangingArms(pose: HumanPose, swing: number): void {
  for (const side of [0, 1] as const) {
    const s = shoulderAt(pose, side);
    const k = side === 1 ? swing : -swing;
    const out = side === 1 ? 1.4 : -1.4;
    pose.hands[side] = v(s.x + out + k * 2.6, s.y + ARM_LEN - Math.abs(k) * 0.8);
  }
}

function base(): HumanPose {
  return {
    hip: v(0, -HIP_STAND),
    lean: 0,
    nod: 0,
    headAhead: 0,
    hunch: 0,
    feet: [v(-HIP_HALF + 0.2, -ANKLE), v(HIP_HALF + 0.2, -ANKLE)],
    hands: [v(0, 0), v(0, 0)],
    point: null,
    chin: false,
    hug: false,
    seated: false,
    quarter: false,
    face: 'smile',
    eyesClosed: false,
    lookUp: false,
  };
}

/** On its feet: standing still, or walking with the legs stepping by `travel`. */
function standing(actor: Actor, t: number, travel: number): HumanPose {
  const pose = base();
  const walking = actor.state === 'walking' || actor.state === 'sprinting';
  if (!walking) {
    if (actor.state === 'idle' && actor.activity?.act === 'sway') {
      swaying(pose, t, actor.activity.arms ?? 'with');
      return pose;
    }
    pose.hip.y += Math.sin(t * 1.7) * 0.2;
    hangingArms(pose, 0);
    if (actor.state === 'talking') {
      pointAhead(pose, t);
    } else if (actor.state === 'thinking') {
      handToChin(pose);
    }
    return pose;
  }
  // A stride, as the Claude rig steps: each stub swings from its hip, the
  // foot lifting as it comes through, the arms swinging against the legs.
  const a = (travel / STRIDE_TILES) * Math.PI * 2;
  const swing = Math.sin(a);
  pose.hip.y += -Math.abs(Math.cos(a)) * 0.5 + 0.25;
  for (const side of [0, 1] as const) {
    const k = side === 1 ? swing : -swing;
    const lift = Math.max(0, side === 1 ? Math.cos(a) : -Math.cos(a));
    pose.feet[side] = v(hipAt(pose, side).x + 0.2 + k * 2.6, -ANKLE - lift * 1.3);
  }
  hangingArms(pose, -swing * 0.6);
  return pose;
}

/** One slow rock, standing at ease, seconds: the Claude rig's, so they rock alike. */
const SWAY = (Math.PI * 2) / SWAY_S;
/** How far each arm swings about its shoulder either way, radians. */
const ARM_SWAY = 0.45;
/**
 * How much lower on the screen a hand is at the front of its swing than at
 * the back, in rig units: seen from 45° and a little above, forward is also
 * toward you, which is down the screen.
 */
const ARM_TOWARD = 0.9;

/**
 * Standing at ease, seen from 45°: rocking gently forward onto the toes and
 * back onto the heels over planted feet, the torso leaning in the way they
 * face and back, the head bowing a touch on the way in. The arms hang
 * straight down and swing forward and back together like pendulums from the
 * shoulders, with the body (a beat behind it) or against it. Forward is the
 * way they face, across the screen, so the arm nearer you swings across the
 * front of the body and the other swings back behind it (`quarter` has the
 * renderer layer them so).
 */
function swaying(pose: HumanPose, t: number, arms: ArmSwing): void {
  const w = t * SWAY;
  const rock = Math.sin(w);
  pose.hip.x += rock * 0.15;
  pose.hip.y += rock * 0.3;
  pose.lean = rock * 0.045;
  pose.nod = rock * 0.05;
  pose.headAhead = rock * 0.25;
  pose.quarter = true;
  const a = armSwing(w, arms, ARM_SWAY);
  for (const side of [0, 1] as const) {
    const s = shoulderAt(pose, side);
    pose.hands[side] = v(
      s.x + Math.sin(a) * ARM_LEN,
      s.y + Math.cos(a) * ARM_LEN + Math.sin(a) * ARM_TOWARD
    );
  }
  pose.face = 'smile';
  // Eyes shut a moment now and then, enjoying it.
  pose.eyesClosed = (t % 6.5) / 6.5 > 0.78;
}

/** The near hand up and out ahead, a finger pointing, bobbing as the words come. */
function pointAhead(pose: HumanPose, t: number): void {
  const beat = Math.sin((t * Math.PI * 2) / (CYCLE_MS.talking / 1000));
  const s = shoulderAt(pose, 1);
  pose.hands[1] = v(s.x + ARM_LEN * 0.95, s.y - 2.2 - beat * 0.8);
  pose.point = 1;
  pose.face = beat > 0 ? 'open' : 'smile';
}

/** The near hand up under the chin, thinking it over; its arm stays tucked behind. */
function handToChin(pose: HumanPose): void {
  const head = headOf(pose);
  pose.hands[1] = v(head.x + 3.4, head.y + HEAD_R * HEAD_SCALE - 0.2);
  pose.chin = true;
  pose.face = 'flat';
  pose.lookUp = true;
}

/**
 * Sat on a seat the way the Claude rig sits in its chair: the hoodie's hem
 * on the cushion, the leg stubs hanging off its front edge down to the floor,
 * the feet a touch ahead, swinging now and then, and the hands on the cushion
 * either side.
 */
function onSeat(actor: Actor, t: number): HumanPose {
  const pose = base();
  pose.seated = true;
  const breath = Math.sin(t * 1.5);
  pose.hip = v(0, -SEAT_TOP - 1.4 + breath * 0.12);
  for (const side of [0, 1] as const) {
    const kick = Math.max(0, Math.sin(t * 1.1 + (side ? Math.PI : 0))) * 0.9;
    pose.feet[side] = v(hipAt(pose, side).x + 1.4 + kick * 0.5, -SEAT_TOP + DANGLE - kick);
  }
  for (const side of [0, 1] as const) {
    const s = shoulderAt(pose, side);
    pose.hands[side] = v(s.x + (side === 1 ? 2.2 : -2.0), -SEAT_TOP - 1.2);
  }
  if (actor.state === 'talking') {
    pointAhead(pose, t);
  } else if (actor.state === 'thinking') {
    handToChin(pose);
  } else if (actor.state === 'napping') {
    pose.nod = 0.22;
    pose.eyesClosed = true;
  }
  return pose;
}

/**
 * On the floor against the wall, after the cartoon's last panel: sat low,
 * knees drawn up to the chest with the shins standing side by side in front
 * and the socks flat on the floor (three of them, as the cartoon has it: the
 * renderer adds the middle one), the arms wrapped round the front of the legs
 * just under the knees with the hands clasped, and the head bowed over them.
 */
function hugging(actor: Actor, t: number): HumanPose {
  const pose = base();
  pose.hug = true;
  pose.seated = true;
  const breath = Math.sin(t * 1.3);
  pose.hip = v(FLOOR_BACK, -1.6);
  pose.lean = 0.04;
  pose.hunch = -0.8 - breath * 0.12;
  // The knees up under the chin, the shins down to the socks side by side.
  pose.knees = [v(HUG.kneeX[0], HUG.kneeY), v(HUG.kneeX[1], HUG.kneeY + 0.3)];
  pose.feet = [v(HUG.kneeX[0] + 0.3, -ANKLE), v(HUG.kneeX[1] + 0.3, -ANKLE)];
  // Both forearms across the front of the legs, just under the knees; the
  // hands meet in front of the middle shin, the near one over the far one.
  const y = HUG.armY + breath * 0.1;
  pose.elbows = [v(HUG.kneeX[0] - 2.6, y + 0.6), v(HUG.kneeX[1] + 2.4, y + 0.2)];
  const mid = (HUG.kneeX[0] + HUG.kneeX[1]) / 2;
  pose.hands = [v(mid + 1.4, y - 0.4), v(mid - 0.4, y + 0.1)];
  pose.headAhead = 0.6;
  pose.nod = 0.12;
  pose.face = 'worried';
  if (actor.state === 'talking') {
    // Head up to say it, the near arm let go to point.
    pose.nod = -0.02;
    pointAhead(pose, t);
    pose.elbows = [pose.elbows[0], midpoint(shoulderAt(pose, 1), pose.hands[1])];
    pose.hands[0] = v(HUG.kneeX[1] + 1.2, y - 0.2);
  } else if (actor.state === 'thinking') {
    pose.nod = 0.04;
    pose.face = 'flat';
    pose.lookUp = true;
  }
  return pose;
}

/** The pose for one frame: standing, sat on a seat, or on the floor, `sit` of the way down. */
export function humanPose(
  actor: Actor,
  t: number,
  sit: number,
  seat: 'sit' | 'hug',
  travel: number
): HumanPose {
  const k = Math.min(1, Math.max(0, sit));
  const up = standing(actor, t, travel);
  if (k <= 0) {
    return up;
  }
  const down = seat === 'hug' ? hugging(actor, t) : onSeat(actor, t);
  return k >= 1 ? down : blend(up, down, k * k * (3 - 2 * k));
}

/** `e` of the way from pose `a` to `b`: the body, hands and feet glide. */
export function blend(a: HumanPose, b: HumanPose, e: number): HumanPose {
  const mixN = (p: number, q: number): number => p + (q - p) * e;
  const mixV = (p: Vec, q: Vec): Vec => v(mixN(p.x, q.x), mixN(p.y, q.y));
  const pair = (p: [Vec, Vec], q: [Vec, Vec]): [Vec, Vec] => [mixV(p[0], q[0]), mixV(p[1], q[1])];
  const near = e < 0.5 ? a : b;
  return {
    ...near,
    hip: mixV(a.hip, b.hip),
    lean: mixN(a.lean, b.lean),
    nod: mixN(a.nod, b.nod),
    headAhead: mixN(a.headAhead, b.headAhead),
    hunch: mixN(a.hunch, b.hunch),
    feet: pair(a.feet, b.feet),
    hands: pair(a.hands, b.hands),
    knees: a.knees || b.knees ? pair(kneesOf(a), kneesOf(b)) : undefined,
    elbows: a.elbows || b.elbows ? pair(elbowsOf(a), elbowsOf(b)) : undefined,
  };
}

// ---- drawing -----------------------------------------------------------------

export type Ctx = CanvasRenderingContext2D;

/** A stub as a tapered capsule: round at either end, `r0` across at `p` and `r1` at `q`. */
function capsule(p: Vec, r0: number, q: Vec, r1: number): Path2D {
  const a = Math.atan2(q.y - p.y, q.x - p.x);
  const path = new Path2D();
  path.arc(p.x, p.y, r0, a + Math.PI / 2, a + (Math.PI * 3) / 2);
  path.arc(q.x, q.y, r1, a - Math.PI / 2, a + Math.PI / 2);
  path.closePath();
  return path;
}

function shape(g: Ctx, path: Path2D, paint: Paint, fill = paint.fill): void {
  g.lineJoin = 'round';
  g.strokeStyle = paint.line;
  g.lineWidth = LINE * 0.8;
  g.fillStyle = fill;
  g.fill(path);
  g.stroke(path);
}

function ellipsePath(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  return p;
}

/** A closed blob through points, smoothed: each point a control, midpoints the ends. */
function blob(pts: readonly Vec[]): Path2D {
  const p = new Path2D();
  const n = pts.length;
  const mid = (a: Vec, b: Vec): Vec => v((a.x + b.x) / 2, (a.y + b.y) / 2);
  const start = mid(pts[n - 1], pts[0]);
  p.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    p.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  p.closePath();
  return p;
}

/**
 * A leg: one stub of jeans from the hem to the ankle, or two either side of a
 * bent knee, and the sock's foot, toe ahead.
 */
function drawLeg(g: Ctx, hip: Vec, foot: Vec, knee?: Vec): void {
  const ankle = v(foot.x, foot.y - 0.3);
  if (knee) {
    shape(g, capsule(hip, LEG_R[0], knee, LEG_R[0]), C.jeans);
    shape(g, capsule(knee, LEG_R[0], ankle, LEG_R[1]), C.jeans);
  } else {
    shape(g, capsule(hip, LEG_R[0], ankle, LEG_R[1]), C.jeans);
  }
  const toe = new Path2D();
  const fy = foot.y + ANKLE - 1.0;
  toe.moveTo(foot.x - 1.6, fy + 0.9);
  toe.quadraticCurveTo(foot.x - 1.9, fy - 1.3, foot.x + 0.2, fy - 1.3);
  toe.quadraticCurveTo(foot.x + 3.4, fy - 1.1, foot.x + 3.2, fy + 0.5);
  toe.quadraticCurveTo(foot.x + 3.0, fy + 0.9, foot.x + 1.4, fy + 0.9);
  toe.closePath();
  g.lineJoin = 'round';
  g.fillStyle = C.socks.fill;
  g.strokeStyle = C.socks.line;
  g.lineWidth = LINE * 0.6;
  g.fill(toe);
  g.stroke(toe);
}

/** A hand: a small skin mitten with a thumb, or a finger out ahead when it points. */
function drawHand(g: Ctx, at: Vec, from: Vec, pointing: boolean): void {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  if (pointing) {
    const root = v(at.x + ux * 0.6 - uy * 0.5, at.y + uy * 0.6 + ux * 0.5);
    shape(g, capsule(root, 0.75, v(root.x + ux * 2.6, root.y + uy * 2.6), 0.62), C.skin);
  }
  shape(g, ellipsePath(at.x, at.y, HAND_R * 1.05, HAND_R * 0.95, Math.atan2(uy, ux)), C.skin);
  shape(
    g,
    ellipsePath(at.x - uy * 1.15 - ux * 0.2, at.y + ux * 1.15 - uy * 0.2, 0.7, 0.58),
    C.skin
  );
}

/** The wrist, a little short of the hand, along the forearm coming from `from`. */
function wristOf(h: Vec, from: Vec): Vec {
  const dx = h.x - from.x;
  const dy = h.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return v(h.x - (dx / d) * 1.3, h.y - (dy / d) * 1.3);
}

/** An arm: one stub of sleeve from the body to the wrist, and the hand on the end. */
function drawArm(g: Ctx, pose: HumanPose, side: 0 | 1): void {
  const s = shoulderAt(pose, side);
  const h = pose.hands[side];
  drawHand(g, h, s, pose.point === side);
  shape(g, capsule(s, ARM_R[0], wristOf(h, s), ARM_R[1]), C.hoodie);
}

/** An upper arm, shoulder to elbow: the first half of a bent arm. */
function drawUpperArm(g: Ctx, pose: HumanPose, side: 0 | 1): void {
  shape(g, capsule(shoulderAt(pose, side), ARM_R[0], elbowsOf(pose)[side], ARM_R[0]), C.hoodie);
}

/** A forearm, elbow to wrist, and the hand on the end: the second half of a bent arm. */
function drawForearm(g: Ctx, pose: HumanPose, side: 0 | 1): void {
  const e = elbowsOf(pose)[side];
  const h = pose.hands[side];
  shape(g, capsule(e, ARM_R[0], wristOf(h, e), ARM_R[1]), C.hoodie);
  drawHand(g, h, e, pose.point === side);
}

/** The hoodie's body, in torso-local space: hem at the hips, up to the neck. */
function torsoPath(len: number): Path2D {
  const p = new Path2D();
  const top = -len;
  p.moveTo(-HEM_HALF, 1.4);
  p.quadraticCurveTo(-HEM_HALF - 0.4, top * 0.35, -SHOULDER_HALF, top + 2.4);
  p.quadraticCurveTo(-SHOULDER_HALF - 0.1, top - 0.2, -2.2, top - 0.3);
  p.lineTo(2.2, top - 0.3);
  p.quadraticCurveTo(SHOULDER_HALF + 0.1, top - 0.2, SHOULDER_HALF, top + 2.4);
  p.quadraticCurveTo(HEM_HALF + 0.4, top * 0.35, HEM_HALF, 1.4);
  p.quadraticCurveTo(0, 2.4, -HEM_HALF, 1.4);
  p.closePath();
  return p;
}

function drawTorso(g: Ctx, pose: HumanPose, back: boolean): void {
  const len = TORSO - pose.hunch;
  g.save();
  g.translate(pose.hip.x, pose.hip.y);
  g.rotate(pose.lean);
  shape(g, torsoPath(len), C.hoodie);
  g.lineCap = 'round';
  if (back) {
    // The hood, hanging down the back between the shoulders.
    const hood = new Path2D();
    hood.moveTo(-3.8, -len + 0.4);
    hood.quadraticCurveTo(-4.4, -len + 4.6, 0, -len + 6.2);
    hood.quadraticCurveTo(4.4, -len + 4.6, 3.8, -len + 0.4);
    hood.closePath();
    shape(g, hood, C.hoodie, C.hoodie.shade);
  } else {
    // The pocket across the front, and the ribbed hem.
    g.strokeStyle = C.hoodie.line;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-2.8, -1.0);
    g.quadraticCurveTo(-2.2, -4.0, 0.6, -4.2);
    g.quadraticCurveTo(3.4, -4.0, 3.8, -1.0);
    g.stroke();
    g.beginPath();
    g.moveTo(-HEM_HALF + 0.4, 0.2);
    g.quadraticCurveTo(0, 1.0, HEM_HALF - 0.4, 0.2);
    g.stroke();
    // The drawstrings, either side of the neck.
    g.strokeStyle = C.string;
    g.lineWidth = 0.6;
    for (const x of [0.9, 3.0]) {
      g.beginPath();
      g.moveTo(x, -len + 0.6);
      g.lineTo(x + 0.2, -len + 4.0);
      g.stroke();
    }
  }
  g.restore();
}

/** The hood bunched behind the neck, seen from the front: under the head, over the shoulders. */
function drawHoodRim(g: Ctx, pose: HumanPose): void {
  const s = shoulderOf(pose);
  shape(g, ellipsePath(s.x - 0.8, s.y + 0.2, 5.0, 2.3, pose.lean), C.hoodie, C.hoodie.shade);
}

/** The hair, in head-local space facing +x: a messy mop over the top and back, a fringe in front. */
const HAIR_FRONT: readonly Vec[] = [
  v(9.4, -0.4),
  v(8.0, -2.0),
  v(7.0, -0.9),
  v(5.6, -2.8),
  v(4.2, -1.4),
  v(2.8, -3.0),
  v(1.2, -1.6),
  v(-0.4, -2.6),
  v(-1.8, -0.6),
  v(-3.2, -1.2),
  v(-4.4, 1.0),
  v(-6.4, 2.8),
  v(-7.6, 5.0),
  v(-9.0, 2.6),
  v(-10.4, 0.6),
  v(-9.8, -2.6),
  v(-10.8, -5.4),
  v(-8.6, -7.8),
  v(-8.4, -10.4),
  v(-5.4, -10.2),
  v(-3.4, -12.4),
  v(-0.6, -10.8),
  v(2.2, -12.2),
  v(4.4, -10.2),
  v(7.2, -10.6),
  v(8.0, -7.8),
  v(10.4, -6.6),
  v(9.6, -4.0),
  v(10.8, -2.2),
];

/** From behind: the mop all round, down to the nape. */
const HAIR_BACK: readonly Vec[] = [
  v(9.8, -2.0),
  v(8.6, 2.2),
  v(9.4, 4.4),
  v(6.2, 4.8),
  v(4.2, 6.8),
  v(1.6, 5.4),
  v(-0.8, 7.4),
  v(-3.2, 5.4),
  v(-5.8, 6.6),
  v(-7.4, 4.0),
  v(-9.8, 3.6),
  v(-9.4, 0.2),
  v(-11.2, -2.6),
  v(-9.8, -6.2),
  v(-10.4, -9.6),
  v(-7.0, -10.6),
  v(-5.2, -13.4),
  v(-1.8, -11.8),
  v(0.8, -13.8),
  v(3.6, -11.6),
  v(6.8, -12.4),
  v(7.8, -9.2),
  v(10.8, -8.0),
  v(9.8, -5.0),
];

const HAIR_FRONT_PATH = (): Path2D => blob(HAIR_FRONT);
const HAIR_BACK_PATH = (): Path2D => blob(HAIR_BACK);

function drawHead(g: Ctx, pose: HumanPose, back: boolean, t: number, blink: boolean): void {
  const head = headOf(pose);
  g.save();
  g.translate(head.x, head.y);
  g.rotate(pose.lean * 0.5 + pose.nod);
  g.scale(HEAD_SCALE, HEAD_SCALE);
  if (back) {
    // The nape below the hair, then the mop from behind.
    shape(g, ellipsePath(0, 6.0, 3.0, 2.4), C.skin);
    shape(g, HAIR_BACK_PATH(), C.hair);
    hairStrands(g, true);
    g.restore();
    return;
  }
  // The face: a round head, its ears lost in the mop.
  shape(g, ellipsePath(0.6, 0.6, HEAD_R + 0.2, HEAD_R - 0.3), C.skin);
  drawFace(g, pose, t, blink);
  shape(g, HAIR_FRONT_PATH(), C.hair);
  hairStrands(g, false);
  g.restore();
}

/** A few strands drawn into the mop, so it reads as hair and not a cap. */
function hairStrands(g: Ctx, back: boolean): void {
  g.strokeStyle = C.hair.shade;
  g.lineWidth = 0.8;
  g.lineCap = 'round';
  const strands: Array<[Vec, Vec, Vec]> = back
    ? [
        [v(-6, -8), v(-4, -3), v(-5, 2)],
        [v(-1, -10), v(0, -4), v(-1, 3)],
        [v(4, -9), v(5, -3), v(4, 2)],
      ]
    : [
        [v(-7, -7), v(-6, -3), v(-7.5, 1.5)],
        [v(-2.5, -10), v(-1.5, -6), v(-3, -2)],
        [v(3.0, -10), v(4.2, -6.4), v(3.4, -3.4)],
      ];
  for (const [a, b, c] of strands) {
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.quadraticCurveTo(b.x, b.y, c.x, c.y);
    g.stroke();
  }
}

function drawFace(g: Ctx, pose: HumanPose, t: number, blink: boolean): void {
  // Soft cheeks.
  g.fillStyle = C.blush;
  g.globalAlpha = 0.28;
  for (const x of [0.4, 7.6]) {
    g.beginPath();
    g.ellipse(x, 4.6, 1.5, 0.9, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // Upright oval eyes, turned toward the facing side, with a catch of light.
  const eyeY = 1.6;
  const shut = blink || pose.eyesClosed;
  for (const x of [2.1, 6.1]) {
    if (shut) {
      g.strokeStyle = C.ink;
      g.lineWidth = 0.75;
      g.beginPath();
      g.arc(x, eyeY - 0.4, 1.0, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
      continue;
    }
    g.fillStyle = C.ink;
    g.beginPath();
    g.ellipse(x, eyeY, 1.0, 1.45, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x + 0.3, eyeY - (pose.lookUp ? 0.9 : 0.5), 0.36, 0, Math.PI * 2);
    g.fill();
  }
  // Worried: brows lifted in the middle, just under the fringe.
  if (pose.face === 'worried') {
    g.strokeStyle = C.ink;
    g.lineWidth = 0.6;
    for (const [x, d] of [
      [2.1, 1],
      [6.1, -1],
    ] as const) {
      g.beginPath();
      // Lifted at the inner ends, over the nose: worried, not cross.
      g.moveTo(x - 1.0, -0.9 + d * 0.3);
      g.lineTo(x + 1.0, -0.9 - d * 0.3);
      g.stroke();
    }
  }
  // The mouth.
  const mx = 4.4;
  const my = 5.4;
  g.strokeStyle = C.ink;
  g.lineWidth = 0.7;
  g.lineCap = 'round';
  switch (pose.face) {
    case 'open': {
      g.fillStyle = '#6e2f2a';
      g.beginPath();
      g.ellipse(mx, my + 0.2, 1.0, 0.85 + Math.abs(Math.sin(t * 7)) * 0.25, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
    case 'flat':
      g.beginPath();
      g.moveTo(mx - 0.8, my);
      g.lineTo(mx + 0.8, my);
      g.stroke();
      break;
    case 'worried':
      g.beginPath();
      g.arc(mx, my + 1.0, 0.95, Math.PI * 1.2, Math.PI * 1.8);
      g.stroke();
      break;
    default:
      g.beginPath();
      g.arc(mx, my - 0.6, 1.0, Math.PI * 0.2, Math.PI * 0.8);
      g.stroke();
  }
}

/** Whether the human is mid-blink at `t`. */
function blinking(t: number): boolean {
  return t % 4.7 < 0.13;
}

/**
 * The arm of a hand up under the chin: the forearm, up the front of the body
 * from an elbow resting low at the side, so the hand plainly belongs to an
 * arm. The upper arm stays behind the body, as every resting arm does.
 */
function drawChinArm(g: Ctx, pose: HumanPose): void {
  const s = shoulderAt(pose, 1);
  const h = pose.hands[1];
  const elbow = v(s.x + 2.2, s.y + 5.4);
  const dx = h.x - elbow.x;
  const dy = h.y - elbow.y;
  const d = Math.hypot(dx, dy) || 1;
  const wrist = v(h.x - (dx / d) * 1.2, h.y - (dy / d) * 1.2);
  shape(g, capsule(elbow, ARM_R[0], wrist, ARM_R[1]), C.hoodie);
}

/**
 * On the floor hugging the knees, from the front, as the cartoon draws it:
 * the far upper arm behind the body; the body; the near upper arm; three legs
 * bent up in front of it, side by side; then the arms wrapped round the front
 * of them, the far forearm under the near one, the hands clasped. A pointing near arm stays one straight stub, out ahead.
 */
function drawHugging(g: Ctx, pose: HumanPose): void {
  const knees = kneesOf(pose);
  const pointing = pose.point === 1;
  drawUpperArm(g, pose, 0);
  drawTorso(g, pose, false);
  drawHoodRim(g, pose);
  if (!pointing) {
    // The near upper arm comes down the outside of the near knee, behind it.
    drawUpperArm(g, pose, 1);
  }
  // The thighs point at you, foreshortened to nothing: each leg is its knee
  // and its shin, a column of jeans down to the floor, the socks at the foot.
  // Three of them, far, middle and near, as the cartoon draws it: the middle
  // one halfway between the other two.
  const legs: Array<[Vec, Vec]> = [
    [knees[0], pose.feet[0]],
    [midpoint(knees[0], knees[1]), midpoint(pose.feet[0], pose.feet[1])],
    [knees[1], pose.feet[1]],
  ];
  for (const [knee, f] of legs) {
    shape(g, capsule(knee, HUG.kneeR, v(f.x, f.y - 0.3), LEG_R[0]), C.jeans);
  }
  for (const [, f] of legs) {
    shape(g, ellipsePath(f.x + 0.6, -0.95, 1.85, 1.0, -0.08), C.socks);
  }
  drawForearm(g, pose, 0);
  if (pointing) {
    drawArm(g, pose, 1);
    return;
  }
  drawForearm(g, pose, 1);
}

/** Draw one pose, facing +x, into a context already set to rig space. */
export function drawHuman(g: Ctx, pose: HumanPose, back: boolean, t: number): void {
  const blink = blinking(t);
  const legs = (): void => {
    for (const side of [0, 1] as const) {
      drawLeg(g, hipAt(pose, side), pose.feet[side]);
    }
  };
  // As the Claude rig is drawn: the limbs go down behind the body, so only
  // what clears it shows.
  if (back) {
    // From behind, sat down, the legs are out of sight in front.
    if (!pose.seated) {
      legs();
    }
    // Hugging the knees, the arms are round the front, out of sight too.
    if (!pose.hug) {
      drawArm(g, pose, 0);
      if (!pose.quarter) {
        drawArm(g, pose, 1);
      }
    }
    drawTorso(g, pose, true);
    if (pose.quarter) {
      // At 45° from behind, the arm on the side it faces is the nearer one.
      drawArm(g, pose, 1);
    }
    drawHead(g, pose, true, t, blink);
    return;
  }
  if (pose.hug) {
    drawHugging(g, pose);
    drawHead(g, pose, false, t, blink);
    return;
  }
  legs();
  if (!pose.quarter) {
    drawArm(g, pose, 0);
  }
  if (!pose.chin) {
    drawArm(g, pose, 1);
  }
  drawTorso(g, pose, false);
  drawHoodRim(g, pose);
  if (pose.quarter) {
    // At 45° from the front, the arm away from the side it faces is the
    // nearer one: over the body, under the head.
    drawArm(g, pose, 0);
  }
  if (pose.chin) {
    drawChinArm(g, pose);
  }
  drawHead(g, pose, false, t, blink);
  if (pose.chin) {
    // The one hand drawn over the face: up under the chin.
    const s = shoulderAt(pose, 1);
    drawHand(g, pose.hands[1], v(s.x + 2.2, s.y + 5.4), false);
  }
}
