import { Box3, INK, Iso, V2, V3 } from '../kit/iso';
import { ACCENT, MAT, Mat, PAL, SHEET, mix } from '../kit/palette';
import { FAN_FPS, FAN_FRAMES, fanBlades, fanHousing } from './fan';
import { Motion, ObjectPart, OfficeObject, PieceState, box3, frac } from './types';

/**
 * A server rack for the server floor: a tall steel cabinet a little taller
 * than the avatar, glass doors front and back. Behind the front glass, a
 * stack of servers, switches, storage shelves and a UPS, every one with its
 * lights; behind the back glass, the same machines' backs with their power
 * supplies, two power strips up the sides, and a great many cables looping
 * from every port into the bundle that climbs to the tray overhead. Two
 * exhaust fans in its roof.
 *
 * The machines in it are one of a few stocked layouts (`RACK_KINDS`), so a
 * row of racks reads as a real row, each different. Their lights blink and
 * the roof fans spin as `motions`, never in the body.
 *
 * Local frame: origin at the middle of its base, front door (+y) facing the
 * cold aisle.
 */

/** The rack's size in tiles: a touch taller than the avatar. */
export const RACK = { w: 0.8, d: 1.0, h: 2.05 } as const;

const HW = RACK.w / 2;
const HD = RACK.d / 2;
const H = RACK.h;
/** The plinth it stands on, and how far the door frame is inset from the shell's edge. */
const PLINTH = 0.07;
const FRAME = 0.05;
/** The machines' space: from just above the plinth to just under the roof. */
const Z0 = 0.14;
const Z1 = H - 0.11;
/** One rack unit, chibi-sized: eighteen of them fill the rack. */
const U = (Z1 - Z0) / 18;
/** The machines stand between the rails: this far in from each side. */
const MX = HW - 0.1;

/** What can go in a rack, and how many units each takes. */
const UNIT_SIZE = {
  server: 1,
  server2: 2,
  storage: 3,
  gpu: 4,
  switch: 1,
  patch: 1,
  manager: 1,
  kvm: 1,
  ups: 2,
  blank: 1,
} as const;

type UnitKind = keyof typeof UNIT_SIZE;

/** The stocked layouts, top to bottom; each fills the rack's eighteen units. */
const LAYOUTS = {
  compute: [
    'patch',
    'switch',
    'manager',
    'server',
    'server',
    'server',
    'server',
    'server2',
    'server',
    'server',
    'server2',
    'server2',
    'blank',
    'ups',
  ],
  storage: ['switch', 'manager', 'storage', 'storage', 'storage', 'server2', 'storage', 'ups'],
  network: [
    'patch',
    'manager',
    'switch',
    'switch',
    'manager',
    'patch',
    'manager',
    'switch',
    'switch',
    'blank',
    'server',
    'server',
    'server',
    'blank',
    'kvm',
    'blank',
    'ups',
  ],
  gpu: ['switch', 'manager', 'gpu', 'gpu', 'gpu', 'server2', 'ups'],
  mixed: [
    'patch',
    'switch',
    'server2',
    'server2',
    'storage',
    'server',
    'server',
    'server',
    'blank',
    'server2',
    'kvm',
    'ups',
  ],
  sparse: [
    'switch',
    'manager',
    'server',
    'server',
    'server2',
    'blank',
    'blank',
    'blank',
    'blank',
    'server2',
    'server',
    'blank',
    'blank',
    'kvm',
    'ups',
  ],
} satisfies Record<string, UnitKind[]>;

export type RackKind = keyof typeof LAYOUTS;
export const RACK_KINDS = Object.keys(LAYOUTS) as RackKind[];

/** How many units a layout fills: always the whole rack. */
export const rackUnits = (kind: RackKind): number =>
  LAYOUTS[kind].reduce((sum, unit) => sum + UNIT_SIZE[unit], 0);

/** How a light blinks: on, flickering with traffic, or slowly, to say it is alive. */
type Blink = 'steady' | 'flicker' | 'slow';

interface Light {
  at: V3;
  color: string;
  blink: Blink;
  /** Its own beat, so no two lights flicker together. */
  seed: number;
}

/** One machine in its slot, and where its face is. */
interface Slot {
  kind: UnitKind;
  z0: number;
  z1: number;
  /** Its place in the stack, from the top: varies its colour and its cables. */
  index: number;
}

