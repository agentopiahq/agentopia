import { COLUMN_HEADS, DEFAULT_BOARD, INK_H, INK_W, normalizeBoard, shownNotes } from '../board';
import { FONT, INK, Iso, Paint, V3, ellipse, lift, plane, roundRect } from '../kit/iso';
import { ACCENT, MAT, PAL, SHEET, mix } from '../kit/palette';
import { OfficeObject, PieceState, box3, flag, frac } from './types';

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

  draw(k, state) {
    const muted = flag(state, 'muted', false);
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
          k.dot([0.29, 0.26, z1 - 0.08], 1.7, muted ? MAT.graphite.l : ACCENT.ledRed);
          if (muted) {
            // Muted: a red slash across the grille.
            k.line(
              [
                [-0.26, 0.263, z0 + 0.08],
                [0.18, 0.263, z1 - 0.08],
              ],
              2.2,
              false,
              ACCENT.ledRed
            );
          }
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
  done = false,
  text = 'a note here'
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
  // Two scribbled lines, as long as the note's words run.
  const words = text.trim().length;
  if (words > 0) {
    const first = Math.min(0.16, 0.03 + words * 0.012);
    k.line([pt(-0.09, 0.03), pt(-0.09 + first, 0.03)], 0.8, false, MAT.graphite.m);
    if (words > 10) {
      const second = Math.min(0.12, (words - 10) * 0.012 + 0.02);
      k.line([pt(-0.09, -0.03), pt(-0.09 + second, -0.03)], 0.8, false, MAT.graphite.m);
    }
  }
  if (done) {
    k.line([pt(0.02, -0.08), pt(0.05, -0.1), pt(0.11, -0.03)], 1.4, false, '#2f8a4a');
  }
}

export const whiteboard: OfficeObject = {
  name: 'Whiteboard',
  blurb: 'The big sprint board: to do, doing, review, done, and a burndown.',
  bounds: box3([-1.85, 0, 0.75], [1.85, 0.22, 2.55]),
  footprint: box3([-1.8, 0, 0.8], [1.8, 0.16, 2.5]),

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

  draw(k, state) {
    const content = state?.board ? normalizeBoard(state.board) : DEFAULT_BOARD;
    const ink = state?.inkImage as CanvasImageSource | undefined;
    const x0 = -1.75;
    const x1 = 1.75;
    const z0 = 0.95;
    const z1 = 2.45;
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
          // The title, and four columns ruled in marker.
          marker(k, [x0 + 0.18, z1 - 0.22], yy, content.title, 0.16, blue);
          marker(k, [x1 - 0.18, z1 - 0.22], yy, content.tag, 0.11, MAT.tomato.d, 'right');
          const colW = (x1 - x0 - 0.24) / COLUMN_HEADS.length;
          const top = z1 - 0.42;
          COLUMN_HEADS.forEach((head, i) => {
            const cx0 = x0 + 0.12 + i * colW;
            if (i > 0) {
              k.line(
                [
                  [cx0, yy, top + 0.08],
                  [cx0 + 0.01, yy, z0 + 0.14],
                ],
                1.1,
                false,
                blue
              );
            }
            marker(k, [cx0 + colW / 2, top - 0.02], yy, head, 0.1, MAT.graphite.d, 'center');
          });
          k.line(
            [
              [x0 + 0.14, yy, top + 0.08],
              [x1 - 0.14, yy, top + 0.09],
            ],
            1.0,
            false,
            blue
          );
          const y2 = yy + 0.002;
          // Notes in every column, as many as fit; done ones ticked.
          content.columns.forEach((notes, col) => {
            const cx = x0 + 0.12 + col * colW + colW / 2;
            for (let j = 0; j < shownNotes(content, col); j++) {
              const x = cx + (j % 2 === 0 ? -0.18 : 0.18);
              const z = top - 0.32 - Math.floor(j / 2) * 0.33;
              const tilt = ((col * 7 + j * 3) % 5) * 0.025 - 0.05;
              sticky(k, x, z, y2, notes[j].color, tilt, col === 3, notes[j].text);
            }
          });
          if (content.chart) {
            // A burndown in the review column's foot: two axes and a falling line.
            const bx = x0 + 0.12 + 2 * colW + 0.12;
            k.line(
              [
                [bx, yy, z0 + 0.55],
                [bx, yy, z0 + 0.2],
                [bx + colW - 0.24, yy, z0 + 0.2],
              ],
              0.9,
              false,
              MAT.graphite.d
            );
            k.line(
              [
                [bx + 0.02, yy, z0 + 0.5],
                [bx + 0.2, yy, z0 + 0.45],
                [bx + 0.36, yy, z0 + 0.36],
                [bx + 0.52, yy, z0 + 0.33],
                [bx + colW - 0.28, yy, z0 + 0.24],
              ],
              1.2,
              false,
              MAT.tomato.d
            );
          }
          if (ink) {
            inkOnBoard(k, ink, board, y2 + 0.002);
          }
          glare(k, y + 0.003, x0 + 2.2, x0 + 2.6, z0 + 0.06, z1 - 0.06);
        },
      },
    });
    // The marker tray: three markers and an eraser.
    k.box([-1.5, 0, z0 - 0.06], [1.5, 0.17, z0], MAT.alu, { ink: INK.detail });
    k.rod([-1.0, 0.09, z0 + 0.02], [-0.72, 0.09, z0 + 0.02], 0.024, MAT.tomato);
    k.rod([-0.64, 0.1, z0 + 0.02], [-0.36, 0.08, z0 + 0.02], 0.024, MAT.cobalt);
    k.rod([-0.28, 0.09, z0 + 0.02], [0.0, 0.09, z0 + 0.02], 0.024, MAT.mint);
    k.box([0.5, 0.03, z0], [0.84, 0.14, z0 + 0.06], MAT.graphite, { ink: INK.detail });
    k.box([0.5, 0.03, z0 + 0.06], [0.84, 0.14, z0 + 0.1], MAT.mustard, { ink: INK.detail });
  },
};

