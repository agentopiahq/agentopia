import { Box3, INK, Iso, V3, ellipse, hull, lift, plane } from '../kit/iso';
import { ACCENT, MAT, SHEET, mix } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * A desk with the big monitor every session works at.
 *
 * Local frame: the origin is the middle of the desk on the floor and the front
 * (+y) faces the seat, which core puts `DESK_SEAT_GAP` tiles in front of the
 * desk's centre. An oiled walnut top on a black steel leg and a white drawer
 * pedestal; on top, the monitor at the back, a desk lamp throwing a warm pool
 * of light, a succulent, a keyboard and mouse in front, a mug, a stack of paper.
 *
 * The monitor's screen is left dark here: what it shows changes with the
 * session, so the renderer lays a live terminal over `MONITOR_SCREEN`.
 */

/** How far in front of the desk's centre the seat is, in tiles. */
export const DESK_SEAT_GAP = 1.25;

const TOP_Z0 = 0.72;
const TOP_Z1 = 0.8;
const HALF_W = 1.2;
const HALF_D = 0.5;

/** The monitor housing. */
const MON = { x0: -0.95, x1: 0.95, y0: -0.26, y1: -0.14, z0: 1.02, z1: 2.1 };

/** The keyboard on the desk top, in desk-local tiles: where a seated lead's hands go. */
export const KEYBOARD = { x0: -0.5, x1: 0.32, y0: 0.06, y1: 0.34, z: TOP_Z1 + 0.05 } as const;

/** The lit glass of the monitor, in desk-local tiles, on the housing's front face. */
export const MONITOR_SCREEN = { x0: -0.86, x1: 0.86, z0: 1.1, z1: 2.02, y: MON.y1 } as const;

function drawerFronts(
  k: Iso,
  x0: number,
  x1: number,
  y: number,
  z0: number,
  z1: number,
  n: number
): void {
  const h = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    const lo = z0 + i * h + 0.03;
    const hi = z0 + (i + 1) * h - 0.03;
    const front: V3[] = [
      [x0 + 0.04, y, lo],
      [x1 - 0.04, y, lo],
      [x1 - 0.04, y, hi],
      [x0 + 0.04, y, hi],
    ];
    k.lit(front, [0, 1, 0], MAT.machine);
    k.line(front, INK.hair, true);
    // A slim aluminium bar pull, lit along its top.
    const mid = (x0 + x1) / 2;
    k.box([mid - 0.13, y, hi - 0.09], [mid + 0.13, y + 0.025, hi - 0.06], MAT.alu, {
      ink: INK.hair,
    });
  }
}

/** Grain on the desk top: long, faint streaks along its length. */
function grain(k: Iso, z: number): void {
  const rows: Array<[number, number, number, number]> = [
    [-1.1, -0.38, 0.4, -0.36],
    [-0.6, -0.2, 1.1, -0.22],
    [-1.12, 0.02, -0.2, 0.0],
    [0.1, 0.12, 1.08, 0.14],
    [-0.9, 0.3, 0.6, 0.32],
    [-1.0, 0.42, 1.0, 0.43],
  ];
  const color = mix(MAT.walnut.d, '#000000', 0.1);
  const ctx = k.ctx;
  ctx.save();
  ctx.globalAlpha *= 0.45;
  for (const [xa, ya, xb, yb] of rows) {
    k.line(
      [
        [xa, ya, z],
        [(xa + xb) / 2, (ya + yb) / 2 + 0.02, z],
        [xb, yb, z],
      ],
      INK.hair,
      false,
      color
    );
  }
  ctx.restore();
}

/** A matte black steel leg: two posts and a foot, at the desk's left end. */
function legFrame(k: Iso, add: (box: Box3, draw: () => void) => void): void {
  const x = -1.06;
  add(box3([x - 0.05, -0.44, 0], [x + 0.05, 0.44, TOP_Z0]), () => {
    k.box([x - 0.05, -0.44, 0], [x + 0.05, 0.44, 0.06], MAT.graphite, { ink: INK.detail });
    k.box([x - 0.035, -0.36, 0.06], [x + 0.035, -0.29, TOP_Z0], MAT.graphite, { ink: INK.detail });
    k.box([x - 0.035, 0.29, 0.06], [x + 0.035, 0.36, TOP_Z0], MAT.graphite, { ink: INK.detail });
    k.box([x - 0.04, -0.4, TOP_Z0 - 0.06], [x + 0.04, 0.4, TOP_Z0], MAT.graphite, {
      ink: INK.detail,
    });
  });
}

