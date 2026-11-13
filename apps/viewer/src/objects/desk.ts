import { INK, Iso, V3, ellipse, lift, plane } from '../kit/iso';
import { ACCENT, MAT } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * A desk with the big monitor every session works at.
 *
 * Local frame: the origin is the middle of the desk on the floor and the front
 * (+y) faces the seat, which core puts `DESK_SEAT_GAP` tiles in front of the
 * desk's centre. Birch top on a side panel and a drawer pedestal; on top, the
 * monitor at the back, a keyboard and mouse in front, a mug, a stack of paper.
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
    k.line(
      [
        [x0 + 0.04, y, lo],
        [x1 - 0.04, y, lo],
        [x1 - 0.04, y, hi],
        [x0 + 0.04, y, hi],
      ],
      INK.hair,
      true
    );
    const mid = (x0 + x1) / 2;
    k.line(
      [
        [mid - 0.12, y, hi - 0.07],
        [mid + 0.12, y, hi - 0.07],
      ],
      1.6
    );
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
      // Under the top: a side panel on the left, a modesty panel at the back,
      // and a drawer pedestal on the right.
      add(box3([-1.12, -0.42, 0], [-1.02, 0.42, TOP_Z0]), () =>
        k.box([-1.12, -0.42, 0], [-1.02, 0.42, TOP_Z0], MAT.birch)
      );
      add(box3([-1.02, -0.42, 0.26], [0.42, -0.36, TOP_Z0]), () =>
        k.box([-1.02, -0.42, 0.26], [0.42, -0.36, TOP_Z0], MAT.birch, { ink: INK.detail })
      );
      add(box3([0.42, -0.42, 0], [1.12, 0.42, TOP_Z0]), () =>
        k.box([0.42, -0.42, 0], [1.12, 0.42, TOP_Z0], MAT.birch, {
          decorate: {
            '+y': () => drawerFronts(k, 0.42, 1.12, 0.42, 0.04, TOP_Z0 - 0.02, 3),
          },
        })
      );
      add(box3([-HALF_W, -HALF_D, TOP_Z0], [HALF_W, HALF_D, TOP_Z1]), () =>
        k.slab(-HALF_W, -HALF_D, HALF_W, HALF_D, TOP_Z0, TOP_Z1, 0.06, MAT.birch, INK.silhouette)
      );

      // The monitor: foot, neck, then the housing with its dark glass.
      add(box3([-0.32, -0.42, TOP_Z1], [0.32, -0.12, TOP_Z1 + 0.04]), () =>
        k.slab(-0.32, -0.42, 0.32, -0.12, TOP_Z1, TOP_Z1 + 0.04, 0.08, MAT.dark, INK.detail)
      );
      add(box3([-0.07, -0.36, TOP_Z1 + 0.04], [0.07, MON.y0, MON.z0 + 0.12]), () =>
        k.box([-0.07, -0.36, TOP_Z1 + 0.04], [0.07, MON.y0, MON.z0 + 0.12], MAT.dark, {
          ink: INK.detail,
        })
      );
      add(box3([MON.x0, MON.y0, MON.z0], [MON.x1, MON.y1, MON.z1]), () =>
        k.box([MON.x0, MON.y0, MON.z0], [MON.x1, MON.y1, MON.z1], MAT.dark, {
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
              k.dot([0.8, s.y, MON.z0 + 0.04], 1.3, ACCENT.ledGreen);
            },
          },
        })
      );

      // On the desk, in front of the monitor.
      add(box3([-1.08, -0.18, TOP_Z1], [-0.62, 0.3, TOP_Z1 + 0.07]), () => {
        // A stack of paper, each sheet a hair out of line with the last.
        for (let i = 0; i < 3; i++) {
          const z = TOP_Z1 + i * 0.022;
          const dx = i === 1 ? 0.03 : 0;
          k.slab(-1.06 + dx, -0.16, -0.64 + dx, 0.28, z, z + 0.022, 0.01, MAT.ceramic, INK.hair);
        }
        k.line(
          [
            [-0.98, 0.0, TOP_Z1 + 0.066],
            [-0.72, 0.0, TOP_Z1 + 0.066],
          ],
          INK.hair
        );
        k.line(
          [
            [-0.98, 0.08, TOP_Z1 + 0.066],
            [-0.8, 0.08, TOP_Z1 + 0.066],
          ],
          INK.hair
        );
      });
      add(box3([-0.5, 0.06, TOP_Z1], [0.32, 0.34, TOP_Z1 + 0.05]), () => {
        k.slab(-0.5, 0.06, 0.32, 0.34, TOP_Z1, TOP_Z1 + 0.05, 0.04, MAT.ceramic, INK.panel);
        // Rows of keys, as hairlines on the deck.
        for (let row = 0; row < 3; row++) {
          const y = 0.12 + row * 0.07;
          k.line(
            [
              [-0.44, y, TOP_Z1 + 0.05],
              [0.26, y, TOP_Z1 + 0.05],
            ],
            INK.hair
          );
        }
      });
      add(box3([0.44, 0.1, TOP_Z1], [0.62, 0.34, TOP_Z1 + 0.05]), () =>
        k.prism(ellipse(0.53, 0.22, 0.08, 0.11, 14), 'z', TOP_Z1, TOP_Z1 + 0.05, MAT.ceramic, {
          ink: INK.detail,
        })
      );
      add(box3([0.72, -0.2, TOP_Z1], [1.02, 0.04, TOP_Z1 + 0.22]), () => {
        k.cylinder(0.85, -0.08, TOP_Z1, TOP_Z1 + 0.2, 0.1, MAT.tomato, INK.panel);
        // The handle, on the mug's lit side.
        k.rod([0.95, -0.08, TOP_Z1 + 0.16], [1.0, -0.08, TOP_Z1 + 0.1], 0.02, MAT.tomato);
        k.rod([1.0, -0.08, TOP_Z1 + 0.1], [0.95, -0.08, TOP_Z1 + 0.05], 0.02, MAT.tomato);
        // Coffee, in the open top.
        k.fill(lift(plane.z(TOP_Z1 + 0.2), ellipse(0.85, -0.08, 0.075, 0.075, 16)), MAT.wood.d);
      });
    });
  },
};
