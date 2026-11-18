/**
 * Colour arithmetic for the drawing styles: parsing whatever a drawing hands
 * the canvas, and the few moves a style makes on it (lighter, more vivid,
 * nearest in a palette).
 */

/** Red, green and blue in 0..255, alpha in 0..1. */
export type RGBA = [number, number, number, number];

const cache = new Map<string, RGBA | null>();

/** A CSS colour as RGBA: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()`; null for anything else. */
export function parseColor(css: string): RGBA | null {
  const hit = cache.get(css);
  if (hit !== undefined) {
    return hit;
  }
  let out: RGBA | null = null;
  const s = css.trim().toLowerCase();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      const v = [...h].map((ch) => parseInt(ch + ch, 16));
      out = [v[0], v[1], v[2], h.length === 4 ? v[3] / 255 : 1];
    } else if (h.length === 6 || h.length === 8) {
      const v = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
      out = [v[0], v[1], v[2], h.length === 8 ? v[3] / 255 : 1];
    }
  } else {
    const m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const parts = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length >= 3) {
        out = [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
      }
    }
  }
  if (out && out.some((v) => Number.isNaN(v))) {
    out = null;
  }
  cache.set(css, out);
  return out;
}

/** RGBA back to CSS. */
export function css(c: RGBA): string {
  const [r, g, b] = c.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(v))));
  if (c[3] >= 1) {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${r},${g},${b},${Math.max(0, c[3]).toFixed(3)})`;
}

/** A CSS colour as a number, for Pixi. */
export function hexOf(c: RGBA): number {
  return (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
}

/** Perceived lightness, 0..1. */
export function lum(c: RGBA): number {
  return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
}

/** `a` toward `b` by `t`, alpha kept from `a`. */
export function mixRgb(a: RGBA, b: RGBA, t: number): RGBA {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3]];
}

/** A `#rrggbb` as RGBA; throws on anything else, for a style's own constants. */
export function rgba(hex: string, alpha = 1): RGBA {
  const c = parseColor(hex);
  if (!c) {
    throw new Error(`not a colour: ${hex}`);
  }
  return [c[0], c[1], c[2], alpha];
}

export function toHsl(c: RGBA): [number, number, number] {
  const r = c[0] / 255;
  const g = c[1] / 255;
  const b = c[2] / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) {
    return [0, 0, l];
  }
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function fromHsl(h: number, s: number, l: number, alpha = 1): RGBA {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  const [r, g, b] =
    hh < 60
      ? [c, x, 0]
      : hh < 120
        ? [x, c, 0]
        : hh < 180
          ? [0, c, x]
          : hh < 240
            ? [0, x, c]
            : hh < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255, alpha];
}

/** Move a colour round the wheel, more or less vivid, lighter or darker. */
export function shift(c: RGBA, o: { h?: number; s?: number; sat?: number; l?: number }): RGBA {
  const [h, s, l] = toHsl(c);
  return fromHsl(h + (o.h ?? 0), s * (o.sat ?? 1) + (o.s ?? 0), l + (o.l ?? 0), c[3]);
}

/** The palette colour nearest `c`, weighted by how the eye weighs the channels. */
export function nearest(c: RGBA, palette: readonly RGBA[]): RGBA {
  let best = palette[0];
  let bestD = Infinity;
  for (const p of palette) {
    const dr = c[0] - p[0];
    const dg = c[1] - p[1];
    const db = c[2] - p[2];
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return [best[0], best[1], best[2], c[3]];
}

/** Two colours are the same paint. */
export function same(a: RGBA | null, b: RGBA | null): boolean {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