/** Where the lamp's shade opens, over the desk. */
const LAMP_MOUTH: V3 = [-0.86, 0.14, TOP_Z1 + 0.5];

/** A desk lamp at the front left: a weighted foot, two arms, a shade over the desk. */
function lamp(k: Iso): void {
  const [bx, by] = [-1.0, 0.24];
  const elbow: V3 = [-1.1, -0.04, TOP_Z1 + 0.5];
  const head: V3 = [-0.92, 0.12, TOP_Z1 + 0.64];
  const mouthC = LAMP_MOUTH;
  k.cylinder(bx, by, TOP_Z1, TOP_Z1 + 0.04, 0.09, MAT.graphite, INK.detail);
  k.rod([bx, by, TOP_Z1 + 0.04], elbow, 0.016, MAT.graphite);
  k.rod(elbow, head, 0.016, MAT.graphite);
  k.dot(elbow, 1.6, MAT.brass.m, INK.hair);
  // The shade: a cone, its mouth down over the desk.
  const mouth = lift(plane.z(mouthC[2]), ellipse(mouthC[0], mouthC[1], 0.11, 0.11, 16));
  const pts = [...mouth, head];
  k.fillScreen(
    hull(pts.map((p) => k.P(p))),
    k.grade([mouth[0], mouth[8], head], [0.4, 0.4, 0.5], MAT.tomato.m)
  );
  k.silhouette(pts, INK.panel);
  k.dot(mouthC, 2.2, '#fff3c4');
}

