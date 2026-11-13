import { INK, Iso, V3, ellipse, lift, plane } from '../kit/iso';
import { ACCENT, MAT, Mat, PAL } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * The kitchen: a run of base units under a stone worktop against the wall,
 * a tiled splashback, wall cupboards, a sink, an espresso machine and a
 * kettle; a fridge; and a standing table to drink at. The worktop is at desk
 * height and the machine's buttons at the avatar's hand height, so a lead
 * can stand at it the way it stands at the copier. Authored against a wall
 * at local y = -D, front toward local +y.
 */

const HX = 2.2;
const D = 0.32;
/** Worktop height: the desk's, where a standing avatar's hands are. */
export const WORKTOP_Z = 0.8;
const UPPER = { z0: 1.5, z1: 2.15, d: 0.34 } as const;

function handle(k: Iso, x: number, y: number, z0: number, z1: number): void {
  k.box([x - 0.012, y, z0], [x + 0.012, y + 0.025, z1], MAT.alu, { ink: INK.hair });
}

export const kitchenCounter: OfficeObject = {
  name: 'Kitchen',
  blurb: 'The kitchen run: sink, espresso machine, kettle, cupboards, at desk height.',
  bounds: box3([-HX - 0.05, -D, 0], [HX + 0.05, D + 0.08, UPPER.z1 + 0.05]),
  footprint: box3([-HX, -D, 0], [HX, D, WORKTOP_Z]),

  shadow(k) {
    k.castShadow(Iso.corners([-HX, -D, 0], [HX, D, WORKTOP_Z]));
  },

  draw(k) {
    const z = WORKTOP_Z;
    k.sorted((add) => {
      // The splashback tiles and the wall cupboards, on the wall behind.
      add(box3([-HX, -D, z], [HX, -D + 0.01, UPPER.z1]), () => {
        const y = -D + 0.005;
        k.fill(
          [
            [-HX, y, z],
            [HX, y, z],
            [HX, y, UPPER.z0],
            [-HX, y, UPPER.z0],
          ],
          '#f3f1ec'
        );
        for (let row = 0; row < 5; row++) {
          const zz = z + 0.1 + row * 0.12;
          k.line(
            [
              [-HX, y, zz],
              [HX, y, zz],
            ],
            INK.hair,
            false,
            '#d6d1c7'
          );
          for (let x = -HX + (row % 2 ? 0.12 : 0.24); x < HX; x += 0.24) {
            k.line(
              [
                [x, y, zz - 0.12],
                [x, y, zz],
              ],
              INK.hair,
              false,
              '#d6d1c7'
            );
          }
        }
      });
      add(box3([-HX, -D, UPPER.z0], [HX, -D + UPPER.d, UPPER.z1]), () =>
        k.box([-HX, -D, UPPER.z0], [HX, -D + UPPER.d, UPPER.z1], MAT.paint, {
          ink: INK.panel,
          decorate: {
            '+y': () => {
              const n = 5;
              const w = (2 * HX) / n;
              for (let i = 0; i < n; i++) {
                const x0 = -HX + i * w;
                k.line(
                  [
                    [x0 + 0.02, -D + UPPER.d, UPPER.z0 + 0.03],
                    [x0 + w - 0.02, -D + UPPER.d, UPPER.z0 + 0.03],
                    [x0 + w - 0.02, -D + UPPER.d, UPPER.z1 - 0.03],
                    [x0 + 0.02, -D + UPPER.d, UPPER.z1 - 0.03],
                  ],
                  INK.hair,
                  true
                );
                handle(
                  k,
                  x0 + (i % 2 ? 0.08 : w - 0.08),
                  -D + UPPER.d,
                  UPPER.z0 + 0.06,
                  UPPER.z0 + 0.2
                );
              }
            },
          },
        })
      );
      // The base units, then the worktop.
      add(box3([-HX, -D, 0], [HX, D, z - 0.05]), () =>
        k.box([-HX, -D, 0.06], [HX, D, z - 0.05], MAT.sand, {
          ink: INK.panel,
          rim: false,
          decorate: {
            '+y': () => {
              const n = 5;
              const w = (2 * HX) / n;
              for (let i = 0; i < n; i++) {
                const x0 = -HX + i * w;
                k.line(
                  [
                    [x0 + 0.02, D, 0.1],
                    [x0 + w - 0.02, D, 0.1],
                    [x0 + w - 0.02, D, z - 0.09],
                    [x0 + 0.02, D, z - 0.09],
                  ],
                  INK.hair,
                  true
                );
                handle(k, x0 + (i % 2 ? 0.08 : w - 0.08), D, z - 0.3, z - 0.14);
              }
            },
          },
        })
      );
      add(box3([-HX, -D, 0], [HX, D, 0.06]), () =>
        k.box([-HX + 0.02, -D, 0], [HX - 0.02, D - 0.04, 0.06], MAT.graphite, {
          ink: INK.hair,
          rim: false,
        })
      );
      add(box3([-HX - 0.02, -D, z - 0.05], [HX + 0.02, D + 0.04, z]), () => {
        k.box([-HX - 0.02, -D, z - 0.05], [HX + 0.02, D + 0.04, z], MAT.stone, { ink: INK.panel });
        // The sink, set into the stone, and its tap.
        k.shape(
          lift(plane.z(z + 0.001), [
            [-0.9, -0.16],
            [-0.3, -0.16],
            [-0.3, 0.2],
            [-0.9, 0.2],
          ]),
          MAT.alu.d,
          INK.detail
        );
        k.dot([-0.6, 0.02, z + 0.002], 1.2, MAT.graphite.d);
      });
      add(box3([-0.66, -D, z], [-0.54, -0.1, z + 0.36]), () => {
        k.cylinder(-0.6, -0.24, z, z + 0.3, 0.025, MAT.alu, INK.detail);
        k.rod([-0.6, -0.24, z + 0.3], [-0.6, -0.08, z + 0.26], 0.02, MAT.alu, INK.detail);
      });
      // The espresso machine: a graphite body with a steel face, a group
      // head over the drip tray with a cup under it, and its buttons lit.
      const ex = 0.75;
      add(box3([ex - 0.22, -D, z], [ex + 0.22, 0.12, z + 0.44]), () => {
        k.box([ex - 0.2, -D + 0.02, z], [ex + 0.2, 0.08, z + 0.42], MAT.graphite, {
          ink: INK.panel,
          decorate: {
            '+y': () => {
              k.shape(
                [
                  [ex - 0.17, 0.08, z + 0.2],
                  [ex + 0.17, 0.08, z + 0.2],
                  [ex + 0.17, 0.08, z + 0.39],
                  [ex - 0.17, 0.08, z + 0.39],
                ],
                MAT.alu.m,
                INK.hair
              );
              for (let i = 0; i < 3; i++) {
                k.dot(
                  [ex - 0.08 + i * 0.08, 0.08, z + 0.33],
                  1.3,
                  i === 0 ? ACCENT.ledGreen : MAT.alu.l,
                  INK.hair
                );
              }
            },
          },
        });
        k.box([ex - 0.16, 0.08, z], [ex + 0.16, 0.12, z + 0.03], MAT.alu, { ink: INK.hair });
        k.box([ex - 0.05, 0.06, z + 0.17], [ex + 0.05, 0.12, z + 0.2], MAT.alu, { ink: INK.hair });
        k.cylinder(ex, 0.09, z + 0.03, z + 0.1, 0.035, MAT.ceramic, INK.hair);
      });
      // A kettle, a fruit bowl, a jar of biscuits.
      add(box3([1.3, -0.2, z], [1.5, 0.0, z + 0.24]), () => {
        k.cylinder(1.4, -0.1, z, z + 0.02, 0.09, MAT.graphite, INK.hair);
        k.prism(ellipse(1.4, -0.1, 0.07, 0.07, 16), 'z', z + 0.02, z + 0.2, MAT.alu, {
          ink: INK.detail,
        });
        k.rod([1.47, -0.1, z + 0.18], [1.5, -0.1, z + 0.08], 0.012, MAT.graphite, INK.hair);
      });
      add(box3([-1.8, -0.18, z], [-1.4, 0.18, z + 0.2]), () => {
        k.prism(ellipse(-1.6, 0.0, 0.16, 0.16, 18), 'z', z, z + 0.08, MAT.glaze, {
          ink: INK.detail,
        });
        const fruit: Array<[V3, number, Mat]> = [
          [[-1.66, -0.02, z + 0.11], 0.06, MAT.tomato],
          [[-1.55, 0.03, z + 0.11], 0.055, MAT.mustard],
          [[-1.6, -0.06, z + 0.15], 0.05, MAT.mint],
        ];
        for (const [c, r, m] of fruit) {
          k.ball(c, r, m, INK.hair);
        }
      });
      add(box3([1.75, -0.22, z], [1.95, -0.02, z + 0.22]), () => {
        k.prism(ellipse(1.85, -0.12, 0.08, 0.08, 16), 'z', z, z + 0.18, MAT.glass, {
          ink: INK.detail,
        });
        k.cylinder(1.85, -0.12, z + 0.18, z + 0.21, 0.085, MAT.oak, INK.hair);
        k.dot([1.85, -0.04, z + 0.08], 1.6, PAL.tan, INK.hair);
      });
    });
  },
};

