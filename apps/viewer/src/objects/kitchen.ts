import { INK, Iso, V3, ellipse, lift, plane } from '../kit/iso';
import { ACCENT, MAT, Mat, PAL, mix } from '../kit/palette';
import { glassLeaf } from './leaf';
import { AVATAR } from './scale';
import { OfficeObject, box3, frac } from './types';

/**
 * The kitchen: a run of base units under a stone worktop against the wall,
 * a tiled splashback, wall cupboards, a sink, a bean-to-cup coffee machine
 * and a kettle; a glass-door drinks fridge; a snack cabinet; and a standing
 * table to drink at. The worktop is at desk
 * height and the machine's buttons at the avatar's hand height, so a lead
 * can stand at it the way it stands at the copier. Authored against a wall
 * at local y = -D, front toward local +y.
 */

const HX = 1.5;
const D = 0.32;
/** Worktop height: the desk's, where a standing avatar's hands are. */
export const WORKTOP_Z = AVATAR.hand;
/** The coffee machine's menu screen, the highest thing on it you press. */
export const COFFEE_BUTTONS_Z = WORKTOP_Z + 0.43;
const UPPER = { z0: 1.5, z1: 2.15, d: 0.34 } as const;

function handle(k: Iso, x: number, y: number, z0: number, z1: number): void {
  k.box([x - 0.012, y, z0], [x + 0.012, y + 0.025, z1], MAT.alu, { ink: INK.hair });
}

/** A bean-to-cup coffee machine standing on a worktop at height z, centred on x. */
function coffeeMachine(k: Iso, x: number, z: number): void {
  const y0 = -D + 0.02;
  const y1 = 0.14;
  const top = z + 0.56;
  k.box([x - 0.26, y0, z], [x + 0.26, y1, top], MAT.graphite, {
    ink: INK.panel,
    decorate: {
      '+y': () => {
        // The menu screen, lit, with its cups to choose from.
        const screen: V3[] = [
          [x - 0.18, y1, z + 0.36],
          [x + 0.18, y1, z + 0.36],
          [x + 0.18, y1, z + 0.5],
          [x - 0.18, y1, z + 0.5],
        ];
        k.shape(screen, '#2d4a5e', INK.hair);
        for (let i = 0; i < 3; i++) {
          const cx = x - 0.12 + i * 0.12;
          k.dot([cx, y1 + 0.001, z + 0.43], 1.6, [PAL.tan, MAT.ceramic.l, MAT.wood.l][i]);
        }
        // The brew recess, dark, over the drip tray.
        k.shape(
          [
            [x - 0.16, y1, z + 0.04],
            [x + 0.16, y1, z + 0.04],
            [x + 0.16, y1, z + 0.3],
            [x - 0.16, y1, z + 0.3],
          ],
          MAT.graphite.d,
          INK.hair
        );
      },
    },
  });
  // The hopper on top: smoked glass with the beans showing.
  k.box(
    [x - 0.18, y0 + 0.06, top],
    [x + 0.06, y0 + 0.26, top + 0.12],
    { l: '#9a7a5f', m: '#7a5a42', d: '#553b2a' },
    {
      ink: INK.detail,
    }
  );
  k.box([x - 0.19, y0 + 0.05, top + 0.12], [x + 0.07, y0 + 0.27, top + 0.14], MAT.graphite, {
    ink: INK.hair,
  });
  // The spouts, the drip tray, and a cup filling.
  k.box([x - 0.06, y1 - 0.06, z + 0.25], [x + 0.06, y1 + 0.02, z + 0.29], MAT.alu, {
    ink: INK.hair,
  });
  k.box([x - 0.16, y1 - 0.1, z], [x + 0.16, y1 + 0.04, z + 0.03], MAT.alu, { ink: INK.hair });
  k.cylinder(x, y1 - 0.03, z + 0.03, z + 0.12, 0.045, MAT.ceramic, INK.hair);
  k.line(
    [
      [x, y1 - 0.03, z + 0.25],
      [x, y1 - 0.03, z + 0.13],
    ],
    1.2,
    false,
    '#6b4126'
  );
}

