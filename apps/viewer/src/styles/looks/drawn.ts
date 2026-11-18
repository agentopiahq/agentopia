import { RGBA, css, fromHsl, lum, mixRgb, nearest, rgba, shift, toHsl } from '../color';
import { RenderStyle } from '../types';

/**
 * The drawn looks: pencil, charcoal, chalk, ink lines and prints. Each maps
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
  // Every face coloured in: a light first layer of its colour, then hatching
  // in the same pencil, closer and crossed the darker the face.
  fill(c, hint, p) {
    const l = lum(c);
    if (l > 0.93 && toHsl(c)[1] < 0.25) {
      return PENCIL_PAPER;
    }
    return p.hatch({
      ground: css(mixRgb(rgba(PENCIL_PAPER), c, 0.35)),
      ink: css(pencilOf(c)),
      gap: 2.6 + l * 4,
      width: 1.15,
      angle: hint.angle,
      cross: l < 0.35,
    });
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
  tint: (c) => css(mixRgb(rgba(PENCIL_PAPER), c, 0.6)),
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
  // A figure is chalked in solid, so its face reads; the room is hatched.
  features: BOARD,
  fill(c, hint, p) {
    const [h, s, l] = toHsl(c);
    if (hint.figure) {
      return css(fromHsl(h, s * 0.8 + 0.1, 0.72));
    }
    const pastel = css(fromHsl(h, s * 0.9 + 0.15, 0.76, 0.85));
    return p.hatch({
      ground: BOARD,
      ink: pastel,
      gap: 3.5 + (1 - l) * 7,
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

const LINO_INK = '#1d1814';
const LINO_PAPER = '#efe5cf';
const LINO_RED = '#cf4a2a';

export const LINOCUT: RenderStyle = {
  id: 'linocut',
  mono: true,
  label: 'Linocut',
  paper: LINO_PAPER,
  grid: '#e5d9bf',
  sheen: 0,
  wobble: 0.8,
  ink: 1.9,
  fill(c, hint, p) {
    const [h, s] = toHsl(c);
    if (s > 0.7 && h > 4 && h < 32 && lum(c) > 0.35 && lum(c) < 0.72) {
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
    vec2 d = (vec2(noise(w * 2.4), noise(w * 2.4 + 7.0)) - 0.5) * 0.6 * uCam.z;
    vec4 c = at(s + d);
    vec3 rgb = un(c);
    if (lum(rgb) < 0.3 && hash(floor(w * 5.0)) > 0.95) {
      rgb = vec3(0.937, 0.898, 0.812);
    }
    return vec4(rgb * c.a, c.a);
  }`,
};

const COMIC_INK = '#141414';

export const COMIC: RenderStyle = {
  id: 'comic',
  label: 'Comic',
  paper: '#fff6d8',
  grid: '#f3e7bf',
  sheen: 0,
  wobble: 0,
  ink: 1.8,
  fill(c, hint, p) {
    const base = shift(c, { sat: 1.35 });
    const l = lum(c);
    // Figures stay flat colour: halftone is for the room's shade.
    if (l >= 0.62 || hint.figure) {
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
  label: 'Flat',
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

/** DawnBringer's 32: a pixel artist's palette, with the browns and tans an office of wood needs. */
const PICO = [
  '#000000',
  '#222034',
  '#45283c',
  '#663931',
  '#8f563b',
  '#df7126',
  '#d9a066',
  '#eec39a',
  '#fbf236',
  '#99e550',
  '#6abe30',
  '#37946e',
  '#4b692f',
  '#524b24',
  '#323c39',
  '#3f3f74',
  '#306082',
  '#5b6ee1',
  '#639bff',
  '#5fcde4',
  '#cbdbfc',
  '#ffffff',
  '#9badb7',
  '#847e87',
  '#696a6a',
  '#595652',
  '#76428a',
  '#ac3232',
  '#d95763',
  '#d77bba',
  '#8f974a',
  '#8a6f30',
].map((h) => rgba(h));
const PICO_INK = '#222034';

export const PIXEL: RenderStyle = {
  id: 'pixel',
  label: 'Pixel art',
  paper: '#cbdbfc',
  grid: '#9badb7',
  sheen: 0,
  wobble: 0,
  ink: 1.8,
  fill: (c) => css(nearest(c, PICO)),
  stroke: (c) => (lum(c) < 0.5 ? PICO_INK : css(nearest(c, PICO))),
  letter: () => PICO_INK,
  tint: (c) => css(nearest(c, PICO)),
  shadow: '#9badb7',
  finish: `void pick(inout vec3 best, inout float bd, vec3 c, vec3 p) {
    vec3 d = c - p;
    float e = dot(d * d, vec3(0.3, 0.59, 0.11));
    if (e < bd) { bd = e; best = p; }
  }
  vec3 pico(vec3 c) {
    vec3 b = vec3(0.0); float d = 9.0;
${PICO.map(
  (p) =>
    `    pick(b, d, c, vec3(${p
      .slice(0, 3)
      .map((v) => (v / 255).toFixed(3))
      .join(', ')}));`
).join('\n')}
    return b;
  }
  vec4 look(vec2 s) {
    float b = 1.5 * max(uCam.z, 0.6);
    vec2 cell = floor((s - uCam.xy) / b);
    vec4 c = at((cell + 0.5) * b + uCam.xy);
    return vec4(pico(un(c)) * c.a, c.a);
  }`,
};