/** A small deterministic hash in [0, 1). */
function hash(a: number, b = 0): number {
  let h = (Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function slotsOf(kind: RackKind): Slot[] {
  const out: Slot[] = [];
  let z = Z1;
  LAYOUTS[kind].forEach((unit, index) => {
    const h = UNIT_SIZE[unit] * U;
    out.push({ kind: unit, z0: z - h + 0.006, z1: z - 0.006, index });
    z -= h;
  });
  return out;
}

/** The faces of the machines, by kind; servers alternate cream and steel. */
function faceMat(slot: Slot, seed: number): Mat {
  switch (slot.kind) {
    case 'server':
    case 'server2':
      return (slot.index + seed) % 3 === 0 ? MAT.machine : MAT.alu;
    case 'storage':
      return MAT.graphite;
    case 'gpu':
      return MAT.graphite;
    case 'switch':
      return MAT.graphite;
    case 'patch':
      return MAT.alu;
    case 'manager':
      return MAT.rubber;
    case 'kvm':
      return MAT.graphite;
    case 'ups':
      return MAT.machine;
    case 'blank':
      return MAT.charcoal;
  }
}

const FRONT = HD;
const BACK = -HD;
/** A point on the front face, a hair proud of it. */
const fp = (x: number, z: number, lift = 0.004): V3 => [x, FRONT + lift, z];
/** A point on the back face, a hair proud of it (out toward -y). */
const bp = (x: number, z: number, lift = 0.004): V3 => [x, BACK - lift, z];

/** A rectangle on a face, from x0..x1 and z0..z1. */
function rect(
  on: (x: number, z: number, lift?: number) => V3,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  lift?: number
): V3[] {
  return [on(x0, z0, lift), on(x1, z0, lift), on(x1, z1, lift), on(x0, z1, lift)];
}

/** Every light on a rack's front, worked out once per layout. */
function lightsOf(kind: RackKind, seed: number): Light[] {
  const lights: Light[] = [];
  let n = 0;
  const add = (x: number, z: number, color: string, blink: Blink): void => {
    lights.push({ at: fp(x, z, 0.01), color, blink, seed: seed * 997 + n++ });
  };
  for (const slot of slotsOf(kind)) {
    const { z0, z1 } = slot;
    const zm = (z0 + z1) / 2;
    switch (slot.kind) {
      case 'server':
        add(-MX + 0.05, zm, ACCENT.ledGreen, 'steady');
        add(-MX + 0.09, zm, ACCENT.ledBlue, 'flicker');
        break;
      case 'server2':
        add(-MX + 0.05, z1 - 0.04, ACCENT.ledGreen, 'steady');
        for (let i = 0; i < 4; i++) {
          add(-MX + 0.2 + i * 0.12, z0 + 0.03, ACCENT.ledBlue, 'flicker');
        }
        break;
      case 'storage':
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 4; c++) {
            add(
              -MX + 0.1 + c * 0.13,
              z0 + 0.04 + r * U,
              hash(seed, r * 4 + c) < 0.08 ? PAL.gold : ACCENT.ledGreen,
              'flicker'
            );
          }
        }
        break;
      case 'switch':
        for (let i = 0; i < 8; i++) {
          add(
            -MX + 0.1 + i * 0.065,
            z1 - 0.018,
            i % 3 === 2 ? PAL.gold : ACCENT.ledGreen,
            'flicker'
          );
        }
        break;
      case 'gpu':
        add(MX - 0.06, z1 - 0.06, ACCENT.ledGreen, 'steady');
        add(MX - 0.1, z1 - 0.06, PAL.gold, 'slow');
        add(MX - 0.14, z1 - 0.06, ACCENT.ledBlue, 'flicker');
        break;
      case 'ups':
        for (let i = 0; i < 3; i++) {
          add(
            MX - 0.06 - i * 0.04,
            zm,
            i === 2 ? PAL.gold : ACCENT.ledGreen,
            i === 2 ? 'slow' : 'steady'
          );
        }
        break;
      case 'kvm':
        add(MX - 0.06, zm, ACCENT.ledBlue, 'slow');
        break;
      default:
        break;
    }
  }
  return lights;
}

/** Whether a light is lit at one still of its loop. */
export function lightOn(blink: Blink, seed: number, frame: number): boolean {
  switch (blink) {
    case 'steady':
      return true;
    case 'slow':
      return (frame + seed) % LIGHT_FRAMES < LIGHT_FRAMES / 2;
    case 'flicker':
      return hash(seed, frame) > 0.4;
  }
}

