import { INK, Iso } from '../kit/iso';
import { ACCENT, MAT } from '../kit/palette';
import { cavity, page, touchPanel, vents } from './printer';
import { OfficeObject, box3 } from './types';

/**
 * A big production copier: three paper cassettes over a plinth, the engine
 * behind its front door, the inner output cavity, the scanner with its
 * document feeder, a touchscreen on an arm, and a stapling finisher on the
 * right with sorted sets in its tray.
 * Local frame: the origin is the middle of its base, the front (+y) faces the room.
 */

const W = 0.62;
const D = 0.5;
const BASE_Z = 0.62;
const BODY_Z = 0.98;
const SCAN0 = 1.12;
const SCAN1 = 1.22;

export const copier: OfficeObject = {
  name: 'Copier',
  blurb: 'A production copier: cassettes, feeder, touchscreen and a stapling finisher.',
  bounds: box3([-0.7, -0.56, 0], [1.08, 0.72, 1.42]),
  footprint: box3([-W, -D, 0], [W + 0.38, D, SCAN1 + 0.1]),

  shadow(k) {
    k.castShadow([
      ...Iso.corners([-W, -D, 0], [W, D, SCAN1 + 0.1]),
      ...Iso.corners([W, -0.4, 0], [W + 0.38, 0.4, 1.0]),
    ]);
  },

  draw(k) {
    k.sorted((add) => {
      add(box3([-W + 0.03, -D + 0.03, 0], [W - 0.03, D - 0.03, 0.05]), () =>
        k.box([-W + 0.03, -D + 0.03, 0], [W - 0.03, D - 0.03, 0.05], MAT.graphite, {
          ink: INK.hair,
          rim: false,
        })
      );
      // The paper cassettes.
      add(box3([-W, -D, 0.05], [W, D, BASE_Z]), () =>
        k.box([-W, -D, 0.05], [W, D, BASE_Z], MAT.machine, {
          rim: false,
          decorate: {
            '+y': () => {
              const n = 3;
              const h = (BASE_Z - 0.1) / n;
              for (let i = 0; i < n; i++) {
                const lo = 0.08 + i * h;
                const hi = lo + h - 0.03;
                k.line(
                  [
                    [-W + 0.04, D, lo],
                    [W - 0.04, D, lo],
                    [W - 0.04, D, hi],
                    [-W + 0.04, D, hi],
                  ],
                  INK.hair,
                  true
                );
                // A recessed grip and a paper-level gauge on each.
                k.shape(
                  [
                    [-0.2, D, hi - 0.06],
                    [0.2, D, hi - 0.06],
                    [0.2, D, hi - 0.035],
                    [-0.2, D, hi - 0.035],
                  ],
                  MAT.graphite.m,
                  INK.hair
                );
                for (let j = 0; j < 4; j++) {
                  k.dot(
                    [0.36 + j * 0.05, D, lo + 0.05],
                    0.9,
                    j < 3 - i ? ACCENT.ledGreen : MAT.graphite.l
                  );
                }
              }
            },
            '+x': () => vents(k, W, -D + 0.1, D - 0.1, 0.16, BASE_Z - 0.1),
          },
        })
      );
      // The engine behind its front door, a cobalt stripe and the maker's plate.
      add(box3([-W, -D, BASE_Z], [W, D, BODY_Z]), () =>
        k.box([-W, -D, BASE_Z], [W, D, BODY_Z], MAT.machine, {
          ink: INK.silhouette,
          rim: false,
          decorate: {
            '+y': () => {
              k.line(
                [
                  [-W + 0.04, D, BASE_Z + 0.03],
                  [W - 0.04, D, BASE_Z + 0.03],
                  [W - 0.04, D, BODY_Z - 0.1],
                  [-W + 0.04, D, BODY_Z - 0.1],
                ],
                INK.hair,
                true
              );
              k.box([-W + 0.08, D, BASE_Z + 0.12], [-W + 0.12, D + 0.02, BODY_Z - 0.16], MAT.alu, {
                ink: INK.hair,
              });
              k.fill(
                [
                  [-W, D + 0.001, BODY_Z - 0.07],
                  [W, D + 0.001, BODY_Z - 0.07],
                  [W, D + 0.001, BODY_Z - 0.04],
                  [-W, D + 0.001, BODY_Z - 0.04],
                ],
                MAT.cobalt.m
              );
              k.shape(
                [
                  [0.1, D + 0.002, BASE_Z + 0.14],
                  [0.36, D + 0.002, BASE_Z + 0.14],
                  [0.36, D + 0.002, BASE_Z + 0.2],
                  [0.1, D + 0.002, BASE_Z + 0.2],
                ],
                MAT.alu.m,
                INK.hair
              );
            },
            '+x': () => vents(k, W, -D + 0.12, D - 0.12, BASE_Z + 0.06, BODY_Z - 0.08),
          },
        })
      );
      cavity(k, add, W, D, BODY_Z, SCAN0);
      add(box3([-W, -D, SCAN0], [W, D, SCAN1]), () =>
        k.box([-W, -D, SCAN0], [W, D, SCAN1], MAT.machine, { ink: INK.panel })
      );
      // The document feeder, with a stack of originals in its tray.
      add(box3([-W + 0.03, -D + 0.03, SCAN1], [W - 0.08, D - 0.05, SCAN1 + 0.12]), () => {
        k.box([-W + 0.03, -D + 0.03, SCAN1], [W - 0.08, D - 0.05, SCAN1 + 0.06], MAT.machine, {
          ink: INK.detail,
        });
        k.box(
          [-W + 0.03, -D + 0.03, SCAN1 + 0.06],
          [W - 0.08, -D + 0.2, SCAN1 + 0.12],
          MAT.graphite,
          {
            ink: INK.detail,
          }
        );
        page(k, -W + 0.1, -D + 0.22, W - 0.16, D - 0.1, SCAN1 + 0.062);
        page(k, -W + 0.11, -D + 0.23, W - 0.15, D - 0.09, SCAN1 + 0.07);
      });
      // The touchscreen, out on its arm at the front right.
      add(box3([0.12, D - 0.02, BODY_Z], [W + 0.04, D + 0.22, BODY_Z + 0.2]), () => {
        k.box([0.36, D, BODY_Z + 0.02], [0.42, D + 0.12, BODY_Z + 0.05], MAT.graphite, {
          ink: INK.hair,
        });
        touchPanel(k, 0.14, W + 0.02, D + 0.2, BODY_Z + 0.06);
      });
      // The finisher: a tall unit on the right, its stacking tray out the side.
      add(box3([W, -0.4, 0], [W + 0.38, 0.4, 1.0]), () => {
        k.box([W, -0.4, 0.03], [W + 0.22, 0.4, 1.0], MAT.machine, {
          ink: INK.silhouette,
          decorate: {
            '+y': () => {
              k.line(
                [
                  [W + 0.03, 0.4, 0.08],
                  [W + 0.19, 0.4, 0.08],
                  [W + 0.19, 0.4, 0.95],
                  [W + 0.03, 0.4, 0.95],
                ],
                INK.hair,
                true
              );
              k.dot([W + 0.11, 0.4, 0.88], 1.2, ACCENT.ledBlue);
            },
          },
        });
        k.box([W + 0.22, -0.3, 0.62], [W + 0.38, 0.3, 0.66], MAT.machine, { ink: INK.detail });
        page(k, W + 0.22, -0.26, W + 0.36, 0.24, 0.665);
        page(k, W + 0.22, -0.24, W + 0.37, 0.26, 0.675);
        k.dot([W + 0.25, -0.22, 0.68], 0.9, MAT.alu.d);
      });
    });
  },
};
