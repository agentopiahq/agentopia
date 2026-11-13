import { FONT, INK, Iso, Paint, V3, ellipse, lift, plane, roundRect } from '../kit/iso';
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

/** Hand lettering in marker on a board facing +y at depth y. */
function marker(
  k: Iso,
  at: [number, number],
  y: number,
  text: string,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left'
): void {
  k.text([at[0], y, at[1]], [1, 0, 0], [0, 0, 1], text, size * k.unit, {
    color,
    font: FONT.hand,
    weight: '700',
    align,
  });
}

/** A sticky note on a board, a little crooked, with two scribbled lines on it. */
function sticky(
  k: Iso,
  x: number,
  z: number,
  y: number,
  color: string,
  tilt: number,
  done = false
): void {
  const w = 0.13;
  const c = Math.cos(tilt);
  const sn = Math.sin(tilt);
  const pt = (u: number, v: number): V3 => [x + u * c - v * sn, y, z + u * sn + v * c];
  // A soft shadow under the note's lifted bottom edge.
  k.fill(
    [pt(-w + 0.01, -w - 0.015), pt(w + 0.01, -w - 0.015), pt(w, w - 0.02), pt(-w, w - 0.02)],
    SHEET.shadow,
    0.25
  );
  k.shape([pt(-w, -w), pt(w, -w), pt(w, w), pt(-w, w)], color, INK.hair);
  k.fill([pt(-w, w - 0.035), pt(w, w - 0.035), pt(w, w), pt(-w, w)], mix(color, '#000000', 0.08));
  k.line([pt(-0.09, 0.03), pt(0.07, 0.03)], 0.8, false, MAT.graphite.m);
  k.line([pt(-0.09, -0.03), pt(0.03, -0.03)], 0.8, false, MAT.graphite.m);
  if (done) {
    k.line([pt(0.02, -0.08), pt(0.05, -0.1), pt(0.11, -0.03)], 1.4, false, '#2f8a4a');
  }
}

export const whiteboard: OfficeObject = {
  name: 'Whiteboard',
  blurb: 'The sprint board: to do, doing, done, and a burndown in the corner.',
  bounds: box3([-1.6, 0, 0.8], [1.6, 0.22, 2.3]),
  footprint: box3([-1.55, 0, 0.9], [1.55, 0.16, 2.25]),

  shadow(k) {
    // Hung on the wall, it throws a thin shadow down the paint below it.
    k.fill(
      [
        [-1.52, 0.001, 0.94],
        [1.4, 0.001, 0.94],
        [1.4, 0.001, 1.0],
        [-1.52, 0.001, 1.0],
      ],
      SHEET.shadow,
      k.shadowAlpha * 0.5
    );
  },

  draw(k) {
    const x0 = -1.52;
    const x1 = 1.52;
    const z0 = 1.0;
    const z1 = 2.2;
    const y = 0.07;
    k.box([x0, 0, z0], [x1, y, z1], MAT.alu, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          const board: V3[] = [
            [x0 + 0.06, y, z0 + 0.06],
            [x1 - 0.06, y, z0 + 0.06],
            [x1 - 0.06, y, z1 - 0.06],
            [x0 + 0.06, y, z1 - 0.06],
          ];
          k.shape(board, k.grade(board, [0, 1, 0], '#fbfcfa'), INK.hair);
          const yy = y + 0.001;
          const blue = '#2f5fb0';
          // The title, and three columns ruled in marker.
          marker(k, [x0 + 0.16, z1 - 0.2], yy, 'Sprint 14', 0.14, blue);
          const cols = [-0.6, 0.35];
          for (const cx of cols) {
            k.line(
              [
                [cx, yy, z1 - 0.3],
                [cx + 0.01, yy, z0 + 0.12],
              ],
              1.1,
              false,
              blue
            );
          }
          k.line(
            [
              [x0 + 0.14, yy, z1 - 0.38],
              [x1 - 0.14, yy, z1 - 0.37],
            ],
            1.0,
            false,
            blue
          );
          marker(k, [-1.06, z1 - 0.34], yy, 'TO DO', 0.09, MAT.graphite.d, 'center');
          marker(k, [-0.12, z1 - 0.34], yy, 'DOING', 0.09, MAT.graphite.d, 'center');
          marker(k, [0.93, z1 - 0.34], yy, 'DONE', 0.09, MAT.graphite.d, 'center');
          const y2 = yy + 0.002;
          for (const [x, z, color, tilt, done] of [
            [-1.25, 1.62, PAL.gold, 0.05, false],
            [-0.9, 1.6, PAL.pink, -0.06, false],
            [-1.18, 1.3, PAL.sky, -0.03, false],
            [-0.3, 1.6, PAL.sage, 0.04, false],
            [0.06, 1.58, PAL.gold, -0.05, false],
            [0.7, 1.62, PAL.pink, 0.03, true],
            [1.05, 1.6, PAL.sky, -0.04, true],
            [0.76, 1.3, PAL.gold, 0.06, true],
            [1.12, 1.28, PAL.sage, -0.02, true],
          ] as const) {
            sticky(k, x, z, y2, color, tilt, done);
          }
          // A burndown under the doing column: two axes and a falling line.
          k.line(
            [
              [-0.45, yy, 1.4],
              [-0.45, yy, 1.12],
              [0.2, yy, 1.12],
            ],
            0.9,
            false,
            MAT.graphite.d
          );
          k.line(
            [
              [-0.43, yy, 1.36],
              [-0.25, yy, 1.32],
              [-0.12, yy, 1.24],
              [0.02, yy, 1.22],
              [0.16, yy, 1.15],
            ],
            1.2,
            false,
            MAT.tomato.d
          );
          glare(k, y + 0.003, x0 + 1.9, x0 + 2.25, z0 + 0.06, z1 - 0.06);
        },
      },
    });
    // The marker tray: three markers and an eraser.
    k.box([-1.25, 0, z0 - 0.06], [1.25, 0.17, z0], MAT.alu, { ink: INK.detail });
    k.rod([-1.0, 0.09, z0 + 0.02], [-0.72, 0.09, z0 + 0.02], 0.024, MAT.tomato);
    k.rod([-0.64, 0.1, z0 + 0.02], [-0.36, 0.08, z0 + 0.02], 0.024, MAT.cobalt);
    k.rod([-0.28, 0.09, z0 + 0.02], [0.0, 0.09, z0 + 0.02], 0.024, MAT.mint);
    k.box([0.5, 0.03, z0], [0.84, 0.14, z0 + 0.06], MAT.graphite, { ink: INK.detail });
    k.box([0.5, 0.03, z0 + 0.06], [0.84, 0.14, z0 + 0.1], MAT.mustard, { ink: INK.detail });
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

