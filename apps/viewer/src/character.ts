import { Actor } from '@agentopia/core';
import { Container, Graphics } from 'pixi.js';

import { THEME } from './theme';

/**
 * The Claude character, as a posed rig.
 *
 * Every part is its own display object, so a state is a *pose* rather than a
 * redraw: the starburst body and the face are built once and then translated,
 * rotated and squashed, while only the limbs — whose geometry genuinely
 * changes every frame — and the scrolling terminal are rebuilt.
 *
 * `poseFor` is a pure function of `(state, facing, t)`. It never reads a clock
 * or an rng, which is what keeps replays reproducible and golden-frame
 * snapshots stable. When real sprite art arrives each part swaps to a textured
 * `Sprite` behind this same rig and the pose function is untouched.
 *
 * Drawing rule inherited from the renderer: within one `Graphics`, all fills
 * come before all strokes, because Pixi accumulates paths and a `fill()` after
 * a `stroke()` fills their connection. Limbs sidestep it entirely by being
 * strokes all the way down — a round-capped zero-length line is a dot.
 */

// ---- proportions, after the cartoon ----------------------------------------

/** Tip radius of the starburst. The body *is* the character; there is no head. */
const BODY_R = 16;
/** Odd, so the silhouette never reads as mechanically symmetric. */
const RAYS = 11;
/** Valley radius as a fraction of BODY_R. Deep enough that rays read as rays. */
const VALLEY = 0.55;
/** Contour weight. Every part carries the same line so they read as one drawing. */
const LINE = 2;

/** Body centre while standing, relative to the actor's tile position. */
const STAND_Y = -24;
/** Where feet meet the floor — just above the contact shadow. */
const GROUND_Y = -2;

const SHOULDER_X = BODY_R * 0.5;
const SHOULDER_Y = BODY_R * 0.3;
const HIP_X = 5;
const HIP_Y = BODY_R * 0.52;

const ARM_W = 3;
const LEG_W = 3.4;
const HAND_R = 3.4;
const FOOT_R = 3;

/** Resting hand and foot placement, mirrored left/right. */
const HAND_X = 20;
const HAND_Y = -9;
const FOOT_X = 6;

interface Vec {
  x: number;
  y: number;
}

type Eyes = 'open' | 'wide' | 'closed' | 'droop';
type Mouth = 'smile' | 'flat' | 'frown' | 'open';

interface Look {
  eyes: Eyes;
  mouth: Mouth;
  brows: boolean;
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

/** Walk, run, or pace: scissoring legs, counter-swinging arms, a bob. */
function stride(pose: Pose, state: Actor['state'], t: number, facing: 1 | -1): void {
  const fast = state === 'sprinting';
  const speed = fast ? 15 : state === 'pacing' ? 5 : 9;
  const reach = fast ? 10 : state === 'pacing' ? 5 : 7;
  const swing = Math.sin(t * speed);
  pose.body.y = STAND_Y - Math.abs(swing) * (fast ? 4 : 2.5);
  pose.tilt = facing * (fast ? 0.16 : 0.05);
  // The trailing foot leaves the floor; the planted one stays down.
  pose.feet = [
    { x: -swing * reach, y: GROUND_Y - Math.max(0, -swing) * 5 },
    { x: swing * reach, y: GROUND_Y - Math.max(0, swing) * 5 },
  ];
  // Arms counter-swing the legs on the same side.
  pose.hands = [
    { x: -HAND_X + swing * 6, y: HAND_Y - Math.abs(swing) * 2 },
    { x: HAND_X - swing * 6, y: HAND_Y - Math.abs(swing) * 2 },
  ];
  if (fast) {
    pose.look = { eyes: 'wide', mouth: 'open', brows: true };
  }
}

/** Typing at the worker's own machine: the body is still, the hands work. */
function typing(pose: Pose, t: number): void {
  pose.body.y = STAND_Y + 3;
  // Hands land just outside the keyboard so the terminal never hides them.
  const keys = pose.body.y + BODY_R * 0.55 - 2;
  pose.hands = [
    { x: -21, y: keys - Math.abs(Math.sin(t * 13)) * 3 },
    { x: 21, y: keys - Math.abs(Math.sin(t * 13 + 1.7)) * 3 },
  ];
  pose.look = { eyes: 'open', mouth: 'flat', brows: true };
  pose.terminal = true;
}

/** Working a station: leaning in, one hand hammering away. */
function labour(pose: Pose, t: number, facing: 1 | -1): void {
  const beat = Math.abs(Math.sin(t * 9));
  pose.body.y = STAND_Y - beat * 3;
  pose.tilt = facing * 0.09;
  pose.hands = [
    { x: facing * 13, y: STAND_Y + 3 - beat * 9 },
    { x: facing * 21, y: STAND_Y + 13 + beat * 3 },
  ];
  pose.look = { eyes: 'open', mouth: 'flat', brows: true };
}

/** The index of the hand on the side the actor faces. */
function nearHand(facing: 1 | -1): 0 | 1 {
  return facing >= 0 ? 1 : 0;
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
    look: { eyes: 'open', mouth: 'smile', brows: false },
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
      // Hand to the chin — the pose from the cartoon's first panel.
      pose.hands[nearHand(facing)] = { x: facing * 10, y: pose.body.y + 9 };
      pose.look = { eyes: 'open', mouth: 'flat', brows: false };
      pose.thought = true;
      break;
    }

