import { Actor, CYCLE_MS } from '@agentopia/core';

import type { RigView, Vec } from './character';
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
 * Sitting is the human's resting state, so it has three of them: on a seat
 * (a sofa, the armchair, a café chair), its cushion at `SEAT_Z`, hips on it,
 * knees forward and feet down to the floor; on the floor against a wall,
 * knees pulled up and both arms round them, chin on top, as in the
 * cartoon's last panel; and standing, to walk between the two. Talking (a
 * prompt landing) points the near hand ahead, as the cartoon's agentic
 * panel does; thinking (a lead asking) is a hand under the chin.
 */

// ---- proportions -----------------------------------------------------------
//
// Lengths are in rig units, the same as the Claude rig's: `RIG_SCALE` maps
// them onto the 32px tile, so a tile is `UNIT` rig units. Y is negative
// upward from the floor; the figure faces +x.

export const RIG_SCALE = 1.55;
const TILE_PX = 32;
/** Rig units in a tile. */
const UNIT = TILE_PX / RIG_SCALE;

/** Hip to knee, and knee to ankle, standing. */
const THIGH = 5.4;
const SHIN = 5.0;
/** The ankle's height off the floor: the sock's foot under it. */
const ANKLE = 1.0;
/** Hip height, standing: legs straight under it. */
const HIP_STAND = THIGH + SHIN + ANKLE;
/** Hip to the line of the shoulders. */
const TORSO = 9.6;
/** How far above the shoulder line the head's centre is. */
const NECK = 7.6;
const HEAD_R = 8.2;
/** Half the hoodie's width at the hem, and at the shoulders. */
const HEM_HALF = 4.9;
/** Half the gap between the hip joints. */
const HIP_HALF = 2.1;
const SHOULDER_HALF = 5.4;
/** Where the arms hang from, either side of the torso's middle. */
const ARM_X = 4.9;
const ARM_DROP = 1.4;
/** Upper arm and forearm. */
const UPPER_ARM = 4.6;
const FOREARM = 4.4;
const SLEEVE_W = 3.7;
const JEANS_W = 4.3;
const HAND_R = 1.75;
/** The outline every part is drawn in, as wide as the Claude rig's. */
const LINE = 1.25;

/** The hips on a seat: the cushion's top, and the hip joint just above it. */
const SEAT_HIP = SEAT_Z * UNIT + 1.3;
/** On the floor: the hips just off it, set back toward the wall. */
const FLOOR_HIP = 1.8;
const FLOOR_BACK = -2.2;

/** How many tiles one full stride covers. */
const STRIDE_TILES = 0.9;
/** How long a change of pose takes to settle, in seconds. */
export const BLEND_S = 0.3;

/** The region the rig draws into, in rig units round its feet. */
export const BOX = { x0: -26, y0: -46, x1: 26, y1: 6 };

/** The figure's height standing, feet to the top of the hair, in tiles. */
export const HUMAN_HEIGHT = (HIP_STAND + TORSO + NECK + HEAD_R + 3) / UNIT;
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
  socks: { fill: '#f6f4f0', shade: '#e2ded8', line: '#45423f' },
  /** The drawstrings, and the ink of the face. */
  string: '#c9c6cf',
  ink: '#241a17',
  blush: '#f29b8c',
} as const satisfies Record<string, Paint | string>;

const C = HUMAN_COLOURS;

// ---- poses -------------------------------------------------------------------

type Face = 'smile' | 'open' | 'flat' | 'worried';

/** One frame of the human, in rig units. Index 0 is the far limb, 1 the near. */
export interface HumanPose {
  hip: Vec;
  /** The torso's lean from upright, toward the facing side, radians. */
  lean: number;
  /** The head's own tilt, radians, and how far it is set forward of the neck. */
  nod: number;
  headAhead: number;
  /** Shorten the torso: a hunch. */
  hunch: number;
  knees: [Vec, Vec];
  feet: [Vec, Vec];
  elbows: [Vec, Vec];
  hands: [Vec, Vec];
  /** Which hand points, its finger out ahead. */
  point: 0 | 1 | null;
  /** The near hand is up under the chin, in front of the face. */
  chin: boolean;
  /** Legs drawn over the torso, arms over the legs: sitting with the knees up. */
  hug: boolean;
  /** Seated: the legs go in front of the torso. */
  seated: boolean;
  face: Face;
  eyesClosed: boolean;
  /** The pupils looking up, from under the fringe. */
  lookUp: boolean;
}

