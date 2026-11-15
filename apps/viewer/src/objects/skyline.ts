import { FONT, Iso, V3, ellipse, lift, plane } from '../kit/iso';
import { mix } from '../kit/palette';
import { NOON, SUNSET, Sky } from '../sky';

/**
 * San Francisco, seen through the window bands. Each glazed wall looks out on
 * its own panorama, laid out in `u`: tiles along the wall, left to right as
 * someone inside looking out sees it, anchored to the world rather than to a
 * segment, so the city runs on unbroken behind a whole band of windows.
 * Heights are the window's own local z (the sill is at 0.45, the transom at
 * 2.15). Everything is drawn flat on the glass plane, a postcard behind it.
 *
 * - The long back wall (home view, left): the Golden Gate over the water,
 *   Telegraph Hill and Coit Tower, then downtown — the Transamerica Pyramid,
 *   Salesforce Tower, 181 Fremont — and the Bay Bridge setting off.
 * - The front wall: the Ferry Building, and the Bay Bridge across the bay.
 * - The right wall: Twin Peaks and Sutro Tower, and the Painted Ladies with
 *   downtown small behind them.
 */

/** One wall's view: draw the stretch the pen can see. */
type Panorama = (s: Sketch) => void;

const C = {
  water: '#3f86ba',
  waterFar: '#79b6da',
  ripple: '#a9d4ec',
  hillFar: '#9db8b4',
  hill: '#7fa972',
  hillLit: '#9cc085',
  hillDry: '#b7b07a',
  orange: '#c8452d',
  orangeDark: '#97321f',
  steel: '#a7b2bf',
  steelDark: '#76838f',
  haze: '#b9cadb',
  edge: '#53657c',
  cream: '#f1e9d6',
  creamShade: '#d8ccb2',
  pyramid: '#f4f1ea',
  pyramidShade: '#d6d3cc',
  salesforce: '#cfd8df',
  salesforceShade: '#a9b6c2',
  dark: '#4f4648',
  glass: '#8fb0cf',
  sand: '#e2d3b8',
  stone: '#c9c2b5',
  sutro: '#d34b3c',
  white: '#ffffff',
} as const;

/** The warm light in a window at night. */
const LIT = '#ffd77a';

/** Pastel houses, the city's own paint box. */
const HOUSES = ['#f2b8b0', '#bfe0c9', '#f5dd9a', '#c9b8e0', '#a9cbe8', '#f6c79e', '#f0efe6'];

/** A cheap deterministic hash in [0, 1): no ambient randomness in a renderer. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A pen on one window's glass, in panorama coordinates. */
export class Sketch {
  constructor(
    readonly k: Iso,
    /** The glass plane's depth. */
    readonly y: number,
    /** The panorama coordinate at the segment's local x = 0. */
    readonly u0: number,
    /** The panorama coordinates the glass shows. */
    readonly lo: number,
    readonly hi: number,
    /** The sky it is drawn under: the light, and the weather. */
    readonly sky: Sky = NOON
  ) {
    const night = 1 - sky.day;
    this.lit = Math.max(0, Math.min(1, (night - 0.15) / 0.6));
    const gloom = Math.max(0, (sky.cloud - 0.5) / 0.5) * 0.3 + sky.rain * 0.12;
    this.tone = (c: string): string => {
      let out = mix(c, '#1c2747', 0.7 * night);
      out = mix(out, '#c47a6c', 0.2 * sky.dusk);
      return mix(out, '#8d97a4', gloom * sky.day);
    };
  }

  /** How strongly the city's lights are on, 0 by day to 1 at night. */
  readonly lit: number;
  /** A colour as the light outside leaves it: darker at night, warmer at dusk, greyer under cloud. */
  private readonly tone: (c: string) => string;
  private readonly tones = new Map<string, string>();

  /** A colour in this sky's light. */
  tint(c: string): string {
    let out = this.tones.get(c);
    if (out === undefined) {
      out = this.tone(c);
      this.tones.set(c, out);
    }
    return out;
  }

  /** Whether any of [a, b] shows through this glass. */
  sees(a: number, b: number): boolean {
    return b >= this.lo && a <= this.hi;
  }

  private at(u: number, z: number, lift = 0): V3 {
    return [u - this.u0, this.y + lift, z];
  }

  /** Fill an outline; `glow` keeps its colour as given, for a light that shines at night. */
  poly(pts: Array<[number, number]>, color: string, alpha = 1, glow = false): void {
    const us = pts.map((p) => p[0]);
    if (!this.sees(Math.min(...us), Math.max(...us))) {
      return;
    }
    this.k.fill(
      pts.map(([u, z]) => this.at(u, z)),
      glow ? color : this.tint(color),
      alpha
    );
  }

  rect(
    u0: number,
    u1: number,
    z0: number,
    z1: number,
    color: string,
    alpha = 1,
    glow = false
  ): void {
    this.poly(
      [
        [u0, z0],
        [u1, z0],
        [u1, z1],
        [u0, z1],
      ],
      color,
      alpha,
      glow
    );
  }

  line(pts: Array<[number, number]>, width: number, color: string, glow = false): void {
    const us = pts.map((p) => p[0]);
    if (!this.sees(Math.min(...us), Math.max(...us))) {
      return;
    }
    this.k.line(
      pts.map(([u, z]) => this.at(u, z, 0.0002)),
      width,
      false,
      glow ? color : this.tint(color)
    );
  }

