import { Box3, INK, Iso, Paint, V3, hull } from '../kit/iso';
import { ACCENT, MAT, mix } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * A multifunction printer on a cabinet stand: the stand on casters, the
 * engine and its paper cassette, the inner output cavity with the last pages
 * in it, the scanner and its document feeder, and a tilted touchscreen.
 * Local frame: the origin is the middle of its base; the front (+y) faces the
 * room, where a worker would stand to collect a page.
 */

const W = 0.5;
const D = 0.42;

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

/**
 * A paper cavity under a scanner: the inner output of a modern multifunction
 * machine. Its back and left side are panels; the front and right stand
 * open, and the last pages lie in it.
 */
export function cavity(
  k: Iso,
  add: (box: Box3, draw: () => void) => void,
  w: number,
  d: number,
  z0: number,
  z1: number
): void {
  add(box3([-w, -d, z0], [w, -d + 0.08, z1]), () =>
    k.box([-w, -d, z0], [w, -d + 0.08, z1], MAT.machine, { ink: INK.detail, rim: false })
  );
  add(box3([-w, -d + 0.08, z0], [-w + 0.07, d, z1]), () =>
    k.box([-w, -d + 0.08, z0], [-w + 0.07, d, z1], MAT.machine, { ink: INK.detail, rim: false })
  );
  add(box3([-w + 0.07, -d + 0.08, z0], [w, d, z0 + 0.03]), () => {
    // The cavity's floor, in its own shadow, with the latest copies on it.
    k.fill(
      [
        [-w + 0.07, -d + 0.08, z0 + 0.001],
        [w, -d + 0.08, z0 + 0.001],
        [w, d, z0 + 0.001],
        [-w + 0.07, d, z0 + 0.001],
      ],
      MAT.graphite.m
    );
    page(k, -w + 0.14, -d + 0.14, w * 0.5, d - 0.08, z0 + 0.012);
    page(k, -w + 0.16, -d + 0.15, w * 0.5 + 0.02, d - 0.06, z0 + 0.02);
  });
}

/** A touchscreen on a tilted panel, its glass lit, at the front right. */
export function touchPanel(k: Iso, x0: number, x1: number, y: number, z: number): void {
  const back: V3 = [0, -0.02, 0.1];
  const quad: V3[] = [
    [x0, y, z],
    [x1, y, z],
    [x1, y + back[1] - 0.16, z + back[2]],
    [x0, y + back[1] - 0.16, z + back[2]],
  ];
  // The panel's body, then its glass.
  k.fillScreen(
    hull([...quad, ...quad.map(([a, b, c]): V3 => [a, b, c - 0.04])].map((p) => k.P(p))),
    MAT.graphite.d
  );
  k.shape(quad, MAT.graphite.m, INK.detail);
  const inset = quad.map(([a, b, c], i): V3 => [
    a + (i === 0 || i === 3 ? 0.03 : -0.03),
    b + (i < 2 ? -0.02 : 0.02),
    c + (i < 2 ? 0.012 : -0.012),
  ]);
  k.shape(inset, lcd(k, inset), INK.hair);
  k.line(
    [inset[0], inset[1]].map(([a, b, c]): V3 => [a, b - 0.04, c + 0.025]),
    1,
    false,
    '#ffffff'
  );
}

