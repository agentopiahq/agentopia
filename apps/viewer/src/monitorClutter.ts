/**
 * What a desk's monitor looks like as its session's context fills: a tidy
 * desktop with a window or two at first, then more and more windows piled
 * over each other, icons strewn everywhere, sticky notes, and at the end a
 * warning box over the lot. The fuller the context, the messier the screen.
 *
 * Pure: a fill and a seed in, rectangles out, in the glass's own pixels.
 * Each item is fixed by the seed and its place in the pile, so a desk's
 * clutter only ever grows as its context does (nothing jumps about), and
 * two desks at the same fill look different.
 */

export interface ClutterWindow {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which of the title-bar tones it wears. */
  tone: number;
}

export interface ClutterNote {
  x: number;
  y: number;
  size: number;
  /** Its tilt, in radians. */
  tilt: number;
}

export interface Clutter {
  windows: ClutterWindow[];
  icons: Array<{ x: number; y: number }>;
  notes: ClutterNote[];
  /** The warning box over everything, once the context is nearly full. */
  alert: { x: number; y: number; w: number; h: number } | null;
}

/** How many title-bar tones there are to pick from. */
export const CLUTTER_TONES = 5;

/** The most of each the screen ever holds. */
const MAX_WINDOWS = 11;
const MAX_ICONS = 18;
const MAX_NOTES = 5;

/** A seeded number in [0, 1) for the `i`th draw of a stream. Stable across runs. */
function draw(seed: number, stream: number, i: number): number {
  let h = (seed ^ Math.imul(stream + 1, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How many of something show at a fill: `base` at empty, `max` at full. */
const countAt = (fill: number, base: number, max: number): number =>
  Math.min(max, Math.floor(base + (max - base) * fill ** 1.4 + 1e-9));

/**
 * The clutter for a context `fill` (0 to 1) on a glass `w` by `h`: the
 * desktop itself, which a running terminal sits in front of (`terminalRect`).
 */
export function clutterFor(fill: number, seed: number, w: number, h: number): Clutter {
  const f = Math.max(0, Math.min(1, fill));
  const windows: ClutterWindow[] = [];
  const n = countAt(f, 2, MAX_WINDOWS);
  for (let i = 0; i < n; i++) {
    // The first two are the tidy desktop's; the rest pile up wherever, ever bigger.
    const tidy = i < 2;
    const big = tidy ? 0.5 : 0.32 + 0.3 * draw(seed, 1, i);
    const ww = w * (tidy ? (i === 0 ? 0.5 : 0.32) : big);
    const wh = h * (tidy ? (i === 0 ? 0.5 : 0.62) : 0.3 + 0.35 * draw(seed, 2, i));
    const x = tidy ? (i === 0 ? 4 : w * 0.6) : -ww * 0.15 + (w + ww * 0.1 - ww) * draw(seed, 3, i);
    const y = tidy ? (i === 0 ? 4 : 9) : -wh * 0.1 + (h - 3 - wh * 0.8) * draw(seed, 4, i);
    windows.push({ x, y, w: ww, h: wh, tone: Math.floor(draw(seed, 5, i) * CLUTTER_TONES) });
  }
  // Icons: a neat column down the left at first, then strewn across the glass.
  const icons: Array<{ x: number; y: number }> = [];
  const iconCount = countAt(f, 2, MAX_ICONS);
  for (let i = 0; i < iconCount; i++) {
    const neat = i < 4;
    icons.push(
      neat
        ? { x: w - 9, y: 4 + i * 8 }
        : { x: 2 + (w - 10) * draw(seed, 6, i), y: 2 + (h - 14) * draw(seed, 7, i) }
    );
  }
  const notes: ClutterNote[] = [];
  const noteCount = f < 0.45 ? 0 : countAt((f - 0.45) / 0.55, 1, MAX_NOTES);
  for (let i = 0; i < noteCount; i++) {
    notes.push({
      x: 3 + (w - 16) * draw(seed, 8, i),
      y: 2 + (h - 18) * draw(seed, 9, i),
      size: 9 + 3 * draw(seed, 10, i),
      tilt: (draw(seed, 11, i) - 0.5) * 0.5,
    });
  }
  const alert = f >= 0.85 ? { x: w * 0.22, y: h * 0.24, w: w * 0.56, h: h * 0.42 } : null;
  return { windows, icons, notes, alert };
}

/** A running terminal's window, always in front of the desktop. */
export interface TerminalRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Its title bar's height: none while it fills the glass. */
  bar: number;
}

/**
 * Where a running terminal sits on a glass `w` by `h` (above the taskbar):
 * the whole glass while the context is empty or unknown, then a window that
 * shrinks as the context fills, so ever more of the pile behind it shows,
 * nudged off-centre by the desk's seed.
 */
export function terminalRect(
  fill: number | null,
  seed: number,
  w: number,
  h: number
): TerminalRect {
  const f = fill === null ? 0 : Math.max(0, Math.min(1, fill));
  if (f <= 0.05) {
    return { x: 0, y: 0, w, h, bar: 0 };
  }
  const tw = w * (1 - 0.4 * f);
  const th = h * (1 - 0.34 * f);
  return {
    x: (w - tw) * (0.3 + 0.4 * draw(seed, 12, 0)),
    y: (h - th) * (0.25 + 0.5 * draw(seed, 13, 0)),
    w: tw,
    h: th,
    bar: 3,
  };
}