  /** A small round light, drawn as a dot at night. */
  light(u: number, z: number, r: number, color: string, alpha = 1): void {
    if (!this.sees(u - r, u + r) || alpha <= 0.01) {
      return;
    }
    this.k.fill(
      lift(plane.y(this.y + 0.0003), ellipse(u - this.u0, z, r, r, 10)),
      color,
      Math.min(1, alpha)
    );
  }

  /** Lit windows scattered over a block, at night. */
  windows(a: number, b: number, z0: number, z1: number, seed: number, odds = 0.45): void {
    if (this.lit <= 0.02 || !this.sees(a, b)) {
      return;
    }
    let row = 0;
    for (let z = z0 + 0.04; z < z1 - 0.04; z += 0.07, row++) {
      let col = 0;
      for (let u = a + 0.03; u < b - 0.04; u += 0.055, col++) {
        if (hash(seed * 7.3 + row * 13.1 + col * 3.7) < odds) {
          this.rect(u, u + 0.028, z, z + 0.035, LIT, this.lit * 0.95, true);
        }
      }
    }
  }

  /** A puff of cloud, made of a few overlapping ellipses. */
  cloud(u: number, z: number, r: number, color: string, alpha: number): void {
    if (!this.sees(u - r * 3, u + r * 3)) {
      return;
    }
    for (const [du, dz, f] of [
      [-r * 1.3, -r * 0.2, 0.75],
      [0, 0, 1],
      [r * 1.2, -r * 0.25, 0.7],
    ]) {
      this.k.fill(
        lift(plane.y(this.y), ellipse(u + du - this.u0, z + dz, r * f * 1.6, r * f, 14)),
        color,
        alpha
      );
    }
  }

  /** Lettering on the view, `size` tiles tall, centred on `u`. */
  text(
    u: number,
    z: number,
    size: number,
    str: string,
    color: string,
    font: string = FONT.mono
  ): void {
    if (!this.sees(u - 0.6, u + 0.6) || !this.k.ctx.fillText) {
      return;
    }
    this.k.text([u - this.u0, this.y + 0.0004, z], [1, 0, 0], [0, 0, 1], str, size * this.k.unit, {
      color,
      font,
      weight: '800',
      align: 'center',
    });
  }

  /** A line traced round a closed outline, to pick a landmark out. */
  outline(pts: Array<[number, number]>, color: string = C.edge, width = 0.55): void {
    this.line([...pts, pts[0]], width, color);
  }
}

// ---- pieces of the city -----------------------------------------------------

const SILL = 0.45;
/** Where the bay meets the far shore. */
const HORIZON = 0.74;

/** The bay, from the sill up to the far shore, with a few glints on it. */
function bay(s: Sketch, from: number, to: number): void {
  s.rect(from, to, SILL, HORIZON, C.water);
  s.rect(from, to, HORIZON - 0.08, HORIZON, C.waterFar, 0.7);
  for (let i = Math.floor(from * 4); i < to * 4; i++) {
    const u = i / 4 + hash(i) * 0.2;
    const z = SILL + 0.04 + hash(i + 0.5) * (HORIZON - SILL - 0.1);
    s.line(
      [
        [u, z],
        [u + 0.08 + hash(i + 0.25) * 0.08, z],
      ],
      0.6,
      C.ripple
    );
  }
}

/** A hill: a smooth ridge through the given crests, down to `base` at both ends. */
function hill(
  s: Sketch,
  from: number,
  to: number,
  crests: Array<[number, number]>,
  color: string,
  base = SILL
): (u: number) => number {
  const height = (u: number): number => {
    let h = base;
    for (const [cu, cz] of crests) {
      const reach = Math.max(0.6, (to - from) / (crests.length + 1));
      const t = Math.max(0, 1 - ((u - cu) / reach) ** 2);
      h = Math.max(h, base + (cz - base) * t);
    }
    return h;
  };
  if (s.sees(from, to)) {
    const pts: Array<[number, number]> = [[from, base]];
    for (let u = from; u <= to + 1e-6; u += 0.1) {
      pts.push([u, height(u)]);
    }
    pts.push([to, base]);
    s.poly(pts, color);
  }
  return height;
}

/** A plain tower, with floors banded across it. */
function tower(
  s: Sketch,
  centre: number,
  width: number,
  top: number,
  color: string,
  base = SILL,
  bands = true
): void {
  const [a, b] = [centre - width / 2, centre + width / 2];
  if (!s.sees(a, b)) {
    return;
  }
  s.rect(a, b, base, top, color);
  // The shaded side, turned from the light.
  s.rect(b - width * 0.3, b, base, top, mix(color, '#2c3e55', 0.16));
  s.windows(a, b, base, top, centre * 31 + top);
  if (bands && s.lit < 0.5) {
    for (let z = base + 0.07; z < top - 0.03; z += 0.07) {
      s.line(
        [
          [a + 0.02, z],
          [b - 0.02, z],
        ],
        0.45,
        mix(color, '#ffffff', 0.45)
      );
    }
  }
}

/** A distant row of low blocks, washed out by the haze. */
function haze(s: Sketch, from: number, to: number, seed: number, lo: number, hi: number): void {
  let u = from;
  let i = 0;
  while (u < to) {
    const w = 0.18 + hash(seed + i) * 0.22;
    const h = lo + hash(seed + i + 0.37) * (hi - lo);
    s.rect(u, Math.min(to, u + w), SILL, h, mix(C.haze, '#ffffff', hash(seed + i + 0.71) * 0.25));
    s.windows(u, Math.min(to, u + w), SILL, h, seed * 3 + i, 0.3);
    u += w;
    i++;
  }
}