/** Stills per loop of a rack's lights, and how fast they play. */
export const LIGHT_FRAMES = 6;
const LIGHT_FPS = 5;

// ---- cables ----------------------------------------------------------------

/** The cables' colours: blue and yellow most, then the rest of the marker box. */
const CABLE_COLORS = [
  PAL.blue,
  PAL.blue,
  PAL.gold,
  PAL.gold,
  PAL.rose,
  PAL.sage,
  PAL.pink,
  '#a58ee0',
  '#f39a4c',
  '#7fd0e6',
];
const POWER_CORD = '#3a3633';

/**
 * A cable through local points, smoothed through their midpoints, drawn as a
 * coloured core inside a darker sleeve so every one reads in a tangle.
 */
export function cable(k: Iso, pts: V3[], color: string, width = 1.2): void {
  if (pts.length < 2) {
    return;
  }
  const s = pts.map((p) => k.P(p));
  const ctx = k.ctx;
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(s[0][0], s[0][1]);
    for (let i = 1; i < s.length - 1; i++) {
      const mx = (s[i][0] + s[i + 1][0]) / 2;
      const my = (s[i][1] + s[i + 1][1]) / 2;
      ctx.quadraticCurveTo(s[i][0], s[i][1], mx, my);
    }
    const last = s[s.length - 1];
    ctx.lineTo(last[0], last[1]);
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.strokeStyle = mix(color, SHEET.line, 0.6);
  ctx.lineWidth = (width + 0.9) * k.lineScale;
  ctx.stroke();
  path();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * k.lineScale;
  ctx.stroke();
  ctx.restore();
}

// ---- the glass doors -------------------------------------------------------

/** Which of a rack's two glass doors: the front, on the cold aisle, or the back, on the hot. */
export type RackSide = 'front' | 'back';
export const RACK_SIDES: readonly RackSide[] = ['front', 'back'];

/** How far a glass door swings open, in degrees: just past square, clear of the next rack's door. */
const DOOR_OPEN = 95;
/** A door's width, between the shell's frame, and how far proud of the face it hangs. */
const LEAF_W = 2 * (HW - FRAME);
const LEAF_LIFT = 0.02;
const LEAF_T = 0.015;

/**
 * Where a door hangs when it is `open` of the way open: its hinge on the
 * floor, the way along it from the hinge, and the way its outer face looks.
 * The front hinges at -x and the back at +x, each swinging out into its aisle.
 */
export function leafFrame(side: RackSide, open: number): { hinge: V2; along: V2; out: V2 } {
  const a = (DOOR_OPEN * Math.min(1, Math.max(0, open)) * Math.PI) / 180;
  const s = side === 'front' ? 1 : -1;
  const d0: V2 = [s, 0];
  const n0: V2 = [0, s];
  return {
    hinge: [-s * (HW - FRAME), s * (HD + LEAF_LIFT)],
    along: [d0[0] * Math.cos(a) + n0[0] * Math.sin(a), d0[1] * Math.cos(a) + n0[1] * Math.sin(a)],
    out: [n0[0] * Math.cos(a) - d0[0] * Math.sin(a), n0[1] * Math.cos(a) - d0[1] * Math.sin(a)],
  };
}

