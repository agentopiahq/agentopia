import { RGBA, css, mixRgb, parseColor } from './color';
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
    case 'clay':
      // Modelling clay: soft lumps where it was pressed on, and here and
      // there the whorls of a fingerprint.
      return tile(key, 72, (g, n) => {
        const rnd = seeded(key);
        g.fillStyle = base;
        g.fillRect(0, 0, n, n);
        // Lumps, wrapped round the tile's edges so it repeats without a seam.
        for (let i = 0; i < 26; i++) {
          const x = rnd() * n;
          const y = rnd() * n;
          const r = 8 + rnd() * 14;
          const light = rnd() < 0.5;
          for (const dx of [-n, 0, n]) {
            for (const dy of [-n, 0, n]) {
              const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
              grad.addColorStop(0, light ? 'rgba(255,248,236,0.1)' : 'rgba(40,24,12,0.06)');
              grad.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = grad;
              g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
            }
          }
        }
        // A fingerprint: a short run of concentric arcs.
        g.lineWidth = 0.45;
        for (let f = 0; f < 1; f++) {
          const cx = n * 0.5 + (rnd() - 0.5) * 12;
          const cy = n * (0.3 + rnd() * 0.4);
          const a0 = rnd() * Math.PI * 2;
          for (let ring = 2; ring < 11; ring++) {
            g.strokeStyle = `rgba(40,24,12,${(0.05 + rnd() * 0.04).toFixed(3)})`;
            g.beginPath();
            g.ellipse(cx, cy, ring * 1.5, ring * 1.1, a0, a0, a0 + Math.PI * (0.7 + rnd() * 0.6));
            g.stroke();
          }
        }
        // Grit picked up off the table.
        for (let i = 0; i < 30; i++) {
          g.fillStyle = rnd() < 0.6 ? 'rgba(255,250,240,0.2)' : 'rgba(30,18,10,0.1)';
          g.fillRect(rnd() * n, rnd() * n, 0.5 + rnd() * 0.6, 0.5 + rnd() * 0.6);
        }
      });
  }
}

/** One stud of a toy brick, `n` across, in the colour of the brick it stands on. */
function studTile(base: RGBA, n: number): HTMLCanvasElement | null {
  const shade = (t: number): string => css(mixRgb(base, [0, 0, 0, 1], t));
  const light = (t: number): string => css(mixRgb(base, [255, 255, 255, 1], t));
  return tile(`studs|${css(base)}|${n}`, n, (g) => {
    g.fillStyle = css(base);
    g.fillRect(0, 0, n, n);
    const r = n * 0.3;
    // How tall the stud stands: straight up on screen is back along both floor axes.
    const h = n * 0.16;
    const bx = n / 2 + h / 2;
    const by = n / 2 + h / 2;
    const disc = (x: number, y: number, color: string): void => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    // Its shadow on the brick, thrown toward the viewer's left.
    g.globalAlpha = 0.35;
    disc(bx + n * 0.03, by + n * 0.07, shade(0.35));
    g.globalAlpha = 1;
    // Its side, swept up from the brick, then its top.
    for (let i = 0; i <= 6; i++) {
      disc(bx - (h * i) / 6, by - (h * i) / 6, shade(0.2));
    }
    disc(bx - h, by - h, light(0.1));
    // A glint on the moulded plastic.
    g.strokeStyle = light(0.6);
    g.lineWidth = n * 0.05;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(bx - h, by - h, r * 0.68, Math.PI * 1.55, Math.PI * 1.95);
    g.stroke();
  });
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
    fallback: string,
    axes?: readonly number[]
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
      const frame = axes
        ? new DOMMatrix([axes[0], axes[1], axes[2], axes[3], 0, 0])
        : new DOMMatrix();
      p.setTransform(frame.rotateSelf(angle).scaleSelf(1 / scale, 1 / scale));
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
    studs: (base, pitch) => {
      const c = parseColor(base);
      const n = Math.max(4, Math.round(pitch * 2) / 2);
      if (!c) {
        return base;
      }
      return pattern(`studs|${base}|${n}`, () => studTile(c, n), 0, base, ISO);
    },
  };
}

/** The floor's axes on screen: a tile's x runs down-right, its y down-left. */
const ISO = [
  Math.cos(Math.PI / 6),
  Math.sin(Math.PI / 6),
  -Math.cos(Math.PI / 6),
  Math.sin(Math.PI / 6),
];
