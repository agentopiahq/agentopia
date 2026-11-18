import { RGBA, css, fromHsl, lum, mixRgb, nearest, rgba, shift, toHsl } from '../color';
import { RenderStyle } from '../types';

/**
 * The drawn looks: pencil, charcoal, chalk, blueprint and neon. Each maps
 * the office's colours onto its own medium; see `types.ts` for the contract.
 */

const GRAPHITE = rgba('#3a3a42');
const PENCIL_PAPER = '#f6f1e4';

/** A colour as a coloured pencil lays it: a touch more vivid, never quite black or white. */
const pencilOf = (c: RGBA): RGBA => {
  const [h, s, l] = toHsl(c);
  return fromHsl(h, Math.min(1, s * 1.15 + 0.05), Math.max(0.16, Math.min(0.74, l)));
};

export const COLOUR_PENCIL: RenderStyle = {
  id: 'colour-pencil',
  label: 'Colour pencil',
  paper: PENCIL_PAPER,
  grid: '#ebe4d3',
  sheen: 0,
  wobble: 3,
  sketch: { overshoot: 5, ghost: 0.4 },
  // Every face coloured in solid, the paper's tooth showing through the pencil.
  fill(c, _hint, p) {
    if (lum(c) > 0.93 && toHsl(c)[1] < 0.25) {
      return PENCIL_PAPER;
    }
    return p.texture('tooth', css(mixRgb(rgba(PENCIL_PAPER), pencilOf(c), 0.82)), 0);
  },
  // The outlines stay the raw graphite sketch.
  stroke(c) {
    const l = lum(c);
    if (l > 0.8) {
      return null;
    }
    return l < 0.45
      ? css([GRAPHITE[0], GRAPHITE[1], GRAPHITE[2], 0.85])
      : css([...pencilOf(c).slice(0, 3), 0.8] as RGBA);
  },
  letter: () => css(GRAPHITE),
  tint: (c) => css(mixRgb(rgba(PENCIL_PAPER), pencilOf(c), 0.82)),
  shadow: '#b3aa9c',
  finish: `vec4 look(vec2 s) {
    vec4 c = at(s);
    vec2 w = world(s);
    float g = noise(w * 3.0) * 0.6 + noise(w * 0.4) * 0.4;
    return vec4(c.rgb * (1.0 - 0.07 * g), c.a);
  }`,
};

const CHARCOAL_INK = rgba('#141414');
const CHARCOAL_PAPER = '#e5e1d8';

export const CHARCOAL: RenderStyle = {
  id: 'charcoal',
  mono: true,
  label: 'Charcoal',
  paper: CHARCOAL_PAPER,
  grid: '#dcd7cc',
  sheen: 0,
  // Straight, firm strokes: barely a wobble, a short overshoot.
  wobble: 0.4,
  ink: 1.5,
  sketch: { overshoot: 2.5, ghost: 0.3 },
  fill(c, _hint, p) {
    const dark = Math.pow(1 - lum(c), 1.15) * 0.95;
    return p.texture('tooth', css(mixRgb(rgba(CHARCOAL_PAPER), CHARCOAL_INK, dark)), 0);
  },
  stroke: (c) => (lum(c) > 0.8 ? 'rgba(247,244,238,0.75)' : css(CHARCOAL_INK)),
  letter: () => css(CHARCOAL_INK),
  tint: (c) => css(mixRgb(rgba(CHARCOAL_PAPER), CHARCOAL_INK, Math.pow(1 - lum(c), 1.15) * 0.95)),
  shadow: '#77736c',
  finish: `vec4 look(vec2 s) {
    vec2 w = world(s);
    vec2 d = (vec2(noise(w * 0.09), noise(w * 0.09 + 11.0)) - 0.5) * 0.6 * uCam.z;
    vec4 c = (at(s + d) * 2.0 + at(s + d + vec2(1.2, 0.0)) + at(s + d - vec2(0.0, 1.2))) / 4.0;
    vec3 rgb = un(c);
    float l = lum(rgb);
    float tooth = smoothstep(0.7, 0.9, noise(w * 2.6));
    rgb = mix(rgb, vec3(0.93, 0.92, 0.89), tooth * 0.45 * (1.0 - l));
    return vec4(rgb * c.a, c.a);
  }`,
};

const BOARD = '#26352e';
const CHALK = '#f2f1e8';