/** The box a door sorts by, `open` of the way open: always out in its aisle, off the rack. */
export function leafBox(side: RackSide, open: number): Box3 {
  const { hinge, along, out } = leafFrame(side, open);
  const pts: V2[] = [];
  for (const t of [0, LEAF_W]) {
    for (const o of [-LEAF_T, LEAF_T]) {
      pts.push([hinge[0] + along[0] * t + out[0] * o, hinge[1] + along[1] * t + out[1] * o]);
    }
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return box3(
    [Math.min(...xs), Math.min(...ys), PLINTH],
    [Math.max(...xs), Math.max(...ys), H - FRAME]
  );
}

/**
 * A glass door, `open` of the way open: a pale tinted pane, two streaks of
 * reflected light across it, and on the front a handle with its lock. Swung
 * open it shows its thin steel stiles, and the machines behind it bare.
 */
function glassDoor(k: Iso, side: RackSide, open: number): void {
  const { hinge, along, out } = leafFrame(side, open);
  const at = (t: number, z: number, o = 0): V3 => [
    hinge[0] + along[0] * t + out[0] * o,
    hinge[1] + along[1] * t + out[1] * o,
    z,
  ];
  const z0 = PLINTH + FRAME;
  const z1 = H - FRAME;
  const pane = [at(0, z0), at(LEAF_W, z0), at(LEAF_W, z1), at(0, z1)];
  k.fill(pane, MAT.glass.l, 0.2);
  // Two streaks of light, slanting up and across the glass.
  const streak = (a: number, w: number, alpha: number): void => {
    const lo = Math.max(0, a - 0.36);
    k.fill(
      [
        at(lo, z0 + 0.25, 0.001),
        at(Math.min(LEAF_W, lo + w), z0 + 0.25, 0.001),
        at(Math.min(LEAF_W, a + w), z1 - 0.2, 0.001),
        at(a, z1 - 0.2, 0.001),
      ],
      '#ffffff',
      alpha
    );
  };
  streak(0.22, 0.14, 0.32);
  streak(0.44, 0.05, 0.24);
  k.line(pane, INK.detail, true, mix(MAT.glass.d, SHEET.line, 0.4));
  if (open > 0.01) {
    // Its stiles, which only show once it stands off the face.
    for (const t of [0, LEAF_W]) {
      k.line([at(t, z0), at(t, z1)], 1.6, false, SHELL.m);
    }
  }
  if (side === 'front') {
    const t = LEAF_W - 0.035;
    const handle = [
      at(t - 0.016, 0.88, 0.015),
      at(t + 0.016, 0.88, 0.015),
      at(t + 0.016, 1.26, 0.015),
      at(t - 0.016, 1.26, 0.015),
    ];
    k.lit(handle, [out[0], out[1], 0], MAT.alu);
    k.line(handle, INK.detail, true);
    k.dot(at(t, 1.33, 0.01), 1.3, MAT.brass.m, INK.hair);
  }
}

/** How far open a rack's door is drawn, from its state: shut unless set. */
export const doorOpen = (state: PieceState | undefined, side: RackSide): number =>
  frac(state, side, 0);

// ---- the front ---------------------------------------------------------------

/** The dark well behind a door, and the two rails the machines hang on. */
function well(k: Iso, on: (x: number, z: number, lift?: number) => V3): void {
  const inner = rect(on, -HW + FRAME, PLINTH + FRAME, HW - FRAME, H - FRAME, 0.001);
  k.fill(inner, mix(MAT.graphite.d, '#000000', 0.3));
  k.line(inner, INK.detail, true);
  for (const s of [-1, 1]) {
    const x = s * (HW - 0.075);
    const rail = rect(on, x - 0.017, Z0 - 0.04, x + 0.017, Z1 + 0.03, 0.002);
    k.fill(rail, MAT.alu.d);
    for (let z = Z0; z < Z1; z += U / 2) {
      k.dot(on(x, z + U / 4, 0.003), 0.45, MAT.graphite.d);
    }
  }
}

/** One machine's face, with the detail its kind has. */
function machineFront(k: Iso, slot: Slot, seed: number): void {
  const { z0, z1 } = slot;
  const m = faceMat(slot, seed);
  const face = rect(fp, -MX, z0, MX, z1);
  k.lit(face, [0, 1, 0], m);
  k.line(face, INK.hair, true);
  const dark = mix(m.d, '#000000', 0.35);
  const zm = (z0 + z1) / 2;
  const socket = (x: number, z: number): void =>
    k.dot(fp(x, z, 0.008), 0.9, mix(dark, '#000000', 0.2));
  switch (slot.kind) {
    case 'server': {
      socket(-MX + 0.05, zm);
      socket(-MX + 0.09, zm);
      // Vent slots, then four little drive slots.
      for (let i = 0; i < 6; i++) {
        const x = -0.12 + i * 0.03;
        k.line([fp(x, z0 + 0.025), fp(x, z1 - 0.025)], 0.55, false, dark);
      }
      for (let i = 0; i < 3; i++) {
        k.shape(rect(fp, 0.1 + i * 0.07, z0 + 0.02, 0.16 + i * 0.07, z1 - 0.02, 0.006), dark, 0.4);
      }
      break;
    }
    case 'server2': {
      socket(-MX + 0.05, z1 - 0.04);
      for (let i = 0; i < 4; i++) {
        const x = -MX + 0.14 + i * 0.12;
        const bay = rect(fp, x, z0 + 0.015, x + 0.105, z1 - 0.015, 0.006);
        k.shape(bay, mix(m.m, '#000000', 0.12), 0.5);
        k.line([fp(x + 0.015, z1 - 0.05, 0.007), fp(x + 0.09, z1 - 0.05, 0.007)], 0.5, false, dark);
        socket(x + 0.06, z0 + 0.03);
      }
      break;
    }
    case 'storage': {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const x = -MX + 0.035 + c * 0.13;
          const z = z0 + 0.012 + r * U;
          const caddy = rect(fp, x, z, x + 0.12, z + U - 0.012, 0.006);
          k.shape(caddy, (r + c) % 2 === 0 ? MAT.machine.m : MAT.machine.l, 0.45);
          socket(x + 0.065, z + 0.04 - 0.012);
        }
      }
      break;
    }
    case 'gpu': {
      // A big honeycomb vent, an accent stripe and a badge.
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 9; c++) {
          const x = -MX + 0.05 + c * 0.05 + (r % 2) * 0.025;
          k.dot(fp(x, z0 + 0.05 + r * 0.045, 0.007), 0.7, mix(m.d, '#000000', 0.45));
        }
      }
      const stripe = rect(fp, -MX, z1 - 0.035, MX, z1 - 0.012, 0.006);
      k.fill(stripe, slot.index % 2 === 0 ? MAT.mint.m : MAT.tomato.m);
      k.shape(rect(fp, MX - 0.17, z0 + 0.08, MX - 0.04, z0 + 0.15, 0.007), MAT.alu.l, 0.4);
      k.text(fp(MX - 0.105, z0 + 0.095, 0.009), [1, 0, 0], [0, 0, 1], 'GPU', 0.05 * k.unit, {
        color: SHEET.ink,
        weight: '800',
      });
      for (let i = 0; i < 3; i++) {
        socket(MX - 0.06 - i * 0.04, z1 - 0.06);
      }
      break;
    }
    case 'switch': {
      // Two rows of ports, their lights above them, and a few patch leads.
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 12; i++) {
          const x = -MX + 0.07 + i * 0.044;
          const z = z0 + 0.016 + row * 0.03;
          k.fill(rect(fp, x, z, x + 0.03, z + 0.022, 0.006), mix(m.d, '#000000', 0.5));
        }
      }
      for (let i = 0; i < 8; i++) {
        socket(-MX + 0.1 + i * 0.065, z1 - 0.018);
      }
      break;
    }
    case 'patch': {
      for (let i = 0; i < 12; i++) {
        const x = -MX + 0.07 + i * 0.044;
        k.fill(rect(fp, x, z0 + 0.025, x + 0.03, z1 - 0.025, 0.006), MAT.graphite.d);
      }
      break;
    }
    case 'manager': {
      // A comb of fingers the patch leads are tucked behind.
      for (let i = 0; i <= 8; i++) {
        const x = -MX + 0.03 + i * 0.075;
        k.fill(rect(fp, x, z0 + 0.01, x + 0.022, z1 - 0.01, 0.006), mix(m.l, '#ffffff', 0.1));
      }
      break;
    }
    case 'kvm': {
      // A pull-out console drawer: a lip and a finger pull.
      k.line(
        [fp(-MX + 0.02, z1 - 0.025), fp(MX - 0.02, z1 - 0.025)],
        0.6,
        false,
        mix(m.l, '#ffffff', 0.3)
      );
      k.shape(rect(fp, -0.08, z0 + 0.02, 0.08, z0 + 0.045, 0.007), MAT.alu.m, 0.4);
      socket(MX - 0.06, zm);
      break;
    }
    case 'ups': {
      // A little lit panel with a battery gauge, and vents.
      const lcd = rect(fp, -MX + 0.05, z0 + 0.06, -MX + 0.25, z1 - 0.05, 0.007);
      k.shape(lcd, ACCENT.lcd, 0.5);
      for (let i = 0; i < 4; i++) {
        k.fill(
          rect(fp, -MX + 0.07 + i * 0.04, z0 + 0.08, -MX + 0.1 + i * 0.04, z1 - 0.07, 0.008),
          mix(ACCENT.lcd, '#1d4a40', 0.7)
        );
      }
      for (let i = 0; i < 5; i++) {
        const x = 0.02 + i * 0.035;
        k.line([fp(x, z0 + 0.04), fp(x, z1 - 0.04)], 0.55, false, mix(m.d, '#000000', 0.2));
      }
      for (let i = 0; i < 3; i++) {
        socket(MX - 0.06 - i * 0.04, zm);
      }
      break;
    }
    case 'blank': {
      k.dot(fp(-MX + 0.04, zm, 0.006), 0.6, m.d);
      k.dot(fp(MX - 0.04, zm, 0.006), 0.6, m.d);
      break;
    }
  }
}

