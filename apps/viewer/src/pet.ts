import { PetKind, PetView } from '@agentopia/core';
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';

import { SHEET } from './kit/palette';

const INK = SHEET.ink;

/**
 * The office cat and dog, as posed rigs drawn in canvas 2D.
 *
 * They follow the avatar's look (`character.ts`), after T's reference
 * cartoon: chibi proportions — a big round head on a small soft body — in
 * flat colour under a thin outline in the coat's own darker shade, with ink
 * only on the face. They are seen side-on, turned to face left or right
 * along the way they are going; a pose is a pure function of what the pet is
 * doing and its own clocks, drawn fresh each frame into the pet's own small
 * canvas, which the renderer composites as a sprite and sorts among the
 * furniture like any figure.
 *
 * Lengths are in sheet pixels at the 32px tile, before the per-pet `scale`;
 * y is negative upward from the floor.
 */

type Ctx = CanvasRenderingContext2D;

interface Vec {
  x: number;
  y: number;
}

/** A coat: the body colour, its lighter belly and muzzle, the outline, and the inner ear. */
export interface Coat {
  m: string;
  d: string;
  belly: string;
  edge: string;
  ear: string;
}

/** A grey tabby with white socks and bib. */
export const CAT_COAT: Coat = {
  m: '#8a8f9e',
  d: '#6f7484',
  belly: '#f4efe6',
  edge: '#4a4e5c',
  ear: '#f2b3bf',
};

/** A sandy, floppy-eared pup with a cream muzzle and chest. */
export const DOG_COAT: Coat = {
  m: '#d9a364',
  d: '#b9824a',
  belly: '#f8ead2',
  edge: '#73471f',
  ear: '#a8693a',
};

/** How each pet is built, in sheet pixels before `scale`. */
interface Build {
  coat: Coat;
  scale: number;
  body: { x: number; y: number; rx: number; ry: number };
  head: { x: number; y: number; r: number };
  /** Hip and shoulder along the body, near then far. */
  legX: { front: number; back: number; spread: number };
  legW: number;
  tailW: number;
}

const BUILD: Record<PetKind, Build> = {
  cat: {
    coat: CAT_COAT,
    scale: 1,
    body: { x: -1, y: -7.6, rx: 7.4, ry: 4.6 },
    head: { x: 6.4, y: -13.4, r: 5.7 },
    legX: { front: 4.0, back: -5.4, spread: 1.6 },
    legW: 2.6,
    tailW: 2.3,
  },
  dog: {
    coat: DOG_COAT,
    scale: 1.12,
    body: { x: -1, y: -9.4, rx: 9, ry: 5.4 },
    head: { x: 8.0, y: -16.2, r: 6.6 },
    legX: { front: 5.0, back: -6.2, spread: 1.8 },
    legW: 3.1,
    tailW: 2.6,
  },
};

/** Outline weight, sheet pixels: thin, like the avatar's. */
const LINE = 1.15;
/** How long one stride covers, in tiles, at a walk and at a run. */
const STRIDE_TILES = { walk: 0.42, trot: 0.75 } as const;
/** How often a pet blinks, and for how long, in seconds. */
const BLINK_EVERY = 3.7;
const BLINK_FOR = 0.14;

/** Where the drawing reaches, in sheet pixels round the feet, before `scale`. */
const BOX = { x0: -26, y0: -40, x1: 26, y1: 6 };

type Eyes = 'open' | 'closed' | 'happy' | 'down';
type Mouth = 'smile' | 'open' | 'tongue' | 'lap';

/** A leg, from where it leaves the body to the foot; a `paw` is a front foot held up. */
interface Leg {
  hip: Vec;
  foot: Vec;
  far: boolean;
}

/** One frame's pose. */
export interface PetPose {
  body: { x: number; y: number; rx: number; ry: number; tilt: number };
  head: { x: number; y: number; tilt: number };
  legs: Leg[];
  /** The tail as a curve: base, two controls, tip. */
  tail: [Vec, Vec, Vec, Vec];
  eyes: Eyes;
  mouth: Mouth;
  /** How far the ears flap back, -1..1 (a dog's floppy ears swing). */
  flap: number;
  /** A toy on the floor in front, for play. */
  toy?: Vec;
  /** Asleep: the z's float up. */
  zzz: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return (Math.imul(hash, 0x9e3779b1) >>> 0) / 0x100000000;
}

