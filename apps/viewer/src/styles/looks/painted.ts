import { css, lum, nearest, rgba } from '../color';
import { RenderStyle } from '../types';

/**
 * The painted looks: a woodblock print, its colours a printer's handful of inks.
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