/** Short patch leads looping from the switches and patch panels into the comb. */
function patchLeads(k: Iso, slots: Slot[], seed: number): void {
  for (const slot of slots) {
    if (slot.kind !== 'switch' && slot.kind !== 'patch') {
      continue;
    }
    const z = slot.kind === 'switch' ? slot.z0 + 0.03 : (slot.z0 + slot.z1) / 2;
    for (let i = 0; i < 12; i++) {
      if (hash(seed * 31 + slot.index, i) < 0.35) {
        continue;
      }
      const x = -MX + 0.085 + i * 0.044;
      const color = CABLE_COLORS[Math.floor(hash(seed + slot.index, i * 7) * CABLE_COLORS.length)];
      const side = i < 6 ? -1 : 1;
      const sag = 0.05 + hash(i, seed) * 0.06;
      cable(
        k,
        [
          fp(x, z, 0.012),
          fp(x, z - sag, 0.03),
          fp(side * (MX - 0.01), z - sag * 0.7, 0.025),
          fp(side * (HW - 0.07), z - 0.02, 0.02),
        ],
        color,
        0.75
      );
    }
  }
}

// ---- the back ----------------------------------------------------------------

/** Where the side bundle climbs the back: inside the left rail, seen from behind. */
const BUNDLE_X = HW - 0.13;

