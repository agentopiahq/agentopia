import { RGBA, css, fromHsl, lum, mixRgb, nearest, rgba, shift, toHsl } from '../color';
import { RenderStyle } from '../types';

/**
 * The drawn looks: pencil, charcoal, chalk, ink lines and prints. Each maps
 * the office's colours onto its own medium; see `types.ts` for the contract.
 */

const level = (c: RGBA, cuts: number[]): number => {
  const l = lum(c);
  let i = 0;
  while (i < cuts.length && l < cuts[i]) {
    i++;
  }
  return i;
};

/** A colour pencil's lead for a colour: graphite, unless the colour is vivid. */
const leadFor = (c: RGBA, graphite: RGBA): string => {
  const [h, s] = toHsl(c);
  return s > 0.42
    ? css(mixRgb(graphite, fromHsl(h, Math.min(1, s * 1.1), 0.45), 0.7))
    : css(graphite);
};

const GRAPHITE = rgba('#3a3a42');
const PENCIL_PAPER = '#f6f1e4';

export const GRAPHITE_SKETCH: RenderStyle = {
  id: 'graphite',
  label: 'Graphite sketch',
  paper: PENCIL_PAPER,
  grid: '#ebe4d3',
  sheen: 0,
  wobble: 3,
  sketch: { overshoot: 5, ghost: 0.4 },
  fill(c, hint, p) {
    const lv = level(c, [0.86, 0.7, 0.5, 0.32]);
    if (lv === 0) {
      return PENCIL_PAPER;
    }
    return p.hatch({
      ground: PENCIL_PAPER,
      ink: leadFor(c, GRAPHITE),
      gap: [9, 6.5, 5, 4][lv - 1],
      width: 0.85,
      angle: hint.angle,
      cross: lv >= 3,
    });
  },
  stroke(c) {
    if (lum(c) > 0.8) {
      return null;
    }
    return css([GRAPHITE[0], GRAPHITE[1], GRAPHITE[2], lum(c) < 0.45 ? 0.85 : 0.5]);
  },
  letter: () => css(GRAPHITE),
  tint: (c) => css(mixRgb(rgba(PENCIL_PAPER), GRAPHITE, 1 - lum(c))),
  shadow: '#9a958c',
  finish: `vec4 look(vec2 s) {
    vec4 c = at(s);
    vec2 w = world(s);
    float g = noise(w * 1.4) * 0.6 + noise(w * 0.3) * 0.4;
    return vec4(c.rgb * (1.0 - 0.08 * g), c.a);
  }`,
};

const CHARCOAL_INK = rgba('#141414');
const CHARCOAL_PAPER = '#e5e1d8';