function blinking(id: string, t: number): boolean {
  const at = (t / BLINK_EVERY + hashOf(id)) % 1;
  return at * BLINK_EVERY < BLINK_FOR;
}

/** Four legs straight down from the body to the floor, each foot shifted by `step`. */
function legsDown(
  b: Build,
  bodyY: number,
  step: (i: number) => Vec = () => ({ x: 0, y: 0 })
): Leg[] {
  const hipY = bodyY + b.body.ry * 0.55;
  const xs = [
    [b.legX.back - b.legX.spread, true],
    [b.legX.front - b.legX.spread, true],
    [b.legX.back, false],
    [b.legX.front, false],
  ] as const;
  return xs.map(([x, far], i) => {
    const s = step(i);
    return { hip: { x, y: hipY }, foot: { x: x + s.x, y: Math.min(0, s.y) }, far };
  });
}

/** A tail from the rump, swinging by `sway` (-1..1) and raised by `up` (0 low, 1 straight up). */
function tailFrom(
  b: Build,
  body: PetPose['body'],
  up: number,
  sway: number,
  kind: PetKind
): PetPose['tail'] {
  const base = { x: body.x - body.rx * 0.92, y: body.y - body.ry * 0.25 };
  const len = kind === 'cat' ? 13 : 8.5;
  const a = lerp(Math.PI * 0.95, Math.PI * 0.55, up) + sway * 0.35;
  const tip = { x: base.x + Math.cos(a) * len, y: base.y - Math.sin(a) * len };
  const c1 = { x: base.x - len * 0.35, y: base.y - len * 0.1 };
  // A cat's tail ends in a hook; a dog's curls over.
  const c2 =
    kind === 'cat'
      ? { x: tip.x - 2.5 + sway * 1.5, y: tip.y + len * 0.35 }
      : { x: tip.x - 3.2, y: tip.y + 1.5 };
  return [base, c1, c2, tip];
}

/** A sitting pet: rump down, chest up, front legs straight, the tail round its feet. */
function sitting(b: Build, kind: PetKind, look: number, sway: number, tailUp = 0): PetPose {
  const body = {
    x: b.body.x - 1.2,
    y: b.body.y - b.body.ry * 0.4,
    rx: b.body.rx * 0.72,
    ry: b.body.ry * 1.32,
    tilt: -0.55,
  };
  const chest = { x: body.x + body.rx * 0.65, y: body.y + body.ry * 0.25 };
  const legs: Leg[] = [
    // The haunches: short, folded, the feet forward.
    { hip: { x: body.x - 2.8, y: -3.2 }, foot: { x: body.x + 1.2, y: 0 }, far: true },
    { hip: chest, foot: { x: chest.x - 0.6, y: 0 }, far: true },
    { hip: { x: body.x - 2.2, y: -3.6 }, foot: { x: body.x + 1.8, y: 0 }, far: false },
    { hip: { x: chest.x + 0.8, y: chest.y }, foot: { x: chest.x + 0.9, y: 0 }, far: false },
  ];
  const tail: PetPose['tail'] =
    tailUp > 0
      ? tailFrom(b, { ...body, y: body.y + body.ry * 0.6 }, tailUp, sway, kind)
      : [
          { x: body.x - body.rx * 0.6, y: -1.6 },
          { x: body.x - body.rx * 1.6, y: -0.6 + sway * 0.5 },
          { x: body.x - body.rx * 1.2, y: 0.6 },
          { x: body.x + 1.5 + sway, y: 0.3 },
        ];
  return {
    body,
    head: { x: b.head.x - 2.4, y: b.head.y - b.body.ry * 0.9 - look * 1.2, tilt: -look * 0.25 },
    legs,
    tail,
    eyes: 'open',
    mouth: 'smile',
    flap: 0,
    zzz: false,
  };
}