/** One machine's back: a plate, a power supply and its cord, and the ports its cables leave from. */
function machineBack(k: Iso, slot: Slot, seed: number): V3[] {
  const { z0, z1 } = slot;
  const zm = (z0 + z1) / 2;
  const plate = rect(bp, -MX, z0, MX, z1);
  const m = slot.kind === 'blank' ? MAT.charcoal : MAT.graphite;
  k.lit(plate, [0, -1, 0], m);
  k.line(plate, INK.hair, true);
  if (slot.kind === 'blank' || slot.kind === 'manager') {
    return [];
  }
  // The power supply, on the side nearer the right-hand power strip.
  const psu = rect(bp, -MX + 0.02, z0 + 0.012, -MX + 0.16, z1 - 0.012, 0.006);
  k.shape(psu, MAT.graphite.l, 0.45);
  k.dot(
    bp(-MX + 0.06, zm, 0.008),
    Math.min(1.4, (z1 - z0) * 9),
    mix(MAT.graphite.d, '#000000', 0.4)
  );
  cable(
    k,
    [bp(-MX + 0.12, zm, 0.012), bp(-MX + 0.1, zm - 0.06, 0.03), bp(-HW + 0.07, zm - 0.03, 0.02)],
    POWER_CORD,
    1
  );
  // The ports, where the data cables leave from.
  const ports: V3[] = [];
  const count =
    slot.kind === 'patch' || slot.kind === 'switch' ? 6 : slot.kind === 'storage' ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const x = -0.02 + i * (0.3 / count);
    const z = slot.kind === 'storage' ? z0 + 0.05 + i * U : zm;
    k.fill(rect(bp, x, z - 0.015, x + 0.03, z + 0.015, 0.006), mix(MAT.graphite.d, '#000000', 0.5));
    ports.push(bp(x + 0.015, z, 0.01));
  }
  void seed;
  return ports;
}

/**
 * The back of the rack, behind its glass: every machine's back, two power
 * strips up the sides, and cables from every port sagging across into the
 * bundle that climbs the left of the rack to the roof.
 */