/** The warm pool of light the lamp throws on the desk top, under everything on it. */
function lampPool(k: Iso): void {
  const ctx = k.ctx;
  if (k.sheen <= 0 || !ctx.createRadialGradient) {
    return;
  }
  const [px, py] = k.P([LAMP_MOUTH[0] + 0.1, LAMP_MOUTH[1], TOP_Z1 + 0.001]);
  const r = 0.6 * k.unit;
  const pool = ctx.createRadialGradient(px, py, 0, px, py, r);
  pool.addColorStop(0, 'rgba(255,232,160,0.5)');
  pool.addColorStop(1, 'rgba(255,232,160,0)');
  ctx.save();
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(px, py, r, r * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A little succulent in a white pot, back right. */
function succulent(k: Iso): void {
  const [x, y] = [1.04, -0.36];
  k.prism(ellipse(x, y, 0.08, 0.08, 16), 'z', TOP_Z1, TOP_Z1 + 0.12, MAT.glaze, {
    ink: INK.detail,
    cap: { l: MAT.wood.d, m: MAT.wood.d, d: MAT.wood.d },
  });
  const leaves: Array<[V3, number]> = [
    [[x - 0.04, y - 0.02, TOP_Z1 + 0.16], 0.05],
    [[x + 0.04, y - 0.01, TOP_Z1 + 0.17], 0.05],
    [[x, y + 0.04, TOP_Z1 + 0.15], 0.05],
    [[x, y, TOP_Z1 + 0.21], 0.045],
  ];
  for (const [c, r] of leaves.sort((a, b) => k.depth(a[0]) - k.depth(b[0]))) {
    k.ball(c, r, MAT.mint, INK.detail);
  }
}

export const desk: OfficeObject = {
  name: 'Desk',
  blurb: 'One per live session: the lead works here, its monitor scrolling the command.',
  bounds: box3([-1.3, -0.6, 0], [1.3, 0.6, 2.2]),
  footprint: box3([-HALF_W, -HALF_D, 0], [HALF_W, HALF_D, 2.1]),

  shadow(k) {
    const pts: V3[] = [];
    for (const x of [-HALF_W, HALF_W]) {
      for (const y of [-HALF_D, HALF_D]) {
        pts.push([x, y, 0], [x, y, TOP_Z1]);
      }
    }
    for (const x of [MON.x0, MON.x1]) {
      pts.push([x, MON.y0, MON.z1], [x, MON.y1, MON.z1]);
    }
    k.castShadow(pts);
  },

  draw(k) {
    k.sorted((add) => {
      // Under the top: a black steel leg frame on the left, a modesty panel
      // at the back, and a white drawer pedestal on the right.
      legFrame(k, add);
      add(box3([-1.0, -0.42, 0.3], [0.42, -0.38, TOP_Z0]), () =>
        k.box([-1.0, -0.42, 0.3], [0.42, -0.38, TOP_Z0], MAT.graphite, { ink: INK.detail })
      );
      add(box3([0.42, -0.42, 0], [1.12, 0.42, TOP_Z0]), () =>
        k.box([0.42, -0.42, 0], [1.12, 0.42, TOP_Z0], MAT.machine, {
          decorate: {
            '+y': () => drawerFronts(k, 0.42, 1.12, 0.42, 0.06, TOP_Z0 - 0.02, 3),
          },
        })
      );
      add(box3([-HALF_W, -HALF_D, TOP_Z0], [HALF_W, HALF_D, TOP_Z1]), () => {
        k.slab(-HALF_W, -HALF_D, HALF_W, HALF_D, TOP_Z0, TOP_Z1, 0.06, MAT.walnut, INK.silhouette);
        grain(k, TOP_Z1 + 0.001);
        lampPool(k);
      });

      // The monitor: an aluminium foot and neck, then the graphite housing
      // with its dark glass, a thin bezel and a sheen across it.
      add(box3([-0.3, -0.42, TOP_Z1], [0.3, -0.12, TOP_Z1 + 0.03]), () =>
        k.slab(-0.3, -0.42, 0.3, -0.12, TOP_Z1, TOP_Z1 + 0.03, 0.1, MAT.alu, INK.detail)
      );
      add(box3([-0.08, -0.36, TOP_Z1 + 0.03], [0.08, MON.y0, MON.z0 + 0.12]), () =>
        k.box([-0.08, -0.36, TOP_Z1 + 0.03], [0.08, MON.y0 - 0.02, MON.z0 + 0.12], MAT.alu, {
          ink: INK.detail,
        })
      );
      add(box3([MON.x0, MON.y0, MON.z0], [MON.x1, MON.y1, MON.z1]), () =>
        k.box([MON.x0, MON.y0, MON.z0], [MON.x1, MON.y1, MON.z1], MAT.graphite, {
          ink: INK.silhouette,
          decorate: {
            '+y': () => {
              const s = MONITOR_SCREEN;
              k.shape(
                [
                  [s.x0, s.y, s.z0],
                  [s.x1, s.y, s.z0],
                  [s.x1, s.y, s.z1],
                  [s.x0, s.y, s.z1],
                ],
                MAT.screen.m,
                INK.detail
              );
              // A chin under the glass, and the power light on it.
              k.line(
                [
                  [MON.x0 + 0.04, s.y, MON.z0 + 0.06],
                  [MON.x1 - 0.04, s.y, MON.z0 + 0.06],
                ],
                INK.hair,
                false,
                MAT.graphite.l
              );
              k.dot([0.8, s.y, MON.z0 + 0.035], 1.3, ACCENT.ledGreen);
            },
            '-y': () => {
              // Vents across the back.
              for (let i = 0; i < 6; i++) {
                const x = -0.4 + i * 0.16;
                k.line(
                  [
                    [x, MON.y0, MON.z1 - 0.3],
                    [x + 0.1, MON.y0, MON.z1 - 0.3],
                  ],
                  INK.detail,
                  false,
                  MAT.graphite.d
                );
              }
            },
          },
        })
      );

      // On the desk, in front of the monitor.
      add(box3([0.66, 0.1, TOP_Z1], [1.1, 0.46, TOP_Z1 + 0.07]), () => {
        // A stack of paper, each sheet a hair out of line with the last.
        for (let i = 0; i < 3; i++) {
          const z = TOP_Z1 + i * 0.022;
          const dx = i === 1 ? 0.02 : 0;
          k.slab(0.68 + dx, 0.12, 1.06 + dx, 0.44, z, z + 0.022, 0.01, MAT.ceramic, INK.hair);
        }
        for (const [y, end] of [
          [0.2, 0.98],
          [0.26, 0.92],
          [0.32, 0.96],
          [0.38, 0.88],
        ] as const) {
          k.line(
            [
              [0.76, y, TOP_Z1 + 0.066],
              [end, y, TOP_Z1 + 0.066],
            ],
            INK.hair,
            false,
            SHEET.lead
          );
        }
      });
      add(box3([-1.16, -0.1, TOP_Z1], [-0.72, 0.34, TOP_Z1 + 0.68]), () => lamp(k));
      add(box3([0.96, -0.44, TOP_Z1], [1.12, -0.28, TOP_Z1 + 0.25]), () => succulent(k));
      const kb = KEYBOARD;
      add(box3([kb.x0, kb.y0, TOP_Z1], [kb.x1, kb.y1, kb.z]), () => {
        k.slab(kb.x0, kb.y0, kb.x1, kb.y1, TOP_Z1, kb.z - 0.015, 0.04, MAT.alu, INK.panel);
        // Rows of keycaps on the deck.
        const cols = 11;
        const rows = 4;
        const kw = (kb.x1 - kb.x0 - 0.06) / cols;
        const kd = (kb.y1 - kb.y0 - 0.05) / rows;
        const z = kb.z - 0.015;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            // The bottom row is mostly space bar.
            if (r === rows - 1 && c > 2 && c < cols - 3) {
              if (c === 3) {
                const x0 = kb.x0 + 0.03 + c * kw;
                const y0 = kb.y0 + 0.025 + r * kd;
                k.fill(
                  [
                    [x0 + 0.005, y0 + 0.005, z],
                    [x0 + kw * 5 - 0.005, y0 + 0.005, z],
                    [x0 + kw * 5 - 0.005, y0 + kd - 0.005, z],
                    [x0 + 0.005, y0 + kd - 0.005, z],
                  ],
                  MAT.graphite.m
                );
              }
              continue;
            }
            const x0 = kb.x0 + 0.03 + c * kw;
            const y0 = kb.y0 + 0.025 + r * kd;
            k.fill(
              [
                [x0 + 0.005, y0 + 0.005, z],
                [x0 + kw - 0.005, y0 + 0.005, z],
                [x0 + kw - 0.005, y0 + kd - 0.005, z],
                [x0 + 0.005, y0 + kd - 0.005, z],
              ],
              MAT.graphite.m
            );
          }
        }
      });
      add(box3([0.44, 0.1, TOP_Z1], [0.62, 0.34, TOP_Z1 + 0.05]), () => {
        k.prism(ellipse(0.53, 0.22, 0.07, 0.1, 16), 'z', TOP_Z1, TOP_Z1 + 0.04, MAT.trim, {
          ink: INK.detail,
        });
        k.line(
          [
            [0.53, 0.13, TOP_Z1 + 0.041],
            [0.53, 0.2, TOP_Z1 + 0.041],
          ],
          INK.hair
        );
      });
      add(box3([0.72, -0.2, TOP_Z1], [1.02, 0.04, TOP_Z1 + 0.44]), () => {
        k.cylinder(0.85, -0.08, TOP_Z1, TOP_Z1 + 0.2, 0.1, MAT.tomato, INK.panel);
        // The handle, on the mug's lit side.
        k.rod([0.95, -0.08, TOP_Z1 + 0.16], [1.0, -0.08, TOP_Z1 + 0.1], 0.02, MAT.tomato);
        k.rod([1.0, -0.08, TOP_Z1 + 0.1], [0.95, -0.08, TOP_Z1 + 0.05], 0.02, MAT.tomato);
        // Coffee, in the open top, with a curl of steam over it.
        k.fill(lift(plane.z(TOP_Z1 + 0.2), ellipse(0.85, -0.08, 0.075, 0.075, 16)), '#5a3420');
        const ctx = k.ctx;
        ctx.save();
        ctx.globalAlpha *= 0.55;
        k.line(
          [
            [0.84, -0.08, TOP_Z1 + 0.24],
            [0.88, -0.08, TOP_Z1 + 0.3],
            [0.83, -0.08, TOP_Z1 + 0.36],
            [0.87, -0.08, TOP_Z1 + 0.42],
          ],
          1.1,
          false,
          '#ffffff'
        );
        ctx.restore();
      });
    });
  },
};