/** Lying down, legs tucked under: a loaf. Asleep, the head goes down on the paws. */
function lying(b: Build, kind: PetKind, asleep: boolean, t: number): PetPose {
  const breathe = asleep ? Math.sin(t * Math.PI * 0.9) * 0.35 : 0;
  const body = {
    x: b.body.x + 0.5,
    y: -b.body.ry * 0.95 - breathe * 0.3,
    rx: b.body.rx * 1.05,
    ry: b.body.ry * 0.95 + breathe,
    tilt: 0,
  };
  const paw = { x: body.x + body.rx * 0.85, y: -0.9 };
  return {
    body,
    head: asleep
      ? { x: b.head.x + 0.5, y: -b.head.r * 0.95, tilt: 0.18 }
      : { x: b.head.x, y: b.head.y + b.body.ry * 1.0, tilt: 0 },
    legs: [
      { hip: { x: paw.x - 1.6, y: -1.4 }, foot: { x: paw.x - 0.6, y: -0.7 }, far: true },
      { hip: { x: paw.x - 2.4, y: -1.4 }, foot: paw, far: false },
    ],
    tail: [
      { x: body.x - body.rx * 0.8, y: body.y + body.ry * 0.5 },
      { x: body.x - body.rx * 1.5, y: -0.4 },
      { x: body.x - body.rx * 0.2, y: 1.2 },
      { x: body.x + body.rx * (kind === 'cat' ? 0.55 : 0.1), y: 0.4 },
    ],
    eyes: asleep ? 'closed' : 'open',
    mouth: 'smile',
    flap: asleep ? 0.6 : 0,
    zzz: asleep,
  };
}

/** Standing on all fours, the legs stepping by `stride` (0..1 round a full stride). */
function standing(
  b: Build,
  kind: PetKind,
  stride: number | null,
  run: boolean,
  t: number
): PetPose {
  const moving = stride !== null;
  const ph = (stride ?? 0) * Math.PI * 2;
  const reach = run ? 3.4 : 2.3;
  const lift = run ? 2.2 : 1.3;
  const bob = moving ? Math.abs(Math.sin(ph)) * (run ? 1.3 : 0.6) : 0;
  const bodyY = b.body.y - bob;
  // Diagonal pairs step together: near back with far front, and the other pair.
  const legs = legsDown(b, bodyY, (i) => {
    if (!moving) {
      return { x: 0, y: 0 };
    }
    const phase = ph + (i === 0 || i === 3 ? 0 : Math.PI);
    return { x: Math.sin(phase) * reach, y: -Math.max(0, Math.cos(phase)) * lift };
  });
  const body = { ...b.body, y: bodyY, tilt: run ? Math.sin(ph * 2) * 0.04 : 0 };
  const sway = moving ? Math.sin(ph) : Math.sin(t * 1.6) * 0.6;
  return {
    body,
    head: { x: b.head.x + (run ? 0.8 : 0), y: b.head.y - bob * 0.6 + (run ? 1 : 0), tilt: 0 },
    legs,
    tail: tailFrom(b, body, kind === 'dog' ? 0.85 : run ? 0.35 : 0.75, sway, kind),
    eyes: 'open',
    mouth: run ? 'open' : 'smile',
    flap: run ? 0.5 + Math.sin(ph * 2) * 0.4 : 0,
    zzz: false,
  };
}

