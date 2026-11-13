import { INK, Iso, V3, ellipse, lift, plane } from '../kit/iso';
import { ACCENT, MAT, PAL, SHEET } from '../kit/palette';
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
    k.box([-0.08, 0, z0 - 0.1], [0.08, 0.12, z0], MAT.dark, { ink: INK.detail });
    k.box([-0.36, 0.02, z0], [0.36, 0.26, z1], MAT.dark, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 5; col++) {
              k.dot([-0.24 + col * 0.11, 0.26, z0 + 0.12 + row * 0.11], 1.5, MAT.dark.d);
            }
          }
          k.dot([0.27, 0.26, z1 - 0.08], 1.7, ACCENT.ledRed);
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
    k.box([-w, 0, 0], [w, 0.03, h], MAT.metal, {
      ink: INK.panel,
      decorate: {
        '+y': () => {
          for (let z = 0.12; z < h - 0.02; z += 0.12) {
            k.line(
              [
                [-w, 0.03, z],
                [w, 0.03, z],
              ],
              INK.hair
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
            MAT.metal.d,
            INK.hair
          );
          k.line(
            [
              [-0.12, 0.03, 0.22],
              [0.12, 0.03, 0.22],
            ],
            2
          );
        },
      },
    });
    k.box([-w - 0.1, 0, 0], [-w, 0.08, h], MAT.metal, { ink: INK.detail });
    k.box([w, 0, 0], [w + 0.1, 0.08, h], MAT.metal, { ink: INK.detail });
    k.box([-w - 0.12, 0, h - 0.02], [w + 0.12, 0.28, h + 0.3], MAT.metal, { ink: INK.silhouette });
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
    k.box([x0, 0, z0], [x1, 0.06, z1], MAT.metal, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          k.shape(
            [
              [x0 + 0.06, 0.06, z0 + 0.06],
              [x1 - 0.06, 0.06, z0 + 0.06],
              [x1 - 0.06, 0.06, z1 - 0.06],
              [x0 + 0.06, 0.06, z1 - 0.06],
            ],
            PAL.cream,
            INK.hair
          );
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
    // The marker tray along the bottom.
    k.box([-1.2, 0, z0 - 0.06], [1.2, 0.16, z0], MAT.metal, { ink: INK.detail });
    k.rod([-0.9, 0.09, z0 + 0.02], [-0.6, 0.09, z0 + 0.02], 0.025, MAT.tomato);
    k.rod([-0.5, 0.09, z0 + 0.02], [-0.22, 0.09, z0 + 0.02], 0.025, MAT.cobalt);
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
    k.dot([0, 0.084, zc], 1.4, MAT.tomato.d);
  },
};

export const windowPane: OfficeObject = {
  name: 'Window',
  blurb: 'A window in the back wall, with a little sky in it.',
  bounds: box3([-0.92, 0, 0.9], [0.92, 0.22, 2.4]),
  footprint: box3([-0.9, 0, 0.95], [0.9, 0.2, 2.35]),

  shadow() {},

  draw(k) {
    const x0 = -0.82;
    const x1 = 0.82;
    const z0 = 1.05;
    const z1 = 2.3;
    k.box([x0, 0, z0], [x1, 0.06, z1], MAT.ceramic, {
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
            k.shape(
              [
                [a, 0.06, lo],
                [b, 0.06, lo],
                [b, 0.06, hi],
                [a, 0.06, hi],
              ],
              PAL.sky,
              INK.detail
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
    k.box([x0 - 0.08, 0, z0 - 0.07], [x1 + 0.08, 0.2, z0], MAT.ceramic, { ink: INK.detail });
  },
};
