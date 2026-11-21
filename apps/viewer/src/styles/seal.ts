import { Seal } from './types';

/**
 * A painter's seal: a small square of vermilion stamped on the sheet, its
 * characters cut out of the ink and read top to bottom. Stamped from a canvas
 * of its own, in its own ink whatever the style makes of other colours, and
 * the same every time: its worn edge and thin patches are seeded by its text.
 */

/** Brush-written and printed faces most machines carry, most like a carved seal first. */
const FONT =
  '"STKaiti", "Kaiti SC", "KaiTi", "BiauKai", "Songti SC", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", serif';

const stamps = new Map<string, HTMLCanvasElement | null>();

/** A small, stable stream of 0..1 from a string. */
function seeded(key: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < key.length; i++) {
    s = Math.imul(s ^ key.charCodeAt(i), 16777619);
  }
  s >>>= 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Whether this machine has a face for every character of `text`: one it
 * lacks is drawn as the same blank box as a character no face has.
 */
function canLetter(text: string): boolean {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 24;
  const g = probe.getContext('2d', { willReadFrequently: true });
  if (!g) {
    return false;
  }
  const inked = (ch: string): string => {
    g.clearRect(0, 0, 24, 24);
    g.font = `20px ${FONT}`;
    g.textBaseline = 'top';
    g.fillText(ch, 2, 2);
    return g.getImageData(0, 0, 24, 24).data.join('');
  };
  const missing = inked('￿');
  return [...text].every((ch) => inked(ch) !== missing);
}

/** The seal as a stamp `size` sheet units square, drawn `density` pixels to the unit; null where it cannot be lettered. */
function stampOf(seal: Seal, size: number, density: number): HTMLCanvasElement | null {
  const key = `${seal.text}|${seal.ink}|${size}@${density}`;
  const made = stamps.get(key);
  if (made !== undefined) {
    return made;
  }
  if (typeof document === 'undefined' || !canLetter(seal.text)) {
    stamps.set(key, null);
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.ceil(size * density);
  const g = canvas.getContext('2d');
  if (!g) {
    stamps.set(key, null);
    return null;
  }
  g.scale(density, density);
  const rnd = seeded(seal.text);
  // The stone's face: a square, its edge a little out of true.
  const inset = size * 0.04;
  const side = size - inset * 2;
  const steps = 9;
  g.fillStyle = seal.ink;
  g.beginPath();
  const corners: Array<[number, number]> = [
    [inset, inset],
    [inset + side, inset],
    [inset + side, inset + side],
    [inset, inset + side],
  ];
  corners.forEach(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % 4];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const jitter = (): number => (rnd() - 0.5) * size * 0.035;
      const px = x + (nx - x) * t + jitter();
      const py = y + (ny - y) * t + jitter();
      if (i === 0 && s === 0) {
        g.moveTo(px, py);
      } else {
        g.lineTo(px, py);
      }
    }
  });
  g.closePath();
  g.fill();
  // The characters, cut out of the ink, top to bottom.
  const chars = [...seal.text];
  const cell = (side * 0.9) / chars.length;
  g.globalCompositeOperation = 'destination-out';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${cell * 0.98}px ${FONT}`;
  // A brush-written face is fine for a knife: cut each stroke a little broader.
  g.lineWidth = cell * 0.045;
  g.lineJoin = 'round';
  chars.forEach((ch, i) => {
    const y = inset + side * 0.05 + cell * (i + 0.52);
    g.fillText(ch, size / 2, y);
    g.strokeText(ch, size / 2, y);
  });
  // Where the stone is chipped and the ink took thinly.
  for (let i = 0; i < 70; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.6;
    const r = size * (0.006 + rnd() * 0.022);
    g.beginPath();
    g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  stamps.set(key, canvas);
  return canvas;
}

/**
 * Stamp `seal` on a canvas with its top left at (`x`, `y`), `size` units
 * square, a little off the square as a hand sets it down. Does nothing on a
 * machine with no face for its characters.
 */
export function stampSeal(
  ctx: CanvasRenderingContext2D,
  seal: Seal,
  x: number,
  y: number,
  size: number
): void {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const density = Math.min(8, Math.max(2, Math.ceil(m ? Math.hypot(m.a, m.b) : 2)));
  const stamp = stampOf(seal, size, density);
  if (!stamp) {
    return;
  }
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(-0.035);
  ctx.globalAlpha = 0.92;
  ctx.drawImage(stamp, -size / 2, -size / 2, size, size);
  ctx.restore();
}