export const CHARCOAL: RenderStyle = {
  id: 'charcoal',
  label: 'Charcoal',
  paper: CHARCOAL_PAPER,
  grid: '#dcd7cc',
  sheen: 0,
  wobble: 2.4,
  ink: 1.5,
  sketch: { overshoot: 4, ghost: 0.3 },
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
    vec2 d = (vec2(noise(w * 0.09), noise(w * 0.09 + 11.0)) - 0.5) * 2.4 * uCam.z;
    vec4 c = (at(s + d) * 2.0 + at(s + d + vec2(1.2, 0.0)) + at(s + d - vec2(0.0, 1.2))) / 4.0;
    vec3 rgb = un(c);
    float l = lum(rgb);
    float tooth = smoothstep(0.7, 0.9, noise(w * 2.6));
    rgb = mix(rgb, vec3(0.93, 0.92, 0.89), tooth * 0.45 * (1.0 - l));
    vec2 v = (s - uView.xy * 0.5) / uView.xy;
    rgb *= 1.0 - 0.35 * smoothstep(0.35, 0.75, length(v));
    return vec4(rgb * c.a, c.a);
  }`,
};

const BOARD = '#26352e';
const CHALK = '#f2f1e8';

export const CHALKBOARD: RenderStyle = {
  id: 'chalkboard',
  label: 'Chalkboard',
  paper: BOARD,
  grid: '#2e3f37',
  dark: true,
  text: CHALK,
  sheen: 0,
  wobble: 2,
  ink: 1.4,
  sketch: { overshoot: 3, ghost: 0.25 },
  fill(c, hint, p) {
    const [h, s, l] = toHsl(c);
    const pastel = css(fromHsl(h, s * 0.7 + 0.1, 0.8));
    return p.hatch({
      ground: BOARD,
      ink: pastel,
      gap: 3.2 + (1 - l) * 5.5,
      width: 1.7,
      angle: hint.angle,
    });
  },
  stroke(c) {
    const [h, s, l] = toHsl(c);
    return l < 0.45 || s < 0.2 ? CHALK : css(fromHsl(h, s * 0.7 + 0.1, 0.8));
  },
  letter: () => CHALK,
  tint(c) {
    const [h, s, l] = toHsl(c);
    return css(mixRgb(rgba(BOARD), fromHsl(h, s * 0.7 + 0.1, 0.8), l * 0.55));
  },
  shadow: '#1d2924',
  finish: `vec4 look(vec2 s) {
    vec2 w = world(s);
    vec4 c = at(s + (vec2(noise(w * 0.5), noise(w * 0.5 + 5.0)) - 0.5) * 1.2 * uCam.z);
    vec3 rgb = un(c);
    vec3 board = vec3(0.149, 0.208, 0.18);
    float chalk = smoothstep(0.3, 0.6, lum(rgb));
    rgb = mix(rgb, board, chalk * smoothstep(0.55, 0.85, noise(w * 2.2)) * 0.65);
    rgb += 0.04 * noise(w * 0.02);
    return vec4(rgb * c.a, c.a);
  }`,
};

const BLUE = rgba('#1f4f8f');
const WHITE_LINE = '#eaf3ff';

export const BLUEPRINT: RenderStyle = {
  id: 'blueprint',
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

const LINO_INK = '#1d1814';
const LINO_PAPER = '#efe5cf';
const LINO_RED = '#cf4a2a';

export const LINOCUT: RenderStyle = {
  id: 'linocut',
  label: 'Linocut',
  paper: LINO_PAPER,
  grid: '#e5d9bf',
  sheen: 0,
  wobble: 0.8,
  ink: 1.9,
  fill(c, hint, p) {
    const [h, s] = toHsl(c);
    if (s > 0.5 && (h < 35 || h > 340) && lum(c) > 0.3) {
      return LINO_RED;
    }
    const l = lum(c);
    if (l > 0.8) {
      return LINO_PAPER;
    }
    if (l > 0.56) {
      return p.hatch({ ground: LINO_PAPER, ink: LINO_INK, gap: 6, width: 2.2, angle: hint.angle });
    }
    if (l > 0.3) {
      return p.hatch({ ground: LINO_INK, ink: LINO_PAPER, gap: 6, width: 1.6, angle: hint.angle });
    }
    return LINO_INK;
  },
  stroke: (c) => (lum(c) > 0.8 ? LINO_PAPER : LINO_INK),
  letter: () => LINO_INK,
  tint: (c) => (lum(c) > 0.6 ? LINO_PAPER : LINO_INK),
  shadow: '#5a524a',
  finish: `vec4 look(vec2 s) {
    vec2 w = world(s);
    vec2 d = (vec2(noise(w * 0.8), noise(w * 0.8 + 7.0)) - 0.5) * 1.4 * uCam.z;
    vec4 c = at(s + d);
    vec3 rgb = un(c);
    if (lum(rgb) < 0.3 && hash(floor(w * 1.3)) > 0.93) {
      rgb = vec3(0.937, 0.898, 0.812);
    }
    return vec4(rgb * c.a, c.a);
  }`,
};

const COMIC_INK = '#141414';

export const COMIC: RenderStyle = {
  id: 'comic',
  label: 'Comic halftone',
  paper: '#fff6d8',
  grid: '#f3e7bf',
  sheen: 0,
  wobble: 0,
  ink: 1.8,
  fill(c, _hint, p) {
    const base = shift(c, { sat: 1.35 });
    const l = lum(c);
    if (l >= 0.62) {
      return css(base);
    }
    return p.dots({
      ground: css(base),
      ink: 'rgba(20,20,20,0.5)',
      cell: 6,
      r: Math.min(2.4, 0.7 + (0.62 - l) * 3.2),
      angle: 45,
    });
  },
  stroke: (c) => (lum(c) < 0.45 ? COMIC_INK : css(shift(c, { sat: 1.35 }))),
  letter: () => COMIC_INK,
  tint: (c) => css(shift(c, { sat: 1.35 })),
};

export const FLAT: RenderStyle = {
  id: 'flat',
  label: 'Flat vector',
  paper: '#fdf3e7',
  grid: '#fdf3e7',
  sheen: 0,
  wobble: 0,
  fill: (c) => css(shift(c, { sat: 1.25, s: 0.05, l: 0.02 })),
  stroke: (c) => (lum(c) < 0.4 ? null : css(shift(c, { sat: 1.25, s: 0.05, l: 0.02 }))),
  letter: () => '#2b2d42',
  tint: (c) => css(shift(c, { sat: 1.25, s: 0.05, l: 0.02 })),
  shadow: '#e7d3bd',
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
  label: 'Neon night',
  paper: '#0b0a1d',
  grid: '#1a1840',
  dark: true,
  text: '#d9d6ff',
  sheen: 0,
  wobble: 0,
  ink: 1.1,
  fill: (c) => css(mixRgb(c, NIGHT, 0.82)),
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

const PICO = [
  '#000000',
  '#1d2b53',
  '#7e2553',
  '#008751',
  '#ab5236',
  '#5f574f',
  '#c2c3c7',
  '#fff1e8',
  '#ff004d',
  '#ffa300',
  '#ffec27',
  '#00e436',
  '#29adff',
  '#83769c',
  '#ff77a8',
  '#ffccaa',
].map((h) => rgba(h));
const PICO_INK = '#1d2b53';

export const PIXEL: RenderStyle = {
  id: 'pixel',
  label: 'Pixel art',
  paper: '#fff1e8',
  grid: '#ffccaa',
  sheen: 0,
  wobble: 0,
  ink: 2.4,
  fill: (c) => css(nearest(c, PICO)),
  stroke: (c) => (lum(c) < 0.5 ? PICO_INK : css(nearest(c, PICO))),
  letter: () => PICO_INK,
  tint: (c) => css(nearest(c, PICO)),
  shadow: '#c2c3c7',
  finish: `void pick(inout vec3 best, inout float bd, vec3 c, vec3 p) {
    vec3 d = c - p;
    float e = dot(d * d, vec3(0.3, 0.59, 0.11));
    if (e < bd) { bd = e; best = p; }
  }
  vec3 pico(vec3 c) {
    vec3 b = vec3(0.0); float d = 9.0;
    pick(b, d, c, vec3(0.0, 0.0, 0.0)); pick(b, d, c, vec3(0.114, 0.169, 0.325));
    pick(b, d, c, vec3(0.494, 0.145, 0.325)); pick(b, d, c, vec3(0.0, 0.529, 0.318));
    pick(b, d, c, vec3(0.671, 0.322, 0.212)); pick(b, d, c, vec3(0.373, 0.341, 0.31));
    pick(b, d, c, vec3(0.761, 0.765, 0.78)); pick(b, d, c, vec3(1.0, 0.945, 0.91));
    pick(b, d, c, vec3(1.0, 0.0, 0.302)); pick(b, d, c, vec3(1.0, 0.639, 0.0));
    pick(b, d, c, vec3(1.0, 0.925, 0.153)); pick(b, d, c, vec3(0.0, 0.894, 0.212));
    pick(b, d, c, vec3(0.161, 0.678, 1.0)); pick(b, d, c, vec3(0.514, 0.463, 0.612));
    pick(b, d, c, vec3(1.0, 0.467, 0.659)); pick(b, d, c, vec3(1.0, 0.8, 0.667));
    return b;
  }
  vec4 look(vec2 s) {
    float b = 3.0 * max(uCam.z, 0.6);
    vec2 cell = floor((s - uCam.xy) / b);
    vec4 c = at((cell + 0.5) * b + uCam.xy);
    return vec4(pico(un(c)) * c.a, c.a);
  }`,
};