function rackBack(k: Iso, kind: RackKind, seed: number): void {
  well(k, bp);
  // Two power strips up the sides, sockets lit by a little readout.
  for (const s of [-1, 1]) {
    const x = s * (HW - 0.075);
    const strip = rect(bp, x - 0.022, Z0, x + 0.022, Z1, 0.004);
    k.lit(strip, [0, -1, 0], s < 0 ? MAT.tomato : MAT.graphite);
    k.line(strip, INK.hair, true);
    for (let z = Z0 + 0.08; z < Z1 - 0.1; z += 0.12) {
      k.dot(bp(x, z, 0.006), 0.7, MAT.graphite.d);
    }
    k.fill(rect(bp, x - 0.014, Z1 - 0.09, x + 0.014, Z1 - 0.04, 0.007), ACCENT.lcd);
  }
  const slots = slotsOf(kind);
  const ports: V3[] = [];
  for (const slot of slots) {
    ports.push(...machineBack(k, slot, seed));
  }
  // Every cable sags from its port across to the bundle, then joins it.
  const bottom = ports.reduce((lo, p) => Math.min(lo, p[2]), Z1);
  ports.forEach((p, i) => {
    const color = CABLE_COLORS[Math.floor(hash(seed * 13 + i, 3) * CABLE_COLORS.length)];
    const sag = 0.06 + hash(seed, i * 5) * 0.14;
    const into = BUNDLE_X - 0.04 + hash(i, seed * 3) * 0.06;
    cable(
      k,
      [
        p,
        [p[0], p[1] - 0.02, p[2] - sag * 0.6],
        [(p[0] + into) / 2, BACK - 0.05, p[2] - sag],
        [into, BACK - 0.04, p[2] - sag * 0.3],
        [into, BACK - 0.04, p[2] + 0.05],
      ],
      color,
      0.85
    );
  });
  // The bundle itself: a fat rope of every colour, climbing to the roof.
  for (let i = 0; i < 7; i++) {
    const x = BUNDLE_X - 0.045 + i * 0.015;
    const wave = (z: number): number => Math.sin(z * 9 + i) * 0.006;
    const pts: V3[] = [];
    for (let z = bottom; z <= H - FRAME + 0.001; z += 0.2) {
      pts.push([x + wave(z), BACK - 0.045, z]);
    }
    pts.push([x, BACK - 0.045, H - FRAME]);
    cable(k, pts, CABLE_COLORS[i % CABLE_COLORS.length], 1);
  }
  // Cable ties round the bundle.
  for (let z = bottom + 0.15; z < H - 0.2; z += 0.32) {
    k.line(
      [bp(BUNDLE_X - 0.055, z, 0.05), bp(BUNDLE_X + 0.06, z + 0.01, 0.05)],
      0.9,
      false,
      SHEET.paper
    );
  }
}

// ---- the rack ------------------------------------------------------------------

/** The rack's steel: a warm dark graphite, soft enough to sit on the cream sheet. */
const SHELL: Mat = { l: '#6a6a70', m: '#4e4f56', d: '#34353b' };

/** The two roof fans' centres. */
const ROOF_FANS: V3[] = [
  [-0.17, HD - 0.27, H],
  [0.17, HD - 0.27, H],
];
const ROOF_FAN_R = 0.14;

/** The rack's own box, without its doors. */
const BODY: Box3 = box3([-HW, -HD, 0], [HW, HD, H]);

/** A rack's sorted parts as its doors stand. */
export function rackParts(state: PieceState | undefined): ObjectPart[] {
  return [
    { name: 'body', footprint: BODY },
    ...RACK_SIDES.map((side) => ({ name: side, footprint: leafBox(side, doorOpen(state, side)) })),
  ];
}