/** Bottles and cans for a shelf: each a colour, a height, a width, round or square. */
const DRINKS: Array<[string, number, number]> = [
  ['#e4473b', 0.2, 0.05],
  ['#3f86d8', 0.26, 0.045],
  ['#f2c230', 0.2, 0.05],
  ['#4bb36a', 0.28, 0.045],
  ['#f08a3c', 0.2, 0.05],
  ['#d8e6ef', 0.3, 0.05],
  ['#9b5bd0', 0.2, 0.05],
  ['#e95f8f', 0.26, 0.045],
];

/**
 * A glass-door drinks fridge: a graphite cabinet with a full-height glass
 * door, lit inside, five wire shelves of cans and bottles in every colour,
 * and a light strip across the top.
 */
export const drinksFridge: OfficeObject = {
  name: 'Drinks fridge',
  blurb: 'A glass-door drinks fridge, lit up, stacked with cans and bottles of all kinds.',
  // Room in front for the door, swung open.
  bounds: box3([-0.52, -0.4, 0], [0.42, 1.2, 1.9]),
  footprint: box3([-0.38, -0.36, 0], [0.38, 0.36, 1.85]),
  shadow(k) {
    k.castShadow(Iso.corners([-0.38, -0.36, 0], [0.38, 0.36, 1.85]));
  },
  draw(k, state) {
    const [hx, hy, h] = [0.38, 0.36, 1.85];
    const y = hy;
    const swing = (FRIDGE_SWING * frac(state, 'open', 0) * Math.PI) / 180;
    const open = swing > 0.02;
    const door = (): void =>
      glassLeaf(k, {
        hinge: [-hx + 0.02, hy + 0.01],
        along: [1, 0],
        swing,
        len: 2 * hx - 0.04,
        z0: 0.08,
        z1: h - 0.02,
        frame: MAT.graphite,
        pull: { t: 2 * hx - 0.1, z0: 0.5, z1: 1.5 },
      });
    // Swung open, the door stands in front: drawn first from behind, last from the front.
    if (open && !k.facing([0, 1, 0])) {
      door();
    }
    // The plinth, set back under the cabinet: drawn before it, so the cabinet
    // covers its top and only its sides show underneath.
    k.box([-hx + 0.02, -hy + 0.02, 0], [hx - 0.02, hy - 0.02, 0.04], MAT.graphite, {
      ink: INK.hair,
      rim: false,
    });
    k.box([-hx, -hy, 0.04], [hx, hy, h], MAT.graphite, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          // The lit inside, seen through the glass.
          const inside: V3[] = [
            [-hx + 0.06, y, 0.12],
            [hx - 0.06, y, 0.12],
            [hx - 0.06, y, h - 0.2],
            [-hx + 0.06, y, h - 0.2],
          ];
          k.fill(inside, k.grade(inside, [0, 1, 0], '#e9f4f7'));
          const shelves = 5;
          const step = (h - 0.32) / shelves;
          for (let i = 0; i < shelves; i++) {
            const z0 = 0.12 + i * step;
            k.line(
              [
                [-hx + 0.06, y + 0.001, z0],
                [hx - 0.06, y + 0.001, z0],
              ],
              INK.detail,
              false,
              MAT.alu.d
            );
            // A row of drinks standing on the shelf, colours shuffled per row.
            let x = -hx + 0.1;
            for (let j = 0; x < hx - 0.1; j++) {
              const [color, tall, w] = DRINKS[(i * 3 + j) % DRINKS.length];
              const ht = Math.min(tall, step - 0.04);
              // A can is a plain cylinder side-on; a bottle has shoulders and a neck.
              const yy = y + 0.002;
              const outline: V3[] =
                tall > 0.24
                  ? [
                      [x, yy, z0],
                      [x + w * 2, yy, z0],
                      [x + w * 2, yy, z0 + ht * 0.62],
                      [x + w * 1.35, yy, z0 + ht * 0.82],
                      [x + w * 1.35, yy, z0 + ht],
                      [x + w * 0.65, yy, z0 + ht],
                      [x + w * 0.65, yy, z0 + ht * 0.82],
                      [x, yy, z0 + ht * 0.62],
                    ]
                  : [
                      [x, yy, z0],
                      [x + w * 2, yy, z0],
                      [x + w * 2, yy, z0 + ht],
                      [x, yy, z0 + ht],
                    ];
              k.shape(outline, color, INK.hair);
              // The label band.
              k.fill(
                [
                  [x, y + 0.003, z0 + ht * 0.3],
                  [x + w * 2, y + 0.003, z0 + ht * 0.3],
                  [x + w * 2, y + 0.003, z0 + ht * 0.5],
                  [x, y + 0.003, z0 + ht * 0.5],
                ],
                '#ffffff',
                0.6
              );
              x += w * 2 + 0.02;
            }
          }
          // The glass itself, shut: a cool sheen and a streak.
          if (!open) {
            k.fill(inside, MAT.glass.l, 0.18);
            k.fill(
              [
                [-hx + 0.12, y + 0.004, 0.2],
                [-hx + 0.22, y + 0.004, 0.2],
                [-hx + 0.42, y + 0.004, h - 0.3],
                [-hx + 0.32, y + 0.004, h - 0.3],
              ],
              '#ffffff',
              0.25
            );
          } else {
            // Open, the cold spills out: a pale glow over the shelves.
            k.fill(inside, '#ffffff', 0.12);
          }
          // The top light strip with its glow, and the door's long handle.
          k.shape(
            [
              [-hx + 0.04, y, h - 0.16],
              [hx - 0.04, y, h - 0.16],
              [hx - 0.04, y, h - 0.05],
              [-hx + 0.04, y, h - 0.05],
            ],
            '#f6efe0',
            INK.hair
          );
          k.text([0, y + 0.002, h - 0.135], [1, 0, 0], [0, 0, 1], 'COLD DRINKS', 0.06 * k.unit, {
            color: MAT.tomato.d,
            weight: '800',
          });
          if (!open) {
            k.box([hx - 0.08, y, 0.5], [hx - 0.05, y + 0.04, 1.5], MAT.alu, { ink: INK.hair });
          }
        },
      },
    });
    if (open && k.facing([0, 1, 0])) {
      door();
    }
  },
};

