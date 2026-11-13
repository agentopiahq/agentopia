import { INK, Iso, Paint, V3, ellipse, lift, plane, roundRect } from '../kit/iso';
import { ACCENT, MAT, PAL, SHEET, mix } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * Things hung on the two back walls: the speaker, the loading-bay shutter,
 * the whiteboard, the clock and the windows. Each is authored on a wall whose
 * surface is the local plane y = 0, its face toward local +y, origin on the
 * floor directly below its middle.
 */

/** Height of the wall speaker's middle above the floor, in tiles. */
export const SPEAKER_Z = 2.2;

export const speaker: OfficeObject = {
  name: 'Speaker',
  blurb: 'The wall speaker: you, speaking. Leads walk over to it to ask you things.',
  bounds: box3([-0.42, 0, 0], [0.42, 0.32, 2.55]),
  footprint: box3([-0.36, 0, 1.85], [0.36, 0.26, 2.45]),

  shadow(k) {
    // It hangs high on the wall, so its shadow falls on the wall itself.
    k.fill(
      [
        [-0.5, 0.001, SPEAKER_Z - 0.34],
        [0.24, 0.001, SPEAKER_Z - 0.34],
        [0.24, 0.001, SPEAKER_Z + 0.16],
        [-0.5, 0.001, SPEAKER_Z + 0.16],
      ],
      SHEET.shadow,
      k.shadowAlpha * 0.6
    );
  },

  draw(k) {
    const z0 = SPEAKER_Z - 0.25;
    const z1 = SPEAKER_Z + 0.25;
    // The cable, run down the wall to the floor.
    k.line(
      [
        [0.18, 0.01, z0],
        [0.18, 0.01, 0.06],
        [0.5, 0.01, 0.02],
      ],
      1.4
    );
    k.box([-0.08, 0, z0 - 0.1], [0.08, 0.12, z0], MAT.graphite, { ink: INK.detail });
    k.box([-0.36, 0.02, z0], [0.36, 0.26, z1], MAT.graphite, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          // The grille: a fine mesh inset in a rounded frame.
          const grille = lift(plane.y(0.261), roundRect(-0.3, z0 + 0.05, 0.22, z1 - 0.05, 0.05));
          k.shape(grille, MAT.graphite.d, INK.hair);
          for (let row = 0; row < 7; row++) {
            for (let col = 0; col < 9; col++) {
              k.dot(
                [-0.27 + col * 0.058 + (row % 2) * 0.029, 0.262, z0 + 0.09 + row * 0.054],
                0.75,
                mix(MAT.graphite.l, '#ffffff', 0.1)
              );
            }
          }
          k.dot([0.29, 0.26, z1 - 0.08], 1.7, ACCENT.ledRed);
          k.dot([0.29, 0.26, z1 - 0.18], 1.3, MAT.graphite.l, INK.hair);
        },
      },
    });
  },
};

const SHUTTER = { w: 0.78, h: 1.62 };

export const shutter: OfficeObject = {
  name: 'Shutter',
  blurb: 'A roller shutter in the back wall: the loading bay, kept shut.',
  bounds: box3([-0.95, 0, 0], [0.95, 0.32, 1.96]),
  footprint: box3([-0.9, 0, 0], [0.9, 0.3, 1.92]),

  shadow(k) {
    k.castShadow(Iso.corners([-0.9, 0, 1.6], [0.9, 0.28, 1.92]), 0, 0.7);
  },

  draw(k) {
    const { w, h } = SHUTTER;
    // The slatted curtain, then its guide rails, then the roller box on top.
    k.box([-w, 0, 0], [w, 0.03, h], MAT.alu, {
      ink: INK.panel,
      decorate: {
        '+y': () => {
          // Each slat: a lit crown along its top and a dark groove under it.
          for (let z = 0.12; z < h - 0.02; z += 0.12) {
            k.line(
              [
                [-w, 0.03, z],
                [w, 0.03, z],
              ],
              INK.hair
            );
            k.line(
              [
                [-w + 0.01, 0.031, z + 0.025],
                [w - 0.01, 0.031, z + 0.025],
              ],
              0.9,
              false,
              mix(MAT.alu.l, '#ffffff', 0.6)
            );
            k.line(
              [
                [-w + 0.01, 0.031, z - 0.02],
                [w - 0.01, 0.031, z - 0.02],
              ],
              0.9,
              false,
              MAT.alu.d
            );
          }
          // The bottom bar and its lift handle.
          k.shape(
            [
              [-w, 0.03, 0.02],
              [w, 0.03, 0.02],
              [w, 0.03, 0.1],
              [-w, 0.03, 0.1],
            ],
            MAT.graphite.m,
            INK.hair
          );
          k.line(
            [
              [-0.12, 0.03, 0.22],
              [0.12, 0.03, 0.22],
            ],
            2
          );
          // A warning sign on the curtain.
          k.shape(
            [
              [-0.18, 0.032, 0.9],
              [0.18, 0.032, 0.9],
              [0.18, 0.032, 1.14],
              [-0.18, 0.032, 1.14],
            ],
            PAL.gold,
            INK.hair
          );
          k.text([0, 0.033, 0.98], [1, 0, 0], [0, 0, 1], 'BAY 1', 0.11 * k.unit, {
            color: SHEET.ink,
          });
        },
      },
    });
    k.box([-w - 0.1, 0, 0], [-w, 0.08, h], MAT.alu, { ink: INK.detail });
    k.box([w, 0, 0], [w + 0.1, 0.08, h], MAT.alu, { ink: INK.detail });
    k.box([-w - 0.12, 0, h - 0.02], [w + 0.12, 0.28, h + 0.3], MAT.alu, { ink: INK.silhouette });
  },
};