/** A fridge: tall, brushed steel, two doors and long bar handles. */
export const fridge: OfficeObject = {
  name: 'Fridge',
  blurb: 'The office fridge, its door covered in notes.',
  bounds: box3([-0.42, -0.38, 0], [0.42, 0.42, 1.9]),
  footprint: box3([-0.4, -0.36, 0], [0.4, 0.36, 1.85]),
  shadow(k) {
    k.castShadow(Iso.corners([-0.4, -0.36, 0], [0.4, 0.36, 1.85]));
  },
  draw(k) {
    const y = 0.36;
    k.box([-0.4, -0.36, 0.03], [0.4, 0.36, 1.85], MAT.alu, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          k.line(
            [
              [-0.39, y, 1.22],
              [0.39, y, 1.22],
            ],
            INK.detail
          );
          k.box([0.28, y, 1.3], [0.32, y + 0.04, 1.7], MAT.alu, { ink: INK.hair });
          k.box([0.28, y, 0.6], [0.32, y + 0.04, 1.12], MAT.alu, { ink: INK.hair });
          for (const [x, zz, c] of [
            [-0.2, 1.0, PAL.gold],
            [-0.05, 0.92, PAL.pink],
            [-0.24, 0.76, PAL.sky],
          ] as const) {
            k.shape(
              [
                [x - 0.07, y + 0.002, zz - 0.07],
                [x + 0.07, y + 0.002, zz - 0.07],
                [x + 0.07, y + 0.002, zz + 0.07],
                [x - 0.07, y + 0.002, zz + 0.07],
              ],
              c,
              INK.hair
            );
          }
        },
      },
    });
    k.box([-0.38, -0.34, 0], [0.38, 0.32, 0.03], MAT.graphite, { ink: INK.hair, rim: false });
  },
};