/** How far the fridge door swings open, at its widest, in degrees. */
const FRIDGE_SWING = 100;

/** A chip bag on a shelf: a pillow-shaped packet, crimped top and bottom. */
function chips(k: Iso, x: number, y: number, z: number, color: string): void {
  const w = 0.09;
  const h = 0.2;
  k.shape(
    [
      [x - w, y, z],
      [x + w, y, z],
      [x + w * 1.1, y, z + h * 0.5],
      [x + w, y, z + h],
      [x - w, y, z + h],
      [x - w * 1.1, y, z + h * 0.5],
    ],
    color,
    INK.hair
  );
  k.fill(
    [
      [x - w * 0.6, y + 0.001, z + h * 0.35],
      [x + w * 0.6, y + 0.001, z + h * 0.35],
      [x + w * 0.6, y + 0.001, z + h * 0.65],
      [x - w * 0.6, y + 0.001, z + h * 0.65],
    ],
    '#fff6e0',
    0.85
  );
}

/** A glass jar of treats on a shelf. */
function jar(k: Iso, x: number, y: number, z: number, fill: string): void {
  k.prism(
    ellipse(x, y, 0.07, 0.07, 16),
    'z',
    z,
    z + 0.16,
    { l: fill, m: mix(fill, '#000000', 0.12), d: mix(fill, '#000000', 0.3) },
    {
      ink: INK.hair,
    }
  );
  k.cylinder(x, y, z + 0.16, z + 0.2, 0.06, MAT.oak, INK.hair);
  k.fill(lift(plane.z(z + 0.08), ellipse(x, y, 0.071, 0.071, 16)).slice(10, 15), '#ffffff', 0.4);
}

/**
 * The snack cabinet: a warm oak unit with closed cupboards below and open
 * shelves above, stocked with jars of cookies and nuts, bags of chips, and a
 * basket of fruit, at the avatar's reach.
 */