/** What a pet looks like this frame. `t` is its own clock (seconds in the act). */
export function petPose(pet: PetView, t: number, travel: number): PetPose {
  const b = BUILD[pet.kind];
  const kind = pet.kind;
  switch (pet.act) {
    case 'walk':
    case 'trot': {
      const run = pet.act === 'trot';
      const stride = (travel / STRIDE_TILES[run ? 'trot' : 'walk']) % 1;
      return standing(b, kind, stride, run, t);
    }
    case 'sniff': {
      const pose = standing(b, kind, null, false, t);
      const sniff = Math.sin(t * 9) * 0.4;
      return {
        ...pose,
        head: { x: b.head.x + 2.2, y: b.head.y + 5.5 + sniff, tilt: 0.4 },
        tail: tailFrom(b, pose.body, 0.8, Math.sin(t * 2.4), kind),
        eyes: 'down',
      };
    }
    case 'eat':
    case 'drink': {
      const pose = standing(b, kind, null, false, t);
      const bob = pet.act === 'eat' ? Math.abs(Math.sin(t * 5)) * 0.9 : Math.sin(t * 7) * 0.3;
      return {
        ...pose,
        body: { ...pose.body, tilt: 0.12 },
        head: { x: b.head.x + 3.2, y: -b.head.r * 0.9 - bob, tilt: 0.55 },
        eyes: 'down',
        mouth: pet.act === 'drink' && Math.sin(t * 7) > 0.2 ? 'lap' : 'smile',
        tail: tailFrom(
          b,
          pose.body,
          kind === 'dog' ? 0.9 : 0.6,
          Math.sin(t * (kind === 'dog' ? 9 : 2)),
          kind
        ),
      };
    }
    case 'sit':
    case 'gaze': {
      const pose = sitting(b, kind, pet.act === 'gaze' ? 0.6 : 0, Math.sin(t * 1.3));
      return pose;
    }
    case 'beg': {
      // Looking up at someone, the tail going.
      const wag = Math.sin(t * (kind === 'dog' ? 14 : 3));
      const pose = sitting(b, kind, 1.3, wag, kind === 'cat' ? 1 : 0);
      if (kind === 'dog') {
        pose.tail = tailFrom(
          b,
          { ...pose.body, y: pose.body.y + pose.body.ry * 0.7 },
          0.6,
          wag,
          kind
        );
      }
      return { ...pose, eyes: 'happy', mouth: kind === 'dog' ? 'tongue' : 'smile' };
    }
    case 'groom': {
      // A paw to the mouth, licked, then wiped over the ear.
      const pose = sitting(b, kind, -0.2, 0);
      const lick = Math.sin(t * 6);
      const head = { x: pose.head.x + 0.4, y: pose.head.y + 1.6, tilt: 0.3 + lick * 0.05 };
      const near = pose.legs[3];
      const paw = { x: head.x + b.head.r * 0.55, y: head.y + b.head.r * 0.55 + lick * 0.4 };
      return {
        ...pose,
        head,
        legs: [...pose.legs.slice(0, 3), { ...near, foot: paw }],
        eyes: 'closed',
        mouth: lick > 0 ? 'lap' : 'smile',
      };
    }
    case 'loaf':
      return lying(b, kind, false, t);
    case 'nap':
      return lying(b, kind, true, t);
    case 'stretch': {
      // A play bow: front legs out along the floor, chest down, rump and tail up.
      const pose = standing(b, kind, null, false, t);
      const k = Math.min(1, t / 0.5);
      const body = { ...pose.body, y: pose.body.y + 1.6 * k, tilt: 0.32 * k };
      const front = (leg: Leg, dx: number): Leg => ({
        hip: { x: leg.hip.x, y: leg.hip.y + 2.4 * k },
        foot: { x: leg.foot.x + dx * k, y: 0 },
        far: leg.far,
      });
      return {
        ...pose,
        body,
        head: { x: b.head.x + 2.4 * k, y: b.head.y + 6 * k, tilt: -0.15 * k },
        legs: [pose.legs[0], front(pose.legs[1], 5.5), pose.legs[2], front(pose.legs[3], 6.5)],
        tail: tailFrom(b, body, 1, Math.sin(t * 2) * 0.3, kind),
        eyes: t > 0.4 && t < 1.4 ? 'closed' : 'open',
        mouth: t > 0.4 && t < 1.2 ? 'open' : 'smile',
      };
    }
    case 'play': {
      // Crouch, wiggle, pounce on the toy, bat it on; over and over.
      const cycle = (t % 1.1) / 1.1;
      const hop = cycle > 0.55 ? Math.sin(((cycle - 0.55) / 0.45) * Math.PI) * 5 : 0;
      const crouch = cycle < 0.55 ? Math.sin((cycle / 0.55) * Math.PI) * 1.5 : 0;
      const pose = standing(b, kind, null, false, t);
      const body = { ...pose.body, y: pose.body.y + crouch - hop, tilt: hop > 0 ? -0.18 : 0.1 };
      const legs = pose.legs.map((leg) => ({
        hip: { x: leg.hip.x, y: leg.hip.y + crouch - hop },
        foot: { x: leg.foot.x + (hop > 0 ? (leg.hip.x > 0 ? 2.5 : -2) : 0), y: -hop * 0.7 },
        far: leg.far,
      }));
      return {
        ...pose,
        body,
        head: { x: b.head.x + 1, y: b.head.y + crouch + 1 - hop, tilt: 0.1 },
        legs,
        tail: tailFrom(
          b,
          body,
          kind === 'dog' ? 0.9 : 0.55,
          Math.sin(t * (kind === 'dog' ? 13 : 8)),
          kind
        ),
        eyes: 'open',
        mouth: kind === 'dog' ? 'tongue' : 'open',
        flap: hop > 0 ? 0.8 : 0,
        toy: { x: b.head.x + b.head.r + 4 + (cycle > 0.8 ? (cycle - 0.8) * 14 : 0), y: -1.6 },
      };
    }
    case 'jump': {
      const pose = standing(b, kind, null, false, t);
      const up = pet.progress < 0.5;
      const body = { ...pose.body, rx: pose.body.rx * 1.08, tilt: up ? -0.42 : 0.38 };
      const legs: Leg[] = pose.legs.map((leg) => {
        const front = leg.hip.x > 0;
        return {
          hip: leg.hip,
          foot: {
            x: leg.hip.x + (front ? 4.2 : -4.6),
            y: leg.hip.y + (front === up ? 2 : 4.4),
          },
          far: leg.far,
        };
      });
      return {
        ...pose,
        body,
        head: { x: b.head.x + 1.2, y: b.head.y + (up ? -1.5 : 2.5), tilt: up ? -0.2 : 0.25 },
        legs,
        tail: tailFrom(b, body, 0.45, 0, kind),
        flap: 0.9,
      };
    }
    case 'stand':
    default:
      return standing(b, kind, null, false, t);
  }
}