const v = (x: number, y: number): Vec => ({ x, y });

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

/** The shoulder a limb hangs from, either side. */
function shoulderAt(pose: HumanPose, side: 0 | 1): Vec {
  const s = shoulderOf(pose);
  const dx = side === 1 ? ARM_X : -ARM_X;
  return v(s.x + dx * Math.cos(pose.lean), s.y + ARM_DROP + dx * Math.sin(pose.lean));
}

/** An elbow between a shoulder and a hand, bent out to one side. */
function elbowFor(shoulder: Vec, hand: Vec, bend: 1 | -1): Vec {
  const dx = hand.x - shoulder.x;
  const dy = hand.y - shoulder.y;
  const d = Math.hypot(dx, dy);
  const reach = UPPER_ARM + FOREARM;
  const mid = v(shoulder.x + dx * (UPPER_ARM / reach), shoulder.y + dy * (UPPER_ARM / reach));
  const out =
    d >= reach ? 0 : Math.sqrt(Math.max(0, UPPER_ARM ** 2 - (d * (UPPER_ARM / reach)) ** 2));
  return d < 1e-6 ? mid : v(mid.x + (-dy / d) * out * bend, mid.y + (dx / d) * out * bend);
}

/** Arms hanging at the sides, a gentle swing either way. */
function hangingArms(pose: HumanPose, swing: number): void {
  for (const side of [0, 1] as const) {
    const s = shoulderAt(pose, side);
    const k = side === 1 ? swing : -swing;
    pose.hands[side] = v(s.x + 0.9 + k * 3.2, s.y + 8.4 - Math.abs(k) * 0.6);
    pose.elbows[side] = v(s.x + 0.5 + k * 1.4, s.y + 4.4);
  }
}

function base(): HumanPose {
  return {
    hip: v(0, -HIP_STAND),
    lean: 0,
    nod: 0,
    headAhead: 0,
    hunch: 0,
    knees: [v(-1.6, -SHIN - ANKLE), v(1.6, -SHIN - ANKLE)],
    feet: [v(-1.4, -ANKLE), v(1.8, -ANKLE)],
    elbows: [v(0, 0), v(0, 0)],
    hands: [v(0, 0), v(0, 0)],
    point: null,
    chin: false,
    hug: false,
    seated: false,
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
    pose.hip.y += Math.sin(t * 1.7) * 0.25;
    hangingArms(pose, 0);
    if (actor.state === 'talking') {
      pointAhead(pose, t);
    }
    return pose;
  }
  const a = (travel / STRIDE_TILES) * Math.PI * 2;
  const swing = Math.sin(a);
  pose.hip.y += -Math.abs(Math.cos(a)) * 0.7 + 0.35;
  pose.lean = 0.06;
  for (const side of [0, 1] as const) {
    const k = side === 1 ? swing : -swing;
    const lift = Math.max(0, side === 1 ? Math.cos(a) : -Math.cos(a));
    const foot = v(pose.hip.x + (side === 1 ? 0.8 : -0.6) + k * 3.6, -ANKLE - lift * 1.6);
    pose.feet[side] = foot;
    pose.knees[side] = v(
      (pose.hip.x + foot.x) / 2 + 0.9 + lift * 0.8,
      (pose.hip.y + foot.y) / 2 - lift * 0.6
    );
  }
  hangingArms(pose, -swing * 0.5);
  return pose;
}

