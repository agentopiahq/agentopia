import { INK, Iso, V2, V3, lift, plane, roundRect } from '../kit/iso';
import { ACCENT, MAT, mix } from '../kit/palette';
import { OfficeObject, PieceState, box3, frac } from './types';

/**
 * The door everyone arrives and leaves by: a painted frame standing at the
 * front edge of the floor, its panelled oak leaf swung open into the room —
 * brass knob, brass kick plate — and a coir mat inside.
 * Local frame: the origin is the middle of the threshold, the front (+y)
 * faces out of the office, toward the viewer.
 */

const POST = 0.1;
const HALF = 0.72;
const H = 2.08;
/** How far the leaf stands open, in degrees, when it is all the way open. */
const OPEN = 62;
/** The leaf's swing for a state: `open` is a fraction of the way, open by default. */
const swingOf = (state?: PieceState): number => (OPEN * frac(state, 'open', 1) * Math.PI) / 180;
/** The doorway's clear opening, between the posts. */
export const DOORWAY = { width: 2 * HALF, height: H } as const;
const LEAF_W = 1.34;
const LEAF_T = 0.06;

/** The leaf's floor outline: hinged at the left post, swung `a` radians in toward -y. */
function leafOutline(a: number): V2[] {
  const hinge: V2 = [-HALF + 0.02, -POST];
  const d: V2 = [Math.cos(a), -Math.sin(a)];
  const n: V2 = [-d[1], d[0]];
  const far: V2 = [hinge[0] + d[0] * LEAF_W, hinge[1] + d[1] * LEAF_W];
  return [
    hinge,
    far,
    [far[0] - n[0] * LEAF_T, far[1] - n[1] * LEAF_T],
    [hinge[0] - n[0] * LEAF_T, hinge[1] - n[1] * LEAF_T],
  ];
}

export const door: OfficeObject = {
  name: 'Door',
  blurb: 'The way in and out: leads arrive and leave by it, helpers file through it.',
  bounds: box3([-0.86, -1.45, 0], [0.86, 0.2, 2.28]),
  // Only the frame sorts against the cast; the open leaf stands to the side.
  footprint: box3([-HALF - POST, -POST, 0], [HALF + POST, POST, H + 0.12]),

  shadow(k, state) {
    k.castShadow([
      Iso.corners([-HALF - POST, -POST, 0], [HALF + POST, POST, H + 0.12]),
      lift(plane.z(0), leafOutline(swingOf(state))).flatMap((p): V3[] => [
        p,
        [p[0], p[1], H - 0.04],
      ]),
    ]);
  },

  draw(k, state) {
    const a = swingOf(state);
    k.sorted((add) => {
      // The mat just inside, flat on the floor.
      add(box3([-0.55, -0.95, 0], [0.55, -0.25, 0.01]), () => {
        k.shape(
          lift(plane.z(0.01), roundRect(-0.55, -0.95, 0.55, -0.25, 0.06)),
          MAT.terracotta.m,
          INK.detail
        );
        for (let i = 0; i < 4; i++) {
          const y = -0.85 + i * 0.16;
          k.line(
            [
              [-0.46, y, 0.012],
              [0.46, y, 0.012],
            ],
            INK.hair,
            false,
            MAT.terracotta.d
          );
        }
      });
      // The leaf, swung in. Panels and the knob on its face toward the room.
      const leaf = leafOutline(a);
      const xs = leaf.map((p) => p[0]);
      const ys = leaf.map((p) => p[1]);
      const leafBox = box3(
        [Math.min(...xs), Math.min(...ys), 0],
        [Math.max(...xs), Math.min(-POST, Math.max(...ys)), H]
      );
      add(leafBox, () => {
        k.prism(leaf, 'z', 0.02, H - 0.04, MAT.wood, { ink: INK.silhouette });
        const along = (t: number, z: number, out = 0.001): V3 => [
          leaf[0][0] + Math.cos(a) * t + Math.sin(a) * out,
          leaf[0][1] - Math.sin(a) * t + Math.cos(a) * out,
          z,
        ];
        const face: V3 = [Math.sin(a), Math.cos(a), 0];
        // Grain down the leaf: faint vertical streaks.
        const ctx = k.ctx;
        ctx.save();
        ctx.globalAlpha *= 0.4;
        for (const t of [0.09, 0.27, 0.5, 0.71, 0.93]) {
          k.line(
            [
              along(LEAF_W * t, 0.06),
              along(LEAF_W * (t + 0.02), H * 0.5),
              along(LEAF_W * t, H - 0.1),
            ],
            INK.hair,
            false,
            MAT.wood.d
          );
        }
        ctx.restore();
        // Two raised panels, each lit along its top and right, shaded below.
        for (const [z0, z1] of [
          [0.2, 0.95],
          [1.12, 1.88],
        ]) {
          const panel = [
            along(0.18, z0),
            along(LEAF_W - 0.18, z0),
            along(LEAF_W - 0.18, z1),
            along(0.18, z1),
          ];
          k.lit(panel, face, {
            l: mix(MAT.wood.l, '#ffffff', 0.08),
            m: mix(MAT.wood.m, '#ffffff', 0.08),
            d: mix(MAT.wood.d, '#ffffff', 0.08),
          });
          k.line(panel, INK.detail, true);
          k.line(
            [along(0.2, z1 - 0.02), along(LEAF_W - 0.2, z1 - 0.02)],
            0.8,
            false,
            mix(MAT.wood.l, '#ffffff', 0.4)
          );
        }
        // A brass kick plate, and the knob on its rose.
        const kick = [
          along(0.04, 0.04),
          along(LEAF_W - 0.04, 0.04),
          along(LEAF_W - 0.04, 0.14),
          along(0.04, 0.14),
        ];
        k.lit(kick, face, MAT.brass);
        k.line(kick, INK.hair, true);
        k.dot(along(LEAF_W - 0.12, 1.02, 0.005), 2.6, MAT.brass.d, INK.hair);
        k.ball(along(LEAF_W - 0.12, 1.02, 0.05), 0.045, MAT.brass, INK.detail);
      });
      // The frame: two posts and the head.
      add(box3([-HALF - POST, -POST, 0], [-HALF, POST, H]), () =>
        k.box([-HALF - POST, -POST, 0], [-HALF, POST, H], MAT.trim, { ink: INK.panel })
      );
      add(box3([HALF, -POST, 0], [HALF + POST, POST, H]), () =>
        k.box([HALF, -POST, 0], [HALF + POST, POST, H], MAT.trim, { ink: INK.panel })
      );
      add(box3([-HALF - POST, -POST, H], [HALF + POST, POST, H + 0.12]), () =>
        k.box([-HALF - POST, -POST, H], [HALF + POST, POST, H + 0.12], MAT.trim, {
          ink: INK.silhouette,
          decorate: {
            '+y': () => k.dot([0, POST, H + 0.06], 1.6, ACCENT.ledGreen),
          },
        })
      );
    });
  },
};
