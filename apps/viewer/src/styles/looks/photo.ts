import { RGBA, css, lum } from '../color';
import { RenderStyle } from '../types';

/**
 * The camera looks: what a thermal camera or a strip of colour negative film
 * would make of the office. Both are mostly their finish; the fills only set
 * up what the finish reads.
 */

/** A shade of grey, `v` of the way to white. */
const grey = (v: number): string => {
  const k = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return css([k, k, k, 1] as RGBA);
};

/**
 * Infrared: heat, not colour. The room is cool and the figures are warm, so
 * every fill becomes a grey of how hot it is (the room's lightness, kept low;
 * a figure near white), and the finish reads that grey through a thermal
 * camera's ironbow palette, softly, with a little sensor noise. The monitors'
 * live screens are bright, so they read warm.
 */
export const INFRARED: RenderStyle = {
  id: 'infrared',
  label: 'Infrared',
  paper: '#1a1a1a',
  grid: '#222222',
  dark: true,
  text: '#ffffff',
  sheen: 0,
  wobble: 0.6,
  fill: (c, hint) => grey(hint.figure ? 0.74 + lum(c) * 0.24 : 0.08 + lum(c) * 0.42),
  stroke: (c, hint) => grey(hint.figure ? 0.6 : 0.04 + lum(c) * 0.3),
  letter: () => '#ffffff',
  tint: (c) => grey(0.08 + lum(c) * 0.42),
  shadow: '#0e0e0e',
  finish: `vec3 iron(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = vec3(0.02, 0.0, 0.08);
    vec3 b = vec3(0.28, 0.02, 0.5);
    vec3 c = vec3(0.78, 0.07, 0.42);
    vec3 d = vec3(0.98, 0.42, 0.05);
    vec3 e = vec3(1.0, 0.84, 0.16);
    vec3 f = vec3(1.0, 1.0, 0.92);
    if (t < 0.2) return mix(a, b, t / 0.2);
    if (t < 0.4) return mix(b, c, (t - 0.2) / 0.2);
    if (t < 0.6) return mix(c, d, (t - 0.4) / 0.2);
    if (t < 0.8) return mix(d, e, (t - 0.6) / 0.2);
    return mix(e, f, (t - 0.8) / 0.2);
  }
  vec4 look(vec2 s) {
    float r = 1.6 * uCam.z;
    vec4 c = at(s) * 0.4 + (at(s + vec2(r, 0.0)) + at(s - vec2(r, 0.0)) + at(s + vec2(0.0, r)) + at(s - vec2(0.0, r))) * 0.15;
    vec2 w = world(s);
    float t = lum(un(c)) + (noise(w * 0.6) - 0.5) * 0.04 + (hash(floor(s)) - 0.5) * 0.025;
    return vec4(iron(t) * c.a, c.a);
  }`,
};

/**
 * Film negative: the office as it sits on a strip of colour negative, every
 * colour turned to its opposite under the film's orange mask, with grain. The
 * drawing itself is the house cartoon; the finish does the rest.
 */
export const NEGATIVE: RenderStyle = {
  id: 'negative',
  label: 'Film negative',
  paper: '#fffdf6',
  grid: '#ece5d4',
  dark: true,
  negative: true,
  finish: `vec4 look(vec2 s) {
    vec4 c = at(s);
    vec3 neg = (1.0 - un(c)) * vec3(0.93, 0.74, 0.56) + vec3(0.05, 0.03, 0.02);
    vec2 w = world(s);
    neg += (noise(w * 5.0) - 0.5) * 0.06 + (hash(floor(s)) - 0.5) * 0.03;
    return vec4(clamp(neg, 0.0, 1.0) * c.a, c.a);
  }`,
};