export const whiteboard: OfficeObject = {
  name: 'Whiteboard',
  blurb: 'The whiteboard, with the stickies a long session leaves behind.',
  bounds: box3([-1.6, 0, 0.8], [1.6, 0.2, 2.25]),
  footprint: box3([-1.55, 0, 0.9], [1.55, 0.16, 2.2]),

  shadow() {
    // Flat against the wall: it casts nothing worth drawing.
  },

  draw(k) {
    const x0 = -1.5;
    const x1 = 1.5;
    const z0 = 1.0;
    const z1 = 2.15;
    k.box([x0, 0, z0], [x1, 0.06, z1], MAT.alu, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          const board: V3[] = [
            [x0 + 0.06, 0.06, z0 + 0.06],
            [x1 - 0.06, 0.06, z0 + 0.06],
            [x1 - 0.06, 0.06, z1 - 0.06],
            [x0 + 0.06, 0.06, z1 - 0.06],
          ];
          k.shape(board, k.grade(board, [0, 1, 0], '#fbfcfa'), INK.hair);
          // A soft glare across the gloss, and the ghost of an old diagram.
          glare(k, 0.061, x0 + 0.9, x0 + 1.5, z0 + 0.06, z1 - 0.06);
          k.ctx.save();
          k.ctx.globalAlpha *= 0.18;
          k.line(
            [
              [0.2, 0.061, 1.25],
              [0.5, 0.061, 1.18],
              [0.9, 0.061, 1.24],
              [1.25, 0.061, 1.16],
            ],
            1.4,
            false,
            MAT.cobalt.d
          );
          k.ctx.restore();
          // A marker diagram: three boxes and the arrows between them.
          const boxAt = (x: number, z: number): void =>
            k.line(
              [
                [x - 0.18, 0.06, z - 0.1],
                [x + 0.18, 0.06, z - 0.1],
                [x + 0.18, 0.06, z + 0.1],
                [x - 0.18, 0.06, z + 0.1],
              ],
              1.1,
              true,
              MAT.cobalt.d
            );
          boxAt(-1.0, 1.8);
          boxAt(-0.3, 1.8);
          boxAt(-0.65, 1.38);
          k.line(
            [
              [-0.82, 0.06, 1.8],
              [-0.48, 0.06, 1.8],
            ],
            1.1,
            false,
            MAT.cobalt.d
          );
          k.line(
            [
              [-0.3, 0.06, 1.7],
              [-0.55, 0.06, 1.48],
            ],
            1.1,
            false,
            MAT.tomato.d
          );
          // The stickies, a little crooked.
          const stickies: Array<[number, number, string]> = [
            [0.35, 1.8, PAL.gold],
            [0.72, 1.86, PAL.pink],
            [1.1, 1.78, PAL.sage],
            [0.5, 1.4, PAL.sky],
            [0.92, 1.36, PAL.gold],
          ];
          for (const [x, z, color] of stickies) {
            k.shape(
              [
                [x - 0.13, 0.065, z - 0.12],
                [x + 0.13, 0.065, z - 0.14],
                [x + 0.15, 0.065, z + 0.12],
                [x - 0.12, 0.065, z + 0.13],
              ],
              color,
              INK.hair
            );
            k.line(
              [
                [x - 0.07, 0.066, z + 0.02],
                [x + 0.07, 0.066, z + 0.02],
              ],
              INK.hair
            );
          }
        },
      },
    });
    // The marker tray along the bottom: two markers and an eraser.
    k.box([-1.2, 0, z0 - 0.06], [1.2, 0.16, z0], MAT.alu, { ink: INK.detail });
    k.rod([-0.9, 0.09, z0 + 0.02], [-0.6, 0.09, z0 + 0.02], 0.025, MAT.tomato);
    k.rod([-0.5, 0.09, z0 + 0.02], [-0.22, 0.09, z0 + 0.02], 0.025, MAT.cobalt);
    k.box([0.5, 0.03, z0], [0.84, 0.13, z0 + 0.06], MAT.graphite, { ink: INK.detail });
    k.box([0.5, 0.03, z0 + 0.06], [0.84, 0.13, z0 + 0.1], MAT.mustard, { ink: INK.detail });
  },
};