/** Little pastel houses climbing a hill. */
function houses(
  s: Sketch,
  from: number,
  to: number,
  ground: (u: number) => number,
  seed: number
): void {
  let u = from;
  let i = 0;
  while (u < to) {
    const w = 0.08 + hash(seed + i) * 0.05;
    const z = ground(u + w / 2) - 0.03;
    const h = 0.06 + hash(seed + i + 0.4) * 0.05;
    if (z > SILL + 0.02) {
      const paint = HOUSES[Math.floor(hash(seed + i + 0.8) * HOUSES.length)];
      // Muted by distance, and gaps for the trees between them.
      if (hash(seed + i + 0.15) > 0.3) {
        s.rect(u, u + w, Math.max(SILL, z - 0.06), z + h, mix(paint, '#cfc8b6', 0.35));
        if (hash(seed + i + 0.55) > 0.45) {
          s.light(u + w / 2, z + h / 2, 0.014, LIT, s.lit * 0.9);
        }
      }
    }
    u += w + 0.015;
    i++;
  }
}

/**
 * A suspension span: towers at `towers`, the deck at `deck`, the main cable
 * slung between the tower tops and down to the anchorages at `ends`.
 */
function suspension(
  s: Sketch,
  ends: [number, number],
  towers: number[],
  deck: number,
  top: number,
  paint: { body: string; shade: string; cable: string; lights: string },
  water = SILL
): void {
  if (!s.sees(ends[0] - 0.1, ends[1] + 0.1)) {
    return;
  }
  const sag = deck + 0.05;
  const anchors = [ends[0], ...towers, ends[1]];
  // The cable, span by span: a parabola from top to top, or down to an anchorage.
  const cable: Array<[number, number]> = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [a, b] = [anchors[i], anchors[i + 1]];
    const za = i === 0 ? deck : top - 0.03;
    const zb = i === anchors.length - 2 ? deck : top - 0.03;
    const low = i === 0 || i === anchors.length - 2 ? null : sag;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const u = a + (b - a) * t;
      let z: number;
      if (low === null) {
        // A side span: slung a little below the straight run to its anchorage.
        z = za + (zb - za) * t - 0.12 * t * (1 - t) * (top - deck);
      } else {
        z = low + (za - low) * (1 - 2 * t) ** 2;
      }
      cable.push([u, z]);
    }
  }
  // Suspenders, hung from the cable to the deck.
  for (let i = 0; i < cable.length - 1; i += 2) {
    const [u, z] = cable[i];
    if (z > deck + 0.03) {
      s.line(
        [
          [u, z],
          [u, deck],
        ],
        0.35,
        paint.cable
      );
    }
  }
  s.line(cable, 0.9, paint.cable);
  // The deck, a ribbon with its truss under it.
  s.rect(ends[0], ends[1], deck - 0.035, deck, paint.body);
  s.rect(ends[0], ends[1], deck - 0.045, deck - 0.035, paint.shade);
  // The towers: two legs and their portal braces.
  for (const t of towers) {
    for (const leg of [-0.055, 0.03]) {
      s.rect(t + leg, t + leg + 0.035, water, top, paint.body);
      s.rect(t + leg + 0.022, t + leg + 0.035, water, top, paint.shade);
    }
    for (let z = deck + 0.12; z < top; z += (top - deck - 0.12) / 3) {
      s.rect(t - 0.03, t + 0.035, z, z + 0.02, paint.body);
    }
    s.rect(t - 0.06, t + 0.07, top - 0.02, top + 0.01, paint.shade);
  }
  // At night: a string of lights along the cable and the deck, a beacon on each tower.
  if (s.lit > 0.02) {
    for (let i = 0; i < cable.length; i += 2) {
      s.light(cable[i][0], cable[i][1], 0.011, paint.lights, s.lit);
    }
    for (let u = ends[0] + 0.05; u < ends[1]; u += 0.12) {
      s.light(u, deck - 0.012, 0.009, '#ffd08a', s.lit * 0.9);
    }
    for (const t of towers) {
      s.light(t, top + 0.03, 0.016, '#ff5a4a', s.lit);
    }
  }
}

/** The Transamerica Pyramid: a white spire with its two wings. */
function transamerica(s: Sketch, c: number, apex: number, half = 0.26): void {
  if (!s.sees(c - half - 0.1, c + half + 0.1)) {
    return;
  }
  const wingLo = SILL + (apex - SILL) * 0.62;
  const wingHi = SILL + (apex - SILL) * 0.8;
  const halfAt = (z: number): number => half * (1 - (z - SILL) / (apex - SILL));
  // The wings: the lift and stair towers, standing proud near the top.
  for (const side of [-1, 1]) {
    const w0 = halfAt(wingLo);
    const w1 = halfAt(wingHi);
    s.poly(
      [
        [c + side * w0 * 0.5, wingLo],
        [c + side * (w0 + 0.05), wingLo],
        [c + side * (w1 + 0.05), wingHi],
        [c + side * w1 * 0.5, wingHi],
      ],
      side < 0 ? C.pyramid : C.pyramidShade
    );
  }
  const body: Array<[number, number]> = [
    [c - half, SILL],
    [c + half, SILL],
    [c, apex],
  ];
  s.poly(body, C.pyramid);
  s.poly(
    [
      [c, SILL],
      [c + half, SILL],
      [c, apex],
    ],
    C.pyramidShade
  );
  // Its rows of windows, narrowing up the faces.
  for (let z = SILL + 0.06; z < apex - 0.15; z += 0.06) {
    const w = halfAt(z) - 0.02;
    s.line(
      [
        [c - w, z],
        [c + w, z],
      ],
      0.4,
      '#b9b6ae'
    );
  }
  s.line(
    [
      [c, apex],
      [c, apex + 0.08],
    ],
    0.8,
    C.pyramidShade
  );
  s.outline(body);
  if (s.lit > 0.02) {
    for (let z = SILL + 0.06; z < apex - 0.2; z += 0.06) {
      const w = halfAt(z) - 0.03;
      s.line(
        [
          [c - w, z],
          [c + w * 0.2, z],
        ],
        0.5,
        mix(LIT, s.tint(C.pyramid), 0.4),
        true
      );
    }
    s.light(c, apex + 0.08, 0.018, '#ff5a4a', s.lit);
  }
}

