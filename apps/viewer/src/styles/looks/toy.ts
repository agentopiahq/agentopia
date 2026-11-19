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

/**
 * A pack of modelling clay: bright, clean colours, each smoothed out flat.
 * Our own picks, not any maker's chart.
 */
const PLASTICINE = [
  '#e2352b', // red
  '#f2862a', // orange
  '#f7d23a', // yellow
  '#a8d64a', // lime
  '#3fb35a', // green
  '#2f8a6a', // pine
  '#34b3a6', // teal
  '#6cc3ea', // sky
  '#2f63c9', // blue
  '#2a3a7a', // navy
  '#8a5cc2', // purple
  '#f48fb7', // pink
  '#f6f3ea', // white
  '#efe1bf', // cream
  '#e2b277', // sand
  '#c98345', // wood
  '#8a5a34', // brown
  '#5a3a26', // dark brown
  '#aeb2b8', // grey
  '#62676f', // dark grey
  '#2a2b30', // black
].map((h) => rgba(h));

/** A colour as the clay nearest it, chosen once it has been made more vivid. */
const clayOf = (c: RGBA): RGBA => nearest(shift(c, { sat: 1.3 }), PLASTICINE);

export const CLAY: RenderStyle = {
  id: 'clay',
  label: 'Clay',
  // The set's painted sky behind the model.
  paper: '#cfe6ef',
  // No grid: the finish would round its lines off into ridges.
  grid: '#cfe6ef',
  sheen: 0,
  wobble: 1.2,
  ink: 0.8,
  features: '#1c1c20',
  // Every piece smoothed out of one colour of clay.
  fill: (c) => css(clayOf(c)),
  // No ink: a piece's edge is only the clay turning away, a little darker.
  // Fine detail drawn over a piece in the piece's colour sinks into it.
  stroke(c, hint) {
    if (lum(c) >= 0.45) {
      return hint.last ? css(clayOf(hint.last)) : css(clayOf(c));
    }
    return css(mixRgb(clayOf(hint.last ?? c), rgba('#000000'), 0.22));
  },
  letter: () => '#2a2b30',
  tint: (c) => css(clayOf(c)),
  shadow: '#7f97a6',
  // Each piece rounded like a pressed lump: darker as it turns away at its
  // edges, a soft shine where it faces the light (the viewer's right), and a
  // soft dark where it sits on the piece below. Plus the gentlest unevenness
  // of something smoothed by hand.
  finish: `vec4 shade(vec2 s) {
    float z = uCam.z;
    vec4 c0 = at(s);
    vec3 here = un(c0);
    // How far in from its edge this point of a piece is: taps on a spiral
    // round it, each asking "same clay?". Darker where a piece turns away at
    // its edge, and where it sits against another.
    float inside = 0.0;
    for (int i = 0; i < 24; i++) {
      float f = (float(i) + 0.5) / 24.0;
      float a = float(i) * 2.39996;
      vec4 o = at(s + vec2(cos(a), sin(a)) * sqrt(f) * 6.0 * z);
      inside += 1.0 - smoothstep(0.04, 0.14, length(un(o) - here) + abs(o.a - c0.a));
    }
    inside /= 24.0;
    vec3 rgb = here * mix(0.74, 1.02, smoothstep(0.4, 1.0, inside));
    return vec4(rgb * c0.a, c0.a);
  }
  vec4 look(vec2 s) {
    // A model on a table, shot close: only a band across the middle in focus.
    float y = abs(s.y / uView.y - 0.55);
    float blur = smoothstep(0.15, 0.55, y) * 5.0 * uCam.z;
    vec4 c = shade(s);
    if (blur > 0.3) {
      vec4 sum = c;
      for (int i = 0; i < 16; i++) {
        float f = (float(i) + 0.5) / 16.0;
        float a = float(i) * 2.39996;
        sum += at(s + vec2(cos(a), sin(a)) * sqrt(f) * blur);
      }
      c = mix(c, sum / 17.0, smoothstep(0.3, 1.5, blur));
    }
    vec3 rgb = un(c);
    vec2 w = world(s);
    rgb *= 1.0 + (noise(w * 0.05) - 0.5) * 0.05;
    return vec4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
  }`,
};
