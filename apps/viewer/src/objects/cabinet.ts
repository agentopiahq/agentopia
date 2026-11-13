import { INK, Iso, V3 } from '../kit/iso';
import { ACCENT, MAT, PAL, SHEET, mix } from '../kit/palette';
import { OfficeObject, box3, frac } from './types';

/**
 * A low two-drawer lateral filing cabinet — where a session files its
 * context away when it compacts. Low enough to stand under the window bands,
 * its top at the avatar's hand height. Each drawer has a pull and a label card; the back
 * has a service panel, because the cabinets on the far wall show theirs.
 * Local frame: origin at the middle of its base, drawers (+y) facing the room.
 */

const W = 0.42;
const D = 0.24;
/** Low, at the avatar's hand height, so it fits under the window bands. */
const H = 0.8;
const DRAWERS = 2;

export const cabinet: OfficeObject = {
  name: 'Cabinet',
  blurb: 'A low lateral filing cabinet: compacting sessions file their papers here.',
  // Room in front for the drawers, pulled out.
  bounds: box3([-0.47, -0.3, 0], [0.47, 0.7, 0.95]),
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

  draw(k, state) {
    const h = (H - 0.14) / DRAWERS;
    const span = (i: number): [number, number] => {
      const lo = 0.1 + i * h;
      return [lo, lo + h - 0.04];
    };
    const outs = Array.from(
      { length: DRAWERS },
      (_, i) => DRAWER_PULL * frac(state, drawerKey(i), 0)
    );
    // A drawer pulled out stands in front of the body: drawn first from
    // behind, last from the front.
    const drawers = (): void => {
      outs.forEach((out, i) => {
        if (out < 0.005) {
          return;
        }
        const [lo, hi] = span(i);
        k.box([-W + 0.05, D - 0.05, lo + 0.01], [W - 0.05, D + out, hi - 0.01], MAT.cabinet, {
          ink: INK.panel,
          decorate: {
            '+y': () => drawerFront(k, i, lo, hi, D + out),
            '+z': () => hangingFiles(k, D, D + out, hi - 0.01),
          },
        });
      });
    };
    const front = k.facing([0, 1, 0]);
    if (!front) {
      drawers();
    }
    // A recessed kick plinth, then the body on it.
    k.box([-W + 0.03, -D + 0.03, 0], [W - 0.03, D - 0.03, 0.06], MAT.graphite, {
      ink: INK.detail,
      rim: false,
    });
    k.box([-W, -D, 0.06], [W, D, H], MAT.cabinet, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          for (let i = 0; i < DRAWERS; i++) {
            const [lo, hi] = span(i);
            if (outs[i] < 0.005) {
              drawerFront(k, i, lo, hi, D);
            } else {
              // The dark slot the drawer slid out of.
              k.shape(
                [
                  [-W + 0.04, D, lo],
                  [W - 0.04, D, lo],
                  [W - 0.04, D, hi],
                  [-W + 0.04, D, hi],
                ],
                MAT.graphite.d,
                INK.detail
              );
            }
          }
          // The lock barrel, top right.
          k.dot([W - 0.1, D, H - 0.06], 1.8, MAT.alu.l, INK.hair);
        },
        '-y': () => {
          // The service panel and its four screws.
          k.line(
            [
              [-W + 0.08, -D, 0.16],
              [W - 0.08, -D, 0.16],
              [W - 0.08, -D, H - 0.12],
              [-W + 0.08, -D, H - 0.12],
            ],
            INK.hair,
            true
          );
          for (const x of [-W + 0.12, W - 0.12]) {
            for (const z of [0.2, H - 0.16]) {
              k.dot([x, -D, z], 1.1, MAT.alu.m, INK.hair);
            }
          }
        },
        '+z': () => {
          // A manila folder someone left on top, papers peeking out.
          k.shape(
            [
              [-0.24, -0.18, H + 0.001],
              [0.22, -0.24, H + 0.001],
              [0.24, 0.16, H + 0.001],
              [-0.2, 0.2, H + 0.001],
            ],
            ACCENT.paperSheet,
            INK.hair
          );
          k.shape(
            [
              [-0.26, -0.2, H + 0.004],
              [0.22, -0.26, H + 0.004],
              [0.26, 0.18, H + 0.004],
              [-0.22, 0.22, H + 0.004],
            ].map(([x, y, z]): V3 => [x + 0.02, y + 0.03, z]),
            PAL.tan,
            INK.detail
          );
        },
      },
    });
    if (front) {
      drawers();
    }
  },
};