export const printer: OfficeObject = {
  name: 'Printer',
  blurb: 'A multifunction printer on its cabinet stand: scanner, feeder, touchscreen, warm pages.',
  bounds: box3([-0.62, -0.48, 0], [0.62, 0.62, 1.32]),
  footprint: box3([-W, -D, 0], [W, D, 1.2]),

  shadow(k) {
    k.castShadow(Iso.corners([-W, -D, 0], [W, D, 1.2]));
  },

  draw(k) {
    const STAND = 0.5;
    const BODY = 0.84;
    const SCAN0 = 0.98;
    const SCAN1 = 1.08;
    k.sorted((add) => {
      // The stand: a graphite cabinet on casters, its door and a ream inside.
      add(box3([-W, -D, 0], [W, D, STAND]), () => {
        for (const [x, y] of [
          [-W + 0.06, D - 0.06],
          [W - 0.06, D - 0.06],
        ]) {
          k.ball([x, y, 0.03], 0.03, MAT.graphite, INK.hair);
        }
        k.box([-W, -D, 0.05], [W, D, STAND], MAT.graphite, {
          ink: INK.panel,
          decorate: {
            '+y': () => {
              k.line(
                [
                  [-W + 0.04, D, 0.09],
                  [W - 0.04, D, 0.09],
                  [W - 0.04, D, STAND - 0.04],
                  [-W + 0.04, D, STAND - 0.04],
                ],
                INK.hair,
                true,
                MAT.graphite.l
              );
              k.box([W - 0.12, D, 0.22], [W - 0.08, D + 0.025, 0.38], MAT.alu, { ink: INK.hair });
            },
          },
        });
      });
      // The engine, with its paper cassette.
      add(box3([-W, -D, STAND], [W, D, BODY]), () =>
        k.box([-W, -D, STAND], [W, D, BODY], MAT.machine, {
          ink: INK.silhouette,
          rim: false,
          decorate: {
            '+y': () => {
              k.line(
                [
                  [-W + 0.04, D, STAND + 0.04],
                  [W - 0.04, D, STAND + 0.04],
                  [W - 0.04, D, STAND + 0.16],
                  [-W + 0.04, D, STAND + 0.16],
                ],
                INK.hair,
                true
              );
              k.shape(
                [
                  [-0.16, D, STAND + 0.12],
                  [0.16, D, STAND + 0.12],
                  [0.16, D, STAND + 0.14],
                  [-0.16, D, STAND + 0.14],
                ],
                MAT.graphite.m,
                INK.hair
              );
              // The front door's seam, a brand strip, the power light.
              k.line(
                [
                  [-W + 0.04, D, STAND + 0.2],
                  [W - 0.04, D, STAND + 0.2],
                ],
                INK.hair
              );
              k.fill(
                [
                  [-W, D + 0.001, BODY - 0.05],
                  [W, D + 0.001, BODY - 0.05],
                  [W, D + 0.001, BODY - 0.03],
                  [-W, D + 0.001, BODY - 0.03],
                ],
                MAT.cobalt.m
              );
              k.dot([-W + 0.08, D, BODY - 0.12], 1.4, ACCENT.ledGreen);
            },
            '+x': () => vents(k, W, -D + 0.08, D - 0.08, STAND + 0.06, BODY - 0.08),
          },
        })
      );
      cavity(k, add, W, D, BODY, SCAN0);
      // The scanner, and the document feeder over it with a stack waiting.
      add(box3([-W, -D, SCAN0], [W, D, SCAN1]), () =>
        k.box([-W, -D, SCAN0], [W, D, SCAN1], MAT.machine, { ink: INK.panel })
      );
      add(box3([-W + 0.02, -D + 0.02, SCAN1], [W - 0.14, D - 0.04, SCAN1 + 0.1]), () => {
        k.box([-W + 0.02, -D + 0.02, SCAN1], [W - 0.14, D - 0.04, SCAN1 + 0.06], MAT.machine, {
          ink: INK.detail,
        });
        k.box(
          [-W + 0.02, -D + 0.02, SCAN1 + 0.06],
          [W - 0.14, -D + 0.16, SCAN1 + 0.1],
          MAT.graphite,
          {
            ink: INK.detail,
          }
        );
        page(k, -W + 0.08, -D + 0.18, W - 0.2, D - 0.1, SCAN1 + 0.062);
      });
      add(box3([0.18, D - 0.08, BODY], [W, D + 0.12, BODY + 0.14]), () =>
        touchPanel(k, 0.18, W - 0.02, D + 0.1, BODY + 0.02)
      );
    });
  },
};