/** Salesforce Tower: tallest in town, tapering a little to its rounded, latticed crown. */
function salesforce(s: Sketch, c: number, top: number): void {
  const [b, t] = [0.25, 0.2];
  if (!s.sees(c - b, c + b)) {
    return;
  }
  const shoulder = top - 0.1;
  const outline: Array<[number, number]> = [
    [c - b, SILL],
    [c + b, SILL],
    [c + t, shoulder],
  ];
  // The rounded crown.
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    outline.push([c + Math.cos(a) * t, shoulder + Math.sin(a) * (top - shoulder)]);
  }
  outline.push([c - t, shoulder]);
  s.poly(outline, C.salesforce);
  s.poly(
    [
      [c + b * 0.35, SILL],
      [c + b, SILL],
      [c + t, shoulder],
      [c + t * 0.35, shoulder],
    ],
    C.salesforceShade
  );
  // The white fins running up its faces.
  for (const f of [-0.6, -0.2, 0.2, 0.6]) {
    s.line(
      [
        [c + f * b, SILL + 0.02],
        [c + f * t, shoulder],
      ],
      0.4,
      C.white
    );
  }
  // The open lattice crown, lit at night, pale by day.
  s.rect(c - t + 0.02, c + t - 0.02, shoulder - 0.12, shoulder + 0.02, '#eef3f6');
  for (let u = c - t + 0.05; u < c + t - 0.03; u += 0.05) {
    s.line(
      [
        [u, shoulder - 0.11],
        [u, shoulder + 0.01],
      ],
      0.35,
      C.salesforceShade
    );
  }
  s.outline(outline);
  s.windows(c - b + 0.03, c + b - 0.03, SILL, shoulder - 0.14, 91, 0.35);
  if (s.lit > 0.02) {
    // The crown lights up at night.
    s.rect(
      c - t + 0.02,
      c + t - 0.02,
      shoulder - 0.12,
      shoulder + 0.02,
      '#bfe6ff',
      s.lit * 0.9,
      true
    );
    s.light(c, shoulder + 0.02, t * 0.9, '#e6f6ff', s.lit * 0.55);
  }
}

/** 181 Fremont: a slim tower braced in great Xs, its crown sliced on a slant. */
function fremont(s: Sketch, c: number, top: number): void {
  const w = 0.12;
  if (!s.sees(c - w, c + w)) {
    return;
  }
  const outline: Array<[number, number]> = [
    [c - w, SILL],
    [c + w, SILL],
    [c + w, top - 0.12],
    [c - w * 0.2, top],
    [c - w, top - 0.05],
  ];
  s.poly(outline, '#9fb2c4');
  s.rect(c + w * 0.35, c + w, SILL, top - 0.12, '#869bb0');
  for (let z = SILL + 0.05; z < top - 0.35; z += 0.3) {
    s.line(
      [
        [c - w, z],
        [c + w, z + 0.3],
      ],
      0.45,
      '#e8eef3'
    );
    s.line(
      [
        [c + w, z],
        [c - w, z + 0.3],
      ],
      0.45,
      '#e8eef3'
    );
  }
  s.line(
    [
      [c - w * 0.2, top],
      [c - w * 0.2, top + 0.09],
    ],
    0.6,
    C.steelDark
  );
  s.outline(outline);
  s.windows(c - w, c + w, SILL, top - 0.15, 77, 0.4);
  s.light(c - w * 0.2, top + 0.09, 0.012, '#ff5a4a', s.lit);
}

/** A sans for the billboards' lettering. */
const SANS = '"Helvetica Neue", Helvetica, Arial, ui-sans-serif, sans-serif';

/**
 * A rooftop billboard: a lettered panel up on two legs, with a catwalk under
 * it and floodlights that keep it lit at night.
 */