export const snackCabinet: OfficeObject = {
  name: 'Snack cabinet',
  blurb: 'The snack cabinet: jars of cookies and nuts, bags of chips, a basket of fruit.',
  bounds: box3([-0.5, -0.24, 0], [0.5, 0.3, 1.75]),
  footprint: box3([-0.46, -0.22, 0], [0.46, 0.22, 1.7]),
  shadow(k) {
    k.castShadow(Iso.corners([-0.46, -0.22, 0], [0.46, 0.22, 1.7]));
  },
  draw(k) {
    const [hx, hy, h] = [0.46, 0.22, 1.7];
    const t = 0.04;
    // The carcass: back, sides, top, and the cupboard below.
    k.box([-hx, -hy, 0], [hx, -hy + t, h], MAT.oak, { ink: INK.detail, rim: false });
    k.box([-hx, -hy, 0], [hx, hy, 0.62], MAT.oak, {
      ink: INK.panel,
      decorate: {
        '+y': () => {
          for (const [x0, x1] of [
            [-hx + 0.03, -0.01],
            [0.01, hx - 0.03],
          ]) {
            k.line(
              [
                [x0, hy, 0.05],
                [x1, hy, 0.05],
                [x1, hy, 0.58],
                [x0, hy, 0.58],
              ],
              INK.hair,
              true
            );
          }
          k.dot([-0.06, hy, 0.48], 1.4, MAT.brass.m, INK.hair);
          k.dot([0.06, hy, 0.48], 1.4, MAT.brass.m, INK.hair);
        },
      },
    });
    const shelf = (z: number): void =>
      k.box([-hx + t, -hy + t, z], [hx - t, hy, z + 0.03], MAT.oak, { ink: INK.hair });
    // The far side panel goes in before the stock, so it never covers it;
    // the near one goes in after.
    const nearSide = k.facing([1, 0, 0]) ? hx - t : -hx;
    const farSide = nearSide === -hx ? hx - t : -hx;
    k.box([farSide, -hy, 0.62], [farSide + t, hy, h], MAT.oak, { ink: INK.detail });
    const y = 0.1;
    // First shelf: chips.
    chips(k, -0.26, y, 0.62, '#e4473b');
    chips(k, -0.04, y, 0.62, '#f2c230');
    chips(k, 0.18, y, 0.62, '#3f86d8');
    shelf(0.9);
    // Second: jars of cookies and nuts.
    jar(k, -0.26, y, 0.93, '#d9a35c');
    jar(k, -0.06, y, 0.93, '#b97a4a');
    jar(k, 0.14, y, 0.93, '#e8cf9a');
    jar(k, 0.32, y, 0.93, '#c98e58');
    shelf(1.18);
    // Third: a fruit basket and a box of tea.
    k.prism(ellipse(-0.16, y, 0.16, 0.12, 18), 'z', 1.21, 1.3, MAT.wood, { ink: INK.detail });
    for (const [cx, cz, r, m] of [
      [-0.22, 1.34, 0.05, MAT.tomato],
      [-0.12, 1.34, 0.05, MAT.mustard],
      [-0.17, 1.39, 0.045, MAT.leaf],
    ] as const) {
      k.ball([cx, y, cz], r, m, INK.hair);
    }
    k.box([0.12, y - 0.1, 1.21], [0.38, y + 0.08, 1.36], MAT.mint, { ink: INK.detail });
    shelf(1.46);
    // Top: more jars.
    jar(k, -0.2, y, 1.49, '#f0d9a8');
    jar(k, 0.05, y, 1.49, '#a8673c');
    // The near side and the top, last, framing the shelves.
    k.box([nearSide, -hy, 0.62], [nearSide + t, hy, h], MAT.oak, { ink: INK.detail });
    k.box([-hx, -hy, h - 0.04], [hx, hy, h], MAT.oak, { ink: INK.panel });
  },
};

/** The sink's steel lip on the worktop, and the basin's depth below it. */
const SINK = { x0: -0.9, x1: -0.3, y0: -0.16, y1: 0.2, lip: 0.045, depth: 0.11 } as const;

/**
 * The sink, set into the worktop at height z: a steel lip round a basin sunk
 * below the stone. Only what shows through the opening is drawn: the floor
 * and whichever inner walls face the viewer, clipped to the hole, so the
 * near walls fall away behind the worktop's edge however the office turns.
 */
