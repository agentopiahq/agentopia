import { Mat, SHEET } from './palette';

/**
 * The isometric pen: a small canvas-2D kit for drawing solid, hand-inked
 * objects in the office's fixed view.
 *
 * The look follows Colorfigures (April Zhu, MIT — https://april-zhu.com/colorfigures):
 * real 3D bodies shaded in three flat bands by the way each face meets the
 * light, a heavy ink silhouette with finer inner lines, and one flat blue cast
 * shadow. This file is our own implementation of that method for canvas 2D; no
 * Colorfigures code is included.
 *
 * Coordinates are tile space with z up, exactly as `@agentopia/core` lays the
 * office out: `x` runs down-right on screen, `y` down-left, `z` straight up.
 * An object is authored in its own local frame (origin at its anchor, its
 * front facing local +y) and placed with `at` and `turn`, so one drawing serves
 * every wall it can stand against.
 *
 * Nothing here reads a clock or an rng. The pen's wobble is a hash of where it
 * is on the page, so a drawing is identical every time it is made.
 */

export type V3 = [number, number, number];
export type V2 = [number, number];

/** cos 30° and sin 30°: one tile along x or y is this far across and down. */
export const C = Math.cos(Math.PI / 6);
export const S = Math.sin(Math.PI / 6);

/**
 * Where cast shadows go: a point `h` up lands `h` times this far away along
 * the floor. Toward the viewer's lower left, short, so a shadow stays joined to
 * what casts it.
 */
export const SHADOW_DIR: V2 = [-0.22, 0.44];

/** The light the bands are cut by: over the viewer's right shoulder. */
const LIGHT: V3 = norm([0.5, -0.25, 1]);
/** Above this much light a face is `l`, above the next it is `m`, else `d`. */
const BAND_HI = 0.6;
const BAND_LO = 0.1;
/** The viewer looks from (+1, +1, +1); a face is seen when its normal agrees. */
const VIEW: V3 = [1, 1, 1];

/** Ink weights, in screen pixels at one pixel per sheet unit. */
export const INK = {
  /** The outline of a whole body. */
  silhouette: 2.1,
  /** Panel edges and the outlines of attached parts. */
  panel: 1.4,
  /** Openings, slots, buttons. */
  detail: 0.9,
  /** Seams, grain, hairlines. */
  hair: 0.6,
} as const;

export function norm(v: V3): V3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A small, stable hash of a number pair to 0..1, for the pen's wobble. */
function hash2(x: number, y: number): number {
  let h =
    Math.imul(Math.round(x * 7.3) | 0, 374761393) ^ Math.imul(Math.round(y * 7.3) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** The convex hull of screen points (monotone chain). */
export function hull(points: V2[]): V2[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) {
    return pts;
  }
  const cross = (o: V2, a: V2, b: V2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: V2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: V2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** A rounded rectangle as a closed polygon in a plane's own (u, v). */
export function roundRect(u0: number, v0: number, u1: number, v1: number, r: number, n = 5): V2[] {
  const rr = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2));
  if (rr <= 0) {
    return [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
  }
  const out: V2[] = [];
  const corner = (cu: number, cv: number, a0: number): void => {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
      out.push([cu + rr * Math.cos(a), cv + rr * Math.sin(a)]);
    }
  };
  corner(u1 - rr, v0 + rr, -90);
  corner(u1 - rr, v1 - rr, 0);
  corner(u0 + rr, v1 - rr, 90);
  corner(u0 + rr, v0 + rr, 180);
  return out;
}

/** An ellipse as a closed polygon in a plane's own (u, v). */
export function ellipse(cu: number, cv: number, ru: number, rv: number, n = 24): V2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cu + ru * Math.cos(a), cv + rv * Math.sin(a)] as V2;
  });
}

/** Planes, for lifting a 2D outline into 3D. */
export const plane = {
  /** Horizontal, at height z: (u, v) = (x, y). */
  z:
    (z: number) =>
    ([u, v]: V2): V3 => [u, v, z],
  /** Facing ±x, at x: (u, v) = (y, z). */
  x:
    (x: number) =>
    ([u, v]: V2): V3 => [x, u, v],
  /** Facing ±y, at y: (u, v) = (x, z). */
  y:
    (y: number) =>
    ([u, v]: V2): V3 => [u, y, v],
};
export const lift = (to: (p: V2) => V3, pts: V2[]): V3[] => pts.map(to);

/** An axis-aligned box in local space, for sorting parts against each other. */
export type Box3 = [V3, V3];

