import { INK, Iso, V2, V3, lift, plane, roundRect } from '../kit/iso';
import { ACCENT, MAT, PAL } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * The door everyone arrives and leaves by: a frame standing at the front edge
 * of the floor, its panelled leaf swung open into the room, a mat inside.
 * Local frame: the origin is the middle of the threshold, the front (+y)
 * faces out of the office, toward the viewer.
 */

const POST = 0.1;
const HALF = 0.64;
const H = 2.08;
/** How far the leaf stands open, in degrees. */
const OPEN = 62;
const LEAF_W = 1.18;
const LEAF_T = 0.06;

/** The leaf's floor outline: hinged at the left post, swung in toward -y. */
function leafOutline(): V2[] {
  const a = (OPEN * Math.PI) / 180;
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
  bounds: box3([-0.78, -1.3, 0], [0.78, 0.2, 2.28]),
  // Only the frame sorts against the cast; the open leaf stands to the side.
  footprint: box3([-HALF - POST, -POST, 0], [HALF + POST, POST, H + 0.12]),

  shadow(k) {
    k.castShadow([
      Iso.corners([-HALF - POST, -POST, 0], [HALF + POST, POST, H + 0.12]),
      lift(plane.z(0), leafOutline()).flatMap((p): V3[] => [p, [p[0], p[1], H - 0.04]]),
    ]);
  },

  draw(k) {
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
      const leaf = leafOutline();
      add(box3([-HALF, -1.25, 0], [0.0, -POST, H]), () => {
        k.prism(leaf, 'z', 0.02, H - 0.04, MAT.wood, { ink: INK.silhouette });
        const a = (OPEN * Math.PI) / 180;
        const along = (t: number, z: number, out = 0.001): V3 => [
          leaf[0][0] + Math.cos(a) * t + Math.sin(a) * out,
          leaf[0][1] - Math.sin(a) * t + Math.cos(a) * out,
          z,
        ];
        for (const [z0, z1] of [
          [0.2, 0.95],
          [1.12, 1.88],
        ]) {
          k.line(
            [along(0.18, z0), along(LEAF_W - 0.18, z0), along(LEAF_W - 0.18, z1), along(0.18, z1)],
            INK.detail,
            true
          );
        }
        k.dot(along(LEAF_W - 0.12, 1.02, 0.02), 2.2, PAL.gold, INK.hair);
      });
      // The frame: two posts and the head.
      add(box3([-HALF - POST, -POST, 0], [-HALF, POST, H]), () =>
        k.box([-HALF - POST, -POST, 0], [-HALF, POST, H], MAT.wood, { ink: INK.panel })
      );
      add(box3([HALF, -POST, 0], [HALF + POST, POST, H]), () =>
        k.box([HALF, -POST, 0], [HALF + POST, POST, H], MAT.wood, { ink: INK.panel })
      );
      add(box3([-HALF - POST, -POST, H], [HALF + POST, POST, H + 0.12]), () =>
        k.box([-HALF - POST, -POST, H], [HALF + POST, POST, H + 0.12], MAT.wood, {
          ink: INK.silhouette,
          decorate: {
            '+y': () => k.dot([0, POST, H + 0.06], 1.6, ACCENT.ledGreen),
          },
        })
      );
    });
  },
};
