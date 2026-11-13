import { INK, Iso, V3, ellipse, hull, lift, norm, plane } from '../kit/iso';
import { MAT, Mat, mix } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * A potted rubber plant: a glazed pot, dark soil, and a crown of broad,
 * glossy leaves on short stems, each leaf its own shape turned its own way —
 * shaded by how it meets the light, with a pale midrib — drawn
 * back to front. Local frame: the origin is the middle of the pot's base.
 */

const POT_R = 0.2;
const POT_H = 0.36;

interface Leaf {
  /** Where its stem leaves the main stalk. */
  base: V3;
  /** Which way it points: round from +x, and up from level, in radians. */
  turn: number;
  rise: number;
  len: number;
  width: number;
  mat: Mat;
}

/** A small, fixed scatter of leaves: the same plant every time. */
const LEAVES: Leaf[] = (() => {
  let seed = 0x51a7;
  const next = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const out: Leaf[] = [];
  const n = 19;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Lower leaves splay out flat; upper ones stand up.
    const z = POT_H + 0.08 + t * 0.5;
    const rise = 0.25 + t * 0.95 + (next() - 0.5) * 0.25;
    const len = 0.34 + (1 - t) * 0.12 + next() * 0.06;
    out.push({
      base: [(next() - 0.5) * 0.06, (next() - 0.5) * 0.06, z],
      turn: i * 2.4 + next() * 0.6,
      rise,
      len: Math.min(len, 0.4 / Math.max(0.3, Math.cos(rise))),
      width: 0.12 + next() * 0.04,
      mat: next() < 0.7 ? MAT.fern : MAT.leaf,
    });
  }
  return out;
})();

/** A leaf's outline in local space, base to tip and back, with its midrib. */
function leafShape(leaf: Leaf): { outline: V3[]; rib: V3[]; normal: V3 } {
  const { base, turn, rise, len, width } = leaf;
  const dir: V3 = [
    Math.cos(turn) * Math.cos(rise),
    Math.sin(turn) * Math.cos(rise),
    Math.sin(rise),
  ];
  // Across the leaf: level, at right angles to where it points.
  const side: V3 = norm([-Math.sin(turn), Math.cos(turn), 0]);
  const at = (t: number, w: number): V3 => {
    // A gentle droop toward the tip.
    const sag = -0.12 * len * t * t;
    return [
      base[0] + dir[0] * len * t + side[0] * w,
      base[1] + dir[1] * len * t + side[1] * w,
      base[2] + dir[2] * len * t + sag + side[2] * w,
    ];
  };
  const steps = [0.12, 0.3, 0.5, 0.7, 0.86];
  const half = (t: number): number => width * Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.95;
  const outline: V3[] = [
    at(0.04, 0),
    ...steps.map((t) => at(t, half(t))),
    at(1, 0),
    ...steps
      .slice()
      .reverse()
      .map((t) => at(t, -half(t))),
  ];
  const rib = [at(0.06, 0), at(0.5, 0), at(0.95, 0)];
  // The leaf's face turns up and a little toward where it points.
  const up: V3 = [-dir[0] * dir[2], -dir[1] * dir[2], 1 - dir[2] * dir[2]];
  return { outline, rib, normal: norm(up) };
}

function drawLeaf(k: Iso, leaf: Leaf): void {
  const { outline, rib, normal } = leafShape(leaf);
  // The stem, from the stalk to the leaf.
  k.line([leaf.base, rib[0]], 1.4, false, mix(leaf.mat.d, '#000000', 0.2));
  // Glossy dark leaves: deep in shade, a fresh green only where they face the light.
  const lit = Math.max(0, Math.min(1, (k.lightOn(normal) - 0.35) / 0.65));
  const tone =
    lit < 0.5
      ? mix(leaf.mat.d, leaf.mat.m, lit * 2)
      : mix(leaf.mat.m, leaf.mat.l, (lit - 0.5) * 1.4);
  const screen = outline.map((p) => k.P(p));
  k.fillScreen(screen, k.grade(outline, [0, 0, 1], tone));
  k.inkScreen(screen, INK.detail);
  k.line(rib, INK.hair, false, mix(leaf.mat.l, '#ffffff', 0.45));
}

export const plant: OfficeObject = {
  name: 'Plant',
  blurb: 'A rubber plant in a glazed pot, tucked where nobody walks.',
  bounds: box3([-0.48, -0.48, 0], [0.48, 0.48, 1.2]),
  footprint: box3([-POT_R, -POT_R, 0], [POT_R, POT_R, 1.1]),

  shadow(k) {
    const pts: V3[] = [];
    for (const leaf of LEAVES) {
      pts.push(...leafShape(leaf).outline);
    }
    k.castShadow(hull2(pts), 0, 0.6);
    k.castShadow(
      lift(plane.z(0), ellipse(0, 0, POT_R, POT_R, 12)).flatMap((p): V3[] => [
        p,
        [p[0], p[1], POT_H],
      ])
    );
  },

  draw(k) {
    // The pot: a tapered body, a rolled rim, dark soil.
    k.prism(ellipse(0, 0, POT_R * 0.78, POT_R * 0.78, 20), 'z', 0, POT_H - 0.07, MAT.terracotta, {
      ink: INK.panel,
    });
    k.prism(ellipse(0, 0, POT_R, POT_R, 20), 'z', POT_H - 0.07, POT_H, MAT.terracotta, {
      ink: INK.panel,
      cap: { l: '#4a3222', m: '#4a3222', d: '#4a3222' },
      rim: false,
    });
    // The stalk.
    k.rod([0, 0, POT_H - 0.02], [0, 0, POT_H + 0.62], 0.018, MAT.wood);
    const order = LEAVES.slice().sort(
      (a, b) => k.depth(leafShape(a).rib[1]) - k.depth(leafShape(b).rib[1])
    );
    for (const leaf of order) {
      drawLeaf(k, leaf);
    }
  },
};

/** Thin a cloud of points to the ones on its outline from above, for a lighter shadow pass. */
function hull2(pts: V3[]): V3[] {
  const flat = hull(pts.map((p): [number, number] => [p[0], p[1]]));
  const top = Math.max(...pts.map((p) => p[2]));
  return flat.map(([x, y]): V3 => [x, y, top * 0.55]);
}