function billboard(
  s: Sketch,
  c: number,
  roof: number,
  w: number,
  words: string,
  paint: { panel: string; ink: string }
): void {
  if (!s.sees(c - w / 2 - 0.02, c + w / 2 + 0.02)) {
    return;
  }
  const h = 0.26;
  const z0 = roof + 0.06;
  const [a, b] = [c - w / 2, c + w / 2];
  for (const leg of [a + w * 0.22, b - w * 0.22]) {
    s.rect(leg - 0.012, leg + 0.012, roof, z0, C.steelDark);
  }
  s.rect(a + 0.02, b - 0.02, z0 - 0.018, z0 - 0.006, C.steelDark);
  // The panel stays its own colour after dark: it is floodlit.
  const glow = Math.min(1, s.lit * 1.5);
  const panel = mix(s.tint(paint.panel), paint.panel, glow);
  const box: Array<[number, number]> = [
    [a, z0],
    [b, z0],
    [b, z0 + h],
    [a, z0 + h],
  ];
  s.poly(box, panel, 1, true);
  s.outline(box, mix(s.tint('#2b2f3a'), '#2b2f3a', glow), 0.7);
  s.text(c, z0 + h * 0.3, h * 0.52, words, mix(s.tint(paint.ink), paint.ink, glow), SANS);
  for (const lamp of [a + w * 0.25, c, b - w * 0.25]) {
    s.light(lamp, z0 - 0.012, 0.012, '#fff3c4', s.lit);
  }
}

/** Coit Tower: a fluted concrete column on the crown of Telegraph Hill. */
function coit(s: Sketch, c: number, base: number, top: number): void {
  const w = 0.08;
  if (!s.sees(c - w, c + w)) {
    return;
  }
  const body: Array<[number, number]> = [
    [c - w, base],
    [c + w, base],
    [c + w, top],
    [c - w, top],
  ];
  s.poly(body, C.cream);
  s.rect(c + w * 0.3, c + w, base, top, C.creamShade);
  for (const f of [-0.5, 0, 0.5]) {
    s.line(
      [
        [c + f * w, base + 0.02],
        [c + f * w, top - 0.08],
      ],
      0.35,
      C.creamShade
    );
  }
  // The arched lookout windows round the top, and the cornice over them.
  for (const f of [-0.55, 0, 0.55]) {
    s.rect(c + f * w - 0.015, c + f * w + 0.015, top - 0.065, top - 0.025, '#8d8270');
  }
  s.rect(c - w - 0.012, c + w + 0.012, top, top + 0.02, C.creamShade);
  s.outline(body);
  // Its little base building on the hilltop.
  s.rect(c - 0.16, c + 0.16, base - 0.02, base + 0.05, C.cream);
  // Floodlit at night.
  s.rect(c - w, c + w, base, top, '#f6e7c4', s.lit * 0.75, true);
}

/** The Ferry Building: a long arcaded shed under its clock tower. */
function ferryBuilding(s: Sketch, c: number): void {
  if (!s.sees(c - 1.4, c + 1.4)) {
    return;
  }
  s.rect(c - 1.3, c + 1.3, SILL, SILL + 0.3, C.cream);
  s.rect(c - 1.3, c + 1.3, SILL + 0.3, SILL + 0.34, C.creamShade);
  for (let u = c - 1.22; u < c + 1.2; u += 0.1) {
    s.rect(u, u + 0.05, SILL + 0.06, SILL + 0.2, '#9c8f78');
  }
  const top = 1.5;
  const body: Array<[number, number]> = [
    [c - 0.1, SILL + 0.3],
    [c + 0.1, SILL + 0.3],
    [c + 0.1, top],
    [c + 0.06, top + 0.07],
    [c, top + 0.16],
    [c - 0.06, top + 0.07],
    [c - 0.1, top],
  ];
  s.poly(body, C.cream);
  s.rect(c + 0.03, c + 0.1, SILL + 0.3, top, C.creamShade);
  // The clock face.
  s.poly(
    Array.from({ length: 10 }, (_, i): [number, number] => {
      const a = (i / 10) * Math.PI * 2;
      return [c + Math.cos(a) * 0.05, top - 0.12 + Math.sin(a) * 0.05];
    }),
    C.white
  );
  s.light(c, top - 0.12, 0.05, '#fff2c8', s.lit);
  s.windows(c - 1.3, c + 1.3, SILL, SILL + 0.3, 5, 0.5);
  for (let z = SILL + 0.42; z < top - 0.22; z += 0.12) {
    s.rect(c - 0.05, c + 0.05, z, z + 0.06, '#9c8f78');
  }
  s.outline(body);
}

/** Sutro Tower: the red-and-white trident on its hill above the city. */
function sutro(s: Sketch, c: number, base: number): void {
  if (!s.sees(c - 0.25, c + 0.25)) {
    return;
  }
  const waist = base + 0.55;
  const top = base + 0.95;
  const legs: Array<[number, number]> = [
    [-0.2, -0.07],
    [0, 0],
    [0.2, 0.07],
  ];
  for (const [foot, head] of legs) {
    // Each leg, striped red and white up to the waist, then a prong above.
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      s.line(
        [
          [c + foot + (head - foot) * t0, base + (waist - base) * t0],
          [c + foot + (head - foot) * t1, base + (waist - base) * t1],
        ],
        1.1,
        i % 2 === 0 ? C.sutro : C.white
      );
    }
    for (let i = 0; i < 4; i++) {
      s.line(
        [
          [c + head * (1 + i * 0.12), waist + ((top - waist) * i) / 4],
          [c + head * (1 + (i + 1) * 0.12), waist + ((top - waist) * (i + 1)) / 4],
        ],
        1,
        i % 2 === 0 ? C.sutro : C.white
      );
    }
  }
  for (const [, head] of legs) {
    s.light(c + head * 1.48, top + 0.01, 0.014, '#ff5a4a', s.lit);
  }
  for (const z of [waist, waist + 0.22]) {
    s.line(
      [
        [c - 0.09, z],
        [c + 0.09, z],
      ],
      1,
      C.sutro
    );
  }
}

