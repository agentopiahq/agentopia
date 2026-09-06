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

// ---- proportions, after the cartoon ----------------------------------------

/** Tip radius of the starburst. The body *is* the character; there is no head. */
const BODY_R = 15;
/** Odd, so the silhouette never reads as mechanically symmetric. */
const RAYS = 11;
/**
 * Valley radius as a fraction of BODY_R. The core has to stay wide enough to
 * hold the whole face, because a feature that reaches past it lands in the gap
 * between two rays and floats on the floor colour.
 */
const VALLEY = 0.56;
/** Silhouette weight on the body. */
const LINE = 2;
/**
 * Contour weight on the limbs, total across both sides. Limbs are thin enough
 * that the body's line would double their apparent width.
 */
const CONTOUR = 1.3;

/**
 * Body centre while standing. High enough that the body's lowest rays clear
 * the floor by a good margin — that gap is the only place legs can read.
 */
const STAND_Y = -24;
/** Where feet meet the floor — just above the contact shadow. */
const GROUND_Y = -2;

/** Joints sit inside the body; the limb only appears where it exits. */
const SHOULDER_X = BODY_R * 0.45;
const SHOULDER_Y = BODY_R * 0.5;
const HIP_X = 4;
const HIP_Y = BODY_R * 0.6;

const ARM_W = 2.1;
const LEG_W = 2.4;
const HAND_R = 2.6;
const FOOT_R = 2.2;

/** The held terminal: its keyboard line, height and width. */
const TERMINAL_Y = -4;
const TERMINAL_H = 12;
const TERMINAL_W = 22;