function sink(k: Iso, z: number): void {
  const { x0, x1, y0, y1, lip, depth } = SINK;
  const at = (zz: number, inset: number): V3[] =>
    lift(plane.z(zz), [
      [x0 + inset, y0 + inset],
      [x1 - inset, y0 + inset],
      [x1 - inset, y1 - inset],
      [x0 + inset, y1 - inset],
    ]);
  // The lip, a hair proud of the stone.
  const top = z + 0.004;
  const outer = at(top, 0);
  k.lit(outer, [0, 0, 1], MAT.alu);
  k.line(outer, INK.detail, true);
  // The basin, seen through the opening inside the lip.
  const hole = at(top, lip);
  const [a, b, c, d] = hole;
  const floor = at(z - depth, lip + 0.015);
  const [fa, fb, fc, fd] = floor;
  const ctx = k.ctx;
  ctx.save();
  if (ctx.clip) {
    ctx.beginPath();
    hole.map((p) => k.P(p)).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.clip();
  }
  k.fill(floor, k.grade(floor, [0, 0, 1], MAT.alu.d));
  // Each inner wall runs from an edge of the opening down to the floor's,
  // and faces into the basin.
  const walls: Array<[V3, V3[]]> = [
    [
      [0, 1, 0],
      [a, b, fb, fa],
    ],
    [
      [-1, 0, 0],
      [b, c, fc, fb],
    ],
    [
      [0, -1, 0],
      [c, d, fd, fc],
    ],
    [
      [1, 0, 0],
      [d, a, fa, fd],
    ],
  ];
  for (const [n, quad] of walls) {
    if (k.facing(n)) {
      k.lit(quad, n, MAT.alu);
      k.line(quad, INK.hair, true, MAT.alu.d);
    }
  }
  // The drain, and a bead of water by it.
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const sump = z - depth + 0.001;
  k.shape(lift(plane.z(sump), ellipse(cx, cy, 0.035, 0.035, 14)), MAT.alu.l, INK.hair);
  k.fill(lift(plane.z(sump), ellipse(cx, cy, 0.018, 0.018, 12)), MAT.graphite.d);
  k.fill(lift(plane.z(sump), ellipse(cx + 0.09, cy + 0.05, 0.025, 0.015, 10)), '#ffffff', 0.35);
  ctx.restore();
  k.line(hole, INK.hair, true);
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
              const n = 4;
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
              const n = 4;
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
        sink(k, z);
      });
      // Clear of the splashback in y, so the sort always puts the tap in front of it.
      add(box3([-0.66, -D + 0.01, z], [-0.54, -0.1, z + 0.36]), () => {
        k.cylinder(-0.6, -0.24, z, z + 0.3, 0.025, MAT.alu, INK.detail);
        k.rod([-0.6, -0.24, z + 0.3], [-0.6, -0.08, z + 0.26], 0.02, MAT.alu, INK.detail);
      });
      // The coffee machine: a big bean-to-cup on the worktop, a hopper of
      // beans on top, a lit menu screen, two spouts over the drip tray with a
      // cup under them, and a stack of cups beside it.
      const ex = 0.7;
      add(box3([ex - 0.3, -D + 0.01, z], [ex + 0.3, 0.2, z + 0.7]), () => coffeeMachine(k, ex, z));
      add(box3([ex + 0.32, -0.1, z], [ex + 0.48, 0.06, z + 0.3]), () => {
        for (let i = 0; i < 4; i++) {
          k.cylinder(
            ex + 0.4,
            -0.02,
            z + i * 0.06,
            z + i * 0.06 + 0.07,
            0.055 + i * 0.002,
            MAT.ceramic,
            INK.hair
          );
        }
      });
      // A kettle, a fruit bowl, a jar of biscuits.
      add(box3([1.22, -0.2, z], [1.44, 0.0, z + 0.24]), () => {
        k.cylinder(1.32, -0.1, z, z + 0.02, 0.09, MAT.graphite, INK.hair);
        k.prism(ellipse(1.32, -0.1, 0.07, 0.07, 16), 'z', z + 0.02, z + 0.2, MAT.alu, {
          ink: INK.detail,
        });
        k.rod([1.39, -0.1, z + 0.18], [1.42, -0.1, z + 0.08], 0.012, MAT.graphite, INK.hair);
      });
      add(box3([-1.45, -0.18, z], [-1.05, 0.18, z + 0.2]), () => {
        k.prism(ellipse(-1.25, 0.0, 0.16, 0.16, 18), 'z', z, z + 0.08, MAT.glaze, {
          ink: INK.detail,
        });
        const fruit: Array<[V3, number, Mat]> = [
          [[-1.31, -0.02, z + 0.11], 0.06, MAT.tomato],
          [[-1.2, 0.03, z + 0.11], 0.055, MAT.mustard],
          [[-1.25, -0.06, z + 0.15], 0.05, MAT.mint],
        ];
        for (const [c, r, m] of fruit) {
          k.ball(c, r, m, INK.hair);
        }
      });
    });
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
