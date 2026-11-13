import { INK, Iso } from '../kit/iso';
import { ACCENT, MAT } from '../kit/palette';
import { page } from './printer';
import { OfficeObject, box3 } from './types';

/**
 * A big office copier: three paper drawers, the engine with a mint stripe,
 * a dark platen lid on top, the control panel jutting out at the front right,
 * and the output tray on its side with a fresh copy in it.
 * Local frame: the origin is the middle of its base, the front (+y) faces the room.
 */

const W = 0.72;
const D = 0.5;
const BASE_Z = 0.78;
const BODY_Z = 1.16;
const LID_Z = 1.24;

export const copier: OfficeObject = {
  name: 'Copier',
  blurb: 'A full-size copier with paper drawers, a platen lid and a side tray.',
  bounds: box3([-0.78, -0.56, 0], [1.08, 0.66, 1.32]),
  footprint: box3([-W, -D, 0], [W, D, LID_Z]),

  shadow(k) {
    k.castShadow([
      ...Iso.corners([-W, -D, 0], [W, D, LID_Z]),
      [1.04, -0.3, 0.84],
      [1.04, 0.3, 0.84],
    ]);
  },

  draw(k) {
    k.sorted((add) => {
      // The output tray off the side, under a fresh copy.
      add(box3([W, -0.3, 0.8], [1.04, 0.3, 0.86]), () => {
        k.box([W, -0.3, 0.8], [1.04, 0.3, 0.84], MAT.machine, { ink: INK.detail });
        page(k, W + 0.04, -0.24, 1.0, 0.2, 0.845);
      });
      add(box3([-W, -D, 0], [W, D, BASE_Z]), () =>
        k.box([-W, -D, 0], [W, D, BASE_Z], MAT.machine, {
          decorate: {
            '+y': () => {
              const n = 3;
              const h = (BASE_Z - 0.1) / n;
              for (let i = 0; i < n; i++) {
                const lo = 0.08 + i * h;
                const hi = lo + h - 0.03;
                k.line(
                  [
                    [-W + 0.05, D, lo],
                    [W - 0.05, D, lo],
                    [W - 0.05, D, hi],
                    [-W + 0.05, D, hi],
                  ],
                  INK.hair,
                  true
                );
                // A long pull and a paper-size tab on each drawer.
                k.line(
                  [
                    [-0.26, D, hi - 0.07],
                    [0.26, D, hi - 0.07],
                  ],
                  1.8
                );
                k.shape(
                  [
                    [0.42, D, lo + 0.05],
                    [0.58, D, lo + 0.05],
                    [0.58, D, lo + 0.11],
                    [0.42, D, lo + 0.11],
                  ],
                  MAT.mint.l,
                  INK.hair
                );
              }
            },
          },
        })
      );
      add(box3([-W, -D, BASE_Z], [W, D, BODY_Z]), () =>
        k.box([-W, -D, BASE_Z], [W, D, BODY_Z], MAT.machine, {
          ink: INK.silhouette,
          decorate: {
            '+y': () => {
              k.shape(
                [
                  [-W, D, BASE_Z + 0.08],
                  [W, D, BASE_Z + 0.08],
                  [W, D, BASE_Z + 0.16],
                  [-W, D, BASE_Z + 0.16],
                ],
                MAT.mint.m,
                INK.hair
              );
            },
          },
        })
      );
      add(box3([-W + 0.02, -D + 0.02, BODY_Z], [W - 0.02, D - 0.02, LID_Z]), () =>
        k.slab(-W + 0.02, -D + 0.02, W - 0.02, D - 0.02, BODY_Z, LID_Z, 0.04, MAT.dark, INK.panel)
      );
      // The control panel juts out over the front at the right.
      add(box3([0.08, D - 0.06, 1.02], [0.7, D + 0.16, 1.1]), () =>
        k.box([0.08, D - 0.06, 1.02], [0.7, D + 0.16, 1.1], MAT.dark, {
          ink: INK.detail,
          decorate: {
            '+z': () => {
              k.shape(
                [
                  [0.14, D, 1.1],
                  [0.38, D, 1.1],
                  [0.38, D + 0.12, 1.1],
                  [0.14, D + 0.12, 1.1],
                ],
                MAT.screen.m,
                INK.hair
              );
              k.line(
                [
                  [0.17, D + 0.05, 1.1],
                  [0.32, D + 0.05, 1.1],
                ],
                0.8,
                false,
                ACCENT.terminal
              );
              k.dot([0.47, D + 0.06, 1.1], 1.7, ACCENT.ledGreen);
              k.dot([0.55, D + 0.06, 1.1], 1.7, ACCENT.ledBlue);
              k.dot([0.63, D + 0.06, 1.1], 1.7, ACCENT.ledRed);
            },
          },
        })
      );
    });
  },
};
