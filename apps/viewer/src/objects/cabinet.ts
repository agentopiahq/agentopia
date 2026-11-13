import { INK, V3 } from '../kit/iso';
import { ACCENT, MAT, PAL, SHEET, mix } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * A three-drawer steel filing cabinet — where a session files its context
 * away when it compacts. Each drawer has a pull and a label card; the back
 * has a service panel, because the cabinets on the far wall show theirs.
 * Local frame: origin at the middle of its base, drawers (+y) facing the room.
 */

const W = 0.4;
const D = 0.33;
const H = 1.5;
const DRAWERS = 3;

export const cabinet: OfficeObject = {
  name: 'Cabinet',
  blurb: 'A steel filing cabinet: compacting sessions file their papers here.',
  bounds: box3([-0.45, -0.4, 0], [0.45, 0.42, 1.62]),
  footprint: box3([-W, -D, 0], [W, D, H]),

  shadow(k) {
    k.castShadow([
      [-W, -D, 0],
      [W, -D, 0],
      [W, D, 0],
      [-W, D, 0],
      [-W, -D, H],
      [W, -D, H],
      [W, D, H],
      [-W, D, H],
    ]);
  },

  draw(k) {
    // A recessed kick plinth, then the body on it.
    k.box([-W + 0.03, -D + 0.03, 0], [W - 0.03, D - 0.03, 0.06], MAT.graphite, {
      ink: INK.detail,
      rim: false,
    });
    k.box([-W, -D, 0.06], [W, D, H], MAT.cabinet, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          const h = (H - 0.14) / DRAWERS;
          for (let i = 0; i < DRAWERS; i++) {
            const lo = 0.1 + i * h;
            const hi = lo + h - 0.04;
            const front: V3[] = [
              [-W + 0.04, D, lo],
              [W - 0.04, D, lo],
              [W - 0.04, D, hi],
              [-W + 0.04, D, hi],
            ];
            k.lit(front, [0, 1, 0], {
              l: MAT.cabinet.l,
              m: mix(MAT.cabinet.m, '#ffffff', 0.08),
              d: mix(MAT.cabinet.d, '#ffffff', 0.08),
            });
            k.line(front, INK.detail, true);
            // A highlight along the drawer's top lip.
            k.line(
              [
                [-W + 0.06, D, hi - 0.015],
                [W - 0.06, D, hi - 0.015],
              ],
              0.8,
              false,
              mix(MAT.cabinet.l, '#ffffff', 0.5)
            );
            // The label card in its chrome holder, with a line of type.
            k.shape(
              [
                [-0.15, D, hi - 0.17],
                [0.15, D, hi - 0.17],
                [0.15, D, hi - 0.06],
                [-0.15, D, hi - 0.06],
              ],
              MAT.alu.l,
              INK.hair
            );
            k.fill(
              [
                [-0.13, D, hi - 0.155],
                [0.13, D, hi - 0.155],
                [0.13, D, hi - 0.075],
                [-0.13, D, hi - 0.075],
              ],
              PAL.cream
            );
            k.line(
              [
                [-0.09, D, hi - 0.115],
                [0.06 - i * 0.03, D, hi - 0.115],
              ],
              INK.hair,
              false,
              SHEET.lead
            );
            // The pull: a chrome cup handle, lit along its top.
            k.box([-0.17, D, hi - 0.31], [0.17, D + 0.035, hi - 0.24], MAT.alu, {
              ink: INK.detail,
            });
            k.fill(
              [
                [-0.14, D + 0.036, hi - 0.3],
                [0.14, D + 0.036, hi - 0.3],
                [0.14, D + 0.036, hi - 0.27],
                [-0.14, D + 0.036, hi - 0.27],
              ],
              MAT.graphite.m
            );
          }
          // The lock barrel, top right.
          k.dot([W - 0.1, D, H - 0.06], 1.8, MAT.alu.l, INK.hair);
        },
        '-y': () => {
          // The service panel and its four screws.
          k.line(
            [
              [-W + 0.08, -D, 0.16],
              [W - 0.08, -D, 0.16],
              [W - 0.08, -D, H - 0.12],
              [-W + 0.08, -D, H - 0.12],
            ],
            INK.hair,
            true
          );
          for (const x of [-W + 0.12, W - 0.12]) {
            for (const z of [0.2, H - 0.16]) {
              k.dot([x, -D, z], 1.1, MAT.alu.m, INK.hair);
            }
          }
        },
        '+z': () => {
          // A manila folder someone left on top, papers peeking out.
          k.shape(
            [
              [-0.24, -0.18, H + 0.001],
              [0.22, -0.24, H + 0.001],
              [0.24, 0.16, H + 0.001],
              [-0.2, 0.2, H + 0.001],
            ],
            ACCENT.paperSheet,
            INK.hair
          );
          k.shape(
            [
              [-0.26, -0.2, H + 0.004],
              [0.22, -0.26, H + 0.004],
              [0.26, 0.18, H + 0.004],
              [-0.22, 0.22, H + 0.004],
            ].map(([x, y, z]): V3 => [x + 0.02, y + 0.03, z]),
            PAL.tan,
            INK.detail
          );
        },
      },
    });
  },
};
