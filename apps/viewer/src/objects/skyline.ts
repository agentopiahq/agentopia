import { FONT, Iso, V3, ellipse, lift, plane } from '../kit/iso';
import { mix } from '../kit/palette';
import { NOON, Sky } from '../sky';

/**
 * San Francisco, seen through the window bands. Each glazed wall looks out on
 * its own panorama, laid out in `u`: tiles along the wall, left to right as
 * someone inside looking out sees it, anchored to the world rather than to a
 * segment, so the city runs on unbroken behind a whole band of windows.
 * Heights are the window's own local z (the sill is at 0.45, the transom at
 * 2.15). Everything is drawn flat on the glass plane, a postcard behind it.
 *
 * The office stands on a high floor in SoMa:
 *
 * - The long back wall (home view, left) looks east: downtown end to end —
 *   the Transamerica Pyramid, Salesforce Tower, 181 Fremont — with
 *   billboards on its rooftops (`BILLBOARDS`), and the Bay Bridge setting
 *   off from Rincon Hill at the far end.
 * - The front wall looks north: Russian Hill, Alcatraz, Telegraph Hill and
 *   Coit Tower, and the Ferry Building.
 * - The right wall looks west: Twin Peaks and Sutro Tower, the Painted
 *   Ladies, and the Golden Gate.
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
    const gloom = Math.max(0, (sky.cloud - 0.5) / 0.5) * 0.3 + sky.rain * 0.12 + sky.storm * 0.18;
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
  paint: { panel: string; ink: string },
  /** How tall the lettering is, as a fraction of the panel. */
  letter = 0.52
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
  s.text(
    c,
    z0 + h * (0.56 - letter / 2),
    h * letter,
    words,
    mix(s.tint(paint.ink), paint.ink, glow),
    SANS
  );
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
//
// The office faces the city the way a high floor in SoMa would: the long
// window wall looks east over downtown, the front wall north toward the bay,
// and the right wall west across the city to the Golden Gate.

/** A tower in the downtown skyline: where it stands, its width, its roof, its paint. */
type Block = [u: number, width: number, top: number, color: string];

/**
 * Rooftops on the long wall that can carry a billboard: two tiles apart
 * along downtown, so the boards never crowd each other, each clear of the
 * mullions (every three tiles, at u = -0.5 - 3k) so none cuts across the
 * lettering, and none in front of a landmark. The tower under each one is drawn whether or not it
 * has a board yet.
 */
export const BILLBOARD_SLOTS: ReadonlyArray<{ u: number; roof: number; color: string }> = [
  { u: -21, roof: 1.06, color: '#e3d7c5' },
  { u: -19, roof: 1.36, color: '#9fb2c4' },
  { u: -17, roof: 1.2, color: '#b8c7d4' },
  { u: -15, roof: 1.3, color: C.stone },
  { u: -13, roof: 1.34, color: '#9fb2c4' },
  { u: -11, roof: 1.48, color: C.glass },
  { u: -9, roof: 1.18, color: C.stone },
];

/** A billboard on one of the long wall's slots. */
export interface Billboard {
  /** The slot it stands on, by its `u`. */
  slot: number;
  words: string;
  panel: string;
  ink: string;
  /** Panel width, tiles: under a light's width. */
  width: number;
  /** Lettering height, as a fraction of the panel. */
  letter?: number;
}

/** The billboards up over downtown. Add one by giving it a free slot. */
export const BILLBOARDS: readonly Billboard[] = [
  { slot: -21, words: 'Scale AI', panel: '#ffffff', ink: '#111111', width: 0.76 },
  { slot: -19, words: 'OpenAI', panel: '#10a37f', ink: '#ffffff', width: 0.74 },
  {
    slot: -17,
    words: 'ANTHROPIC',
    panel: '#d97757',
    ink: '#faf9f5',
    width: 0.86,
    letter: 0.42,
  },
  { slot: -13, words: 'Airbyte', panel: '#615eff', ink: '#ffffff', width: 0.68 },
  { slot: -11, words: 'Liquid AI', panel: '#14161c', ink: '#ffffff', width: 0.76 },
];

/** Where Salesforce Tower stands on the long wall: a lone window in the stories looks at it. */
const DOWNTOWN_U = -16;

