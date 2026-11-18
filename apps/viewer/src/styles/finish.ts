import { Filter, GlProgram, defaultFilterVert } from 'pixi.js';

import { RenderStyle } from './types';

/**
 * A style's finish: one pass over the whole drawn office on the GPU, for what
 * a medium does to a picture as a whole (paper grain, a wash's drift, chalk
 * dust, glow, chunky pixels) rather than to any one mark.
 *
 * A style writes `vec4 look(vec2 s)`, the colour (premultiplied) at screen
 * point `s` in CSS pixels, from these:
 *
 * - `at(s)`: the drawn office at a screen point, premultiplied; `un(c)` its colour unpremultiplied.
 * - `world(s)`: where a screen point is on the sheet, in sheet units, so a
 *   texture is fixed to the office as the camera pans and zooms.
 * - `uCam`: the sheet's origin on screen (`xy`) and its scale (`z`); `uView`: the view's size.
 * - `noise`, `hash` and `lum`.
 *
 * Nothing here reads a clock: a finish is the same every frame.
 */

const HEAD = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uCam;
uniform vec4 uView;

vec4 at(vec2 s) {
  vec2 uv = clamp((s - uOutputFrame.xy) * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
  return texture(uTexture, uv);
}
vec3 un(vec4 c) { return c.a > 0.0 ? c.rgb / c.a : c.rgb; }
vec2 world(vec2 s) { return (s - uCam.xy) / uCam.z; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/** The finish filter for a style, or null for a style with none. */
export function finishFilter(style: RenderStyle): Filter | null {
  if (!style.finish) {
    return null;
  }
  return new Filter({
    glProgram: GlProgram.from({
      vertex: defaultFilterVert,
      fragment: `${HEAD}\n${style.finish}\nvoid main() { finalColor = look(uOutputFrame.xy + vTextureCoord * uInputSize.xy); }`,
      name: `finish-${style.id}`,
    }),
    resources: {
      finish: {
        uCam: { value: new Float32Array([0, 0, 1, 0]), type: 'vec4<f32>' },
        uView: { value: new Float32Array([800, 600, 0, 0]), type: 'vec4<f32>' },
      },
    },
  });
}

/** Tell a finish where the sheet is on screen, and how big the view is. */
export function aimFinish(
  filter: Filter,
  x: number,
  y: number,
  scale: number,
  w: number,
  h: number
): void {
  const u = filter.resources.finish.uniforms as { uCam: Float32Array; uView: Float32Array };
  u.uCam[0] = x;
  u.uCam[1] = y;
  u.uCam[2] = scale;
  u.uView[0] = w;
  u.uView[1] = h;
}