/**
 * The big sprint board, freestanding: the same board on a mobile stand — two
 * aluminium uprights on wheeled feet — so it can stand out on the floor by
 * the desks, away from the windows, and be rolled wherever the team gathers.
 * Local frame: the origin is on the floor under the board's middle.
 */
export const mobileBoard: OfficeObject = {
  name: 'Mobile whiteboard',
  blurb: 'The big sprint board on a wheeled stand, out on the floor by the desks.',
  bounds: box3([-1.95, -0.5, 0], [1.95, 0.5, 2.6]),
  footprint: box3([-1.9, -0.42, 0], [1.9, 0.45, 2.5]),

  shadow(k) {
    for (const x of [-1.85, 1.85]) {
      k.castShadow(Iso.corners([x - 0.04, -0.42, 0], [x + 0.04, 0.45, 0.06]));
    }
    k.castShadow(Iso.corners([-1.75, -0.01, 0.95], [1.75, 0.08, 2.45]), 0, 0.7);
  },

  draw(k, state) {
    k.sorted((add) => {
      for (const x of [-1.85, 1.85]) {
        add(box3([x - 0.05, -0.42, 0], [x + 0.05, 0.45, 2.52]), () => {
          // A wheeled foot, an upright, and a knob where the board pivots.
          for (const y of [-0.38, 0.41]) {
            k.ball([x, y, 0.035], 0.035, MAT.graphite, INK.hair);
          }
          k.box([x - 0.035, -0.4, 0.06], [x + 0.035, 0.43, 0.11], MAT.alu, { ink: INK.detail });
          k.box([x - 0.03, 0.0, 0.11], [x + 0.03, 0.06, 2.52], MAT.alu, { ink: INK.detail });
          k.dot([x, 0.07, 1.7], 1.8, MAT.graphite.m, INK.hair);
        });
      }
      add(box3([-1.78, 0, 0.88], [1.78, 0.17, 2.46]), () => whiteboard.draw(k, state));
    });
  },
};

/** The minutes past midnight a running clock shows, from its state. */
function clockMinutes(state?: PieceState): number {
  const m = state?.minutes;
  return typeof m === 'number' && Number.isFinite(m) ? m : 10 * 60 + 10;
}

