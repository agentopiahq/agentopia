import { RGBA, css, lum, mixRgb, nearest, rgba, shift } from '../color';
import { RenderStyle } from '../types';

/**
 * The painted looks: washes, oils, pastels and a woodblock print. Their
 * textures are tiles made per colour (`paints.ts`), so colours are rounded a
 * little first: a few hundred tones in, a few dozen tiles out.
 */

const round = (c: RGBA, step = 12): RGBA => [
  Math.round(c[0] / step) * step,
  Math.round(c[1] / step) * step,
  Math.round(c[2] / step) * step,
  c[3],
];

const SEPIA = '#3b2a1f';
const WASH_PAPER = '#fbf7ee';

/** The grain and drift a wash has: shared by both watercolours. */
const washFinish = (drift: number, edges: number): string => `vec4 look(vec2 s) {
    vec2 w = world(s);
    vec2 d = (vec2(noise(w * 0.06), noise(w * 0.06 + 19.0)) - 0.5) * ${drift.toFixed(1)} * uCam.z;
    vec4 c = at(s + d);
    vec3 rgb = un(c);
    float e = abs(lum(un(at(s + d + vec2(1.5, 0.0)))) - lum(rgb)) + abs(lum(un(at(s + d + vec2(0.0, 1.5)))) - lum(rgb));
    rgb *= 1.0 - ${edges.toFixed(2)} * smoothstep(0.02, 0.2, e);
    rgb *= 1.0 - 0.07 * noise(w * 1.7) - 0.04 * noise(w * 0.4);
    return vec4(rgb * c.a, c.a);
  }`;

export const INK_WASH: RenderStyle = {
  id: 'ink-wash',
  label: 'Ink & wash',
  paper: WASH_PAPER,
  grid: '#f0e8d6',
  sheen: 0,
  wobble: 1.6,
  ink: 0.8,
  fill: (c, _hint, p) =>
    p.texture('wash', css(round(mixRgb(shift(c, { sat: 1.08 }), rgba('#ffffff'), 0.12))), 0),
  stroke: (c) => (lum(c) < 0.5 ? SEPIA : css(shift(c, { l: -0.12 }))),
  letter: () => SEPIA,
  tint: (c) => css(mixRgb(c, rgba('#ffffff'), 0.12)),
  shadow: '#b9aec8',
  finish: washFinish(2, 0.06),
};

export const WATERCOLOUR: RenderStyle = {
  id: 'watercolour',
  label: 'Watercolour',
  paper: '#fdfbf5',
  grid: '#f3eee2',
  sheen: 0,
  wobble: 1,
  ink: 0.5,
  fill: (c, _hint, p) =>
    p.texture('wash', css(round(mixRgb(shift(c, { sat: 1.12 }), rgba('#ffffff'), 0.2))), 0),
  stroke: (c) => (lum(c) < 0.5 ? 'rgba(85,85,85,0.28)' : css([c[0], c[1], c[2], 0.55])),
  letter: () => '#4a5a70',
  tint: (c) => css(mixRgb(c, rgba('#ffffff'), 0.2)),
  shadow: '#c3bdd8',
  finish: washFinish(3, 0.16),
};

/** Oils: richer colour, and the shade cooled toward a violet ground. */
const oil = (c: RGBA): RGBA =>
  lum(c) < 0.42
    ? mixRgb(shift(c, { sat: 1.1 }), rgba('#2a2a5a'), 0.12)
    : shift(c, { sat: 1.12, s: 0.04 });

export const OIL: RenderStyle = {
  id: 'oil',
  label: 'Oil paint',
  paper: '#d9cdb3',
  grid: '#cfc1a3',
  sheen: 0,
  wobble: 1.2,
  ink: 0.85,
  fill: (c, hint, p) => p.texture('strokes', css(round(oil(c))), hint.angle),
  stroke: (c, hint) =>
    lum(c) < 0.45
      ? css([...mixRgb(hint.last ?? c, rgba('#1a1410'), 0.5).slice(0, 3), 0.5] as RGBA)
      : css(oil(c)),
  letter: () => '#3a2a20',
  tint: (c) => css(oil(c)),
  shadow: '#8c7c6c',
  finish: `vec4 look(vec2 s) {
    vec4 c = at(s);
    vec3 rgb = un(c);
    float l0 = lum(rgb);
    float lx = lum(un(at(s + vec2(1.0, 0.0))));
    float ly = lum(un(at(s + vec2(0.0, 1.0))));
    float spec = clamp((l0 - lx) * 2.2 + (l0 - ly) * 2.2, -0.25, 0.5);
    rgb += spec * 0.35;
    vec2 w = world(s);
    rgb -= (sin(w.x * 3.1) * sin(w.y * 3.1)) * 0.018;
    return vec4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
  }`,
};

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