/** The towers between the landmarks and the billboard slots, north to south. */
const DOWNTOWN: readonly Block[] = [
  [-21.45, 0.3, 1.2, C.sand],
  [-20.5, 0.26, 1.3, C.stone],
  [-19.45, 0.3, 1.5, C.glass],
  [-18.1, 0.36, 1.74, C.dark],
  [-17.55, 0.26, 1.28, C.sand],
  [-14.45, 0.26, 1.46, '#d9c9b0'],
  [-13.55, 0.26, 1.6, '#8ea7c1'],
  [-12.45, 0.28, 1.52, C.glass],
  [-12.0, 0.32, 1.7, '#b8c7d4'],
  [-10.45, 0.28, 1.28, C.sand],
  [-10.0, 0.3, 1.56, '#e3d7c5'],
  [-9.5, 0.26, 1.4, '#8ea7c1'],
  [-8.5, 0.3, 1.24, C.sand],
  [-8.0, 0.26, 1.02, '#d9c9b0'],
  // Rincon Hill, where the Bay Bridge comes ashore.
  [-7.3, 0.26, 1.66, C.glass],
  [-6.85, 0.3, 1.2, C.stone],
];

/** Low blocks along the Embarcadero, in front of the towers. */
const WATERFRONT: readonly Block[] = [
  [-20.8, 0.34, 0.82, C.sand],
  [-17.9, 0.3, 0.76, C.stone],
  [-14.9, 0.36, 0.84, '#e3d7c5'],
  [-12.2, 0.32, 0.78, C.sand],
  [-9.8, 0.36, 0.8, C.stone],
];

/**
 * The long window wall, looking east: downtown end to end, from the
 * Transamerica Pyramid in the north past Salesforce Tower and 181 Fremont to
 * Rincon Hill, billboards on its rooftops, and the Bay Bridge setting off for
 * the East Bay at the far end, behind the meeting room.
 */
const eastView: Panorama = (s) => {
  bay(s, -22, -1);
  hill(
    s,
    -22.5,
    -0.5,
    [
      [-19, 0.86],
      [-13, 0.92],
      [-7, 0.88],
      [-2.5, 0.95],
    ],
    C.hillFar,
    HORIZON - 0.02
  );
  haze(s, -21.9, -6.6, 11, 0.95, 1.45);
  for (const slot of BILLBOARD_SLOTS) {
    tower(s, slot.u, 0.42, slot.roof, slot.color);
  }
  for (const [u, w, top, color] of DOWNTOWN) {
    tower(s, u, w, top, color);
  }
  transamerica(s, -20, 2.08);
  salesforce(s, DOWNTOWN_U, 2.13);
  fremont(s, -14, 1.86);
  for (const [u, w, top, color] of WATERFRONT) {
    tower(s, u, w, top, color);
  }
  for (const b of BILLBOARDS) {
    const slot = BILLBOARD_SLOTS.find((x) => x.u === b.slot);
    if (slot) {
      billboard(s, slot.u, slot.roof, b.width, b.words, b, b.letter);
    }
  }
  // The Bay Bridge's west span, off Rincon Hill toward Yerba Buena.
  hill(s, -1.6, 0.6, [[-0.6, 0.98]], C.hill);
  suspension(s, [-6.6, -0.8], [-5.3, -2.1], 0.86, 1.42, {
    body: C.steel,
    shade: C.steelDark,
    cable: C.steelDark,
    lights: '#f4f8ff',
  });
};

/** Alcatraz: a rock in the bay, its cellhouse and its lighthouse. */
function alcatraz(s: Sketch, c: number): void {
  if (!s.sees(c - 0.6, c + 0.6)) {
    return;
  }
  hill(s, c - 0.55, c + 0.55, [[c - 0.05, SILL + 0.18]], C.hillDry, SILL + 0.06);
  s.rect(c - 0.3, c + 0.18, SILL + 0.16, SILL + 0.27, C.stone);
  s.rect(c + 0.05, c + 0.18, SILL + 0.16, SILL + 0.27, mix(C.stone, '#2c3e55', 0.16));
  s.windows(c - 0.3, c + 0.18, SILL + 0.16, SILL + 0.27, 61, 0.5);
  s.rect(c + 0.24, c + 0.29, SILL + 0.16, SILL + 0.42, C.cream);
  s.light(c + 0.265, SILL + 0.44, 0.018, '#fff3c4', s.lit);
}

