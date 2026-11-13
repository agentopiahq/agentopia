import { INK } from '../kit/iso';
import { MAT, PAL } from '../kit/palette';
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
    k.box([-W, -D, 0], [W, D, H], MAT.cobalt, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          const h = (H - 0.08) / DRAWERS;
          for (let i = 0; i < DRAWERS; i++) {
            const lo = 0.05 + i * h;
            const hi = lo + h - 0.04;
            k.shape(
              [
                [-W + 0.04, D, lo],
                [W - 0.04, D, lo],
                [W - 0.04, D, hi],
                [-W + 0.04, D, hi],
              ],
              MAT.cobalt.m,
              INK.detail
            );
            // The label card, then the pull below it.
            k.shape(
              [
                [-0.14, D, hi - 0.16],
                [0.14, D, hi - 0.16],
                [0.14, D, hi - 0.07],
                [-0.14, D, hi - 0.07],
              ],
              PAL.cream,
              INK.hair
            );
            k.shape(
              [
                [-0.17, D, hi - 0.3],
                [0.17, D, hi - 0.3],
                [0.17, D, hi - 0.24],
                [-0.17, D, hi - 0.24],
              ],
              MAT.metal.m,
              INK.detail
            );
          }
        },
        '-y': () => {
          // The service panel and its four screws.
          k.line(
            [
              [-W + 0.08, -D, 0.12],
              [W - 0.08, -D, 0.12],
              [W - 0.08, -D, H - 0.12],
              [-W + 0.08, -D, H - 0.12],
            ],
            INK.hair,
            true
          );
          for (const x of [-W + 0.12, W - 0.12]) {
            for (const z of [0.16, H - 0.16]) {
              k.dot([x, -D, z], 1.1, MAT.cobalt.d);
            }
          }
        },
        '+z': () => {
          // A manila folder someone left on top.
          k.shape(
            [
              [-0.26, -0.2, H],
              [0.22, -0.24, H],
              [0.26, 0.18, H],
              [-0.22, 0.22, H],
            ],
            PAL.tan,
            INK.detail
          );
        },
      },
    });
  },
};
