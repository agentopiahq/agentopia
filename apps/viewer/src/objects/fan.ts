import { INK, Iso, V3 } from '../kit/iso';
import { MAT, Mat, mix } from '../kit/palette';

/**
 * Cooling fans, for the server floor: a round housing drawn into a body, and
 * the blades that spin in it, drawn as a loop of stills (`Motion`). Blades
 * repeat every `2π / blades`, so a loop of stills only has to sweep one
 * blade's worth of turn to spin for ever.
 */

/** The way a fan faces: up out of a top, or out of a front or a back. */
export type FanFace = '+z' | '+y' | '-y' | '+x' | '-x';

/** A fan's plane: its normal, and two axes across it. */
function basis(face: FanFace): { n: V3; u: V3; v: V3 } {
  switch (face) {
    case '+z':
      return { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] };
    case '+y':
      return { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] };
    case '-y':
      return { n: [0, -1, 0], u: [-1, 0, 0], v: [0, 0, 1] };
    case '+x':
      return { n: [1, 0, 0], u: [0, -1, 0], v: [0, 0, 1] };
    case '-x':
      return { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
  }
}

/** A point `r` out from `c` at angle `a` in a fan's plane, a hair off it toward the viewer. */
function at(c: V3, face: FanFace, r: number, a: number, lift = 0): V3 {
  const { n, u, v } = basis(face);
  const cu = Math.cos(a) * r;
  const sv = Math.sin(a) * r;
  return [
    c[0] + u[0] * cu + v[0] * sv + n[0] * lift,
    c[1] + u[1] * cu + v[1] * sv + n[1] * lift,
    c[2] + u[2] * cu + v[2] * sv + n[2] * lift,
  ];
}

/** A circle in a fan's plane. */
export function fanRing(c: V3, face: FanFace, r: number, lift = 0, n = 28): V3[] {
  return Array.from({ length: n }, (_, i) => at(c, face, r, (i / n) * Math.PI * 2, lift));
}

/** Blades per fan. */
export const FAN_BLADES = 5;
/** Stills per loop of a fan: enough to read as a smooth spin at `FAN_FPS`. */
export const FAN_FRAMES = 6;
export const FAN_FPS = 14;

/**
 * The housing a fan sits in, part of the body: a square bezel with a screw
 * at each corner, and the round dark throat the blades turn in.
 */
export function fanHousing(k: Iso, c: V3, face: FanFace, r: number, bezel: Mat = MAT.alu): void {
  const { n } = basis(face);
  if (!k.facing(n)) {
    return;
  }
  const s = r * 1.12;
  const corner = (du: number, dv: number): V3 => {
    const { u, v } = basis(face);
    return [
      c[0] + u[0] * du + v[0] * dv + n[0] * 0.003,
      c[1] + u[1] * du + v[1] * dv + n[1] * 0.003,
      c[2] + u[2] * du + v[2] * dv + n[2] * 0.003,
    ];
  };
  const square: V3[] = [corner(-s, -s), corner(s, -s), corner(s, s), corner(-s, s)];
  k.lit(square, n, bezel);
  k.line(square, INK.detail, true);
  for (const [du, dv] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    k.dot(corner(du * s * 0.82, dv * s * 0.82), 0.9, bezel.d);
  }
  const throat = fanRing(c, face, r, 0.005);
  k.fill(throat, mix(MAT.graphite.d, '#000000', 0.25));
  k.line(throat, INK.detail, true);
  // The inner lip catches a little light along its lower edge.
  k.line(fanRing(c, face, r * 0.93, 0.006).slice(14, 26), 0.6, false, mix(bezel.l, '#ffffff', 0.4));
}

/**
 * The blades and the guard over them at one still of the loop. `frame` of
 * `FAN_FRAMES` sweeps one blade's worth of turn.
 */
export function fanBlades(
  k: Iso,
  c: V3,
  face: FanFace,
  r: number,
  frame: number,
  blade: Mat = MAT.graphite,
  hub: Mat = MAT.alu
): void {
  const { n } = basis(face);
  if (!k.facing(n)) {
    return;
  }
  const turn = ((frame % FAN_FRAMES) / FAN_FRAMES) * ((Math.PI * 2) / FAN_BLADES);
  const rh = r * 0.32;
  const tone = k.tone(n, blade);
  for (let i = 0; i < FAN_BLADES; i++) {
    const a0 = turn + (i * Math.PI * 2) / FAN_BLADES;
    const pts: V3[] = [];
    // The leading edge sweeps forward as it runs out, like a real fan's.
    for (let t = 0; t <= 1.001; t += 0.25) {
      pts.push(at(c, face, rh + (r * 0.9 - rh) * t, a0 + 0.38 * t * t, 0.008));
    }
    for (let t = 0; t <= 1.001; t += 0.25) {
      pts.push(at(c, face, r * 0.9, a0 + 0.38 + 0.5 * t, 0.008));
    }
    for (let t = 1; t >= -0.001; t -= 0.25) {
      pts.push(at(c, face, rh + (r * 0.9 - rh) * t, a0 + 0.52 + 0.36 * t * t, 0.008));
    }
    k.fill(pts, tone);
    k.line(pts, INK.hair, true);
  }
  const boss = fanRing(c, face, rh, 0.01, 18);
  k.lit(boss, n, hub);
  k.line(boss, INK.detail, true);
  k.dot(at(c, face, 0, 0, 0.012), 1, hub.d);
  // The finger guard: two wire rings and four spokes, over the blades.
  const wire = mix(MAT.alu.m, '#ffffff', 0.2);
  for (const rr of [r * 0.6, r * 0.97]) {
    k.line(fanRing(c, face, rr, 0.014), 0.7, true, wire);
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    k.line([at(c, face, rh, a, 0.014), at(c, face, r * 0.97, a, 0.014)], 0.6, false, wire);
  }
}