/**
 * The front wall, looking north: Russian Hill and Alcatraz out in the bay to
 * the west of the door, Telegraph Hill with Coit Tower and the Ferry Building
 * on the Embarcadero to the east of it, Marin's hills across the water.
 */
const northView: Panorama = (s) => {
  bay(s, -22, 0);
  hill(
    s,
    -22.5,
    0.5,
    [
      [-20, 1.0],
      [-16, 0.92],
      [-10, 0.98],
      [-3, 0.88],
    ],
    C.hillFar,
    HORIZON - 0.02
  );
  // Russian Hill, its houses stepping down to the water.
  const russian = hill(
    s,
    -22,
    -17.4,
    [
      [-21, 1.0],
      [-19.4, 0.9],
    ],
    C.hill
  );
  houses(s, -21.9, -17.5, russian, 29);
  alcatraz(s, -16);
  // Telegraph Hill, with Coit Tower on its crown.
  const telegraph = hill(
    s,
    -10.6,
    -5.2,
    [
      [-7.4, 0.92],
      [-6.5, 1.02],
    ],
    C.hill
  );
  hill(s, -10.2, -5.4, [[-6.5, 0.98]], C.hillLit, SILL + 0.3);
  houses(s, -10.5, -5.3, telegraph, 7);
  coit(s, -6.5, 0.98, 1.5);
  // The Embarcadero: a few slabs behind the waterfront, then the Ferry Building.
  haze(s, -4.9, -1.0, 23, 0.9, 1.3);
  tower(s, -2.5, 0.36, 1.32, C.stone);
  tower(s, -4.6, 0.3, 1.18, C.sand);
  ferryBuilding(s, -3.5);
};

/**
 * The right wall, looking west: Twin Peaks and Sutro Tower to the south, the
 * Painted Ladies on Alamo Square, and the Golden Gate to the north, across to
 * Marin's headlands.
 */
const westView: Panorama = (s) => {
  s.rect(2, 14.2, SILL, 0.7, C.hillFar);
  haze(s, 2, 14.2, 41, 0.62, 0.82);
  bay(s, 13.8, 22);
  hill(
    s,
    18.8,
    22.5,
    [
      [19.6, 1.0],
      [20.8, 1.12],
    ],
    C.hillFar,
    HORIZON - 0.02
  );
  const peaks = hill(
    s,
    2.2,
    9.6,
    [
      [4.4, 1.22],
      [6.4, 1.28],
      [8.4, 1.08],
    ],
    C.hillDry
  );
  hill(
    s,
    2.2,
    9.6,
    [
      [4.4, 1.0],
      [6.4, 1.04],
    ],
    mix(C.hillDry, C.hill, 0.5),
    SILL + 0.2
  );
  houses(s, 2.4, 9.4, (u) => Math.min(peaks(u), 0.95), 43);
  sutro(s, 7.6, peaks(7.6) - 0.02);
  // Alamo Square's green slope, and the row of Victorians along it.
  hill(s, 10.6, 14.4, [[12.9, 0.78]], C.hillLit);
  paintedLadies(s, 12.05, 6, SILL + 0.02);
  // The Presidio's green, where the Gate comes ashore on the city side.
  const presidio = hill(s, 14.0, 15.6, [[14.6, 0.98]], C.hill);
  houses(s, 14.1, 15.0, presidio, 53);
  // The Golden Gate, from the city across to Marin.
  suspension(s, [14.7, 20.3], [16.1, 18.9], 0.84, 1.56, {
    body: C.orange,
    shade: C.orangeDark,
    cable: C.orangeDark,
    lights: '#ffb867',
  });
};

/** Each glazed wall's view, by the direction its windows face into the room. */
const VIEWS: Array<{ normal: [number, number]; view: Panorama; shift: number }> = [
  { normal: [1, 0], view: eastView, shift: 0 },
  { normal: [0, -1], view: northView, shift: 0 },
  { normal: [-1, 0], view: westView, shift: 0 },
  // A window drawn on its own (in the stories) looks out on downtown.
  { normal: [0, 1], view: eastView, shift: DOWNTOWN_U },
];