/** The window's glass, in its own frame: the room's sunlight is cut from it too. */
export const WINDOW = { x0: -1.09, x1: 1.09, z0: 0.66, z1: 2.39, transom: 2.02 } as const;
/** How far down the blind is drawn on a window that has one. */
export const BLIND_Z = 1.72;

/** A fixed city to look out at: buildings, their heights and colours. */
const SKYLINE: Array<[number, number, number, string]> = [
  [-1.1, -0.82, 1.62, '#8aa1bd'],
  [-0.84, -0.5, 1.9, '#9db4cc'],
  [-0.52, -0.3, 1.42, '#7f94b0'],
  [-0.3, 0.05, 2.12, '#a9bdd2'],
  [0.05, 0.3, 1.58, '#8ea4bf'],
  [0.3, 0.62, 1.84, '#9aafc8'],
  [0.62, 0.86, 1.38, '#7c91ad'],
  [0.86, 1.1, 1.7, '#a3b8cf'],
];

/** The view through the whole window: sky, clouds, the city. */
function view(k: Iso, y: number): void {
  const ctx = k.ctx;
  const { x0, x1, z0, z1 } = WINDOW;
  const glassQuad: V3[] = [
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
  ];
  const top = k.P([0, y, z1]);
  const bottom = k.P([0, y, z0]);
  let sky: Paint = PAL.sky;
  if (ctx.createLinearGradient) {
    const g = ctx.createLinearGradient(top[0], top[1], bottom[0], bottom[1]);
    g.addColorStop(0, '#5f9ee6');
    g.addColorStop(0.7, '#b6d8f5');
    g.addColorStop(1, '#eaf4f7');
    sky = g;
  }
  k.fill(glassQuad, sky);
  ctx.save();
  if (ctx.clip) {
    ctx.beginPath();
    glassQuad
      .map((p) => k.P(p))
      .forEach(([x, yy], i) => (i === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy)));
    ctx.closePath();
    ctx.clip();
  }
  const yv = y + 0.0005;
  for (const [cx, cz, r] of [
    [-0.7, 2.22, 0.1],
    [-0.56, 2.26, 0.13],
    [-0.42, 2.21, 0.09],
    [0.48, 2.12, 0.08],
    [0.6, 2.15, 0.1],
    [0.72, 2.11, 0.07],
  ]) {
    k.fill(lift(plane.y(yv), ellipse(cx, cz, r * 1.5, r, 14)), '#ffffff', 0.92);
  }
  // The city: flat-topped blocks, a few lit windows in each.
  for (const [a, b, h, color] of SKYLINE) {
    k.fill(
      [
        [a, yv, z0],
        [b, yv, z0],
        [b, yv, h],
        [a, yv, h],
      ],
      color
    );
    for (let zz = z0 + 0.12; zz < h - 0.08; zz += 0.12) {
      for (let xx = a + 0.05; xx < b - 0.05; xx += 0.08) {
        k.fill(
          [
            [xx, yv + 0.0002, zz],
            [xx + 0.035, yv + 0.0002, zz],
            [xx + 0.035, yv + 0.0002, zz + 0.05],
            [xx, yv + 0.0002, zz + 0.05],
          ],
          mix(color, '#ffffff', 0.35)
        );
      }
    }
  }
  ctx.restore();
}