/** A standing table by the kitchen, at a standing avatar's chest height. */
export const standingTable: OfficeObject = {
  name: 'Standing table',
  blurb: 'A standing table by the kitchen, for a coffee on your feet.',
  bounds: box3([-0.9, -0.38, 0], [0.9, 0.38, 1.15]),
  footprint: box3([-0.85, -0.32, 0], [0.85, 0.32, 0.95]),
  shadow(k) {
    k.castShadow(Iso.corners([-0.85, -0.32, 0.9], [0.85, 0.32, 0.95]), 0, 0.8);
  },
  draw(k) {
    const z = 0.95;
    k.sorted((add) => {
      for (const x of [-0.6, 0.6]) {
        add(box3([x - 0.04, -0.28, 0], [x + 0.04, 0.28, z - 0.04]), () => {
          k.box([x - 0.04, -0.28, 0], [x + 0.04, 0.28, 0.04], MAT.graphite, { ink: INK.detail });
          k.box([x - 0.03, -0.03, 0.04], [x + 0.03, 0.03, z - 0.04], MAT.graphite, {
            ink: INK.detail,
          });
        });
      }
      add(box3([-0.85, -0.32, z - 0.04], [0.85, 0.32, z]), () => {
        k.slab(-0.85, -0.32, 0.85, 0.32, z - 0.04, z, 0.08, MAT.oak, INK.silhouette);
        k.cylinder(-0.3, 0.05, z, z + 0.1, 0.045, MAT.ceramic, INK.detail);
        k.fill(lift(plane.z(z + 0.101), ellipse(-0.3, 0.05, 0.034, 0.034, 12)), '#5a3420');
        k.cylinder(0.35, -0.08, z, z + 0.1, 0.045, MAT.tomato, INK.detail);
      });
    });
  },
};
