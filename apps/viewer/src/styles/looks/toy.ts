import { RGBA, css, lum, mixRgb, nearest, rgba, shift, toHsl } from '../color';
import { RenderStyle } from '../types';

/**
 * The toy looks: the office built out of plastic bricks, or modelled in clay
 * for a stop-motion film. Both keep every object as drawn; only what it is
 * made of changes.
 */

/**
 * A tub of toy bricks: the moulded plastic colours a brick comes in, bright
 * and few. Our own picks, not any maker's chart.
 */
const PLASTIC = [
  '#c4281c', // red
  '#8e1f1b', // dark red
  '#e86a1c', // orange
  '#f4b81e', // yellow
  '#dbc591', // tan
  '#a7865a', // dark tan
  '#7a4a26', // brown
  '#4b2c1a', // dark brown
  '#2f8f3e', // green
  '#9cc63b', // lime
  '#6f9a7f', // sage
  '#1e5fb4', // blue
  '#5ba6dd', // sky
  '#1c3260', // navy
  '#7a5aa6', // purple
  '#e98fb4', // pink
  '#f3f2ee', // white
  '#b9bcbf', // light grey
  '#7b7f85', // grey
  '#45484e', // dark grey
  '#1f2024', // black
].map((h) => rgba(h));

/** A colour as the plastic nearest it, chosen once it has been made a little more vivid. */
const plastic = (c: RGBA): RGBA => nearest(shift(c, { sat: 1.35 }), PLASTIC);

export const TOY_BRICKS: RenderStyle = {
  id: 'toy-bricks',
  label: 'Toy bricks',
  paper: '#e8edf2',
  grid: '#dce3ea',
  sheen: 0,
  wobble: 0,
  ink: 0.85,
  // Every level top is studded, the rest is smooth moulded plastic.
  fill(c, hint, p) {
    const out = css(plastic(c));
    return hint.top && !hint.figure ? p.studs(out, hint.top * 0.18) : out;
  },
  // No ink: a brick's edge is its own colour, a shade darker.
  stroke(c, hint) {
    const own = hint.last ? plastic(hint.last) : plastic(c);
    return lum(c) < 0.45 ? css(mixRgb(own, rgba('#000000'), 0.45)) : css(plastic(c));
  },
  letter: () => '#1f2024',
  tint: (c) => css(plastic(c)),
  shadow: '#a9b3be',
  // Moulded plastic catches the light: a bright edge along the top of every
  // shape, a little shade along its foot.
  finish: `vec4 look(vec2 s) {
    vec4 c = at(s);
    float r = 1.0 * uCam.z;
    vec3 here = un(c);
    float top = smoothstep(0.05, 0.25, length(here - un(at(s - vec2(0.0, r)))));
    float foot = smoothstep(0.05, 0.25, length(here - un(at(s + vec2(0.0, r)))));
    vec3 rgb = mix(here, min(here * 1.2 + 0.08, 1.0), top * 0.45);
    rgb = mix(rgb, here * 0.86, foot * 0.3);
    return vec4(rgb * c.a, c.a);
  }`,
};

/** Clay, as it comes out of the pack: soft, chalky colour, never quite bright or black. */
const clayOf = (c: RGBA): RGBA => {
  const [, s, l] = toHsl(c);
  const soft = shift(c, { sat: 1.1, s: s > 0.12 ? 0.06 : 0 });
  // Lightness squeezed toward the middle, warmed a touch.
  const want = 0.26 + l * 0.52;
  return mixRgb(shift(soft, { l: want - l }), rgba('#c98a5a'), 0.06);
};

export const CLAY: RenderStyle = {
  id: 'clay',
  label: 'Clay',
  paper: '#e9e2d6',
  // Faint, so the puffed edges of the finish leave the board's grid alone.
  grid: '#e5ded1',
  sheen: 0,
  wobble: 2.4,
  ink: 1.7,
  features: '#2a1d16',
  // Every face pressed out of clay, lumps and thumbprints and all.
  fill: (c, hint, p) => p.texture('clay', css(clayOf(c)), hint.angle),
  // The seams between pieces: the clay's own colour, pressed darker, never black.
  stroke(c, hint) {
    if (lum(c) >= 0.45) {
      return css(mixRgb(clayOf(c), rgba('#2a1d16'), 0.12));
    }
    return css(mixRgb(clayOf(hint.last ?? c), rgba('#2a1d16'), 0.5));
  },
  letter: () => '#3a2a20',
  tint: (c) => css(clayOf(c)),
  shadow: '#b3a690',
  // Clay is soft and lumpy: edges rounded off, the surface catching the light
  // where the hand pressed it, and here and there the whorl of a thumb.
  finish: `vec4 look(vec2 s) {
    float z = uCam.z;
    vec4 c0 = at(s);
    vec3 here = un(c0);
    // Puffed edges: darker where a piece meets another, lit where it faces
    // the light (the viewer's right), shaded where it turns away.
    float edge = 0.0;
    float lit = 0.0;
    vec2 light = vec2(0.6, -0.8);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854;
      vec2 d = vec2(cos(a), sin(a));
      for (int j = 1; j <= 2; j++) {
        float diff = smoothstep(0.03, 0.16, length(un(at(s + d * float(j) * 1.7 * z)) - here));
        edge += diff;
        lit += diff * dot(d, light);
      }
    }
    edge /= 16.0;
    lit /= 16.0;
    // A slight softening, so no edge is quite sharp.
    float r = 0.8 * z;
    vec4 c = c0 * 0.5 + (at(s + vec2(r, 0.0)) + at(s - vec2(r, 0.0)) + at(s + vec2(0.0, r)) + at(s - vec2(0.0, r))) * 0.125;
    vec3 rgb = un(c) * (1.0 - edge * 0.22) + vec3(lit * 0.5);
    // The surface's gentle lumps, catching the light.
    vec2 w = world(s);
    float h0 = noise(w * 0.09);
    float hx = noise((w + vec2(1.5, 0.0)) * 0.09);
    float hy = noise((w + vec2(0.0, 1.5)) * 0.09);
    rgb *= 1.0 + ((hx - h0) * 0.8 - (hy - h0) * 0.6) * 0.3;
    return vec4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
  }`,
};