export const clock: OfficeObject = {
  name: 'Clock',
  blurb: 'A wall clock, stopped at ten past ten like every clock in a catalogue.',
  bounds: box3([-0.34, 0, 1.75], [0.34, 0.12, 2.45]),
  footprint: box3([-0.3, 0, 1.8], [0.3, 0.08, 2.4]),

  shadow() {},

  draw(k) {
    const zc = 2.1;
    const r = 0.3;
    k.prism(ellipse(0, zc, r, r, 28), 'y', 0, 0.08, MAT.tomato, { ink: INK.silhouette });
    // The face, inset in the rim.
    const face = lift(plane.y(0.081), ellipse(0, zc, r * 0.8, r * 0.8, 28));
    k.shape(face, PAL.cream, INK.detail);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick: V3[] = [
        [Math.cos(a) * r * 0.66, 0.082, zc + Math.sin(a) * r * 0.66],
        [Math.cos(a) * r * 0.74, 0.082, zc + Math.sin(a) * r * 0.74],
      ];
      k.line(tick, INK.hair);
    }
    // Ten past ten: the hour hand toward the ten, the minute hand toward the two.
    k.line(
      [
        [0, 0.083, zc],
        [-0.13, 0.083, zc + 0.08],
      ],
      1.6
    );
    k.line(
      [
        [0, 0.083, zc],
        [0.17, 0.083, zc + 0.1],
      ],
      1.1
    );
    // The second hand, in red, and the glass's glint.
    k.line(
      [
        [0.03, 0.084, zc + 0.03],
        [-0.1, 0.084, zc - 0.17],
      ],
      0.6,
      false,
      MAT.tomato.d
    );
    k.dot([0, 0.084, zc], 1.4, MAT.tomato.d);
    k.ctx.save();
    k.ctx.globalAlpha *= 0.5;
    k.line(
      lift(
        plane.y(0.085),
        Array.from({ length: 7 }, (_, i): [number, number] => {
          const a = Math.PI * (0.55 + i * 0.05);
          return [Math.cos(a) * r * 0.62, zc + Math.sin(a) * r * 0.62];
        })
      ),
      1.6,
      false,
      '#ffffff'
    );
    k.ctx.restore();
  },
};

/** A soft diagonal band of glare on a glossy face at depth y. */
function glare(k: Iso, y: number, xa: number, xb: number, z0: number, z1: number): void {
  const ctx = k.ctx;
  if (k.sheen <= 0) {
    return;
  }
  const lean = (z1 - z0) * 0.35;
  ctx.save();
  ctx.globalAlpha *= 0.28;
  k.fill(
    [
      [xa, y, z0],
      [xb, y, z0],
      [xb + lean, y, z1],
      [xa + lean, y, z1],
    ],
    '#ffffff'
  );
  ctx.globalAlpha *= 0.6;
  k.fill(
    [
      [xb + 0.08, y, z0],
      [xb + 0.18, y, z0],
      [xb + 0.18 + lean, y, z1],
      [xb + 0.08 + lean, y, z1],
    ],
    '#ffffff'
  );
  ctx.restore();
}