/** How far a drawer slides out, all the way open, in tiles. */
const DRAWER_PULL = 0.34;

/** The state key for drawer `i`, counted from the bottom. */
export const drawerKey = (i: number): string => (i === DRAWERS - 1 ? 'top' : 'bottom');

/** A drawer's face on the plane y: lit panel, top lip, label card and cup pull. */
function drawerFront(k: Iso, i: number, lo: number, hi: number, y: number): void {
  const front: V3[] = [
    [-W + 0.04, y, lo],
    [W - 0.04, y, lo],
    [W - 0.04, y, hi],
    [-W + 0.04, y, hi],
  ];
  k.lit(front, [0, 1, 0], {
    l: MAT.cabinet.l,
    m: mix(MAT.cabinet.m, '#ffffff', 0.08),
    d: mix(MAT.cabinet.d, '#ffffff', 0.08),
  });
  k.line(front, INK.detail, true);
  // A highlight along the drawer's top lip.
  k.line(
    [
      [-W + 0.06, y, hi - 0.015],
      [W - 0.06, y, hi - 0.015],
    ],
    0.8,
    false,
    mix(MAT.cabinet.l, '#ffffff', 0.5)
  );
  // The label card in its chrome holder, with a line of type.
  k.shape(
    [
      [-0.15, y, hi - 0.17],
      [0.15, y, hi - 0.17],
      [0.15, y, hi - 0.06],
      [-0.15, y, hi - 0.06],
    ],
    MAT.alu.l,
    INK.hair
  );
  k.fill(
    [
      [-0.13, y, hi - 0.155],
      [0.13, y, hi - 0.155],
      [0.13, y, hi - 0.075],
      [-0.13, y, hi - 0.075],
    ],
    PAL.cream
  );
  k.line(
    [
      [-0.09, y, hi - 0.115],
      [0.06 - i * 0.03, y, hi - 0.115],
    ],
    INK.hair,
    false,
    SHEET.lead
  );
  // The pull: a chrome cup handle, lit along its top.
  k.box([-0.17, y, hi - 0.25], [0.17, y + 0.035, hi - 0.2], MAT.alu, {
    ink: INK.detail,
  });
  k.fill(
    [
      [-0.14, y + 0.036, hi - 0.245],
      [0.14, y + 0.036, hi - 0.245],
      [0.14, y + 0.036, hi - 0.22],
      [-0.14, y + 0.036, hi - 0.22],
    ],
    MAT.graphite.m
  );
}

/** Hanging files seen from above in an open drawer: coloured tabs in a row. */
function hangingFiles(k: Iso, y0: number, y1: number, z: number): void {
  const inner: V3[] = [
    [-W + 0.08, y0, z + 0.001],
    [W - 0.08, y0, z + 0.001],
    [W - 0.08, y1 - 0.03, z + 0.001],
    [-W + 0.08, y1 - 0.03, z + 0.001],
  ];
  k.shape(inner, MAT.graphite.d, INK.hair);
  const tabs = [PAL.gold, PAL.sky, PAL.pink, PAL.sage, PAL.tan];
  for (let j = 0; y0 + 0.05 + j * 0.06 < y1 - 0.04; j++) {
    const yy = y0 + 0.05 + j * 0.06;
    k.shape(
      [
        [-W + 0.1, yy, z + 0.002],
        [W - 0.1, yy, z + 0.002],
        [W - 0.1, yy + 0.02, z + 0.002],
        [-W + 0.1, yy + 0.02, z + 0.002],
      ],
      ACCENT.paperSheet,
      INK.hair
    );
    const tx = -W + 0.14 + ((j * 0.17) % (2 * W - 0.36));
    k.fill(
      [
        [tx, yy, z + 0.003],
        [tx + 0.1, yy, z + 0.003],
        [tx + 0.1, yy + 0.02, z + 0.003],
        [tx, yy + 0.02, z + 0.003],
      ],
      tabs[j % tabs.length]
    );
  }
}