interface Part {
  box: Box3;
  draw: () => void;
}

export interface IsoOptions {
  /** Screen pixels per tile. */
  unit: number;
  /** Where world (0, 0, 0) lands on the canvas. */
  origin?: V2;
  /** How much the pen wobbles, in screen pixels. 0 draws ruler-straight. */
  wobble?: number;
  /**
   * A multiplier on every line weight and dot size. Ink is a property of the
   * sheet, so a close-up drawn at 3x the unit wants 3x the ink to look like a
   * photograph of the office rather than a finer drawing of it.
   */
  lineScale?: number;
  /** How strongly cast shadows cover what they fall on. */
  shadowAlpha?: number;
}

/**
 * One pen on one canvas. `place` moves it to an object's anchor and turn;
 * everything drawn after is in that object's local frame.
 */
export class Iso {
  readonly ctx: CanvasRenderingContext2D;
  readonly unit: number;
  origin: V2;
  wobble: number;
  lineScale: number;
  shadowAlpha: number;
  /** The object's anchor in world tiles. */
  private at: V3 = [0, 0, 0];
  /** Quarter turns about z, counter-clockwise seen from above. */
  private turn = 0;
  private parts: Part[] | null = null;

  constructor(ctx: CanvasRenderingContext2D, options: IsoOptions) {
    this.ctx = ctx;
    this.unit = options.unit;
    this.origin = options.origin ?? [0, 0];
    this.lineScale = options.lineScale ?? 1;
    this.shadowAlpha = options.shadowAlpha ?? SHEET.shadowAlpha;
    this.wobble = (options.wobble ?? 0.4) * this.lineScale;
  }

  /** Stand the pen at an anchor, turned so local +y faces `front`. */
  place(at: V3, front: Facing = '+y'): this {
    this.at = at;
    this.turn = TURNS[front];
    return this;
  }

  // ---- projection ----------------------------------------------------------

  /** A local direction, as a world direction. */
  dir(n: V3): V3 {
    let [x, y] = [n[0], n[1]];
    for (let i = 0; i < this.turn; i++) {
      [x, y] = [-y, x];
    }
    return [x, y, n[2]];
  }

  /** A local point, as a world point. */
  world(p: V3): V3 {
    const d = this.dir(p);
    return [d[0] + this.at[0], d[1] + this.at[1], d[2] + this.at[2]];
  }

  /** A world point on the canvas. */
  screenOfWorld(w: V3): V2 {
    const u = this.unit;
    return [
      (w[0] - w[1]) * C * u + this.origin[0],
      (w[0] + w[1]) * S * u - w[2] * u + this.origin[1],
    ];
  }

  /** A local point on the canvas. */
  P(p: V3): V2 {
    return this.screenOfWorld(this.world(p));
  }

  /** How near the viewer a local point is: larger draws later. */
  depth(p: V3): number {
    return dot3(this.world(p), VIEW);
  }

  /** Is a face with this local normal turned toward the viewer? */
  facing(n: V3): boolean {
    return dot3(this.dir(n), VIEW) > 1e-6;
  }

  /** The flat tone a face with this local normal takes. */
  tone(n: V3, m: Mat): string {
    const lit = dot3(norm(this.dir(n)), LIGHT);
    return lit > BAND_HI ? m.l : lit > BAND_LO ? m.m : m.d;
  }

  // ---- the pen -------------------------------------------------------------

