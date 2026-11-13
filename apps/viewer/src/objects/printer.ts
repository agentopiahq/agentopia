import { INK, Iso, Paint, V3 } from '../kit/iso';
import { ACCENT, MAT, mix } from '../kit/palette';
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

/** Cooling vents: a column of short slots on a side face at x. */
export function vents(k: Iso, x: number, y0: number, y1: number, z0: number, z1: number): void {
  const slots = Math.max(2, Math.floor((z1 - z0) / 0.05));
  for (let i = 0; i < slots; i++) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / slots;
    k.line(
      [
        [x, y0 + (y1 - y0) * 0.55, z],
        [x, y1, z],
      ],
      INK.detail,
      false,
      mix(MAT.machine.d, '#000000', 0.25)
    );
  }
}

/** A lit LCD: a teal-green glass, brightest at its top. */
export function lcd(k: Iso, quad: V3[]): Paint {
  const ctx = k.ctx;
  if (!ctx.createLinearGradient) {
    return ACCENT.lcd;
  }
  const a = k.P(quad[0]);
  const b = k.P(quad[2]);
  const paint = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
  paint.addColorStop(0, mix(ACCENT.lcd, '#ffffff', 0.35));
  paint.addColorStop(1, mix(ACCENT.lcd, '#000000', 0.15));
  return paint;
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
                MAT.graphite.m,
                INK.hair
              );
              // The paper-level gauge: a strip of white behind a slot.
              k.shape(
                [
                  [0.24, D, 0.14],
                  [0.44, D, 0.14],
                  [0.44, D, 0.2],
                  [0.24, D, 0.2],
                ],
                MAT.graphite.d,
                INK.hair
              );
              k.fill(
                [
                  [0.26, D, 0.155],
                  [0.36, D, 0.155],
                  [0.36, D, 0.185],
                  [0.26, D, 0.185],
                ],
                ACCENT.paperSheet
              );
            },
            '+x': () => vents(k, W, -D + 0.08, D - 0.08, 0.12, BASE_Z - 0.08),
          },
        })
      );
      // A graphite plinth, the printer standing a hair off the floor on it.
      add(box3([-W + 0.02, -D + 0.02, 0], [W - 0.02, D - 0.02, 0.04]), () =>
        k.box([-W + 0.02, -D + 0.02, 0], [W - 0.02, D - 0.02, 0.04], MAT.graphite, {
          ink: INK.hair,
          rim: false,
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
            '+x': () => vents(k, W, -D + 0.1, D - 0.1, BASE_Z + 0.12, TOP_Z - 0.1),
            '+z': () => {
              // The output well, dark, with the last page lying in it.
              k.shape(
                [
                  [-0.42, -0.3, TOP_Z],
                  [0.2, -0.3, TOP_Z],
                  [0.2, 0.22, TOP_Z],
                  [-0.42, 0.22, TOP_Z],
                ],
                MAT.graphite.m,
                INK.detail
              );
              page(k, -0.36, -0.24, 0.14, 0.18, TOP_Z + 0.005);
            },
          },
        })
      );
      // The control panel, raised at the top right, with its screen and light.
      add(box3([0.26, -0.3, TOP_Z], [0.5, 0.3, TOP_Z + 0.06]), () => {
        k.box([0.26, -0.3, TOP_Z], [0.5, 0.3, TOP_Z + 0.06], MAT.graphite, {
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
                lcd(k, [
                  [0.3, -0.24, TOP_Z + 0.06],
                  [0.46, -0.24, TOP_Z + 0.06],
                  [0.46, 0.04, TOP_Z + 0.06],
                  [0.3, 0.04, TOP_Z + 0.06],
                ]),
                INK.hair
              );
              k.dot([0.34, 0.16, TOP_Z + 0.06], 1.5, ACCENT.ledGreen);
              k.dot([0.42, 0.16, TOP_Z + 0.06], 1.5, MAT.graphite.l, INK.hair);
              k.dot([0.38, 0.24, TOP_Z + 0.06], 1.5, MAT.graphite.l, INK.hair);
            },
          },
        });
      });
    });
  },
};