/** The Painted Ladies: a row of Victorians in their pastels, gabled and trimmed. */
function paintedLadies(s: Sketch, from: number, n: number, ground: number): void {
  const w = 0.32;
  if (!s.sees(from, from + n * w)) {
    return;
  }
  const paints = ['#f2b8b0', '#bfe0c9', '#f5dd9a', '#c9b8e0', '#a9cbe8', '#f6c79e'];
  for (let i = 0; i < n; i++) {
    const a = from + i * w;
    const b = a + w - 0.02;
    const eave = ground + 0.38;
    const house: Array<[number, number]> = [
      [a, ground],
      [b, ground],
      [b, eave],
      [(a + b) / 2, eave + 0.16],
      [a, eave],
    ];
    s.poly(house, paints[i % paints.length]);
    // The bay window, the door and the attic window, all picked out in white.
    s.rect(a + 0.04, a + 0.14, ground + 0.08, ground + 0.3, C.white, 0.85);
    s.rect(
      a + 0.05,
      a + 0.13,
      ground + 0.1,
      ground + 0.28,
      LIT,
      s.lit * (i % 3 === 1 ? 0.3 : 0.9),
      true
    );
    s.rect(
      b - 0.1,
      b - 0.04,
      ground,
      ground + 0.14,
      mix(paints[i % paints.length], '#3a2f2a', 0.35)
    );
    s.rect((a + b) / 2 - 0.03, (a + b) / 2 + 0.03, eave + 0.02, eave + 0.08, C.white, 0.85);
    s.line(
      [
        [a, eave],
        [(a + b) / 2, eave + 0.16],
        [b, eave],
      ],
      0.6,
      C.white
    );
    s.outline(house);
  }
}

// ---- the three views ------------------------------------------------------------

/** The long back wall: the Golden Gate, Telegraph Hill, downtown, the Bay Bridge. */
const westView: Panorama = (s) => {
  bay(s, -22, -1);
  // Marin's headlands across the Gate, and the East Bay hills far off.
  hill(
    s,
    -22.5,
    -17.6,
    [
      [-22, 1.12],
      [-20.8, 1.0],
    ],
    C.hillFar,
    HORIZON - 0.02
  );
  hill(
    s,
    -6,
    -0.5,
    [
      [-3, 0.86],
      [-1, 0.9],
    ],
    C.hillFar,
    HORIZON - 0.02
  );
  // The Golden Gate, from the Marin side across to the city.
  suspension(s, [-21.8, -16.2], [-20.5, -17.6], 0.84, 1.56, {
    body: C.orange,
    shade: C.orangeDark,
    cable: C.orangeDark,
    lights: '#ffb867',
  });
  // Telegraph Hill, with Coit Tower on its crown.
  const telegraph = hill(
    s,
    -16.6,
    -12.4,
    [
      [-14.6, 1.02],
      [-13.7, 0.92],
    ],
    C.hill
  );
  hill(s, -16.4, -12.6, [[-14.6, 0.98]], C.hillLit, SILL + 0.3);
  houses(s, -16.5, -12.5, telegraph, 7);
  coit(s, -14.6, 0.98, 1.5);
  // Downtown: a hazy back row, then the towers that make the skyline.
  const d = -1.7;
  haze(s, -12.9, -3.2, 11, 0.95, 1.45);
  tower(s, d - 10.7, 0.32, 1.22, C.sand);
  tower(s, d - 10.2, 0.28, 1.48, C.glass);
  tower(s, d - 8.45, 0.3, 1.34, C.stone);
  transamerica(s, d - 9.25, 2.08);
  tower(s, d - 7.85, 0.32, 1.74, C.dark);
  tower(s, d - 7.25, 0.28, 1.62, '#b8c7d4');
  tower(s, d - 6.72, 0.26, 1.3, C.sand);
  salesforce(s, d - 6.1, 2.13);
  fremont(s, d - 5.35, 1.86);
  tower(s, d - 4.82, 0.32, 1.46, '#e3d7c5');
  tower(s, d - 4.3, 0.28, 1.18, '#8ea7c1');
  tower(s, d - 3.85, 0.36, 0.98, C.stone);
  tower(s, d - 3.4, 0.3, 1.1, C.glass);
  // Two billboards up on the rooftops, each in the middle of one light so no
  // mullion cuts across the lettering.
  billboard(s, d - 10.3, 1.48, 0.66, 'airbyte', { panel: '#615eff', ink: '#ffffff' });
  billboard(s, d - 8.3, 1.34, 0.76, 'Liquid AI', { panel: '#14161c', ink: '#ffffff' });
  // The waterfront: low blocks along the Embarcadero.
  tower(s, -4.75, 0.34, 0.92, C.sand);
  tower(s, -4.3, 0.3, 0.8, C.stone);
  tower(s, -3.85, 0.38, 0.72, '#e3d7c5');
  // The Bay Bridge's west span setting off from the waterfront.
  suspension(s, [-3.2, 0.5], [-2.15, -0.6], 0.86, 1.42, {
    body: C.steel,
    shade: C.steelDark,
    cable: C.steelDark,
    lights: '#f4f8ff',
  });
};