  /** Trace screen points as a path, with the pen's wobble on long runs. */
  private trace(pts: V2[], close: boolean, wobble: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (pts.length === 0) {
      return;
    }
    ctx.moveTo(pts[0][0], pts[0][1]);
    const n = close ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // A long run bows gently, like a hand-ruled line: one or two slow
      // waves along it, pinned to zero at both ends so corners stay sharp.
      const steps = wobble > 0 ? Math.floor(len / 6) : 0;
      if (steps >= 3) {
        const nx = -(b[1] - a[1]) / len;
        const ny = (b[0] - a[0]) / len;
        const phase = hash2(a[0] + b[0], a[1] + b[1]) * Math.PI * 2;
        const waves = len > 160 ? 2 : 1;
        const amp = wobble * Math.min(1, len / 40);
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const x = a[0] + (b[0] - a[0]) * t;
          const y = a[1] + (b[1] - a[1]) * t;
          const off = Math.sin(t * Math.PI) * Math.sin(phase + t * waves * Math.PI) * amp;
          ctx.lineTo(x + nx * off, y + ny * off);
        }
      }
      ctx.lineTo(b[0], b[1]);
    }
    if (close) {
      ctx.closePath();
    }
  }

  /** Fill a screen polygon flat. */
  fillScreen(pts: V2[], color: string, alpha = 1): void {
    const ctx = this.ctx;
    this.trace(pts, true, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
    // A hairline of the same colour closes the seams between neighbouring faces.
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6 * this.lineScale;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Ink a screen polyline. */
  inkScreen(pts: V2[], width: number, close = true, color: string = SHEET.ink): void {
    const ctx = this.ctx;
    this.trace(pts, close, this.wobble);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * this.lineScale;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  /** Fill a local polygon. */
  fill(pts: V3[], color: string, alpha = 1): void {
    this.fillScreen(
      pts.map((p) => this.P(p)),
      color,
      alpha
    );
  }

  /** Fill and ink a local polygon. */
  shape(pts: V3[], color: string, width: number = INK.detail): void {
    const screen = pts.map((p) => this.P(p));
    this.fillScreen(screen, color);
    if (width > 0) {
      this.inkScreen(screen, width);
    }
  }

  /** Ink a local polyline. */
  line(pts: V3[], width: number = INK.detail, close = false, color: string = SHEET.ink): void {
    this.inkScreen(
      pts.map((p) => this.P(p)),
      width,
      close,
      color
    );
  }

  /** Ink the outline around a whole set of local points: the silhouette. */
  silhouette(pts: V3[], width: number = INK.silhouette): void {
    this.inkScreen(hull(pts.map((p) => this.P(p))), width);
  }

  /** A filled dot at a local point, `r` in screen pixels. */
  dot(p: V3, r: number, color: string, ink = 0): void {
    const [x, y] = this.P(p);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r * this.lineScale, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (ink > 0) {
      ctx.strokeStyle = SHEET.ink;
      ctx.lineWidth = ink * this.lineScale;
      ctx.stroke();
    }
  }

  // ---- solids --------------------------------------------------------------

  /**
   * An axis-aligned box: every face that is turned toward the viewer, shaded by
   * the light and outlined, then the silhouette. `decorate` runs per visible
   * face, after the face, so whatever is mounted on a face shows only while
   * that face does.
   */
  box(
    lo: V3,
    hi: V3,
    m: Mat,
    options: { ink?: number; edge?: number; decorate?: Partial<Record<Facing, () => void>> } = {}
  ): void {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const faces: Array<[Facing, V3, V3[]]> = [
      [
        '+y',
        [0, 1, 0],
        [
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x0, y1, z1],
        ],
      ],
      [
        '-y',
        [0, -1, 0],
        [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
          [x0, y0, z1],
        ],
      ],
      [
        '+x',
        [1, 0, 0],
        [
          [x1, y0, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x1, y0, z1],
        ],
      ],
      [
        '-x',
        [-1, 0, 0],
        [
          [x0, y0, z0],
          [x0, y1, z0],
          [x0, y1, z1],
          [x0, y0, z1],
        ],
      ],
      [
        '+z',
        [0, 0, 1],
        [
          [x0, y0, z1],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1],
        ],
      ],
    ];
    const edge = options.edge ?? INK.hair;
    for (const [name, n, quad] of faces) {
      if (!this.facing(n)) {
        continue;
      }
      this.fill(quad, this.tone(n, m));
      if (edge > 0) {
        this.line(quad, edge, true);
      }
      options.decorate?.[name]?.();
    }
    const corners: V3[] = [];
    for (const x of [x0, x1]) {
      for (const y of [y0, y1]) {
        for (const z of [z0, z1]) {
          corners.push([x, y, z]);
        }
      }
    }
    const ink = options.ink ?? INK.panel;
    if (ink > 0) {
      this.silhouette(corners, ink);
    }
  }

  /**
   * A prism: a convex outline in a plane, swept along that plane's normal.
   * The sides are banded strip by strip, so a rounded outline shades like a
   * rounded body. `axis` names the sweep: 'z' sweeps an (x, y) outline up from
   * a0 to a1; 'x' sweeps a (y, z) outline along x; 'y' a (x, z) outline along y.
   */
  prism(
    outline: V2[],
    axis: 'x' | 'y' | 'z',
    a0: number,
    a1: number,
    m: Mat,
    options: { ink?: number; cap?: Mat; decorateCap?: () => void } = {}
  ): void {
    const at = plane[axis];
    const A = lift(at(a0), outline);
    const B = lift(at(a1), outline);
    const center = avg3([...A, ...B]);
    const n = A.length;
    for (let i = 0; i < n; i++) {
      const quad: V3[] = [A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]];
      let nrm = norm(cross3(sub3(quad[1], quad[0]), sub3(quad[3], quad[0])));
      if (dot3(nrm, sub3(avg3(quad), center)) < 0) {
        nrm = [-nrm[0], -nrm[1], -nrm[2]];
      }
      if (this.facing(nrm)) {
        this.fill(quad, this.tone(nrm, m));
      }
    }
    const capNormal: V3 = axis === 'z' ? [0, 0, 1] : axis === 'x' ? [1, 0, 0] : [0, 1, 0];
    const capNear = this.facing(capNormal);
    const cap = capNear ? B : A;
    const capN: V3 = capNear ? capNormal : [-capNormal[0], -capNormal[1], -capNormal[2]];
    if (this.facing(capN)) {
      this.fill(cap, this.tone(capN, options.cap ?? m));
      this.line(cap, INK.detail, true);
      options.decorateCap?.();
    }
    this.silhouette([...A, ...B], options.ink ?? INK.panel);
  }

  /** An upright cylinder centred on (x, y). */
  cylinder(
    x: number,
    y: number,
    z0: number,
    z1: number,
    r: number,
    m: Mat,
    ink: number = INK.panel
  ): void {
    this.prism(ellipse(x, y, r, r, 20), 'z', z0, z1, m, { ink });
  }

  /** A rounded slab standing on the floor: a desk top, a tray, a shelf. */
  slab(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
    r: number,
    m: Mat,
    ink?: number
  ): void {
    this.prism(roundRect(x0, y0, x1, y1, r), 'z', z0, z1, m, { ink });
  }

  /** A rounded tube between two local points. */
  rod(a: V3, b: V3, r: number, m: Mat, ink: number = INK.detail): void {
    const d = norm(sub3(b, a));
    const u = norm(cross3(d, Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const v = cross3(d, u);
    const ring = (p: V3): V3[] =>
      Array.from({ length: 12 }, (_, i) => {
        const t = (i / 12) * Math.PI * 2;
        const c = Math.cos(t) * r;
        const s = Math.sin(t) * r;
        return [
          p[0] + u[0] * c + v[0] * s,
          p[1] + u[1] * c + v[1] * s,
          p[2] + u[2] * c + v[2] * s,
        ] as V3;
      });
    const A = ring(a);
    const B = ring(b);
    for (let i = 0; i < 12; i++) {
      const quad: V3[] = [A[i], A[(i + 1) % 12], B[(i + 1) % 12], B[i]];
      const nrm = norm(sub3(avg3(quad), avg3([a, b])));
      if (this.facing(nrm)) {
        this.fill(quad, this.tone(nrm, m));
      }
    }
    this.silhouette([...A, ...B], ink);
  }

  /**
   * A ball: a leafy crown, a knob. Seen the same from everywhere, so it is a
   * circle cut into the three bands — dark rim on the shaded side, the body,
   * and a lit cap toward the light.
   */
  ball(c: V3, r: number, m: Mat, ink: number = INK.panel): void {
    const [x, y] = this.P(c);
    const R = r * this.unit;
    const ctx = this.ctx;
    const disc = (cx: number, cy: number, rr: number): void => {
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    };
    ctx.save();
    disc(x, y, R);
    ctx.clip();
    ctx.fillStyle = m.d;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
    disc(x + R * 0.14, y - R * 0.12, R * 0.9);
    ctx.fillStyle = m.m;
    ctx.fill();
    disc(x + R * 0.38, y - R * 0.4, R * 0.5);
    ctx.fillStyle = m.l;
    ctx.fill();
    ctx.restore();
    if (ink > 0) {
      this.inkScreen(ellipse(x, y, R, R, Math.max(12, Math.round(R))), ink);
    }
  }

  // ---- shadows -------------------------------------------------------------

  /**
   * The flat blue shadow a set of local points casts on the surface at
   * height `z0`. Draw shadows first, before anything stands up.
   */
  castShadow(pts: V3[] | V3[][], z0 = 0, strength = 1): void {
    // Several outlines (a frame and its open leaf) fill as one path, so where
    // they overlap the shadow is not doubly dark.
    const sets = (Array.isArray(pts[0]?.[0]) ? pts : [pts]) as V3[][];
    const ctx = this.ctx;
    ctx.beginPath();
    for (const set of sets) {
      const ground = hull(
        set.map((p) => {
          const w = this.world(p);
          const h = Math.max(0, w[2] - z0);
          return this.screenOfWorld([w[0] + h * SHADOW_DIR[0], w[1] + h * SHADOW_DIR[1], z0]);
        })
      );
      ground.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
    }
    ctx.globalAlpha = this.shadowAlpha * strength;
    ctx.fillStyle = SHEET.shadow;
    ctx.fill('nonzero');
    ctx.globalAlpha = 1;
  }

  /** The eight corners of a box, for shadows and silhouettes. */
  static corners(lo: V3, hi: V3): V3[] {
    const out: V3[] = [];
    for (const x of [lo[0], hi[0]]) {
      for (const y of [lo[1], hi[1]]) {
        for (const z of [lo[2], hi[2]]) {
          out.push([x, y, z]);
        }
      }
    }
    return out;
  }

  // ---- text on a face ------------------------------------------------------

  /**
   * Letter text flat on a face: on the plane through local `at`, reading along
   * local `u` with local `v` up. Hidden when the face is turned away, so text
   * is never drawn mirrored.
   */
  text(
    at: V3,
    u: V3,
    v: V3,
    str: string,
    size: number,
    options: { color?: string; font?: string; weight?: string; align?: CanvasTextAlign } = {}
  ): void {
    const normal = cross3(u, v);
    if (!this.facing(normal)) {
      return;
    }
    const o = this.P(at);
    const pu = this.P([at[0] + u[0], at[1] + u[1], at[2] + u[2]]);
    const pv = this.P([at[0] + v[0], at[1] + v[1], at[2] + v[2]]);
    const ux = (pu[0] - o[0]) / this.unit;
    const uy = (pu[1] - o[1]) / this.unit;
    const vx = (o[0] - pv[0]) / this.unit;
    const vy = (o[1] - pv[1]) / this.unit;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([ux, uy, vx, vy, o[0], o[1]])));
    ctx.fillStyle = options.color ?? SHEET.ink;
    ctx.font = `${options.weight ?? '700'} ${size}px ${options.font ?? FONT.mono}`;
    ctx.textAlign = options.align ?? 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  // ---- sorting -------------------------------------------------------------

  /**
   * Collect parts and draw them back to front. There is no depth buffer: two
   * parts whose boxes are separated along an axis go by which side of that
   * axis the viewer is on; otherwise by the depth of their centres.
   */
  sorted(build: (add: (box: Box3, draw: () => void) => void) => void): void {
    const parts: Part[] = [];
    const outer = this.parts;
    this.parts = parts;
    build((box, draw) => parts.push({ box, draw }));
    this.parts = outer;
    const world = (b: Box3): Box3 => {
      const a = this.world(b[0]);
      const c = this.world(b[1]);
      return [
        [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2])],
        [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])],
      ];
    };
    const boxes = new Map(parts.map((p) => [p, world(p.box)]));
    parts.sort((p, q) => compareBoxes(boxes.get(p) as Box3, boxes.get(q) as Box3));
    for (const part of parts) {
      part.draw();
    }
  }
}