/** The sky's colours, top to bottom, at a time and in a weather. */
export function skyColors(sky: Sky): [string, string, string] {
  const night = 1 - sky.day;
  const blend = (dayC: string, nightC: string, duskC: string, duskK: number): string => {
    let out = mix(dayC, nightC, night);
    out = mix(out, duskC, sky.dusk * duskK);
    const grey = Math.max(0, (sky.cloud - 0.35) / 0.65) * 0.85;
    out = mix(out, mix('#a3adb9', '#232c40', night), grey);
    // Thunderheads bring a bruised dark down over it all.
    out = mix(out, mix('#5b6273', '#151a28', night), sky.storm * 0.6);
    // Fog washes the sky out to a pale grey.
    return mix(out, mix('#dde3e8', '#3a4660', night), sky.fog * 0.55);
  };
  return [
    blend('#3f8ee6', '#0b1530', '#3b4a8c', 0.6),
    blend('#8cc6f2', '#1b2c55', '#e88d8a', 0.85),
    blend('#d9eef8', '#2e4373', '#f8c27a', 0.9),
  ];
}

/**
 * Where the sun and the moon rise and set on the long wall, which looks east:
 * up out of the East Bay hills by the Bay Bridge, at the band's far end, and
 * down behind the towers at its north end.
 */
const RISE_U = -3.7;
const SET_U = -20.6;
/** Which way along the long wall the sun travels: the side a waxing moon is lit on. */
const SUNWARD = Math.sign(SET_U - RISE_U);

/** Where the sun or the moon stands on the long wall, `arc` of the way across its sky, `height` up it (below 0, sunk behind the city). */
function across(arc: number, height: number): [number, number] {
  return [RISE_U + (SET_U - RISE_U) * arc, HORIZON - 0.1 + height * (2.0 - HORIZON + 0.1)];
}

const MOON_R = 0.12;

/**
 * The moon's lit part as an outline: the bright limb on the side facing the
 * sun (`sunward` while it waxes, as the sun is ahead of it on its way west,
 * the other side as it wanes), closed by the terminator, an ellipse half
 * that sweeps across the disc from new to full and back.
 */
export function moonLit(
  phase: number,
  u: number,
  z: number,
  r: number,
  sunward = 1
): Array<[number, number]> {
  const side = (phase < 0.5 ? 1 : -1) * sunward;
  const k = Math.cos(2 * Math.PI * phase);
  const n = 18;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = Math.PI / 2 - (Math.PI * i) / n;
    pts.push([u + side * r * Math.cos(t), z + r * Math.sin(t)]);
  }
  for (let i = n - 1; i > 0; i--) {
    const t = Math.PI / 2 - (Math.PI * i) / n;
    pts.push([u + side * k * r * Math.cos(t), z + r * Math.sin(t)]);
  }
  return pts;
}

/** The moon in its phase, faint by day, with the dark of it showing against the night. */
function moon(s: Sketch, clear: number): void {
  const { sky } = s;
  if (sky.moon < -0.15) {
    return;
  }
  const [u, z] = across(sky.moonArc, sky.moon);
  const night = 1 - sky.day;
  const lit = (1 - Math.cos(2 * Math.PI * sky.phase)) / 2;
  const show = clear * (0.5 + 0.5 * night);
  // The unlit disc, earthshine against the dark: lost in the daylight.
  s.light(u, z, MOON_R, '#2c3858', 0.85 * night * clear);
  s.light(u, z, MOON_R * 2.3, '#dfe6f5', 0.12 * lit * night * clear);
  if (lit > 0.01) {
    s.poly(
      moonLit(sky.phase, u, z, MOON_R, SUNWARD),
      mix('#f4f1e2', '#ffffff', sky.day),
      show,
      true
    );
  }
  // A couple of seas, where the light falls on them.
  for (const [du, dz, r] of [
    [-0.3, 0.2, 0.2],
    [0.35, -0.28, 0.14],
    [0.1, 0.38, 0.12],
  ]) {
    if (moonLights(sky.phase, du * MOON_R, dz * MOON_R, MOON_R, SUNWARD)) {
      s.light(u + du * MOON_R, z + dz * MOON_R, r * MOON_R, '#d6d2c0', show);
    }
  }
}

