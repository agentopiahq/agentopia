import { INK, Iso } from '../kit/iso';
import { ACCENT, MAT } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * A floor-standing laser printer: a paper cabinet below, the engine above, the
 * output well on top with the last page in it, and a little control panel.
 * Local frame: the origin is the middle of its base; the front (+y) faces the
 * room, where a worker would stand to collect a page.
 */

const W = 0.56;
const D = 0.42;
const BASE_Z = 0.48;
const TOP_Z = 0.94;

/** A printed page lying flat at height z: a cream sheet with lines of type. */
export function page(k: Iso, x0: number, y0: number, x1: number, y1: number, z: number): void {
  k.shape(
    [
      [x0, y0, z],
      [x1, y0, z],
      [x1, y1, z],
      [x0, y1, z],
    ],
    ACCENT.paperSheet,
    INK.hair
  );
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const y = y0 + ((y1 - y0) * (i + 1)) / (rows + 1);
    const end = x1 - (x1 - x0) * (i % 2 === 0 ? 0.18 : 0.38);
    k.line(
      [
        [x0 + (x1 - x0) * 0.15, y, z],
        [end, y, z],
      ],
      INK.hair
    );
  }
}

export const printer: OfficeObject = {
  name: 'Printer',
  blurb: 'A floor-standing laser printer, last page still warm in the tray.',
  bounds: box3([-0.62, -0.48, 0], [0.62, 0.56, 1.05]),
  footprint: box3([-W, -D, 0], [W, D, TOP_Z]),

  shadow(k) {
    k.castShadow(Iso.corners([-W, -D, 0], [W, D, TOP_Z + 0.05]));
  },

  draw(k) {
    k.sorted((add) => {
      add(box3([-W, -D, 0], [W, D, BASE_Z]), () =>
        k.box([-W, -D, 0], [W, D, BASE_Z], MAT.machine, {
          decorate: {
            '+y': () => {
              // The paper drawer: a seam, a pull, and a paper-level window.
              k.line(
                [
                  [-W + 0.05, D, 0.07],
                  [W - 0.05, D, 0.07],
                  [W - 0.05, D, BASE_Z - 0.05],
                  [-W + 0.05, D, BASE_Z - 0.05],
                ],
                INK.hair,
                true
              );
              k.shape(
                [
                  [-0.16, D, 0.3],
                  [0.16, D, 0.3],
                  [0.16, D, 0.36],
                  [-0.16, D, 0.36],
                ],
                MAT.dark.m,
                INK.hair
              );
            },
          },
        })
      );
      add(box3([-W, -D, BASE_Z], [W, D, TOP_Z]), () =>
        k.box([-W, -D, BASE_Z], [W, D, TOP_Z], MAT.machine, {
          ink: INK.silhouette,
          decorate: {
            '+y': () => {
              // The front cover's seam and its finger grip.
              k.line(
                [
                  [-W + 0.04, D, BASE_Z + 0.06],
                  [W - 0.04, D, BASE_Z + 0.06],
                ],
                INK.hair
              );
              k.shape(
                [
                  [-0.22, D, TOP_Z - 0.16],
                  [0.22, D, TOP_Z - 0.16],
                  [0.22, D, TOP_Z - 0.12],
                  [-0.22, D, TOP_Z - 0.12],
                ],
                MAT.dark.d,
                INK.hair
              );
            },
            '+z': () => {
              // The output well, dark, with the last page lying in it.
              k.shape(
                [
                  [-0.42, -0.3, TOP_Z],
                  [0.2, -0.3, TOP_Z],
                  [0.2, 0.22, TOP_Z],
                  [-0.42, 0.22, TOP_Z],
                ],
                MAT.machine.d,
                INK.detail
              );
              page(k, -0.36, -0.24, 0.14, 0.18, TOP_Z + 0.005);
            },
          },
        })
      );
      // The control panel, raised at the top right, with its screen and light.
      add(box3([0.26, -0.3, TOP_Z], [0.5, 0.3, TOP_Z + 0.06]), () => {
        k.box([0.26, -0.3, TOP_Z], [0.5, 0.3, TOP_Z + 0.06], MAT.dark, {
          ink: INK.detail,
          decorate: {
            '+z': () => {
              k.shape(
                [
                  [0.3, -0.24, TOP_Z + 0.06],
                  [0.46, -0.24, TOP_Z + 0.06],
                  [0.46, 0.04, TOP_Z + 0.06],
                  [0.3, 0.04, TOP_Z + 0.06],
                ],
                MAT.screen.l,
                INK.hair
              );
              k.dot([0.38, 0.18, TOP_Z + 0.06], 1.6, ACCENT.ledGreen);
            },
          },
        });
      });
    });
  },
};