// ---- drawing ---------------------------------------------------------------

/** A capsule from `a` to `b`, `w` wide, round at both ends. */
function capsule(a: Vec, b: Vec, w: number): Path2D {
  const path = new Path2D();
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const r = w / 2;
  path.arc(b.x, b.y, r, angle - Math.PI / 2, angle + Math.PI / 2);
  path.arc(a.x, a.y, r, angle + Math.PI / 2, angle + (Math.PI * 3) / 2);
  path.closePath();
  return path;
}

/** The tail: a cubic, round-tipped, `w` wide at its base thinning a little to the tip. */
function tailShape(tail: PetPose['tail'], w: number): Path2D {
  const [p0, p1, p2, p3] = tail;
  const at = (t: number): Vec => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  };
  const path = new Path2D();
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const a = at(i / steps);
    const c = at((i + 1) / steps);
    path.addPath(capsule(a, c, w * (1 - (i / steps) * 0.25)));
  }
  return path;
}

function ellipsePath(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const path = new Path2D();
  path.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  return path;
}

/** A rounded triangle for a pointed ear: base corners and tip. */
function earShape(a: Vec, b: Vec, tip: Vec): Path2D {
  const path = new Path2D();
  path.moveTo(a.x, a.y);
  path.quadraticCurveTo((a.x + tip.x) / 2 - 0.6, (a.y + tip.y) / 2, tip.x, tip.y);
  path.quadraticCurveTo((b.x + tip.x) / 2 + 0.6, (b.y + tip.y) / 2, b.x, b.y);
  path.closePath();
  return path;
}

/** Fill and outline a set of shapes as one silhouette: every outline first, then every fill. */
function silhouette(g: Ctx, shapes: readonly Path2D[], fill: string, edge: string): void {
  g.strokeStyle = edge;
  g.lineWidth = LINE * 2;
  g.lineJoin = 'round';
  for (const s of shapes) {
    g.stroke(s);
  }
  g.fillStyle = fill;
  for (const s of shapes) {
    g.fill(s);
  }
}