export const CHALKBOARD: RenderStyle = {
  id: 'chalkboard',
  mono: true,
  label: 'Chalk',
  paper: BOARD,
  grid: '#2e3f37',
  dark: true,
  text: CHALK,
  sheen: 0,
  wobble: 2,
  ink: 1.4,
  sketch: { overshoot: 3, ghost: 0.25 },
  // Everything chalked in solid: the room in soft pastel over the slate, the
  // figures brighter, so their faces read.
  features: BOARD,
  fill(c, hint) {
    const [h, s, l] = toHsl(c);
    if (hint.figure) {
      return css(fromHsl(h, s * 0.8 + 0.1, 0.72));
    }
    return css(mixRgb(rgba(BOARD), fromHsl(h, s * 0.9 + 0.15, 0.76), 0.25 + l * 0.5));
  },
  stroke(c) {
    const [h, s, l] = toHsl(c);
    return l < 0.45 || s < 0.2 ? CHALK : css(fromHsl(h, s * 0.7 + 0.1, 0.8));
  },
  letter: () => CHALK,
  tint(c) {
    const [h, s, l] = toHsl(c);
    return css(mixRgb(rgba(BOARD), fromHsl(h, s * 0.9 + 0.15, 0.76), 0.25 + l * 0.5));
  },
  shadow: '#1d2924',
  finish: `vec4 look(vec2 s) {
    vec2 w = world(s);
    vec4 c = at(s + (vec2(noise(w * 1.6), noise(w * 1.6 + 5.0)) - 0.5) * 0.5 * uCam.z);
    vec3 rgb = un(c);
    vec3 board = vec3(0.149, 0.208, 0.18);
    float chalk = smoothstep(0.3, 0.6, lum(rgb));
    rgb = mix(rgb, board, chalk * smoothstep(0.55, 0.85, noise(w * 6.0)) * 0.45);
    rgb += 0.04 * noise(w * 0.02);
    return vec4(rgb * c.a, c.a);
  }`,
};

const BLUE = rgba('#1f4f8f');
const WHITE_LINE = '#eaf3ff';

export const BLUEPRINT: RenderStyle = {
  id: 'blueprint',
  mono: true,
  label: 'Blueprint',
  paper: '#1f4f8f',
  grid: '#36639f',
  dark: true,
  text: WHITE_LINE,
  sheen: 0,
  wobble: 0.3,
  fill: (c) => css(mixRgb(mixRgb(BLUE, rgba('#13396e'), 0.5), rgba('#2f64a6'), lum(c))),
  stroke: (c) => (lum(c) > 0.8 ? 'rgba(234,243,255,0.5)' : WHITE_LINE),
  letter: () => WHITE_LINE,
  tint: (c) => css(mixRgb(mixRgb(BLUE, rgba('#13396e'), 0.5), rgba('#2f64a6'), lum(c))),
  shadow: '#173f75',
  finish: `vec4 look(vec2 s) {
    vec4 c = at(s);
    return vec4(c.rgb + (noise(world(s) * 0.9) - 0.5) * 0.035 * c.a, c.a);
  }`,
};

const NIGHT = rgba('#0b0a1d');
const neon = (c: RGBA | null): string => {
  if (!c) {
    return '#38f9ff';
  }
  const [h, s, l] = toHsl(c);
  if (s < 0.14) {
    return l > 0.6 ? '#e8e6ff' : '#9a7bff';
  }
  return css(fromHsl(h, Math.max(0.85, s), 0.62));
};

export const NEON: RenderStyle = {
  id: 'neon',
  features: '#0b0a1d',
  label: 'Neon',
  paper: '#0b0a1d',
  grid: '#1a1840',
  dark: true,
  text: '#d9d6ff',
  sheen: 0,
  wobble: 0,
  ink: 1.1,
  // The room sinks into the dark; a figure is lit, so its face and eyes still read.
  fill: (c, hint) =>
    css(hint.figure ? shift(mixRgb(c, NIGHT, 0.4), { sat: 1.2 }) : mixRgb(c, NIGHT, 0.82)),
  stroke: (c, hint) => (lum(c) < 0.45 ? neon(hint.last) : neon(c)),
  letter: () => '#d9d6ff',
  tint: (c) => css(mixRgb(c, NIGHT, 0.8)),
  shadow: '#05040f',
  finish: `vec4 look(vec2 s) {
    vec4 c = at(s);
    vec3 g = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec2 o = vec2(cos(a), sin(a)) * uCam.z;
      g += max(un(at(s + o * 3.0)) - 0.3, 0.0) * 0.7 + max(un(at(s + o * 8.0)) - 0.3, 0.0) * 0.5;
    }
    vec3 rgb = un(c) + g / 12.0 * 1.6;
    return vec4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
  }`,
};