/** The near hand up and out ahead, a finger pointing, bobbing as the words come. */
function pointAhead(pose: HumanPose, t: number): void {
  const beat = Math.sin((t * Math.PI * 2) / (CYCLE_MS.talking / 1000));
  const s = shoulderAt(pose, 1);
  const hand = v(s.x + 8.2, s.y - 2.6 - beat * 0.9);
  pose.hands[1] = hand;
  pose.elbows[1] = elbowFor(s, hand, -1);
  pose.point = 1;
  pose.face = beat > 0 ? 'open' : 'smile';
}

/** The near hand under the chin, thinking it over. */
function handToChin(pose: HumanPose): void {
  const head = headOf(pose);
  const s = shoulderAt(pose, 1);
  const hand = v(head.x + 3.4, head.y + HEAD_R - 0.6);
  pose.hands[1] = hand;
  pose.elbows[1] = v(s.x + 2.6, s.y + 6.4);
  pose.chin = true;
  pose.face = 'flat';
  pose.lookUp = true;
}

/** Sat on a seat: hips on the cushion, knees forward, feet down near the floor. */
function onSeat(actor: Actor, t: number): HumanPose {
  const pose = base();
  pose.seated = true;
  const breath = Math.sin(t * 1.5);
  pose.hip = v(-2.2, -SEAT_HIP + breath * 0.15);
  pose.lean = -0.08;
  // Thighs out along the seat, then the shins down to the floor.
  pose.knees = [v(3.4, -SEAT_HIP - 0.5), v(5.0, -SEAT_HIP - 0.1)];
  const kick = Math.max(0, Math.sin(t * 0.9)) * 0.6;
  pose.feet = [v(4.2, -ANKLE + 0.2), v(5.9, -ANKLE + 0.2 - kick)];
  // Hands resting in the lap, elbows easy at the sides.
  for (const side of [0, 1] as const) {
    const s = shoulderAt(pose, side);
    pose.hands[side] = v(2.0 + side * 1.8, -SEAT_HIP - 2.2);
    pose.elbows[side] = v(s.x + 0.4, s.y + 5.0);
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
 * On the floor against the wall: knees pulled up to the chest and hugged,
 * chin resting on them, after the cartoon's last panel.
 */
function hugging(actor: Actor, t: number): HumanPose {
  const pose = base();
  pose.hug = true;
  pose.seated = true;
  const breath = Math.sin(t * 1.3);
  pose.hip = v(FLOOR_BACK, -FLOOR_HIP);
  pose.lean = 0.12;
  pose.hunch = 0.6 - breath * 0.15;
  pose.knees = [v(2.8, -9.4), v(4.2, -9.0)];
  pose.feet = [v(4.0, -ANKLE + 0.1), v(5.6, -ANKLE + 0.1)];
  // Both arms round the shins, hands clasped in front of them.
  for (const side of [0, 1] as const) {
    const s = shoulderAt(pose, side);
    pose.hands[side] = v(5.2 + side * 1.2, -5.4 + side * 0.2);
    pose.elbows[side] = v(s.x + 1.6 + side * 0.6, s.y + 5.4);
  }
  pose.headAhead = 0;
  pose.nod = 0.1;
  pose.face = 'worried';
  if (actor.state === 'talking') {
    // Head up off the knees to say it, a hand let go to point.
    pose.nod = -0.02;
    pose.headAhead = 0.4;
    pointAhead(pose, t);
  } else if (actor.state === 'thinking') {
    pose.nod = 0.02;
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
    knees: pair(a.knees, b.knees),
    feet: pair(a.feet, b.feet),
    elbows: pair(a.elbows, b.elbows),
    hands: pair(a.hands, b.hands),
  };
}

// ---- drawing -----------------------------------------------------------------

export type Ctx = CanvasRenderingContext2D;

/** A limb as a soft round-ended stroke through its joints, outlined. */
function limb(g: Ctx, pts: readonly Vec[], width: number, paint: Paint): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const trace = (): void => {
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
  };
  trace();
  g.strokeStyle = paint.line;
  g.lineWidth = width + LINE;
  g.stroke();
  trace();
  g.strokeStyle = paint.fill;
  g.lineWidth = width;
  g.stroke();
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

/** Where a leg leaves the hips, either side of their middle. */
function hipAt(pose: HumanPose, side: 0 | 1): Vec {
  const dx = side === 1 ? HIP_HALF : -HIP_HALF;
  return v(pose.hip.x + dx * Math.cos(pose.lean), pose.hip.y + dx * Math.sin(pose.lean));
}

/** A leg: the jeans from hip to ankle, then the white sock and its foot. */
function drawLeg(g: Ctx, hip: Vec, knee: Vec, foot: Vec): void {
  // The sock first, under the jeans' hem: a cuff, and the foot, toe ahead.
  limb(g, [v(foot.x, foot.y - 1.4), v(foot.x, foot.y)], 2.9, C.socks);
  shape(g, ellipsePath(foot.x + 0.9, foot.y + 0.15, 2.3, 1.35), C.socks);
  limb(g, [hip, knee, v(foot.x, foot.y - 1.3)], JEANS_W, C.jeans);
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

/** A hand: a skin mitten, with a finger out when it points. */
function drawHand(g: Ctx, at: Vec, from: Vec, pointing: boolean): void {
  if (pointing) {
    const dx = at.x - from.x;
    const dy = at.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const tip = v(at.x + (dx / d) * 3.0 - (dy / d) * 0.5, at.y + (dy / d) * 3.0 + (dx / d) * 0.5);
    limb(g, [v(at.x - (dy / d) * 0.5, at.y + (dx / d) * 0.5), tip], 1.6, C.skin);
  }
  shape(g, ellipsePath(at.x, at.y, HAND_R, HAND_R * 0.95), C.skin);
}

function drawArm(g: Ctx, pose: HumanPose, side: 0 | 1): void {
  const s = shoulderAt(pose, side);
  const e = pose.elbows[side];
  const h = pose.hands[side];
  // The sleeve ends a little short of the hand, at its cuff.
  const dx = h.x - e.x;
  const dy = h.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const cuff = v(h.x - (dx / d) * 1.4, h.y - (dy / d) * 1.4);
  drawHand(g, h, e, pose.point === side);
  limb(g, [s, e, cuff], SLEEVE_W, C.hoodie);
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
      g.moveTo(x - 1.0, -0.9 - d * 0.25);
      g.lineTo(x + 1.0, -0.9 + d * 0.25);
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

/** Draw one pose, facing +x, into a context already set to rig space. */
export function drawHuman(g: Ctx, pose: HumanPose, back: boolean, t: number): void {
  const blink = blinking(t);
  const legs = (): void => {
    for (const side of [0, 1] as const) {
      drawLeg(g, hipAt(pose, side), pose.knees[side], pose.feet[side]);
    }
  };
  if (back) {
    // From behind: the arms at the sides behind nothing, the legs only when
    // standing (sat, they run forward out of sight), then the back. Sat, the
    // hands are in the lap, out of sight in front: the arms hang to the seat.
    if (!pose.seated) {
      legs();
    }
    const arms =
      pose.seated && pose.point === null
        ? ({ ...pose, elbows: [...pose.elbows], hands: [...pose.hands] } as HumanPose)
        : pose;
    if (arms !== pose) {
      hangingArms(arms, 0);
    }
    drawArm(g, arms, 0);
    drawArm(g, arms, 1);
    drawTorso(g, pose, true);
    drawHead(g, pose, true, t, blink);
    return;
  }
  drawArm(g, pose, 0);
  if (!pose.seated) {
    legs();
  }
  drawTorso(g, pose, false);
  if (pose.seated) {
    legs();
  }
  drawHoodRim(g, pose);
  if (pose.hug) {
    // Arms round the knees, the head resting over them.
    drawArm(g, pose, 1);
    drawHead(g, pose, false, t, blink);
    if (pose.point === 1) {
      drawArm(g, pose, 1);
    }
    return;
  }
  if (pose.chin) {
    drawHead(g, pose, false, t, blink);
    drawArm(g, pose, 1);
    return;
  }
  drawHead(g, pose, false, t, blink);
  drawArm(g, pose, 1);
}