/** The head's own parts, in the head's frame (its centre at the origin, facing +x). */
function drawHead(g: Ctx, kind: PetKind, pose: PetPose, id: string, clock: number): void {
  const b = BUILD[kind];
  const c = b.coat;
  const r = b.head.r;
  const shapes: Path2D[] = [ellipsePath(0, 0, r, r * 0.92)];
  let ears: Path2D[] = [];
  let snout: Path2D | null = null;
  if (kind === 'cat') {
    ears = [
      earShape(
        { x: -r * 0.78, y: -r * 0.45 },
        { x: -r * 0.12, y: -r * 0.86 },
        { x: -r * 0.62, y: -r * 1.42 }
      ),
      earShape(
        { x: r * 0.18, y: -r * 0.88 },
        { x: r * 0.8, y: -r * 0.42 },
        { x: r * 0.62, y: -r * 1.4 }
      ),
    ];
    shapes.push(...ears);
  } else {
    snout = ellipsePath(r * 0.82, r * 0.28, r * 0.5, r * 0.38);
    shapes.push(snout);
  }
  silhouette(g, shapes, c.m, c.edge);
  // The lighter muzzle and cheeks.
  g.fillStyle = c.belly;
  if (kind === 'cat') {
    g.fill(ellipsePath(r * 0.38, r * 0.42, r * 0.46, r * 0.34));
    g.fillStyle = c.ear;
    for (const [x0, x1, tx, ty] of [
      [-0.62, -0.26, -0.55, -1.18],
      [0.32, 0.64, 0.56, -1.16],
    ]) {
      const inner = earShape(
        { x: r * x0, y: -r * 0.66 },
        { x: r * x1, y: -r * 0.74 },
        { x: r * tx, y: r * ty }
      );
      g.fill(inner);
    }
  } else if (snout) {
    g.fill(snout);
    g.fill(ellipsePath(r * 0.3, r * 0.48, r * 0.38, r * 0.28));
  }

  // Eyes: small upright dots, close-set and turned toward the way it faces.
  const ex = kind === 'cat' ? [r * 0.12, r * 0.62] : [r * 0.05, r * 0.5];
  const ey = kind === 'cat' ? -r * 0.04 : -r * 0.14;
  const eyes: Eyes = pose.eyes === 'open' && blinking(id, clock) ? 'closed' : pose.eyes;
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineWidth = 0.75;
  g.lineCap = 'round';
  for (const [i, x] of ex.entries()) {
    const s = i === 0 ? 0.9 : 1;
    if (eyes === 'open' || eyes === 'down') {
      const dy = eyes === 'down' ? 0.5 : 0;
      g.fill(ellipsePath(x, ey + dy, 0.75 * s, (eyes === 'down' ? 0.75 : 1.1) * s));
      // A catchlight.
      g.fillStyle = '#ffffff';
      g.fill(ellipsePath(x + 0.25, ey + dy - 0.35, 0.25, 0.25));
      g.fillStyle = INK;
    } else if (eyes === 'closed') {
      g.beginPath();
      g.moveTo(x - 1, ey + 0.2);
      g.quadraticCurveTo(x, ey + 1, x + 1, ey + 0.2);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(x - 1, ey + 0.4);
      g.quadraticCurveTo(x, ey - 0.8, x + 1, ey + 0.4);
      g.stroke();
    }
  }

  // Nose and mouth.
  if (kind === 'cat') {
    const nx = r * 0.5;
    const ny = r * 0.3;
    g.fillStyle = '#e58a9b';
    g.beginPath();
    g.moveTo(nx - 0.8, ny - 0.4);
    g.lineTo(nx + 0.8, ny - 0.4);
    g.lineTo(nx, ny + 0.45);
    g.closePath();
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 0.55;
    g.beginPath();
    // The little ω.
    g.moveTo(nx - 1.3, ny + 0.6);
    g.quadraticCurveTo(nx - 0.65, ny + 1.4, nx, ny + 0.55);
    g.quadraticCurveTo(nx + 0.65, ny + 1.4, nx + 1.3, ny + 0.6);
    g.stroke();
    if (pose.mouth === 'lap' || pose.mouth === 'open') {
      g.fillStyle = '#e8708a';
      g.fill(ellipsePath(nx + 0.2, ny + 1.5, 0.6, 0.55));
    }
    // Whiskers.
    g.strokeStyle = c.edge;
    g.lineWidth = 0.35;
    g.globalAlpha = 0.6;
    for (const dy of [-0.2, 0.5]) {
      g.beginPath();
      g.moveTo(nx + 1.2, ny + dy);
      g.lineTo(nx + 3.4, ny + dy * 2 - 0.3);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else {
    const nx = r * 1.22;
    const ny = r * 0.08;
    g.fillStyle = INK;
    g.fill(ellipsePath(nx, ny, 1.15, 0.9));
    g.fillStyle = '#ffffff';
    g.fill(ellipsePath(nx - 0.3, ny - 0.3, 0.3, 0.22));
    g.strokeStyle = INK;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(nx - 0.2, ny + 0.8);
    g.quadraticCurveTo(nx - 0.6, ny + 2.2, nx - 2.2, ny + 1.8);
    g.stroke();
    if (pose.mouth === 'tongue' || pose.mouth === 'lap' || pose.mouth === 'open') {
      g.fillStyle = '#ef7d92';
      g.strokeStyle = '#b44a5e';
      g.lineWidth = 0.4;
      const tongue = ellipsePath(nx - 1.4, ny + 2.6 + (pose.mouth === 'lap' ? 0.6 : 0), 0.9, 1.3);
      g.fill(tongue);
      g.stroke(tongue);
    }
  }
}

/** A dog's floppy ear, hanging from the top of its head, in the head's frame. */
function dogEar(g: Ctx, r: number, near: boolean, flap: number, coat: Coat): void {
  const root = near ? { x: -r * 0.35, y: -r * 0.78 } : { x: r * 0.3, y: -r * 0.86 };
  const swing = flap * 0.9;
  const tip = {
    x: root.x - r * (near ? 0.35 : 0.15) - swing * r * 0.5,
    y: root.y + r * (1.05 - swing * 0.5),
  };
  const path = new Path2D();
  path.moveTo(root.x - r * 0.28, root.y + 0.4);
  path.quadraticCurveTo(tip.x - r * 0.42, tip.y - r * 0.2, tip.x, tip.y);
  path.quadraticCurveTo(tip.x + r * 0.42, tip.y - r * 0.25, root.x + r * 0.3, root.y + 0.2);
  path.closePath();
  silhouette(g, [path], near ? coat.ear : coat.d, coat.edge);
}

function drawToy(g: Ctx, kind: PetKind, at: Vec, t: number): void {
  if (kind === 'cat') {
    // A ball of yarn, a loose end trailing.
    const ball = ellipsePath(at.x, at.y, 1.8, 1.8);
    silhouette(g, [ball], '#e86a8a', '#8f3550');
    g.strokeStyle = '#b84a68';
    g.lineWidth = 0.4;
    for (const a of [0.4, 1.3]) {
      g.beginPath();
      g.ellipse(at.x, at.y, 1.5, 0.7, a + t, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(at.x + 1.6, at.y + 0.6);
    g.quadraticCurveTo(at.x + 3.5, at.y + 1.8, at.x + 5, at.y + 1.4);
    g.stroke();
  } else {
    const ball = ellipsePath(at.x, at.y, 2, 2);
    silhouette(g, [ball], '#d8ec55', '#6f7d1b');
    g.strokeStyle = '#ffffff';
    g.lineWidth = 0.5;
    g.beginPath();
    g.arc(at.x - 2.2, at.y, 2.2, -0.9, 0.9);
    g.stroke();
  }
}

/** Draw a pose, facing +x, with the feet at the origin. */
export function drawPet(g: Ctx, kind: PetKind, pose: PetPose, id: string, clock: number): void {
  const b = BUILD[kind];
  const c = b.coat;
  const legShape = (leg: Leg): Path2D => capsule(leg.hip, leg.foot, b.legW);

  // The far legs, in the coat's shade, behind everything.
  silhouette(g, pose.legs.filter((l) => l.far).map(legShape), c.d, c.edge);
  if (pose.toy) {
    drawToy(g, kind, pose.toy, clock * 3);
  }
  // A far floppy ear hangs behind the head.
  g.save();
  g.translate(pose.head.x, pose.head.y);
  g.rotate(pose.head.tilt);
  if (kind === 'dog') {
    dogEar(g, b.head.r, false, pose.flap, c);
  }
  g.restore();

  // The body, tail and near legs as one silhouette.
  const body = ellipsePath(pose.body.x, pose.body.y, pose.body.rx, pose.body.ry, pose.body.tilt);
  const near = pose.legs.filter((l) => !l.far).map(legShape);
  silhouette(g, [tailShape(pose.tail, b.tailW), body, ...near], c.m, c.edge);
  // The pale belly and bib, and white socks on the cat.
  g.save();
  g.clip(body);
  g.fillStyle = c.belly;
  g.fill(
    ellipsePath(
      pose.body.x + pose.body.rx * 0.35,
      pose.body.y + pose.body.ry * 0.75,
      pose.body.rx * 0.75,
      pose.body.ry * 0.55,
      pose.body.tilt
    )
  );
  g.restore();
  if (kind === 'cat') {
    g.fillStyle = c.belly;
    for (const leg of pose.legs.filter((l) => !l.far)) {
      g.fill(ellipsePath(leg.foot.x, leg.foot.y - 0.3, b.legW * 0.5, b.legW * 0.42));
    }
  }
  if (kind === 'cat') {
    // Tabby stripes over the back.
    g.save();
    g.clip(body);
    g.strokeStyle = c.d;
    g.lineWidth = 0.9;
    g.lineCap = 'round';
    for (const dx of [-0.5, 0, 0.5]) {
      const x = pose.body.x + dx * pose.body.rx;
      const top = pose.body.y - pose.body.ry;
      g.beginPath();
      g.moveTo(x - 0.5, top - 0.5);
      g.quadraticCurveTo(x + 0.6, top + 1.4, x, top + 2.6);
      g.stroke();
    }
    g.restore();
  }

  // The head on top.
  g.save();
  g.translate(pose.head.x, pose.head.y);
  g.rotate(pose.head.tilt);
  drawHead(g, kind, pose, id, clock);
  if (kind === 'dog') {
    dogEar(g, b.head.r, true, pose.flap, c);
  }
  g.restore();

  if (pose.zzz) {
    g.fillStyle = c.edge;
    g.font = `700 5px Gaegu, "Comic Sans MS", cursive`;
    const rise = (clock * 0.6) % 1;
    g.globalAlpha = 1 - rise;
    g.fillText('z', pose.head.x + 3, pose.head.y - b.head.r - 1 - rise * 5);
    g.font = `700 4px Gaegu, "Comic Sans MS", cursive`;
    g.globalAlpha = Math.min(1, 1.6 - rise);
    g.fillText('z', pose.head.x + 6, pose.head.y - b.head.r - 5 - rise * 4);
    g.globalAlpha = 1;
  }
}

/** How tall each pet stands, and how much floor it takes, in tiles: see `PETS` in scale.ts. */
export function petHeight(kind: PetKind): number {
  const b = BUILD[kind];
  const ears = kind === 'cat' ? b.head.r * 1.42 : b.head.r * 0.95;
  return ((-b.head.y + ears) * b.scale) / 32;
}

export class PetRig {
  readonly view = new Container();

  private readonly canvas = document.createElement('canvas');
  private readonly sprite = new Sprite();
  private source: CanvasSource | null = null;
  private resolution = 0;

  constructor(private readonly kind: PetKind) {
    const s = BUILD[kind].scale;
    this.sprite.position.set(BOX.x0 * s, BOX.y0 * s);
    this.view.addChild(this.sprite);
  }

  private ensure(resolution: number): void {
    const res = Math.max(1, Math.min(4, Math.round(resolution * 4) / 4));
    if (res === this.resolution && this.source) {
      return;
    }
    const s = BUILD[this.kind].scale;
    this.resolution = res;
    this.canvas.width = Math.ceil((BOX.x1 - BOX.x0) * s * res);
    this.canvas.height = Math.ceil((BOX.y1 - BOX.y0) * s * res);
    const old = this.sprite.texture;
    this.source = new CanvasSource({ resource: this.canvas, resolution: res });
    this.sprite.texture = new Texture({ source: this.source });
    if (old && old !== Texture.EMPTY) {
      old.destroy(true);
    }
  }

  /**
   * Pose and draw one frame, facing `facing` along the screen. `travel` is
   * how far it has walked, in tiles (what its legs step by); `clock` the
   * frame clock in seconds, for blinks and the z's.
   */
  update(pet: PetView, facing: 1 | -1, travel: number, clock: number, resolution = 2): void {
    this.ensure(resolution);
    const s = BUILD[this.kind].scale;
    const g = this.canvas.getContext('2d') as Ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.resolution * s;
    g.setTransform(k * facing, 0, 0, k, (facing > 0 ? -BOX.x0 : BOX.x1) * k, -BOX.y0 * k);
    const pose = petPose(pet, pet.phase / 1000, travel);
    drawPet(g, this.kind, pose, pet.id, clock);
    this.source?.update();
  }

  destroy(): void {
    this.sprite.texture.destroy(true);
    this.view.destroy({ children: true });
  }
}
