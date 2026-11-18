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

/** Tiles are drawn at this many pixels per sheet unit. */
const DENSITY = 2;

const tiles = new Map<string, HTMLCanvasElement>();
const perCanvas = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern | null>>();

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
  let canvas = tiles.get(key);
  if (!canvas) {
    if (typeof document === 'undefined') {
      return null;
    }
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.max(2, Math.round(size * DENSITY));
    const g = canvas.getContext('2d');
    if (!g) {
      return null;
    }
    g.scale(DENSITY, DENSITY);
    draw(g, size);
    tiles.set(key, canvas);
  }
  return canvas;
}

/** Draw `fn` at a point and at its wrapped copies, so a tile repeats without a seam. */
function wrapped(
  n: number,
  x: number,
  y: number,
  reach: number,
  fn: (x: number, y: number) => void
): void {
  for (const dx of [-n, 0, n]) {
    for (const dy of [-n, 0, n]) {
      const px = x + dx;
      const py = y + dy;
      if (px > -reach && px < n + reach && py > -reach && py < n + reach) {
        fn(px, py);
      }
    }
  }
}

const jitter = (base: string, rnd: () => number, dl: number, dh: number, ds: number): string => {
  const c = parseColor(base) ?? [128, 128, 128, 1];
  const [h, s, l] = toHsl(c);
  return css(
    fromHsl(
      h + (rnd() - 0.5) * 2 * dh,
      s + (rnd() - 0.5) * 2 * ds,
      l + (rnd() - 0.5) * 2 * dl,
      c[3]
    )
  );
};

function strokeTile(
  g: CanvasRenderingContext2D,
  n: number,
  base: string,
  key: string,
  o: {
    count: number;
    len: [number, number];
    width: [number, number];
    spread: number;
    dl: number;
    alpha: number;
    ground?: string;
  }
): void {
  const rnd = seeded(key);
  g.fillStyle = o.ground ?? base;
  g.fillRect(0, 0, n, n);
  g.lineCap = 'round';
  for (let i = 0; i < o.count; i++) {
    const x = rnd() * n;
    const y = rnd() * n;
    const a = ((rnd() - 0.5) * o.spread * Math.PI) / 180;
    const len = o.len[0] + rnd() * (o.len[1] - o.len[0]);
    const w = o.width[0] + rnd() * (o.width[1] - o.width[0]);
    const color = jitter(base, rnd, o.dl, 9, 0.08);
    const dx = (Math.cos(a) * len) / 2;
    const dy = (Math.sin(a) * len) / 2;
    wrapped(n, x, y, len, (px, py) => {
      g.beginPath();
      g.moveTo(px - dx, py - dy);
      g.lineTo(px + dx, py + dy);
      g.strokeStyle = color;
      g.globalAlpha = o.alpha;
      g.lineWidth = w;
      g.stroke();
    });
  }
  g.globalAlpha = 1;
}

function textureTile(
  kind: TextureKind,
  base: string,
  ground: string | undefined
): HTMLCanvasElement | null {
  const key = `${kind}|${base}|${ground ?? ''}`;
  switch (kind) {
    case 'wax':
      return tile(key, 44, (g, n) => {
        strokeTile(g, n, base, key, {
          count: 64,
          len: [10, 20],
          width: [3, 4.4],
          spread: 30,
          dl: 0.06,
          alpha: 0.95,
          ground,
        });
        // The paper's tooth, where the wax skipped.
        const rnd = seeded(`${key}|tooth`);
        g.fillStyle = ground ?? '#c6a679';
        for (let i = 0; i < 260; i++) {
          g.globalAlpha = 0.55 + rnd() * 0.45;
          g.fillRect(rnd() * n, rnd() * n, 0.5 + rnd() * 0.9, 0.5 + rnd() * 0.7);
        }
        g.globalAlpha = 1;
      });
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
  }
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
    let p = patterns.get(key);
    if (p === undefined) {
      const canvas = make();
      p =
        canvas && typeof ctx.createPattern === 'function'
          ? ctx.createPattern(canvas, 'repeat')
          : null;
      patterns.set(key, p);
    }
    if (!p) {
      return fallback;
    }
    if (typeof DOMMatrix !== 'undefined' && typeof p.setTransform === 'function') {
      p.setTransform(new DOMMatrix().rotateSelf(angle).scaleSelf(1 / DENSITY, 1 / DENSITY));
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
    dots: (o) => {
      const key = `dots|${o.ground}|${o.ink}|${o.cell}|${o.r.toFixed(2)}`;
      return pattern(
        key,
        () =>
          tile(key, o.cell, (g, n) => {
            g.fillStyle = o.ground;
            g.fillRect(0, 0, n, n);
            g.fillStyle = o.ink;
            g.beginPath();
            g.arc(n / 2, n / 2, o.r, 0, Math.PI * 2);
            g.fill();
          }),
        o.angle,
        o.ground
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