export const clock: OfficeObject = {
  name: 'Clock',
  blurb: 'A wall clock, stopped at ten past ten like every clock in a catalogue.',
  bounds: box3([-0.34, 0, 1.75], [0.34, 0.12, 2.45]),
  footprint: box3([-0.3, 0, 1.8], [0.3, 0.08, 2.4]),

  shadow() {},

  draw(k, state) {
    const zc = 2.1;
    const r = 0.3;
    // Stopped at ten past ten until it is wound; then it keeps the office's time.
    const minutes = flag(state, 'running', false) ? clockMinutes(state) : 10 * 60 + 10;
    const hourA = Math.PI / 2 - ((minutes / 60) % 12) * (Math.PI / 6);
    const minA = Math.PI / 2 - (minutes % 60) * (Math.PI / 30);
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
    // The hour hand and the minute hand.
    k.line(
      [
        [0, 0.083, zc],
        [Math.cos(hourA) * 0.15, 0.083, zc + Math.sin(hourA) * 0.15],
      ],
      1.6
    );
    k.line(
      [
        [0, 0.083, zc],
        [Math.cos(minA) * 0.2, 0.083, zc + Math.sin(minA) * 0.2],
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

/**
 * The marker drawing, laid flat onto the board's face. The projection is
 * parallel, so the face is an exact affine image of the drawing's canvas.
 */
function inkOnBoard(k: Iso, ink: CanvasImageSource, face: V3[], y: number): void {
  const ctx = k.ctx;
  if (!ctx.drawImage) {
    return;
  }
  const [bl, br, , tl] = face.map((p): V3 => [p[0], y, p[2]]);
  const o = k.P(tl);
  const u = k.P([br[0], y, tl[2]]);
  const v = k.P(bl);
  ctx.save();
  ctx.transform(
    (u[0] - o[0]) / INK_W,
    (u[1] - o[1]) / INK_W,
    (v[0] - o[0]) / INK_H,
    (v[1] - o[1]) / INK_H,
    o[0],
    o[1]
  );
  ctx.drawImage(ink, 0, 0, INK_W, INK_H);
  ctx.restore();
}

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

/**
 * Windows come in one-tile segments that butt together into a continuous
 * band of glass along a wall — a ribbon window, nearly floor to ceiling — so
 * a whole wall can be glazed. Each segment is one light between two half
 * mullions; three variants carry different stretches of the city behind,
 * so a long band does not repeat. This is a segment's glass, in its frame.
 */
export const WINDOW = { x0: -0.5, x1: 0.5, z0: 0.45, z1: 2.55, transom: 2.15 } as const;
/** How many lights a segment has. */
export const WINDOW_LIGHTS = 1;
/** How far down the blind is drawn on a segment that has one. */
export const BLIND_Z = 1.85;
/** How far down the blind is by default, as a fraction of the light. */
export const BLIND_DOWN = (WINDOW.z1 - BLIND_Z) / (WINDOW.z1 - WINDOW.z0);
/** Where a blind `down` of the way down hangs its bar. */
export const blindZ = (down: number): number => WINDOW.z1 - down * (WINDOW.z1 - WINDOW.z0 - 0.04);

/** A stretch of city, three tiles long, that the three segment variants share. */
const CITY: Array<[number, number, number, string]> = [
  [-1.5, -1.12, 1.62, '#8aa1bd'],
  [-1.12, -0.7, 1.95, '#9db4cc'],
  [-0.7, -0.4, 1.42, '#7f94b0'],
  [-0.4, 0.08, 2.18, '#a9bdd2'],
  [0.08, 0.42, 1.58, '#8ea4bf'],
  [0.42, 0.85, 1.88, '#9aafc8'],
  [0.85, 1.18, 1.38, '#7c91ad'],
  [1.18, 1.5, 1.72, '#a3b8cf'],
];
const CLOUDS: Array<[number, number, number]> = [
  [-1.2, 2.32, 0.1],
  [-1.05, 2.36, 0.13],
  [-0.9, 2.31, 0.09],
  [0.35, 2.22, 0.08],
  [0.5, 2.26, 0.11],
  [0.64, 2.21, 0.07],
];

/** The view through a segment: sky, clouds and the city, `offset` tiles along the stretch. */
function view(k: Iso, y: number, offset: number): void {
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
  for (const [cx, cz, r] of CLOUDS) {
    k.fill(lift(plane.y(yv), ellipse(cx - offset, cz, r * 1.5, r, 14)), '#ffffff', 0.92);
  }
  for (const [a0, b0, h, color] of CITY) {
    const [a, b] = [a0 - offset, b0 - offset];
    if (b < x0 || a > x1) {
      continue;
    }
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

/** One segment of a window band: a light of glass, half a mullion at each side, a sill. */
function windowSegment(blind: boolean, variant: number): OfficeObject {
  const offset = variant - 1;
  return {
    name: blind ? 'Window, blind down' : 'Window',
    blurb: blind
      ? 'A tile of the window band, its roller blind part down against the sun.'
      : 'A tile of the window band: tiles of these glaze a whole wall, nearly floor to ceiling.',
    bounds: box3(
      [WINDOW.x0 - 0.02, 0, WINDOW.z0 - 0.2],
      [WINDOW.x1 + 0.02, 0.26, WINDOW.z1 + 0.12]
    ),
    footprint: box3([WINDOW.x0, 0, WINDOW.z0 - 0.15], [WINDOW.x1, 0.22, WINDOW.z1 + 0.1]),

    shadow() {},

    draw(k, state) {
      const { x0, x1, z0, z1, transom } = WINDOW;
      const f = 0.07;
      const barZ = blindZ(frac(state, 'down', BLIND_DOWN));
      const y = 0.04;
      // The frame: head and sill rails across, half a mullion at each end,
      // so segments side by side read as one band.
      k.box([x0, 0, z0 - f], [x1, y, z1 + f], MAT.graphite, {
        ink: INK.hair,
        rim: false,
        decorate: {
          '+y': () => {
            view(k, y + 0.001, offset);
            const yy = y + 0.002;
            for (const [a, b] of [
              [x0, x0 + 0.03],
              [x1 - 0.03, x1],
            ]) {
              k.fill(
                [
                  [a, yy, z0],
                  [b, yy, z0],
                  [b, yy, z1],
                  [a, yy, z1],
                ],
                MAT.graphite.m
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
            if (variant === 1) {
              // Every third light opens: its handle.
              k.line(
                [
                  [x1 - 0.1, yy + 0.002, 1.2],
                  [x1 - 0.1, yy + 0.002, 1.35],
                ],
                1.6,
                false,
                MAT.alu.l
              );
            }
            glare(
              k,
              yy + 0.001,
              x0 + 0.12 + offset * 0.1,
              x0 + 0.26 + offset * 0.1,
              z0 + 0.05,
              transom - 0.05
            );
            if (blind) {
              // The roller blind: the fabric down to its bar, slats of light through it.
              const ctx = k.ctx;
              const fab: V3[] = [
                [x0 + 0.02, yy + 0.01, barZ],
                [x1 - 0.02, yy + 0.01, barZ],
                [x1 - 0.02, yy + 0.01, z1],
                [x0 + 0.02, yy + 0.01, z1],
              ];
              ctx.save();
              ctx.globalAlpha *= 0.94;
              k.fill(fab, k.grade(fab, [0, 1, 0], '#efe4cc'));
              ctx.restore();
              for (let zz = barZ + 0.12; zz < z1; zz += 0.14) {
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
              k.box([x0, yy, barZ - 0.04], [x1, yy + 0.04, barZ], MAT.alu, { ink: INK.hair });
            }
          },
        },
      });
      if (blind) {
        k.box([x0, 0, z1 + f], [x1, 0.14, z1 + f + 0.1], MAT.alu, { ink: INK.hair, rim: false });
      }
      // The sill, running on into the next segment's.
      k.box([x0, 0, z0 - f - 0.07], [x1, 0.24, z0 - f], MAT.trim, { ink: INK.hair });
    },
  };
}

export const windowPane = windowSegment(false, 0);
export const window2 = windowSegment(false, 1);
export const window3 = windowSegment(false, 2);
export const windowBlind = windowSegment(true, 0);
export const windowBlind2 = windowSegment(true, 1);
export const windowBlind3 = windowSegment(true, 2);
