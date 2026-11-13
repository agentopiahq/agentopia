import { INK, V3, ellipse, lift, plane } from '../kit/iso';
import { MAT } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * A potted office plant: a terracotta pot with a rim and a round, leafy
 * crown, the leaves drawn as a cluster of balls back to front.
 * Local frame: the origin is the middle of the pot's base.
 */

const POT_R = 0.2;
const POT_H = 0.34;

/** The crown's balls, as centre and radius in tiles, roughly back to front. */
const CROWN: Array<[V3, number]> = [
  [[-0.06, -0.08, 0.78], 0.2],
  [[0.12, -0.02, 0.64], 0.17],
  [[-0.16, 0.06, 0.56], 0.17],
  [[0.06, 0.1, 0.5], 0.16],
  [[0.0, 0.0, 0.98], 0.15],
];

export const plant: OfficeObject = {
  name: 'Plant',
  blurb: 'An office plant in a terracotta pot, tucked where nobody walks.',
  bounds: box3([-0.42, -0.42, 0], [0.42, 0.42, 1.16]),
  footprint: box3([-POT_R, -POT_R, 0], [POT_R, POT_R, 1.1]),

  shadow(k) {
    const pts: V3[] = [];
    for (const [[x, y, z], r] of CROWN) {
      for (const p of ellipse(x, y, r, r, 8)) {
        pts.push([p[0], p[1], z]);
      }
    }
    pts.push(...lift(plane.z(0), ellipse(0, 0, POT_R, POT_R, 10)));
    k.castShadow(pts);
  },

  draw(k) {
    k.prism(ellipse(0, 0, POT_R * 0.82, POT_R * 0.82, 18), 'z', 0, POT_H - 0.06, MAT.terracotta, {
      ink: INK.panel,
    });
    k.prism(ellipse(0, 0, POT_R, POT_R, 18), 'z', POT_H - 0.06, POT_H, MAT.terracotta, {
      ink: INK.panel,
      cap: { l: MAT.wood.d, m: MAT.wood.d, d: MAT.wood.d },
    });
    const sorted = [...CROWN].sort((a, b) => k.depth(a[0]) - k.depth(b[0]));
    for (const [c, r] of sorted) {
      k.ball(c, r, MAT.leaf, INK.panel);
    }
  },
};