/** The front wall: the Ferry Building on the Embarcadero, and the Bay Bridge. */
const bayView: Panorama = (s) => {
  bay(s, -22, 0);
  hill(
    s,
    -22.5,
    0.5,
    [
      [-19, 0.95],
      [-14, 0.88],
      [-8, 0.98],
      [-2, 0.9],
    ],
    C.hillFar,
    HORIZON - 0.02
  );
  // Embarcadero Center's slabs behind the waterfront.
  haze(s, -21.8, -14.2, 23, 0.9, 1.3);
  tower(s, -20.6, 0.36, 1.32, C.stone);
  tower(s, -19.9, 0.3, 1.18, C.sand);
  tower(s, -16.1, 0.36, 1.28, C.stone);
  tower(s, -15.4, 0.3, 1.4, C.glass);
  ferryBuilding(s, -18);
  // Yerba Buena Island, where the two halves of the bridge meet.
  hill(s, -2.6, 0.2, [[-1.2, 0.98]], C.hill);
  suspension(s, [-11.2, -6.1], [-10, -7.3], 0.86, 1.46, {
    body: C.steel,
    shade: C.steelDark,
    cable: C.steelDark,
    lights: '#f4f8ff',
  });
  suspension(s, [-6.1, -1.6], [-4.9, -2.8], 0.86, 1.46, {
    body: C.steel,
    shade: C.steelDark,
    cable: C.steelDark,
    lights: '#f4f8ff',
  });
  // The centre anchorage between the two spans.
  s.rect(-6.3, -5.9, SILL, 1.02, C.stone);
  s.rect(-6.0, -5.9, SILL, 1.02, mix(C.stone, '#2c3e55', 0.16));
};

/** The right wall: Twin Peaks and Sutro Tower, and the Painted Ladies. */
const southView: Panorama = (s) => {
  s.rect(2, 22, SILL, 0.7, C.hillFar);
  haze(s, 2, 22, 41, 0.62, 0.82);
  const peaks = hill(
    s,
    2.2,
    11.4,
    [
      [5.6, 1.22],
      [7.9, 1.28],
      [10, 1.08],
    ],
    C.hillDry
  );
  hill(
    s,
    2.2,
    11.4,
    [
      [5.6, 1.0],
      [7.9, 1.04],
    ],
    mix(C.hillDry, C.hill, 0.5),
    SILL + 0.2
  );
  houses(s, 2.4, 11.2, (u) => Math.min(peaks(u), 0.95), 43);
  sutro(s, 9.2, peaks(9.2) - 0.02);
  // Downtown, small and far, the way it shows behind the Ladies.
  tower(s, 13.1, 0.12, 0.98, C.haze, SILL, false);
  transamerica(s, 13.55, 1.18, 0.1);
  tower(s, 14.1, 0.14, 1.04, C.haze, SILL, false);
  tower(s, 14.55, 0.12, 1.12, '#c4d1dc', SILL, false);
  tower(s, 15.0, 0.16, 0.94, C.haze, SILL, false);
  // Alamo Square's green slope, and the row of Victorians along it.
  hill(s, 11.6, 17.4, [[14.4, 0.78]], C.hillLit);
  paintedLadies(s, 12.4, 6, SILL + 0.02);
  const heights = hill(
    s,
    17.4,
    22,
    [
      [19, 1.0],
      [21.2, 0.92],
    ],
    C.hill
  );
  houses(s, 17.5, 21.9, heights, 53);
};

/** Each glazed wall's view, by the direction its windows face into the room. */
const VIEWS: Array<{ normal: [number, number]; view: Panorama; shift: number }> = [
  { normal: [1, 0], view: westView, shift: 0 },
  { normal: [0, -1], view: bayView, shift: 0 },
  { normal: [-1, 0], view: southView, shift: 0 },
  // A window drawn on its own (in the stories) looks out on downtown.
  { normal: [0, 1], view: westView, shift: -10.95 },
];

/** The sky's colours, top to bottom, at a time and in a weather. */
export function skyColors(sky: Sky): [string, string, string] {
  const night = 1 - sky.day;
  const blend = (dayC: string, nightC: string, duskC: string, duskK: number): string => {
    let out = mix(dayC, nightC, night);
    out = mix(out, duskC, sky.dusk * duskK);
    const grey = Math.max(0, (sky.cloud - 0.35) / 0.65) * 0.85;
    out = mix(out, mix('#a3adb9', '#232c40', night), grey);
    // Fog washes the sky out to a pale grey.
    return mix(out, mix('#dde3e8', '#3a4660', night), sky.fog * 0.55);
  };
  return [
    blend('#3f8ee6', '#0b1530', '#3b4a8c', 0.6),
    blend('#8cc6f2', '#1b2c55', '#e88d8a', 0.85),
    blend('#d9eef8', '#2e4373', '#f8c27a', 0.9),
  ];
}

/** Where the sun (or the moon) stands on the long wall, `arc` of the way across its sky. */
function across(arc: number, height: number): [number, number] {
  return [-21.5 + 20 * arc, HORIZON - 0.1 + Math.max(0, height) * (2.0 - HORIZON + 0.1)];
}