/** Resting hand and foot placement, mirrored left/right. */
const HAND_X = 17;
const HAND_Y = -6;
const FOOT_X = 4.5;

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
  // Arms counter-swing the legs on the same side.
  pose.hands = [
    { x: -HAND_X + swing * 5, y: HAND_Y - Math.abs(swing) * 2 },
    { x: HAND_X - swing * 5, y: HAND_Y - Math.abs(swing) * 2 },
  ];
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
        { x: -4, y: GROUND_Y },
        { x: 4, y: GROUND_Y },
      ];
      pose.look = { eyes: 'droop', mouth: 'frown' };
      break;

    case 'napping': {
      const breath = Math.sin(t * 0.9);
      pose.body.y = STAND_Y + 7 + breath * 1.2;
      pose.squash = 0.93;
      pose.hands = [
        reach(pose.body, { x: -12, y: pose.body.y + 12 }),
        reach(pose.body, { x: 12, y: pose.body.y + 12 }),
      ];
      pose.feet = [
        { x: -4.5, y: GROUND_Y },
        { x: 4.5, y: GROUND_Y },
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
 * The starburst outline: tapered rays with rounded tips and deep valleys.
 *
 * Drawn as an explicit path rather than Pixi's `star()`, because a star wide
 * enough to survive a contour stroke has to taper — stroking a plain star
 * thickly enough to round its tips fills the valleys and turns the whole thing
 * into a cookie.
 *
 * `FLANK` is the fraction of the valley-to-tip span at which the flank control
 * point sits. Around 0.49 the flank is straight; below it the ray tapers
 * concavely the way the logo's do, and above it the ray bulges into a blunt
 * cog tooth.
 */
const FLANK = 0.45;

function starburst(g: Graphics, r: number, rays: number, valley: number): void {
  const step = (Math.PI * 2) / rays;
  const inner = r * valley;
  const tipHalf = step * 0.13;
  const flank = inner + (r - inner) * FLANK;

  for (let i = 0; i < rays; i++) {
    const axis = -Math.PI / 2 + i * step;
    const before = axis - step / 2;
    const after = axis + step / 2;

    const v0 = polar(before, inner);
    if (i === 0) {
      g.moveTo(v0.x, v0.y);
    } else {
      g.lineTo(v0.x, v0.y);
    }

    const rise = polar((before + axis - tipHalf) / 2, flank);
    const t0 = polar(axis - tipHalf, r);
    g.quadraticCurveTo(rise.x, rise.y, t0.x, t0.y);

    // The tip is a single curve through a point just past the radius, which
    // rounds it without a join.
    const cap = polar(axis, r * 1.05);
    const t1 = polar(axis + tipHalf, r);
    g.quadraticCurveTo(cap.x, cap.y, t1.x, t1.y);

    const fall = polar((axis + tipHalf + after) / 2, flank);
    const v1 = polar(after, inner);
    g.quadraticCurveTo(fall.x, fall.y, v1.x, v1.y);
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
 * The face, in body-local space. Big eyes set high and a small mouth is most
 * of what makes the character read as cute rather than as a sea urchin; the
 * whole thing stays inside the valley radius so no feature can land in the gap
 * between two rays.
 */
function drawFace(g: Graphics, look: Look, facing: 1 | -1): void {
  g.clear();
  const shift = facing * 1;
  const ex = 3.7;
  const ey = -2.4;
  const eyes: readonly Vec[] = [
    { x: shift - ex, y: ey },
    { x: shift + ex, y: ey },
  ];
  const mouthY = ey + 6.2;

  // Fills before strokes: Pixi accumulates paths, and a fill issued after a
  // stroke fills their connection too.
  if (look.eyes === 'open' || look.eyes === 'wide') {
    const rx = look.eyes === 'wide' ? 2.4 : 2;
    const ry = look.eyes === 'wide' ? 3 : 2.6;
    for (const eye of eyes) {
      g.ellipse(eye.x, eye.y, rx, ry).fill(THEME.eye);
    }
  } else if (look.eyes === 'droop') {
    for (const eye of eyes) {
      g.ellipse(eye.x, eye.y + 0.8, 2.1, 1.4).fill(THEME.eye);
    }
  }
  if (look.mouth === 'open') {
    g.ellipse(shift, mouthY, 2.3, 2.6).fill(THEME.eye);
  }

  if (look.eyes === 'closed') {
    for (const eye of eyes) {
      g.moveTo(eye.x - 2.6, eye.y - 0.6)
        .quadraticCurveTo(eye.x, eye.y + 2.3, eye.x + 2.6, eye.y - 0.6)
        .stroke({ color: THEME.eye, width: 1.7, cap: 'round' });
    }
  }
  if (look.eyes === 'droop') {
    // Half-lids, sloping down toward the outside of the face.
    eyes.forEach((eye, i) => {
      const out = i === 0 ? -1 : 1;
      g.moveTo(eye.x - out * 2.4, eye.y - 1.7)
        .lineTo(eye.x + out * 2.4, eye.y - 0.7)
        .stroke({ color: THEME.eye, width: 1.5, cap: 'round' });
    });
  }
  if (look.mouth === 'smile') {
    g.moveTo(shift - 2.6, mouthY - 1)
      .quadraticCurveTo(shift, mouthY + 2, shift + 2.6, mouthY - 1)
      .stroke({ color: THEME.eye, width: 1.5, cap: 'round' });
  } else if (look.mouth === 'flat') {
    g.moveTo(shift - 2.2, mouthY)
      .lineTo(shift + 2.2, mouthY)
      .stroke({ color: THEME.eye, width: 1.6, cap: 'round' });
  } else if (look.mouth === 'frown') {
    g.moveTo(shift - 2.6, mouthY + 1.2)
      .quadraticCurveTo(shift, mouthY - 1.5, shift + 2.6, mouthY + 1.2)
      .stroke({ color: THEME.eye, width: 1.5, cap: 'round' });
  }
}

/**
 * A little terminal held in front, with pseudo-random output scrolling up it.
 * Line widths are hashed from the scroll position and the actor id, so the
 * output churns without any real text — or any real randomness, so replays
 * stay identical.
 */
function drawTerminal(g: Graphics, t: number, seed: string): void {
  const lineH = 3;
  const top = TERMINAL_Y - TERMINAL_H;
  g.roundRect(-TERMINAL_W / 2, top, TERMINAL_W, TERMINAL_H, 3).fill(THEME.laptop);
  // Same light screen as the desks' own laptops — a dark slab reads as a
  // different object entirely.
  g.roundRect(-TERMINAL_W / 2 + 2, top + 2, TERMINAL_W - 4, TERMINAL_H - 5, 2).fill(
    THEME.laptopGlow
  );

  const scroll = t * 6;
  const offset = (scroll % 1) * lineH;
  const base = Math.floor(scroll);
  let seedHash = 0;
  for (let i = 0; i < seed.length; i++) {
    seedHash = (seedHash * 31 + seed.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < 4; i++) {
    const hash = Math.abs((seedHash ^ ((base + i) * 2654435761)) % 1000) / 1000;
    const y = top + 3.5 + i * lineH - offset;
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
  g.roundRect(at.x - 3.2, at.y - 7.5, 6.4, 6.6, 2).fill(THEME.mug);
  g.roundRect(at.x - 2.4, at.y - 7.9, 4.8, 1.3, 1).fill(THEME.laptopGlow);
}

/** Three thought dots rising over the head, fading in sequence. */
function drawThought(g: Graphics, t: number, top: number): void {
  const dots = [0, 1, 2].map((i) => ({
    x: 12 + i * 8,
    y: top - 7 - i * 6.5,
    r: 3 + i * 0.8,
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
    // Back to front. Limbs go *behind* the body so only the length that clears
    // the silhouette shows; in front they cross the body mass and blend into
    // the rays. The terminal sits over the body, and hands are posed outside
    // its width so it never hides them.
    this.view.addChild(this.shadow, this.thought, this.limbs, this.core, this.prop, this.held);
    this.shadow.ellipse(0, -1, 11, 4).fill({ color: THEME.shadow, alpha: 0.18 });
  }

  update(actor: Actor, t: number, atOwnComputer: boolean): void {
    const pose = poseFor(actor, t, atOwnComputer);
    const tone = actor.state === 'slump' ? THEME.slumpTint : THEME.worker;

    // The body is geometry, not animation: rebuilt only when the tint changes.
    if (tone !== this.tone) {
      this.tone = tone;
      this.blob.clear();
      starburst(this.blob, BODY_R, RAYS, VALLEY);
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
    this.shadow.scale.set(Math.max(0.6, 1 - airborne * 0.03));

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
      0.8,
      LEG_W,
      tone,
      { radius: FOOT_R, wide: 3.2 }
    );
    limbPair(
      this.limbs,
      [
        { x: pose.body.x - SHOULDER_X, y: pose.body.y + SHOULDER_Y },
        { x: pose.body.x + SHOULDER_X, y: pose.body.y + SHOULDER_Y },
      ],
      pose.hands,
      3,
      ARM_W,
      tone,
      { radius: HAND_R, wide: 0.8 }
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