    case 'slump':
      pose.body.y = STAND_Y + 4;
      pose.squash = 0.86;
      pose.hands = [
        { x: -HAND_X + 4, y: GROUND_Y - 5 },
        { x: HAND_X - 4, y: GROUND_Y - 5 },
      ];
      pose.feet = [
        { x: -4, y: GROUND_Y },
        { x: 4, y: GROUND_Y },
      ];
      pose.look = { eyes: 'droop', mouth: 'frown', brows: true };
      break;

    case 'napping': {
      const breath = Math.sin(t * 0.9);
      pose.body.y = STAND_Y + 6 + breath * 1.2;
      pose.squash = 0.92;
      pose.hands = [
        { x: -11, y: pose.body.y + 11 },
        { x: 11, y: pose.body.y + 11 },
      ];
      pose.feet = [
        { x: -5, y: GROUND_Y },
        { x: 5, y: GROUND_Y },
      ];
      pose.look = { eyes: 'closed', mouth: 'smile', brows: false };
      break;
    }

    case 'coffee': {
      const sip = Math.max(0, Math.sin(t * 0.8));
      pose.hands[nearHand(facing)] = { x: facing * 11, y: pose.body.y + 9 - sip * 6 };
      pose.look = { eyes: sip > 0.75 ? 'closed' : 'open', mouth: 'smile', brows: false };
      pose.mug = true;
      break;
    }