/** Which way an object's front faces, in world terms. */
export type Facing = '+y' | '+x' | '-y' | '-x' | '+z';
const TURNS: Record<Facing, number> = { '+y': 0, '-x': 1, '-y': 2, '+x': 3, '+z': 0 };

/**
 * Back-to-front order of two world boxes for the fixed view. Separated along
 * an axis: the one on the low side of it is farther. Otherwise: centre depth.
 */
export function compareBoxes(p: Box3, q: Box3): number {
  for (let k = 0; k < 3; k++) {
    if (p[1][k] <= q[0][k] + 1e-6) {
      return -1;
    }
    if (q[1][k] <= p[0][k] + 1e-6) {
      return 1;
    }
  }
  const mid = (b: Box3): number => (b[0][0] + b[1][0] + b[0][1] + b[1][1] + b[0][2] + b[1][2]) / 2;
  return mid(p) - mid(q);
}

export const FONT = {
  /** Titles only. */
  title: '"Young Serif", Georgia, "Times New Roman", serif',
  /** Everything hand-lettered on the sheet. */
  hand: 'Gaegu, "Comic Sans MS", "Chalkboard SE", ui-rounded, cursive',
  /** Lettering printed on machines. */
  mono: 'ui-monospace, Menlo, Consolas, monospace',
} as const;

function sub3(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function avg3(ps: V3[]): V3 {
  const s: V3 = [0, 0, 0];
  for (const p of ps) {
    s[0] += p[0] / ps.length;
    s[1] += p[1] / ps.length;
    s[2] += p[2] / ps.length;
  }
  return s;
}
