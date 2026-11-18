import { RGBA, css, lum, mixRgb, nearest, rgba, shift } from '../color';
import { RenderStyle } from '../types';

/**
 * The painted looks: an oil pastel and a woodblock print. Their
 * textures are tiles made per colour (`paints.ts`), so colours are rounded a
 * little first: a few hundred tones in, a few dozen tiles out.
 */

const round = (c: RGBA, step = 12): RGBA => [
  Math.round(c[0] / step) * step,
  Math.round(c[1] / step) * step,
  Math.round(c[2] / step) * step,
  c[3],
];

const KRAFT = '#c6a679';

export const OIL_PASTEL: RenderStyle = {
  id: 'oil-pastel',
  label: 'Oil pastel',
  paper: KRAFT,
  grid: '#bb9a6c',
  sheen: 0,
  wobble: 1.4,
  ink: 1.3,
  fill: (c, hint, p) =>
    p.texture('wax', css(round(shift(c, { sat: 1.18, s: 0.06, l: 0.03 }))), hint.angle, KRAFT),
  stroke: (c) => (lum(c) < 0.45 ? '#2d2340' : css(shift(c, { sat: 1.18, s: 0.06 }))),
  letter: () => '#2d2340',
  tint: (c) => css(shift(c, { sat: 1.18, s: 0.06, l: 0.03 })),
  shadow: '#8f7457',
  finish: `vec4 look(vec2 s) {
    vec4 c = at(s);
    vec2 w = world(s);
    vec3 rgb = mix(un(c), vec3(0.776, 0.651, 0.475), smoothstep(0.72, 0.9, noise(w * 1.9)) * 0.45);
    rgb *= 1.0 - 0.06 * noise(w * 0.7);
    return vec4(rgb * c.a, c.a);
  }`,
};

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