    case 'waiting':
      // Hands clasped politely in front, waiting to be told what to do.
      pose.hands = [
        { x: -5, y: pose.body.y + 14 },
        { x: 5, y: pose.body.y + 14 },
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
 * into a cookie. The flank control points sit inside the straight chord, which
 * is what gives each ray the logo's slightly concave taper.
 */
function starburst(g: Graphics, r: number, rays: number, valley: number): void {
  const step = (Math.PI * 2) / rays;
  const inner = r * valley;
  const tipHalf = step * 0.17;
  const flank = inner + (r - inner) * 0.28;

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

    // The tip is a single curve through a point slightly past the radius,
    // which rounds it without a join.
    const cap = polar(axis, r * 1.07);
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
  g.stroke({ color: THEME.workerLine, width: radius * 2 + LINE * 2, cap: 'round' });
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
    g.stroke({ color: THEME.workerLine, width: width + LINE * 2, cap: 'round' });
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
 * The face, in body-local space. Kept well inside the valley radius so no
 * feature can ever land in the gap between two rays.
 */
function drawFace(g: Graphics, look: Look, facing: 1 | -1): void {
  g.clear();
  const shift = facing * 1.2;
  const ex = 3.6;
  const ey = -2;
  const eyes: readonly Vec[] = [
    { x: shift - ex, y: ey },
    { x: shift + ex, y: ey },
  ];
  const mouthY = ey + 6;

  // Fills before strokes: Pixi accumulates paths, and a fill issued after a
  // stroke fills their connection too.
  if (look.eyes === 'open' || look.eyes === 'wide') {
    const rx = look.eyes === 'wide' ? 2.4 : 1.8;
    const ry = look.eyes === 'wide' ? 3 : 2.5;
    for (const eye of eyes) {
      g.ellipse(eye.x, eye.y, rx, ry).fill(THEME.eye);
    }
  } else if (look.eyes === 'droop') {
    for (const eye of eyes) {
      g.ellipse(eye.x, eye.y + 0.7, 1.8, 1.3).fill(THEME.eye);
    }
  }
  if (look.mouth === 'open') {
    g.ellipse(shift, mouthY, 2.3, 2.7).fill(THEME.eye);
  }

  if (look.eyes === 'closed') {
    for (const eye of eyes) {
      g.moveTo(eye.x - 2.4, eye.y - 0.5)
        .quadraticCurveTo(eye.x, eye.y + 2.1, eye.x + 2.4, eye.y - 0.5)
        .stroke({ color: THEME.eye, width: 1.6, cap: 'round' });
    }
  }
  if (look.eyes === 'droop') {
    // Half-lids, sloping down toward the outside of the face.
    eyes.forEach((eye, i) => {
      const out = i === 0 ? -1 : 1;
      g.moveTo(eye.x - out * 2.3, eye.y - 1.6)
        .lineTo(eye.x + out * 2.3, eye.y - 0.6)
        .stroke({ color: THEME.eye, width: 1.5, cap: 'round' });
    });
  }
  if (look.brows) {
    // A frown gets worried brows (outer ends down); everything else gets
    // determined ones (inner ends down).
    const worried = look.mouth === 'frown';
    eyes.forEach((eye, i) => {
      const out = i === 0 ? -1 : 1;
      const inner = ey - (worried ? 4.8 : 3.8);
      const outer = ey - (worried ? 3.8 : 4.8);
      g.moveTo(eye.x - out * 1.6, inner)
        .lineTo(eye.x + out * 1.6, outer)
        .stroke({ color: THEME.eye, width: 1.6, cap: 'round' });
    });
  }
  if (look.mouth === 'smile') {
    g.moveTo(shift - 2.8, mouthY - 1)
      .quadraticCurveTo(shift, mouthY + 2.2, shift + 2.8, mouthY - 1)
      .stroke({ color: THEME.eye, width: 1.5, cap: 'round' });
  } else if (look.mouth === 'flat') {
    g.moveTo(shift - 2.4, mouthY)
      .lineTo(shift + 2.4, mouthY)
      .stroke({ color: THEME.eye, width: 1.6, cap: 'round' });
  } else if (look.mouth === 'frown') {
    g.moveTo(shift - 2.8, mouthY + 1.2)
      .quadraticCurveTo(shift, mouthY - 1.6, shift + 2.8, mouthY + 1.2)
      .stroke({ color: THEME.eye, width: 1.5, cap: 'round' });
  }
}

/**
 * A little terminal with pseudo-random output lines scrolling up. Widths are
 * hashed from the scroll position and actor id, so the output churns without
 * any real text — or any real randomness, so replays stay identical.
 */
function drawTerminal(g: Graphics, cy: number, t: number, seed: string): void {
  const w = 34;
  const h = 24;
  const lineH = 4.5;
  g.roundRect(-w / 2, cy - h, w, h, 3).fill(THEME.laptop);
  g.roundRect(-w / 2 + 2, cy - h + 2, w - 4, h - 6, 2).fill(THEME.screen);
  const scroll = t * 6;
  const offset = (scroll % 1) * lineH;
  const base = Math.floor(scroll);
  let seedHash = 0;
  for (let i = 0; i < seed.length; i++) {
    seedHash = (seedHash * 31 + seed.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < 4; i++) {
    const n = base + i;
    const hash = Math.abs((seedHash ^ (n * 2654435761)) % 1000) / 1000;
    const lineW = 6 + hash * (w - 14);
    const y = cy - h + 4 + i * lineH - offset;
    if (y < cy - h + 3 || y > cy - 7) {
      continue;
    }
    g.roundRect(-w / 2 + 4, y, lineW, 2, 1).fill({
      color: THEME.screenText,
      alpha: 0.55 + hash * 0.4,
    });
  }
  g.roundRect(-w / 2 - 2, cy - 3, w + 4, 4, 2).fill(THEME.deskShade);
}

/** A mug in the raised hand, for the coffee break. */
function drawMug(g: Graphics, at: Vec): void {
  g.roundRect(at.x - 3.4, at.y - 8, 6.8, 7, 2).fill(THEME.mug);
  g.roundRect(at.x - 2.6, at.y - 8.4, 5.2, 1.4, 1).fill(THEME.laptopGlow);
}

/** Three thought dots rising over the head, fading in sequence. */
function drawThought(g: Graphics, t: number, top: number): void {
  const dots = [0, 1, 2].map((i) => ({
    x: 13 + i * 9,
    y: top - 8 - i * 7,
    r: 3.5 + i * 0.8,
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
  private legs = new Graphics();
  /** Carries the body's tilt and squash, so the face rides along with them. */
  private core = new Container();
  private blob = new Graphics();
  private face = new Graphics();
  private prop = new Graphics();
  private arms = new Graphics();
  /** Held props are fills, and the arms are strokes; they cannot share a layer. */
  private held = new Graphics();

  /** Redraw caches: these two parts are static except when the pose changes. */
  private tone: number | null = null;
  private faceKey = '';

  constructor() {
    this.core.addChild(this.blob, this.face);
    // Back to front. Arms sit over the prop so hands land on the keyboard;
    // the face sits over the body so a raised hand never covers the eyes.
    this.view.addChild(
      this.shadow,
      this.thought,
      this.legs,
      this.core,
      this.prop,
      this.arms,
      this.held
    );
    this.shadow.ellipse(0, -1, 14, 4.5).fill({ color: THEME.shadow, alpha: 0.18 });
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

    const faceKey = `${pose.look.eyes}|${pose.look.mouth}|${pose.look.brows}|${actor.facing}`;
    if (faceKey !== this.faceKey) {
      this.faceKey = faceKey;
      drawFace(this.face, pose.look, actor.facing);
    }

    // The shadow tightens as the character leaves the floor.
    const airborne = Math.max(0, STAND_Y - pose.body.y);
    this.shadow.scale.set(Math.max(0.6, 1 - airborne * 0.03));

    this.legs.clear();
    limbPair(
      this.legs,
      [
        { x: pose.body.x - HIP_X, y: pose.body.y + HIP_Y },
        { x: pose.body.x + HIP_X, y: pose.body.y + HIP_Y },
      ],
      pose.feet,
      1.5,
      LEG_W,
      tone,
      { radius: FOOT_R, wide: 3 }
    );

    this.prop.clear();
    if (pose.terminal) {
      drawTerminal(this.prop, pose.body.y + BODY_R * 0.55, t, actor.id);
    }

    this.arms.clear();
    limbPair(
      this.arms,
      [
        { x: pose.body.x - SHOULDER_X, y: pose.body.y + SHOULDER_Y },
        { x: pose.body.x + SHOULDER_X, y: pose.body.y + SHOULDER_Y },
      ],
      pose.hands,
      2,
      ARM_W,
      tone,
      { radius: HAND_R, wide: 0.8 }
    );
    this.held.clear();
    if (pose.mug) {
      drawMug(this.held, pose.hands[nearHand(actor.facing)]);
    }

    this.thought.clear();
    if (pose.thought) {
      drawThought(this.thought, t, pose.body.y - BODY_R);
    }
  }
}