/** The sun by day and the moon by night, crossing the long wall's sky. */
function sunAndMoon(s: Sketch): void {
  const { sky } = s;
  const clear = (1 - sky.cloud * 0.85) * (1 - sky.fog * 0.6);
  if (sky.sun > -0.12) {
    const [u, z] = across(sky.arc, sky.sun);
    const low = Math.max(0, 1 - sky.sun / 0.35);
    const color = mix('#fff4c8', '#ff9f4a', low);
    s.light(u, z, 0.24, color, 0.22 * clear);
    s.light(u, z, 0.14, color, 0.35 * clear);
    s.light(u, z, 0.085, color, clear);
  } else {
    const arc = (((sky.minutes - SUNSET + 1440) % 1440) / 720) % 2;
    const [u, z] = across(arc, Math.sin(Math.PI * arc));
    s.light(u, z, 0.16, '#dfe6f5', 0.12 * clear);
    s.light(u, z, 0.07, '#f4f1e2', clear);
    s.light(u - 0.02, z + 0.015, 0.014, '#d6d2c0', clear);
    s.light(u + 0.025, z - 0.02, 0.01, '#d6d2c0', clear);
  }
}

/** Stars over the whole city once it is dark, where the cloud lets them through. */
function stars(s: Sketch): void {
  const show = (1 - s.sky.day) * (1 - s.sky.cloud) * (1 - s.sky.fog * 0.5);
  if (show < 0.05) {
    return;
  }
  for (let i = Math.floor(s.lo * 9) - 1; i <= Math.ceil(s.hi * 9); i++) {
    if (hash(i + 0.21) > 0.55) {
      continue;
    }
    const u = i / 9 + hash(i + 0.4) * 0.1;
    const z = 1.25 + hash(i + 0.8) * 1.25;
    s.light(u, z, 0.006 + hash(i + 0.1) * 0.006, '#ffffff', show * (0.5 + hash(i + 0.6) * 0.5));
  }
}

/** The clouds: more, bigger and greyer as the weather closes in, drifting on with time. */
function clouds(s: Sketch): void {
  const { sky } = s;
  let color = mix('#ffffff', '#a6afba', Math.max(0, sky.cloud - 0.5) * 1.6);
  color = mix(color, '#f4b8a6', sky.dusk * 0.6);
  color = mix(color, '#2f3b58', (1 - sky.day) * 0.85);
  const gap = 1.7 - sky.cloud * 1.15;
  const lo = s.lo - sky.drift;
  const hi = s.hi - sky.drift;
  for (let i = Math.floor(lo / gap) - 2; i <= Math.ceil(hi / gap) + 1; i++) {
    const u = i * gap + hash(i) * gap * 0.6 + sky.drift;
    const z = 2.3 - sky.cloud * 0.35 + hash(i + 0.3) * (0.16 + sky.cloud * 0.25);
    const r = 0.06 + sky.cloud * 0.08 + hash(i + 0.6) * 0.04;
    s.cloud(u, z, r, color, 0.95);
  }
}

/** Fog rolling in off the ocean, banked low over the bay and the city. */
function fog(s: Sketch): void {
  const thick = s.sky.fog;
  if (thick < 0.03) {
    return;
  }
  const color = mix('#eef1f4', '#4a5774', 1 - s.sky.day);
  const top = SILL + 0.45 + thick * 0.75;
  for (let i = 1; i <= 5; i++) {
    s.rect(s.lo - 0.1, s.hi + 0.1, SILL, SILL + ((top - SILL) * i) / 5, color, thick * 0.26, true);
  }
  // Wisps, drifting with the wind.
  for (
    let i = Math.floor((s.lo - s.sky.drift) / 0.9) - 1;
    i <= Math.ceil((s.hi - s.sky.drift) / 0.9);
    i++
  ) {
    const u = i * 0.9 + hash(i + 0.7) * 0.5 + s.sky.drift;
    s.cloud(
      u,
      top - 0.3 + hash(i) * 0.4,
      0.07 + thick * 0.05 + hash(i + 0.2) * 0.05,
      color,
      thick * 0.6
    );
  }
}

/** Rain, streaking past the glass. */
function rain(s: Sketch): void {
  const hard = s.sky.rain;
  if (hard < 0.03) {
    return;
  }
  const color = mix('#e6eef6', '#7f8dab', 1 - s.sky.day);
  const ctx = s.k.ctx;
  ctx.save();
  ctx.globalAlpha *= 0.55 * hard;
  for (let i = Math.floor(s.lo * 12) - 2; i <= Math.ceil(s.hi * 12) + 2; i++) {
    const u = i / 12 + hash(i + 0.33) * 0.06;
    const z = SILL + hash(i + 0.77) * 1.75;
    s.line(
      [
        [u, z + 0.16],
        [u - 0.05, z],
      ],
      0.5,
      color,
      true
    );
  }
  ctx.restore();
}

/**
 * Draw the sky and the city behind one window segment. The pen stands at the
 * segment, so where it is along its wall picks the stretch of panorama that
 * shows; `sky` sets the hour and the weather.
 */
export function drawSkyline(k: Iso, y: number, x0: number, x1: number, sky: Sky = NOON): void {
  const along = k.dir([1, 0, 0]);
  const into = k.dir([0, 1, 0]);
  const at = k.world([0, 0, 0]);
  const pick =
    VIEWS.find((v) => Math.round(into[0]) === v.normal[0] && Math.round(into[1]) === v.normal[1]) ??
    VIEWS[0];
  const u0 = at[0] * along[0] + at[1] * along[1] + pick.shift;
  const s = new Sketch(k, y, u0, u0 + x0, u0 + x1, sky);
  // The view is ruled straight: the pen's hand wobble is for the furniture.
  const wobble = k.wobble;
  k.wobble = 0;
  stars(s);
  if (pick.view === westView) {
    sunAndMoon(s);
  }
  clouds(s);
  pick.view(s);
  fog(s);
  rain(s);
  k.wobble = wobble;
}