/** Whether the point `du`, `dz` from the moon's middle is in its lit part. */
export function moonLights(phase: number, du: number, dz: number, r: number, sunward = 1): boolean {
  const side = (phase < 0.5 ? 1 : -1) * sunward;
  const half = Math.sqrt(Math.max(0, r * r - dz * dz));
  return side * du >= Math.cos(2 * Math.PI * phase) * half && Math.abs(du) <= half;
}

/** The sun by day and the moon in its phase, rising behind the city and crossing the long wall's sky. */
function sunAndMoon(s: Sketch): void {
  const { sky } = s;
  const clear = (1 - sky.cloud * 0.85) * (1 - sky.fog * 0.6);
  moon(s, clear);
  if (sky.sun > -0.15) {
    const [u, z] = across(sky.arc, sky.sun);
    // Low, it swells and reddens, as a rising or setting sun does.
    const low = Math.max(0, 1 - sky.sun / 0.35);
    const color = mix('#fff4c8', '#ff8a3d', low);
    const r = 0.1 + 0.03 * low;
    s.light(u, z, r * 3.2, color, (0.16 + 0.1 * low) * clear);
    s.light(u, z, r * 1.8, color, 0.35 * clear);
    s.light(u, z, r, color, clear);
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

/** How far apart the clouds' slots are along the view, in tiles: the most a sky ever holds. */
const CLOUD_GAP = 0.55;
/** How much of the weather's cloud a slot takes to grow from nothing to its whole size. */
const CLOUD_GROW = 0.08;

/**
 * The clouds: each in a slot of its own along the view, at a height and a size
 * of its own, filled as the weather closes in, greyer as it does, drifting on
 * with the wind. A slot's cloud is there once the weather's cloud passes the
 * slot's own share of the sky, so more cloud only adds clouds: a clear sky
 * turning cloudy keeps the clouds it had, and new ones blow in on the wind,
 * growing as they come. They keep low enough to be seen under the transom and
 * a blind at its default height.
 */
function clouds(s: Sketch): void {
  const { sky } = s;
  let color = mix('#ffffff', '#a6afba', Math.max(0, sky.cloud - 0.5) * 1.6);
  color = mix(color, '#565d6c', sky.storm * 0.7);
  color = mix(color, '#f4b8a6', sky.dusk * 0.6);
  color = mix(color, '#2f3b58', (1 - sky.day) * 0.85);
  const lo = s.lo - sky.drift;
  const hi = s.hi - sky.drift;
  const cover = 0.03 + sky.cloud * 0.97;
  for (let i = Math.floor(lo / CLOUD_GAP) - 3; i <= Math.ceil(hi / CLOUD_GAP) + 2; i++) {
    const here = Math.max(0, Math.min(1, (cover - hash(i + 0.91)) / CLOUD_GROW));
    if (here <= 0) {
      continue;
    }
    // Still coming in: smaller, fainter, and upwind of where it settles.
    const u = i * CLOUD_GAP + hash(i) * CLOUD_GAP * 0.6 + sky.drift - (1 - here) * 0.6;
    const z = 1.6 + hash(i + 0.3) * 0.35;
    const r = (0.08 + hash(i + 0.6) * 0.06 + sky.cloud * 0.03) * (0.55 + 0.45 * here);
    s.cloud(u, z, r, color, 0.95 * Math.min(1, here * 1.5));
  }
}

/** Fog rolling in off the ocean, banked low over the bay and the city: a bank, no stray puffs. */
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

/** Snow, drifting down past the glass: soft flakes, still in the view (the renderer sets some falling). */
function snow(s: Sketch): void {
  const hard = s.sky.snow;
  if (hard < 0.03) {
    return;
  }
  const color = mix('#ffffff', '#c9d3e6', 1 - s.sky.day);
  for (let i = Math.floor(s.lo * 14) - 2; i <= Math.ceil(s.hi * 14) + 2; i++) {
    const u = i / 14 + hash(i + 0.41) * 0.06;
    const z = SILL + 0.05 + hash(i + 0.19) * 1.6;
    s.light(u, z, 0.012 + hash(i + 0.63) * 0.01, color, 0.85 * hard);
  }
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
  if (pick.view === eastView) {
    sunAndMoon(s);
  }
  clouds(s);
  pick.view(s);
  fog(s);
  rain(s);
  snow(s);
  k.wobble = wobble;
}
