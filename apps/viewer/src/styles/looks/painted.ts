import { RGBA, css, fromHsl, lum, mixRgb, nearest, rgba, toHsl } from '../color';
import { RenderStyle } from '../types';

/**
 * The painted looks from East Asia: a woodblock print in a printer's handful of
 * inks, and an ink painting in washes of one ink on rice paper.
 */

/** A woodblock printer's handful of inks. */
const UKIYO = [
  '#1f3a5f',
  '#2c4770',
  '#5b7fa3',
  '#c8402a',
  '#d98b8b',
  '#d6b276',
  '#e2b84a',
  '#d9703a',
  '#c08a55',
  '#e0a868',
  '#9c5a34',
  '#6f8a4f',
  '#7fa79a',
  '#8f9a86',
  '#ece0c4',
  '#f3ead6',
  '#e3d3b0',
  '#4a4642',
  '#2a2420',
].map((h) => rgba(h));
const SUMI = '#2a2420';

export const UKIYO_E: RenderStyle = {
  id: 'ukiyo-e',
  label: 'Ukiyo-e',
  paper: '#efe3c6',
  grid: '#e5d6b4',
  sheen: 0,
  wobble: 0.6,
  ink: 1.2,
  fill: (c) => css(nearest(c, UKIYO)),
  stroke: (c) => (lum(c) < 0.5 ? SUMI : css(nearest(c, UKIYO))),
  letter: () => SUMI,
  tint: (c) => css(nearest(c, UKIYO)),
  shadow: '#b8986c',
  finish: `vec4 look(vec2 s) {
    vec4 c = at(s);
    vec2 w = world(s);
    vec3 rgb = un(c) * (1.0 - 0.07 * noise(vec2(w.x * 0.02, w.y * 0.9)) - 0.04 * noise(w * 1.5));
    return vec4(rgb * c.a, c.a);
  }`,
};

const INK = rgba('#1c1a18');
const XUAN = '#f3ecdc';

/** How dark a colour is in ink: a wash for the mid tones, near-solid ink only for the darkest. */
const washOf = (c: RGBA): RGBA => {
  const tone = Math.pow(1 - lum(c), 1.6) * 0.95;
  // A trace of the colour stays in the wash, as a painter's light tint would.
  return mixRgb(mixRgb(rgba(XUAN), INK, tone), c, 0.1);
};

/**
 * Chinese ink painting (shuimo): washes of one ink on warm rice paper, light
 * things left as bare paper, outlines in a brush line that swells and dries,
 * and the ink bleeding a little into the damp paper. The agents keep a pale
 * vermilion wash, the one colour on the sheet, so they still read as the cast.
 */
export const INK_PAINTING: RenderStyle = {
  id: 'ink-painting',
  label: 'Ink painting',
  mono: true,
  paper: XUAN,
  grid: '#ebe2cf',
  sheen: 0,
  wobble: 1.6,
  ink: 1.5,
  sketch: { overshoot: 2, ghost: 0.15 },
  fill(c, hint) {
    const [h, s] = toHsl(c);
    if (hint.figure && s > 0.5) {
      return css(mixRgb(rgba(XUAN), fromHsl(h, s * 0.9, 0.55), 0.55));
    }
    // Much of the sheet is left as bare paper, as a painter leaves it.
    if (lum(c) > 0.62) {
      return XUAN;
    }
    return css(washOf(c));
  },
  stroke: (c) => (lum(c) > 0.8 ? null : css([INK[0], INK[1], INK[2], lum(c) < 0.45 ? 0.92 : 0.55])),
  letter: () => css(INK),
  tint: (c) => (lum(c) > 0.62 ? XUAN : css(washOf(c))),
  shadow: '#d8cfbd',
  finish: `vec4 look(vec2 s) {
    vec2 w = world(s);
    vec4 c = at(s);
    vec3 m = un(c);
    // The ink spreads into the damp paper: a little of any darker neighbour bleeds in.
    float r = 1.4 * uCam.z;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.047 + noise(w * 0.7) * 2.0;
      vec3 t = un(at(s + vec2(cos(a), sin(a)) * r * (0.6 + noise(w * 1.3 + float(i)))));
      m = min(m, mix(m, t, 0.45));
    }
    // A dry brush: dark strokes break up along their run where the ink ran thin.
    float dry = smoothstep(0.6, 0.85, noise(vec2(w.x * 0.8, w.y * 3.0)));
    m = mix(m, vec3(0.953, 0.925, 0.863), dry * 0.35 * (1.0 - lum(m)));
    // The paper's long fibres.
    m *= 1.0 - 0.05 * (noise(vec2(w.x * 0.15, w.y * 2.5)) * 0.5 + noise(w * 1.8) * 0.5);
    return vec4(m * c.a, c.a);
  }`,
};