function rack(kind: RackKind, seed: number): OfficeObject {
  const slots = slotsOf(kind);
  const lights = lightsOf(kind, seed);
  const motions: Motion[] = [
    {
      frames: LIGHT_FRAMES,
      fps: LIGHT_FPS,
      draw(k, frame) {
        if (!k.facing([0, 1, 0])) {
          return;
        }
        const ctx = k.ctx;
        for (const light of lights) {
          if (!lightOn(light.blink, light.seed, frame)) {
            continue;
          }
          const outer = ctx.globalAlpha;
          ctx.globalAlpha = outer * 0.3;
          k.dot(light.at, 2.1, light.color);
          ctx.globalAlpha = outer;
          k.dot(light.at, 0.95, mix(light.color, '#ffffff', 0.35));
        }
      },
    },
    {
      frames: FAN_FRAMES,
      fps: FAN_FPS,
      draw(k, frame) {
        for (const c of ROOF_FANS) {
          fanBlades(k, [c[0], c[1], c[2] + 0.004], '+z', ROOF_FAN_R, frame);
        }
      },
    },
  ];
  return {
    name: 'Server rack',
    blurb: `A ${kind} rack: machines behind the front glass, a tangle of cables behind the back, fans in the roof.`,
    // Wide enough for both doors swung all the way open.
    bounds: box3([-HW - 0.08, -HD - LEAF_W - 0.06, 0], [HW + 0.08, HD + LEAF_W + 0.06, H + 0.03]),
    footprint: BODY,
    // The body, and each glass door on its own: swung open, a door stands out
    // in the aisle, where it sorts by itself.
    partsOf: (state) => rackParts(state),
    motions,

    shadow(k) {
      k.castShadow(Iso.corners([-HW, -HD, 0], [HW, HD, H]));
    },

    draw(k, state) {
      k.sorted((add) => {
        add(
          BODY,
          () => {
            // Feet and a plinth, then the steel shell over them.
            k.box([-HW + 0.03, -HD + 0.03, 0], [HW - 0.03, HD - 0.03, PLINTH], MAT.graphite, {
              ink: INK.detail,
              rim: false,
            });
            k.box([-HW, -HD, PLINTH], [HW, HD, H], SHELL, {
              ink: INK.silhouette,
              decorate: {
                '+y': () => {
                  well(k, fp);
                  for (const slot of slots) {
                    machineFront(k, slot, seed);
                  }
                  patchLeads(k, slots, seed);
                  for (const light of lights) {
                    k.dot(light.at, 0.95, mix(light.color, '#000000', 0.55));
                  }
                  // The rack's number plate over the door.
                  k.shape(rect(fp, -0.12, H - 0.045, 0.12, H - 0.008, 0.006), PAL.cream, 0.4);
                  k.line(
                    [fp(-0.08, H - 0.027, 0.008), fp(0.04 + (seed % 3) * 0.02, H - 0.027, 0.008)],
                    0.5,
                    false,
                    SHEET.lead
                  );
                },
                '-y': () => rackBack(k, kind, seed),
                '+x': () => sidePanel(k, 1),
                '-x': () => sidePanel(k, -1),
                '+z': () => roof(k),
              },
            });
          },
          'body'
        );
        for (const side of RACK_SIDES) {
          const open = doorOpen(state, side);
          add(leafBox(side, open), () => glassDoor(k, side, open), side);
        }
      });
    },
  };
}

/** A side panel: two pressed panels and a grille of vents near the top. */
function sidePanel(k: Iso, s: 1 | -1): void {
  const x = s * HW + s * 0.003;
  const n: V3 = [s, 0, 0];
  for (const [z0, z1] of [
    [PLINTH + 0.08, 0.98],
    [1.06, H - 0.08],
  ]) {
    k.line(
      [
        [x, -HD + 0.08, z0],
        [x, HD - 0.08, z0],
        [x, HD - 0.08, z1],
        [x, -HD + 0.08, z1],
      ],
      INK.hair,
      true,
      mix(SHELL.d, '#000000', 0.25)
    );
  }
  for (let i = 0; i < 5; i++) {
    const z = H - 0.2 - i * 0.05;
    k.line(
      [
        [x, -0.25, z],
        [x, 0.25, z],
      ],
      1,
      false,
      mix(k.tone(n, SHELL), '#000000', 0.35)
    );
  }
}

/** The roof: a vent grille, the two fans' housings, and the brush the cables drop through. */
function roof(k: Iso): void {
  const top = (x: number, y: number): V3 => [x, y, H + 0.002];
  for (let i = 0; i < 6; i++) {
    const y = -0.05 + i * 0.045;
    k.line([top(-0.3, y), top(0.3, y)], 0.6, false, mix(SHELL.d, '#000000', 0.2));
  }
  for (const c of ROOF_FANS) {
    fanHousing(k, c, '+z', ROOF_FAN_R, SHELL);
  }
  const brush: V3[] = [
    top(-0.26, -HD + 0.07),
    top(0.26, -HD + 0.07),
    top(0.26, -HD + 0.19),
    top(-0.26, -HD + 0.19),
  ];
  k.shape(brush, MAT.graphite.d, INK.detail);
  for (let i = 0; i < 14; i++) {
    const x = -0.24 + i * 0.037;
    k.line([top(x, -HD + 0.08), top(x + 0.01, -HD + 0.18)], 0.4, false, MAT.graphite.l);
  }
}

/** Every stocked rack, by kind, each with its own seed for its cables and lights. */
export const RACKS: Record<RackKind, OfficeObject> = Object.fromEntries(
  RACK_KINDS.map((kind, i) => [kind, rack(kind, i + 1)])
) as Record<RackKind, OfficeObject>;