/** The view through a pane: sky down to a haze, clouds, a line of trees. */
function view(k: Iso, a: number, b: number, lo: number, hi: number, y: number): void {
  const ctx = k.ctx;
  const pane: V3[] = [
    [a, y, lo],
    [b, y, lo],
    [b, y, hi],
    [a, y, hi],
  ];
  const top = k.P([(a + b) / 2, y, WINDOW.z1]);
  const bottom = k.P([(a + b) / 2, y, WINDOW.z0]);
  const sky: Paint = ctx.createLinearGradient
    ? (() => {
        const g = ctx.createLinearGradient(top[0], top[1], bottom[0], bottom[1]);
        g.addColorStop(0, '#6fa8e8');
        g.addColorStop(0.75, '#b9dbf6');
        g.addColorStop(1, '#e6f3f8');
        return g;
      })()
    : PAL.sky;
  k.fill(pane, sky);
  ctx.save();
  if (ctx.clip) {
    ctx.beginPath();
    pane
      .map((p) => k.P(p))
      .forEach(([x, yy], i) => (i === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy)));
    ctx.closePath();
    ctx.clip();
  }
  // Clouds, drifting across the top panes.
  for (const [cx, cz, r] of [
    [-0.45, 2.02, 0.09],
    [-0.33, 2.05, 0.11],
    [-0.2, 2.01, 0.08],
    [0.32, 1.9, 0.07],
    [0.42, 1.93, 0.09],
    [0.53, 1.9, 0.06],
  ]) {
    k.fill(lift(plane.y(y + 0.0005), ellipse(cx, cz, r * 1.4, r, 14)), '#ffffff', 0.9);
  }
  // A line of trees, then a far rooftop, along the bottom panes.
  for (let i = 0; i < 9; i++) {
    const cx = WINDOW.x0 + 0.05 + i * 0.19;
    const r = 0.1 + ((i * 37) % 5) * 0.012;
    k.fill(
      lift(plane.y(y + 0.001), ellipse(cx, WINDOW.z0 + 0.06, r, r * 1.2, 12)),
      i % 2 ? MAT.leaf.m : MAT.fern.m
    );
  }
  k.fill(
    [
      [0.1, y + 0.0012, WINDOW.z0],
      [0.62, y + 0.0012, WINDOW.z0],
      [0.62, y + 0.0012, WINDOW.z0 + 0.2],
      [0.36, y + 0.0012, WINDOW.z0 + 0.3],
      [0.1, y + 0.0012, WINDOW.z0 + 0.2],
    ],
    MAT.terracotta.m
  );
  ctx.restore();
}

/** The glass of a window, in its own frame: the room's sunlight is cut from it too. */
const WINDOW = { x0: -0.75, x1: 0.75, z0: 1.12, z1: 2.23 } as const;

export const windowPane: OfficeObject = {
  name: 'Window',
  blurb: 'A window in the wall: blue sky, a few clouds, the treetops outside.',
  bounds: box3([-0.92, 0, 0.9], [0.92, 0.22, 2.4]),
  footprint: box3([-0.9, 0, 0.95], [0.9, 0.2, 2.35]),

  shadow() {},

  draw(k) {
    const x0 = -0.82;
    const x1 = 0.82;
    const z0 = 1.05;
    const z1 = 2.3;
    k.box([x0, 0, z0], [x1, 0.06, z1], MAT.trim, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          const panes: Array<[number, number, number, number]> = [
            [x0 + 0.07, 0.03, z0 + 0.07, (z0 + z1) / 2 - 0.03],
            [0.03, x1 - 0.07, z0 + 0.07, (z0 + z1) / 2 - 0.03],
            [x0 + 0.07, -0.03, (z0 + z1) / 2 + 0.03, z1 - 0.07],
            [0.03, x1 - 0.07, (z0 + z1) / 2 + 0.03, z1 - 0.07],
          ];
          for (const [a, b, lo, hi] of panes) {
            view(k, a, b, lo, hi, 0.06);
            k.line(
              [
                [a, 0.06, lo],
                [b, 0.06, lo],
                [b, 0.06, hi],
                [a, 0.06, hi],
              ],
              INK.detail,
              true
            );
          }
          // Two streaks of reflection across the glass.
          k.ctx.save();
          k.ctx.globalAlpha *= 0.45;
          k.line(
            [
              [x0 + 0.2, 0.061, z0 + 0.4],
              [x0 + 0.5, 0.061, z0 + 0.12],
            ],
            2.6,
            false,
            '#ffffff'
          );
          k.line(
            [
              [0.2, 0.061, z1 - 0.15],
              [0.5, 0.061, z1 - 0.45],
            ],
            2.6,
            false,
            '#ffffff'
          );
          k.ctx.restore();
        },
      },
    });
    // The sill.
    k.box([x0 - 0.08, 0, z0 - 0.07], [x1 + 0.08, 0.2, z0], MAT.trim, { ink: INK.detail });
  },
};
