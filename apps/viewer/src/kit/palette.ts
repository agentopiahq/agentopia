/**
 * The marker palette.
 *
 * The office is drawn as one hand-inked sheet, so every colour on it comes from
 * here: the paper, the ink, the flat blue of every cast shadow, and the
 * three-tone materials the objects are shaded with.
 *
 * A material is three tones — light, mid and dark — and a face takes one of
 * them by the way it meets the light (see `Iso.tone`). An object reads as
 * solid because its top, its lit side and its shaded side are three different
 * colours under one heavy ink line; the pen then grades each face a little
 * within its band and adds rims of highlight (see `Iso.sheen`), so the bands
 * read as real materials under real light rather than flat cut paper.
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
  floor: { l: '#ddb27a', m: '#c8955a', d: '#8f6236' },
  /** The walls' cut plaster: their tops and ends. */
  wall: { l: '#f6efdf', m: '#ebe0c8', d: '#cdbf9f' },
  /** Warm white wall paint. */
  paint: { l: '#fbf3e3', m: '#f1e5cc', d: '#d8c7a6' },
  /** The feature wall the speaker, whiteboard and shutter hang on: a deep teal. */
  teal: { l: '#7fb8b1', m: '#5f9e98', d: '#3f746f' },
  /** Painted trim: skirting, rails, sills, window frames. */
  trim: { l: '#fffaf0', m: '#efe6d3', d: '#c9bda4' },
  /** Oiled walnut, for the desk tops. */
  walnut: { l: '#b97a4a', m: '#9a6038', d: '#6a3f22' },
  /** Brushed aluminium. */
  alu: { l: '#f2f4f5', m: '#cfd5d8', d: '#98a1a6' },
  /** Graphite plastic: monitors, panels. */
  graphite: { l: '#5a5e66', m: '#3e424a', d: '#26292f' },
  /** Brass, for knobs and handles. */
  brass: { l: '#f6d57a', m: '#d9a93c', d: '#9a7120' },
  /** A darker leaf, for the shaded side of a plant. */
  fern: { l: '#78c06a', m: '#4f9a4c', d: '#2f6a35' },
  /** Glazed ceramic, for a plant pot. */
  glaze: { l: '#f2f0ea', m: '#d9d6cc', d: '#a9a597' },
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

/** Floor planks: a few oak tones, mixed board by board. */
export const PLANKS = ['#dcae74', '#d3a067', '#e3b981', '#c99258', '#d8a86e', '#cf9b60'] as const;

/** Rugs, one per desk: field, border, and the pattern woven into them. */
export const RUGS: ReadonlyArray<{ field: string; border: string; motif: string }> = [
  { field: '#7fbf9f', border: '#3f7d68', motif: '#f3e7c8' },
  { field: '#88a7dc', border: '#3d5a9a', motif: '#f6e6b8' },
  { field: '#e7929f', border: '#a44a5c', motif: '#fbeedd' },
  { field: '#e9be6a', border: '#a8762a', motif: '#fff4dc' },
  { field: '#9a8fd0', border: '#544a8f', motif: '#f6e9cf' },
  { field: '#e0906a', border: '#9c4f31', motif: '#fbecd8' },
];

/** Daylight through the windows, laid on the floor. */
export const SUN = { color: '#fff1c2', alpha: 0.46 } as const;

/** Accents, used sparingly: status lights and terminal text. */
export const ACCENT = {
  ledGreen: '#43c25c',
  ledRed: '#e2483d',
  ledBlue: '#4f8ee8',
  terminal: '#8af0ae',
  paperSheet: '#fffdf7',
  /** A lit LCD panel on a machine. */
  lcd: '#8fe0cf',
} as const;

/** Small hex → Pixi number, for the few Pixi-drawn overlays. */
export const hexNum = (hex: string): number => parseInt(hex.slice(1), 16);
