import { css, fromHsl, parseColor, toHsl } from './color';
import { Paint, Paints, TextureKind } from './types';

/**
 * The patterns a style paints with. Each is a small tile, drawn once at twice
 * the sheet's density and laid back at half size so it stays crisp, then
 * turned to the face's angle where it is used. Tiles are shared; the
 * `CanvasPattern` made from one belongs to one canvas, so those are kept per
 * canvas. Nothing here reads a clock or an rng: every tile is seeded by what
 * it is a tile of, so a drawing is the same every time it is made.
 */

/**
 * Tiles are drawn at least this many pixels per sheet unit, and as many as the
 * canvas they are laid on draws per sheet unit, so a close-up stays sharp.
 */
const DENSITY = 2;
const MAX_DENSITY = 8;
/** The density the next tile is drawn at: set per pattern, from the canvas it is for. */
let density = DENSITY;
/** How many of a tile's pixels make one sheet unit. */
const tileScale = new WeakMap<HTMLCanvasElement, number>();

const tiles = new Map<string, HTMLCanvasElement>();
const perCanvas = new WeakMap<
  CanvasRenderingContext2D,
  Map<string, { p: CanvasPattern | null; scale: number }>
>();

/** A small, stable stream of 0..1 from a string. */
function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tile(
  key: string,
  size: number,
  draw: (g: CanvasRenderingContext2D, n: number) => void
): HTMLCanvasElement | null {
  const at = `${key}@${density}`;
  let canvas = tiles.get(at);
  if (!canvas) {
    if (typeof document === 'undefined') {
      return null;
    }
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.max(2, Math.round(size * density));
    const g = canvas.getContext('2d');
    if (!g) {
      return null;
    }
    // Exactly the tile's size, so it repeats without a seam whatever the density.
    const k = canvas.width / size;
    g.scale(k, k);
    draw(g, size);
    tileScale.set(canvas, k);
    tiles.set(at, canvas);
  }
  return canvas;
}

function textureTile(
  kind: TextureKind,
  base: string,
  ground: string | undefined
): HTMLCanvasElement | null {
  const key = `${kind}|${base}|${ground ?? ''}`;
  switch (kind) {
    case 'tooth':
      return tile(key, 48, (g, n) => {
        const rnd = seeded(key);
        g.fillStyle = base;
        g.fillRect(0, 0, n, n);
        for (let i = 0; i < 520; i++) {
          const light = rnd() < 0.55;
          g.fillStyle = light ? '#f4f1ea' : '#0e0e0e';
          g.globalAlpha = (light ? 0.35 : 0.18) * rnd();
          g.fillRect(rnd() * n, rnd() * n, 0.4 + rnd() * 1.1, 0.4 + rnd() * 0.8);
        }
        g.globalAlpha = 1;
      });
    case 'wash':
      // One wash of colour, laid by a brush that ran dry in places: long thin
      // streaks of bare paper and of heavier pigment along the stroke, each
      // carried round the tile's edge so the wash repeats without a seam.
      return tile(key, 72, (g, n) => {
        const rnd = seeded(key);
        g.fillStyle = base;
        g.fillRect(0, 0, n, n);
        const pigment = darker(base, 0.14);
        g.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
          const dry = rnd() < 0.62;
          const y = 1.5 + rnd() * (n - 3);
          const x = rnd() * n;
          const len = 8 + rnd() * 46;
          const tilt = (rnd() - 0.5) * 0.6;
          g.strokeStyle = dry ? (ground ?? '#f4ecda') : pigment;
          g.globalAlpha = dry ? 0.1 + rnd() * 0.32 : 0.05 + rnd() * 0.12;
          g.lineWidth = 0.25 + rnd() * (dry ? 1.1 : 1.6);
          for (const dx of [0, -n]) {
            g.beginPath();
            g.moveTo(x + dx, y);
            g.lineTo(x + dx + len, y + tilt);
            g.stroke();
          }
        }
        g.globalAlpha = 1;
      });
    case 'dry':
      // A dry brush dragged across the paper: broad strokes of thin ink with
      // bare paper between them, and nothing under them.
      return tile(key, 96, (g, n) => {
        const rnd = seeded(key);
        g.lineCap = 'round';
        g.strokeStyle = base;
        for (let i = 0; i < 46; i++) {
          const y = 2 + rnd() * (n - 4);
          const x = rnd() * n;
          const len = 20 + rnd() * 60;
          const tilt = (rnd() - 0.5) * 1.2;
          g.globalAlpha = 0.35 + rnd() * 0.5;
          g.lineWidth = 1.2 + rnd() * 3.6;
          for (const dx of [0, -n]) {
            g.beginPath();
            g.moveTo(x + dx, y);
            g.lineTo(x + dx + len, y + tilt);
            g.stroke();
          }
        }
        g.globalAlpha = 1;
      });
  }
}

/** A colour a little darker, as more pigment in the same wash. */
function darker(color: string, by: number): string {
  const c = parseColor(color);
  if (!c) {
    return color;
  }
  const [h, s, l] = toHsl(c);
  return css(fromHsl(h, Math.min(1, s * 1.1), Math.max(0, l - by)));
}

/** The patterns for one canvas. */
export function paintsFor(ctx: CanvasRenderingContext2D): Paints {
  let mine = perCanvas.get(ctx);
  if (!mine) {
    mine = new Map();
    perCanvas.set(ctx, mine);
  }
  const patterns = mine;
  const pattern = (
    key: string,
    make: () => HTMLCanvasElement | null,
    angle: number,
    fallback: string
  ): Paint => {
    // As fine as this canvas draws: its pixels per sheet unit, in half steps.
    const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    const k = m ? Math.hypot(m.a, m.b) : 1;
    density = Math.min(MAX_DENSITY, Math.max(DENSITY, Math.ceil(k * 2) / 2));
    const at = `${key}@${density}`;
    let made = patterns.get(at);
    if (made === undefined) {
      const canvas = make();
      made = {
        p:
          canvas && typeof ctx.createPattern === 'function'
            ? ctx.createPattern(canvas, 'repeat')
            : null,
        scale: (canvas && tileScale.get(canvas)) ?? density,
      };
      patterns.set(at, made);
    }
    const { p, scale } = made;
    if (!p) {
      return fallback;
    }
    if (typeof DOMMatrix !== 'undefined' && typeof p.setTransform === 'function') {
      p.setTransform(new DOMMatrix().rotateSelf(angle).scaleSelf(1 / scale, 1 / scale));
    }
    return p;
  };
  return {
    hatch: (o) => {
      const key = `hatch|${o.ground ?? ''}|${o.ink}|${o.gap}|${o.width}|${o.cross ? 1 : 0}`;
      return pattern(
        key,
        () =>
          tile(key, o.gap, (g, n) => {
            if (o.ground) {
              g.fillStyle = o.ground;
              g.fillRect(0, 0, n, n);
            }
            g.strokeStyle = o.ink;
            g.lineWidth = o.width;
            g.beginPath();
            g.moveTo(-1, n / 2);
            g.lineTo(n + 1, n / 2);
            if (o.cross) {
              g.moveTo(n / 2, -1);
              g.lineTo(n / 2, n + 1);
            }
            g.stroke();
          }),
        o.angle,
        o.ground ?? o.ink
      );
    },
    texture: (kind, base, angle, ground) =>
      pattern(
        `tex|${kind}|${base}|${ground ?? ''}`,
        () => textureTile(kind, base, ground),
        angle,
        base
      ),
  };
}
