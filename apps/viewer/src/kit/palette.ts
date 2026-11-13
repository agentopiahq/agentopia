/**
 * The marker palette.
 *
 * The office is drawn as one hand-inked sheet, so every colour on it comes from
 * here: the paper, the ink, the flat blue of every cast shadow, and the
 * three-tone materials the objects are shaded with.
 *
 * A material is three flat tones — light, mid and dark — and a face takes one
 * of them by the way it meets the light (see `Iso.tone`). There are no
 * gradients and no glows anywhere: an object reads as solid because its top,
 * its lit side and its shaded side are three different flat colours under one
 * heavy ink line.
 */

export interface Mat {
  /** Faces turned to the light: tops, mostly. */
  l: string;
  /** The lit side. */
  m: string;
  /** The side in shade. */
  d: string;
}

/** Mix two `#rrggbb` colours, `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  let out = '#';
  for (let i = 0; i < 3; i++) {
    const v = Math.round(channel(a, i) * (1 - t) + channel(b, i) * t);
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

/** A material from one body colour: the colour itself, then two steps darker. */
export function matOf(hex: string, darken = 0.16, shade = 0.38): Mat {
  return { l: hex, m: mix(hex, '#000000', darken), d: mix(hex, '#000000', shade) };
}

/** The sheet itself: ink, paper, and the few fixed colours every drawing shares. */
export const SHEET = {
  /** The page around the sheet. */
  page: '#e3dac6',
  paper: '#fffdf6',
  /** The faint isometric construction grid printed on the paper. */
  grid: '#ece5d4',
  ink: '#2b2930',
  /** Muted hand lettering: notes, the footnote. */
  lead: '#6a6055',
  /** The one flat blue every cast shadow is. */
  shadow: '#5d6c9c',
  /** How strongly a cast shadow covers what it falls on. */
  shadowAlpha: 0.5,
  /** The lit state: a desk that wants you. */
  red: '#c8372f',
  /** Cream label pills. */
  pill: '#fff4d6',
} as const;

/** Body colours, after the marker pigments: clear colours that read as marker. */
export const PAL = {
  cream: '#fffdf6',
  tan: '#ecc98e',
  wood: '#c07f3f',
  pink: '#f3a6bb',
  rose: '#ef6a4c',
  sage: '#93d3b0',
  sky: '#a9c8ee',
  blue: '#76a0e2',
  gold: '#f4b829',
  steel: '#c6ccce',
  shade: '#e3e0d2',
} as const;

/** Materials. Office things are mostly metal, enamel, laminate and wood. */
export const MAT = {
  metal: { l: '#eef0f0', m: '#c6ccce', d: '#8f989b' },
  ceramic: { l: '#fbfaf3', m: '#e3e0d2', d: '#bdb8a6' },
  dark: { l: '#55504a', m: '#3d3935', d: '#272421' },
  board: { l: '#e6e1d4', m: '#cfc8b8', d: '#aaa293' },
  wood: { l: '#d9a86c', m: '#bf8a4f', d: '#8e6236' },
  /** Desk laminate: a pale birch, so the dark monitor reads against it. */
  birch: { l: '#f0d9ac', m: '#dcbd86', d: '#b0905c' },
  /** The floor boards and the slab's cut edge. */
  floor: { l: '#f1dfb9', m: '#d9bd8a', d: '#a9824f' },
  /** The two back walls. */
  wall: { l: '#f6efdf', m: '#ebe0c8', d: '#cdbf9f' },
  /** Enamelled office machines. */
  machine: { l: '#f4f1e8', m: '#dcd7c8', d: '#aaa391' },
  cobalt: { l: '#a9c8ee', m: '#76a0e2', d: '#4d6fae' },
  mint: { l: '#bfe6cf', m: '#93d3b0', d: '#5f9c7b' },
  mustard: { l: '#f7cd5e', m: '#f4b829', d: '#b9861a' },
  tomato: { l: '#f48c72', m: '#ef6a4c', d: '#b8452f' },
  blush: { l: '#f7c3d1', m: '#f3a6bb', d: '#c77a8f' },
  terracotta: { l: '#e39a6c', m: '#c9784a', d: '#985430' },
  leaf: { l: '#a9dc8f', m: '#7fbf6a', d: '#4f8a43' },
  /** A glowing terminal: the screen colour is its own material. */
  screen: { l: '#2a3a36', m: '#1d2a26', d: '#141d1a' },
  glass: { l: '#e4f2f4', m: '#c4dfe4', d: '#97b9c0' },
  rubber: { l: '#6b6760', m: '#4e4a44', d: '#34312d' },
} satisfies Record<string, Mat>;

/** Accents, used sparingly: status lights and terminal text. */
export const ACCENT = {
  ledGreen: '#43c25c',
  ledRed: '#e2483d',
  ledBlue: '#4f8ee8',
  terminal: '#8af0ae',
  paperSheet: '#fffdf7',
} as const;

/** Small hex → Pixi number, for the few Pixi-drawn overlays. */
export const hexNum = (hex: string): number => parseInt(hex.slice(1), 16);