/** A tall office window: graphite frame, three lights and a transom, a deep sill. */
function windowObject(blind: boolean): OfficeObject {
  return {
    name: blind ? 'Window with blind' : 'Window',
    blurb: blind
      ? 'A tall window with its roller blind half down against the sun.'
      : 'A tall window onto the city: sky, clouds, the blocks across the street.',
    bounds: box3([-1.3, 0, 0.45], [1.3, 0.26, 2.6]),
    footprint: box3([-1.25, 0, 0.5], [1.25, 0.22, 2.55]),

    shadow() {},

    draw(k) {
      const { x0, x1, z0, z1, transom } = WINDOW;
      const f = 0.07;
      const y = 0.04;
      // The reveal: the wall's thickness round the opening, in trim.
      k.box([x0 - f, 0, z0 - f], [x1 + f, y, z1 + f], MAT.graphite, {
        ink: INK.silhouette,
        decorate: {
          '+y': () => {
            view(k, y + 0.001);
            const yy = y + 0.002;
            const mullions = [x0 + (x1 - x0) / 3, x0 + ((x1 - x0) * 2) / 3];
            // Mullions and the transom bar, in graphite.
            for (const mx of mullions) {
              k.shape(
                [
                  [mx - 0.025, yy, z0],
                  [mx + 0.025, yy, z0],
                  [mx + 0.025, yy, z1],
                  [mx - 0.025, yy, z1],
                ],
                MAT.graphite.m,
                INK.hair
              );
            }
            k.shape(
              [
                [x0, yy, transom - 0.02],
                [x1, yy, transom - 0.02],
                [x1, yy, transom + 0.02],
                [x0, yy, transom + 0.02],
              ],
              MAT.graphite.m,
              INK.hair
            );
            // A handle on the middle light, which opens.
            k.line(
              [
                [mullions[1] - 0.06, yy + 0.002, 1.3],
                [mullions[1] - 0.06, yy + 0.002, 1.45],
              ],
              1.6,
              false,
              MAT.alu.l
            );
            glare(k, yy + 0.001, x0 + 0.15, x0 + 0.35, z0 + 0.05, transom - 0.05);
            glare(k, yy + 0.001, 0.25, 0.4, z0 + 0.05, transom - 0.05);
            if (blind) {
              // The roller blind: a cassette, the fabric, its bar and cord.
              const ctx = k.ctx;
              const fab: V3[] = [
                [x0 + 0.02, yy + 0.01, BLIND_Z],
                [x1 - 0.02, yy + 0.01, BLIND_Z],
                [x1 - 0.02, yy + 0.01, z1],
                [x0 + 0.02, yy + 0.01, z1],
              ];
              ctx.save();
              ctx.globalAlpha *= 0.94;
              k.fill(fab, k.grade(fab, [0, 1, 0], '#efe4cc'));
              ctx.restore();
              for (let zz = BLIND_Z + 0.12; zz < z1; zz += 0.14) {
                k.line(
                  [
                    [x0 + 0.04, yy + 0.011, zz],
                    [x1 - 0.04, yy + 0.011, zz],
                  ],
                  INK.hair,
                  false,
                  '#d9c9a8'
                );
              }
              k.box([x0, yy, BLIND_Z - 0.04], [x1, yy + 0.04, BLIND_Z], MAT.alu, { ink: INK.hair });
              k.line(
                [
                  [x1 - 0.15, yy + 0.04, BLIND_Z],
                  [x1 - 0.15, yy + 0.04, BLIND_Z - 0.3],
                ],
                0.8,
                false,
                MAT.graphite.m
              );
              k.dot([x1 - 0.15, yy + 0.04, BLIND_Z - 0.3], 1.4, MAT.alu.l, INK.hair);
            }
          },
        },
      });
      if (blind) {
        k.box([x0 - f, 0, z1 + f], [x1 + f, 0.14, z1 + f + 0.1], MAT.alu, { ink: INK.detail });
      }
      // The sill.
      k.box([x0 - f - 0.05, 0, z0 - f - 0.07], [x1 + f + 0.05, 0.24, z0 - f], MAT.trim, {
        ink: INK.detail,
      });
    },
  };
}

export const windowPane = windowObject(false);
export const windowBlind = windowObject(true);
