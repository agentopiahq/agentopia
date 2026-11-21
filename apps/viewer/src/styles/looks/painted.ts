import { RGBA, css, lum, mixRgb, nearest, rgba, toHsl } from '../color';
import { RenderStyle } from '../types';

/**
 * The painted looks from East Asia: a woodblock print in a printer's handful
 * of inks, and an ink wash painting in a few soft washes on rice paper.
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

/** Rice paper, warm and a little grey. */
const XUAN = '#ede4d0';
const SUMI_GREY = '#3d3a37';
/** An ink wash painter's few pigments: sage and ochre, peach, rust, slate, and ink in greys. */
const WASHES = [
  '#6f8c6b',
  '#91ab8c',
  '#b6c8ad',
  '#cfdac6',
  '#c9842f',
  '#e3a043',
  '#ecbd76',
  '#efd29e',
  '#f0d4ae',
  '#b0603f',
  '#d99a55',
  '#d8a08a',
  '#8f6b4c',
  '#b49673',
  '#7f949a',
  '#aebcbd',
  '#3b3835',
  '#6f6b67',
  '#999590',
  '#c3bdb3',
  '#e2dacb',
].map((h) => rgba(h));

/**
 * A colour as one of the washes, laid on the paper: the pigment nearest it,
 * thinned the paler the colour was, so the light things are left as almost
 * bare paper and the room reads as washes rather than paint.
 */
const washOf = (c: RGBA, figure: boolean, ground = false): RGBA => {
  const l = lum(c);
  const [, s] = toHsl(c);
  if (!figure && l > 0.84 && s < 0.35) {
    return mixRgb(rgba(XUAN), c, 0.18);
  }
  // The ground is left as paper, as a painter leaves it, with the faintest wash.
  if (ground) {
    return mixRgb(rgba(XUAN), c, 0.2);
  }
  const strength = figure ? 0.95 : Math.min(0.94, 0.4 + (1 - l) * 0.75);
  return mixRgb(rgba(XUAN), nearest(c, WASHES), strength);
};

/**
 * Ink wash (shuimo with colour): soft grey-black outlines from a brush that
 * runs dry, breaking the line and blotting at its corners; muted washes of
 * sage and ochre streaked along the stroke, fading back to the paper in
 * places and bleeding softly at the edges; grey pools of ink for shadows; and
 * the fine weave of the paper under it all.
 */
export const INK_WASH: RenderStyle = {
  id: 'ink-wash',
  label: 'Ink wash',
  paper: XUAN,
  // No construction grid: a painter rules none.
  grid: XUAN,
  sheen: 0,
  wobble: 1.3,
  ink: 1.3,
  brush: {
    dash: [16, 1.6, 7, 1.3, 24, 2, 10, 1.5, 4, 1.3, 19, 1.8],
    dry: 0.3,
    blot: 1.9,
    fade: 0.7,
  },
  // The painting signs itself: 水墨, "water and ink", in a painter's vermilion.
  seal: { text: '水墨', ink: '#b93a2b' },
  features: SUMI_GREY,
  fill: (c, hint, p) =>
    p.texture('wash', css(washOf(c, hint.figure, hint.ground)), hint.angle, XUAN),
  // Every line in the one grey-black ink, lighter for the lighter things it outlines.
  stroke(c, hint) {
    const l = lum(c);
    if (l > 0.86) {
      return null;
    }
    // The floor's seams and grain: a faint trace, where a painter would leave them out.
    if (hint.ground) {
      return 'rgba(61,58,55,0.16)';
    }
    return css([0x3d, 0x3a, 0x37, l < 0.45 ? 0.88 : 0.62]);
  },
  letter: () => SUMI_GREY,
  tint: (c) => css(washOf(c, false)),
  shadow: '#9c968c',
  // Shadows are a dry brush dragged across the floor, not a flat pool.
  shade: (p) => p.texture('dry', '#807a71', 0),
  finish: `vec4 look(vec2 s) {
    vec2 w = world(s);
    vec4 c = at(s);
    // The washes are laid a little off the lines, as a painter's are: bleeding
    // past an outline here, stopping short of it there. The ink stays put.
    float drift = noise(w * 0.09) * 12.566;
    vec2 off = vec2(cos(drift), sin(drift)) * 0.8 * uCam.z;
    vec4 cw = at(s + off);
    if (lum(un(c)) > 0.5 && lum(un(cw)) > 0.55 && cw.a > 0.5) {
      c = cw;
    }
    vec3 m = un(c);
    // The washes and the ink spread a little into the damp paper: soft edges,
    // and a little of any darker neighbour bleeding in.
    float r = 0.9 * uCam.z;
    vec3 avg = vec3(0.0);
    vec3 dark = m;
    for (int i = 0; i < 4; i++) {
      float a = float(i) * 1.571 + 0.4;
      // Near and far by turns, so the spread is ragged rather than a ring.
      vec3 t = un(at(s + vec2(cos(a), sin(a)) * r * (0.65 + 0.7 * mod(float(i), 2.0))));
      avg += t;
      dark = min(dark, t);
    }
    m = mix(m, avg / 4.0, 0.35);
    m = mix(m, min(m, dark), 0.12);
    // The washes thin out in places, back toward the paper.
    vec3 paper = vec3(0.929, 0.894, 0.816);
    float patch = noise(w * 0.03);
    float mottle = noise(w * 0.15);
    float fade = smoothstep(0.4, 0.9, patch * 0.6 + mottle * 0.4) * 0.3;
    m = mix(m, paper, fade * smoothstep(0.32, 0.55, lum(m)));
    // Dark ink pools and thins as it dries: never one flat black.
    float pool = smoothstep(0.25, 0.85, (1.0 - patch) * 0.45 + (1.0 - mottle) * 0.55);
    m = mix(m, paper, pool * 0.3 * (1.0 - smoothstep(0.3, 0.5, lum(m))));
    // The paper's fine weave.
    float weave = noise(vec2(w.x * 2.4, w.y * 0.35)) + noise(vec2(w.x * 0.35, w.y * 2.4));
    m *= 1.0 - 0.03 * weave - 0.025 * patch;
    return vec4(m * c.a, c.a);
  }`,
};
