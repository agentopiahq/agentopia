import { FONT, INK, Iso, V3 } from '../kit/iso';
import { ACCENT, MAT, Mat, PAL, SHEET, mix } from '../kit/palette';
import { RACK, cable } from './serverRack';
import { OfficeObject, PieceState, box3, frac } from './types';

/**
 * The server floor's set dressing, every one at the avatar's scale (a rack
 * is 2.05 tiles, the avatar 1.9): a tape library whose robot arm shuffles
 * cartridges, a glass-walled network core with its tangle of fibre, the
 * status board by the stairs, the fire panel, an extinguisher and a crash
 * cart, a sticky note and a forgotten mug, a wall thermometer, the big red
 * emergency power-off button under its cover, and the little maintenance
 * robot that does the rounds.
 *
 * Each is authored front toward local +y, origin at the middle of its base
 * on the floor; the wall-hung ones are drawn up at their height from there.
 */

const onY = (y: number, x0: number, z0: number, x1: number, z1: number): V3[] => [
  [x0, y, z0],
  [x1, y, z0],
  [x1, y, z1],
  [x0, y, z1],
];

/** A small deterministic hash in [0, 1). */
function hash(a: number, b = 0): number {
  let h = (Math.imul(a + 0x51ed, 0x85ebca6b) ^ Math.imul(b + 0x2c1b, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const RAINBOW = [PAL.rose, '#f39a4c', PAL.gold, PAL.sage, '#7fd0e6', PAL.blue, '#a58ee0', PAL.pink];

// ---- the tape library ---------------------------------------------------------

const TAPE = { w: 2.3, d: 0.85, h: 1.95 } as const;
/** The window onto the shelves, on the front. */
const TW = { x0: -TAPE.w / 2 + 0.16, x1: TAPE.w / 2 - 0.5, z0: 0.35, z1: TAPE.h - 0.22 };
const TAPE_ROWS = 6;
const TAPE_COLS = 14;
/** Stills in the arm's round trip, and how fast it goes. */
const ARM_FRAMES = 16;
const ARM_FPS = 4;

/** Where the arm's picker is along the shelves, and how high, at one still of its loop. */
export function armAt(frame: number): { x: number; z: number; grip: boolean } {
  const f = ((frame % ARM_FRAMES) + ARM_FRAMES) % ARM_FRAMES;
  // Out to a cartridge, a pause to take it, back to the drive, a pause to load it.
  const legs = [0, 0.2, 0.55, 0.55, 0.9, 0.9, 0.4, 0.1, 0.1, 0.35, 0.7, 0.7, 0.3, 0.05, 0, 0];
  const highs = [2, 2, 4, 4, 1, 1, 3, 5, 5, 2, 0, 0, 3, 2, 2, 2];
  const t = legs[f];
  const row = highs[f];
  return {
    x: TW.x0 + 0.08 + t * (TW.x1 - TW.x0 - 0.16),
    z: TW.z0 + 0.1 + (row + 0.5) * ((TW.z1 - TW.z0 - 0.2) / TAPE_ROWS),
    grip: f === 3 || f === 5 || f === 8 || f === 11,
  };
}

export const tapeLibrary: OfficeObject = {
  name: 'Tape library',
  blurb:
    'Backups on tape: shelves of cartridges behind glass, and a robot arm that fetches them to the drives.',
  bounds: box3(
    [-TAPE.w / 2 - 0.03, -TAPE.d / 2 - 0.02, 0],
    [TAPE.w / 2 + 0.03, TAPE.d / 2 + 0.06, TAPE.h + 0.05]
  ),
  footprint: box3([-TAPE.w / 2, -TAPE.d / 2, 0], [TAPE.w / 2, TAPE.d / 2, TAPE.h]),
  motions: [
    {
      frames: ARM_FRAMES,
      fps: ARM_FPS,
      draw(k, frame) {
        if (!k.facing([0, 1, 0])) {
          return;
        }
        const y = TAPE.d / 2 + 0.012;
        const arm = armAt(frame);
        // The gantry rail across the top, the carriage on it, and the picker.
        k.fill(onY(y, TW.x0 + 0.02, TW.z1 - 0.07, TW.x1 - 0.02, TW.z1 - 0.04), MAT.alu.d);
        k.fill(onY(y + 0.002, arm.x - 0.03, TW.z0 + 0.04, arm.x + 0.03, TW.z1 - 0.04), MAT.alu.m);
        const head = onY(y + 0.004, arm.x - 0.07, arm.z - 0.05, arm.x + 0.07, arm.z + 0.05);
        k.shape(head, MAT.mustard.m, INK.detail);
        k.dot([arm.x + 0.05, y + 0.006, arm.z + 0.02], 1.1, arm.grip ? ACCENT.ledGreen : PAL.gold);
        if (arm.grip) {
          // A cartridge in its fingers.
          k.shape(
            onY(y + 0.006, arm.x - 0.035, arm.z - 0.035, arm.x + 0.035, arm.z + 0.03),
            PAL.blue,
            INK.hair
          );
        }
      },
    },
  ],
  shadow(k) {
    k.castShadow(Iso.corners([-TAPE.w / 2, -TAPE.d / 2, 0], [TAPE.w / 2, TAPE.d / 2, TAPE.h]));
  },
  draw(k) {
    k.box([-TAPE.w / 2, -TAPE.d / 2, 0], [TAPE.w / 2, TAPE.d / 2, TAPE.h], MAT.machine, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          const y = TAPE.d / 2 + 0.004;
          // The dark inside, and the cartridges on their shelves.
          k.fill(onY(y, TW.x0, TW.z0, TW.x1, TW.z1), mix(MAT.graphite.d, '#000000', 0.25));
          const rowH = (TW.z1 - TW.z0 - 0.2) / TAPE_ROWS;
          const colW = (TW.x1 - TW.x0 - 0.12) / TAPE_COLS;
          for (let r = 0; r < TAPE_ROWS; r++) {
            const z = TW.z0 + 0.1 + r * rowH;
            k.line(
              [
                [TW.x0, y + 0.002, z],
                [TW.x1, y + 0.002, z],
              ],
              INK.hair,
              false,
              MAT.alu.d
            );
            for (let c = 0; c < TAPE_COLS; c++) {
              if (hash(r, c) < 0.12) {
                continue;
              }
              const x = TW.x0 + 0.06 + c * colW;
              const label = RAINBOW[Math.floor(hash(c, r + 9) * RAINBOW.length)];
              k.fill(
                onY(y + 0.003, x + 0.006, z + 0.012, x + colW - 0.006, z + rowH - 0.012),
                MAT.graphite.m
              );
              k.fill(
                onY(y + 0.004, x + 0.012, z + rowH * 0.55, x + colW - 0.012, z + rowH - 0.02),
                label
              );
            }
          }
          // The glass over it all.
          const glass = onY(y + 0.02, TW.x0, TW.z0, TW.x1, TW.z1);
          k.fill(glass, MAT.glass.l, 0.18);
          k.line(glass, INK.detail, true);
          // The drives' panel to the right: slots, a little screen, the name.
          const px = TW.x1 + 0.06;
          k.shape(
            onY(y + 0.006, px, TAPE.h - 0.62, TAPE.w / 2 - 0.08, TAPE.h - 0.42),
            ACCENT.lcd,
            INK.detail
          );
          k.text(
            [(px + TAPE.w / 2 - 0.08) / 2, y + 0.01, TAPE.h - 0.56],
            [1, 0, 0],
            [0, 0, 1],
            'LTO-9',
            0.08 * k.unit,
            {
              color: mix(ACCENT.lcd, '#10302a', 0.75),
              weight: '800',
            }
          );
          for (let i = 0; i < 4; i++) {
            const z = 1.05 - i * 0.16;
            k.shape(onY(y + 0.006, px, z, TAPE.w / 2 - 0.08, z + 0.1), MAT.graphite.m, INK.hair);
            k.fill(
              onY(y + 0.008, px + 0.04, z + 0.035, TAPE.w / 2 - 0.16, z + 0.06),
              mix(MAT.graphite.d, '#000000', 0.4)
            );
            k.dot(
              [TAPE.w / 2 - 0.12, y + 0.009, z + 0.05],
              0.9,
              i === 1 ? PAL.gold : ACCENT.ledGreen
            );
          }
          k.text(
            [0, y + 0.006, 0.15],
            [1, 0, 0],
            [0, 0, 1],
            'BACKUPS · TAPE LIBRARY',
            0.075 * k.unit,
            {
              color: SHEET.lead,
              weight: '800',
            }
          );
        },
        '+z': () => {
          for (let i = 0; i < 7; i++) {
            const x = -TAPE.w / 2 + 0.25 + i * 0.3;
            k.line(
              [
                [x, -0.25, TAPE.h + 0.002],
                [x, 0.25, TAPE.h + 0.002],
              ],
              0.6,
              false,
              MAT.machine.d
            );
          }
        },
      },
    });
    k.box(
      [-TAPE.w / 2 + 0.03, -TAPE.d / 2 + 0.03, 0],
      [TAPE.w / 2 - 0.03, TAPE.d / 2 - 0.03, 0.07],
      MAT.graphite,
      {
        ink: INK.detail,
        rim: false,
      }
    );
  },
};

// ---- the network core cage -------------------------------------------------------

const CAGE = { w: 2.5, d: 1.5, h: 2.05 } as const;
const CW = CAGE.w / 2;
const CD = CAGE.d / 2;

/** One of the two core switches inside: a short rack of line cards and their lights. */
function coreSwitch(k: Iso, x: number): void {
  const w = 0.38;
  const d = 0.55;
  const h = 1.35;
  k.box([x - w, -d, 0], [x + w, d, h], MAT.graphite, {
    ink: INK.panel,
    decorate: {
      '+y': () => {
        for (let i = 0; i < 8; i++) {
          const z = 0.12 + i * 0.15;
          k.fill(
            onY(d + 0.003, x - w + 0.05, z, x + w - 0.05, z + 0.12),
            mix(MAT.graphite.m, '#000000', 0.15)
          );
          for (let j = 0; j < 9; j++) {
            k.dot(
              [x - w + 0.09 + j * 0.07, d + 0.006, z + 0.06],
              0.7,
              (i + j) % 4 === 0 ? PAL.gold : ACCENT.ledGreen
            );
          }
        }
      },
    },
  });
}

export const networkCage: OfficeObject = {
  name: 'Network core',
  blurb:
    'The core switches in a glass-walled cage, and the great rainbow tangle of fibre between them.',
  bounds: box3([-CW - 0.04, -CD - 0.04, 0], [CW + 0.04, CD + 0.08, CAGE.h + 0.3]),
  footprint: box3([-CW, -CD, 0], [CW, CD, CAGE.h]),
  shadow(k) {
    k.castShadow(Iso.corners([-CW, -CD, 0], [CW, CD, CAGE.h]), 0, 0.45);
  },
  draw(k) {
    const panel = (pts: V3[], n: V3): void => {
      k.fill(pts, MAT.glass.l, 0.22);
      k.line(pts, INK.panel, true, mix(MAT.alu.d, SHEET.line, 0.3));
      void n;
    };
    k.sorted((add) => {
      // The far walls first, then the floor plate, the switches and fibre, and the near walls.
      const walls: Array<[V3, V3[], [V3, V3, V3]]> = [
        [
          [0, -1, 0],
          onY(-CD, -CW, 0, CW, CAGE.h),
          [
            [-CW, -CD, 0],
            [CW, -CD + 0.02, CAGE.h],
            [0, -1, 0],
          ],
        ],
        [
          [0, 1, 0],
          onY(CD, -CW, 0, CW, CAGE.h),
          [
            [-CW, CD - 0.02, 0],
            [CW, CD, CAGE.h],
            [0, 1, 0],
          ],
        ],
        [
          [-1, 0, 0],
          [
            [-CW, -CD, 0],
            [-CW, CD, 0],
            [-CW, CD, CAGE.h],
            [-CW, -CD, CAGE.h],
          ],
          [
            [-CW, -CD, 0],
            [-CW + 0.02, CD, CAGE.h],
            [-1, 0, 0],
          ],
        ],
        [
          [1, 0, 0],
          [
            [CW, -CD, 0],
            [CW, CD, 0],
            [CW, CD, CAGE.h],
            [CW, -CD, CAGE.h],
          ],
          [
            [CW - 0.02, -CD, 0],
            [CW, CD, CAGE.h],
            [1, 0, 0],
          ],
        ],
      ];
      for (const [n, pts, [lo, hi]] of walls) {
        add([lo, hi], () => {
          panel(pts, n);
          // Posts at the corners and a rail along the top.
          for (const p of [pts[0], pts[1]]) {
            k.rod(p, [p[0], p[1], CAGE.h], 0.025, MAT.alu, INK.detail);
          }
          k.rod(pts[3], pts[2], 0.02, MAT.alu, INK.hair);
          if (n[1] === 1) {
            // The door in the front wall, and its sign.
            k.line(
              [
                [-0.35, CD + 0.004, 0],
                [-0.35, CD + 0.004, 1.95],
                [0.35, CD + 0.004, 1.95],
                [0.35, CD + 0.004, 0],
              ],
              INK.detail,
              false,
              MAT.alu.d
            );
            k.dot([0.27, CD + 0.01, 1.0], 1.4, MAT.brass.m, INK.hair);
            k.shape(onY(CD + 0.008, -0.32, 1.62, 0.32, 1.82), PAL.cream, INK.detail);
            k.text([0, CD + 0.012, 1.67], [1, 0, 0], [0, 0, 1], 'NETWORK CORE', 0.075 * k.unit, {
              color: SHEET.ink,
              weight: '800',
            });
          }
        });
      }
      add(
        [
          [-CW + 0.05, -CD + 0.05, 0],
          [CW - 0.05, CD - 0.05, 2.0],
        ],
        () => {
          k.fill(
            [
              [-CW, -CD, 0.004],
              [CW, -CD, 0.004],
              [CW, CD, 0.004],
              [-CW, CD, 0.004],
            ],
            mix(MAT.alu.m, '#ffffff', 0.2)
          );
          coreSwitch(k, -0.7);
          coreSwitch(k, 0.7);
          // Fibre: every colour, looping out of one switch's cards, up over the
          // cage's roof rail, and into the other's.
          for (let i = 0; i < 26; i++) {
            const z0 = 0.2 + hash(i, 1) * 1.1;
            const z1 = 0.2 + hash(i, 2) * 1.1;
            const top = 1.6 + hash(i, 3) * 0.55;
            const y = -0.2 + hash(i, 4) * 0.75;
            cable(
              k,
              [
                [-0.34, 0.56, z0],
                [-0.25 + hash(i, 5) * 0.1, y + 0.1, z0 + 0.2],
                [-0.1, y, top],
                [0.1, y, top + 0.05],
                [0.25 - hash(i, 6) * 0.1, y + 0.1, z1 + 0.2],
                [0.34, 0.56, z1],
              ],
              RAINBOW[i % RAINBOW.length],
              0.8
            );
          }
        }
      );
    });
    // A wire-mesh roof edge, lit along the top.
    k.line(
      [
        [-CW, -CD, CAGE.h],
        [CW, -CD, CAGE.h],
        [CW, CD, CAGE.h],
        [-CW, CD, CAGE.h],
      ],
      INK.panel,
      true,
      MAT.alu.d
    );
  },
};

// ---- the status board ---------------------------------------------------------------

const NOC = { w: 2.3, h: 1.3, z0: 0.72, t: 0.1 } as const;

/** What the board shows: calls a minute, oldest first, and a few numbers under it. */
export interface BoardShows {
  series: readonly number[];
  sessions: number;
  helpers: number;
}

/** The board's numbers from a piece's state, or a quiet floor's. */
function boardOf(state?: PieceState): BoardShows {
  const series = Array.isArray(state?.series) ? (state.series as number[]) : [];
  return {
    series,
    sessions: typeof state?.sessions === 'number' ? state.sessions : 0,
    helpers: typeof state?.helpers === 'number' ? state.helpers : 0,
  };
}

/** The top of a sparkline: a little over the busiest minute, never under ten. */
export function boardScale(series: readonly number[]): number {
  const most = series.reduce((m, v) => Math.max(m, v), 0);
  return Math.max(10, Math.ceil((most * 1.2) / 5) * 5);
}

export const statusBoard: OfficeObject = {
  name: 'Status board',
  blurb:
    'The office upstairs at a glance: tool calls a minute as a scrolling sparkline, like a NOC wall.',
  bounds: box3([-NOC.w / 2 - 0.05, -0.3, 0], [NOC.w / 2 + 0.05, 0.12, NOC.z0 + NOC.h + 0.1]),
  footprint: box3([-NOC.w / 2, -0.25, 0], [NOC.w / 2, 0.06, NOC.z0 + NOC.h]),
  shadow(k) {
    k.castShadow([
      Iso.corners([-NOC.w / 2, -0.05, NOC.z0], [NOC.w / 2, 0.05, NOC.z0 + NOC.h]),
      Iso.corners([-0.7, -0.25, 0], [-0.6, 0.0, NOC.z0]),
      Iso.corners([0.6, -0.25, 0], [0.7, 0.0, NOC.z0]),
    ]);
  },
  draw(k, state) {
    const shows = boardOf(state);
    // Two legs on feet, then the screen in its bezel.
    for (const x of [-0.65, 0.65]) {
      k.box([x - 0.17, -0.25, 0], [x + 0.17, 0.0, 0.04], MAT.graphite, {
        ink: INK.detail,
        rim: false,
      });
      k.box([x - 0.04, -0.12, 0.04], [x + 0.04, -0.04, NOC.z0 + 0.1], MAT.alu, { ink: INK.detail });
    }
    const z0 = NOC.z0;
    const z1 = NOC.z0 + NOC.h;
    k.box([-NOC.w / 2, -0.06, z0], [NOC.w / 2, 0.04, z1], MAT.graphite, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          const y = 0.045;
          const sx0 = -NOC.w / 2 + 0.07;
          const sx1 = NOC.w / 2 - 0.07;
          const sz0 = z0 + 0.07;
          const sz1 = z1 - 0.07;
          k.fill(onY(y, sx0, sz0, sx1, sz1), '#132024');
          const text = (
            x: number,
            z: number,
            str: string,
            size: number,
            color: string,
            align: CanvasTextAlign = 'left'
          ): void =>
            k.text([x, y + 0.002, z], [1, 0, 0], [0, 0, 1], str, size * k.unit, {
              color,
              weight: '800',
              font: FONT.mono,
              align,
            });
          text(sx0 + 0.06, sz1 - 0.11, 'TOOL CALLS / MIN', 0.07, '#8fd6c4');
          const now = shows.series[shows.series.length - 1] ?? 0;
          text(sx1 - 0.06, sz1 - 0.2, String(now), 0.17, ACCENT.ledGreen, 'right');
          text(sx1 - 0.06, sz1 - 0.27, 'this minute', 0.045, '#6f9c92', 'right');
          // The chart: gridlines, the area under the line, and the line.
          const cx0 = sx0 + 0.08;
          const cx1 = sx1 - 0.08;
          const cz0 = sz0 + 0.17;
          const cz1 = sz1 - 0.34;
          const top = boardScale(shows.series);
          for (let i = 0; i <= 4; i++) {
            const z = cz0 + ((cz1 - cz0) * i) / 4;
            k.line(
              [
                [cx0, y + 0.002, z],
                [cx1, y + 0.002, z],
              ],
              INK.hair,
              false,
              '#24403f'
            );
          }
          text(cx0, cz1 + 0.03, String(top), 0.045, '#6f9c92');
          const n = Math.max(2, shows.series.length);
          const pts: V3[] = shows.series.map((v, i) => [
            cx0 + ((cx1 - cx0) * i) / (n - 1),
            y + 0.003,
            cz0 + ((cz1 - cz0) * Math.min(v, top)) / top,
          ]);
          if (pts.length >= 2) {
            k.fill(
              [...pts, [pts[pts.length - 1][0], y + 0.003, cz0], [pts[0][0], y + 0.003, cz0]],
              ACCENT.ledGreen,
              0.18
            );
            k.line(pts, 1.4, false, ACCENT.ledGreen);
            k.dot(pts[pts.length - 1], 1.6, '#c9ffd9');
          }
          text(
            cx0,
            sz0 + 0.05,
            `${shows.sessions} live · ${shows.helpers} helpers`,
            0.06,
            '#8fd6c4'
          );
          text(cx1, sz0 + 0.05, `last ${shows.series.length} min`, 0.05, '#6f9c92', 'right');
        },
      },
    });
  },
};

// ---- on the walls -------------------------------------------------------------------

/** A box hung on the wall behind it (at local y = 0), its front at +y. */
function wallBox(
  k: Iso,
  w: number,
  d: number,
  z0: number,
  z1: number,
  m: Mat,
  front?: () => void
): void {
  k.box([-w / 2, 0, z0], [w / 2, d, z1], m, {
    ink: INK.panel,
    decorate: front ? { '+y': front } : undefined,
  });
}

const FIRE = { w: 0.56, d: 0.09, z0: 1.15, z1: 1.75 } as const;

export const firePanel: OfficeObject = {
  name: 'Fire suppression panel',
  blurb: 'Gas, not water, for a room full of machines: armed, its lights all green.',
  bounds: box3(
    [-FIRE.w / 2 - 0.02, -0.01, FIRE.z0 - 0.02],
    [FIRE.w / 2 + 0.02, FIRE.d + 0.03, FIRE.z1 + 0.02]
  ),
  footprint: box3([-FIRE.w / 2, 0, FIRE.z0], [FIRE.w / 2, FIRE.d, FIRE.z1]),
  shadow() {},
  draw(k) {
    wallBox(k, FIRE.w, FIRE.d, FIRE.z0, FIRE.z1, MAT.tomato, () => {
      const y = FIRE.d + 0.004;
      k.shape(onY(y, -0.22, FIRE.z1 - 0.2, 0.22, FIRE.z1 - 0.05), PAL.cream, INK.detail);
      k.text(
        [0, y + 0.004, FIRE.z1 - 0.115],
        [1, 0, 0],
        [0, 0, 1],
        'FIRE SUPPRESSION',
        0.042 * k.unit,
        {
          color: MAT.tomato.d,
          weight: '800',
        }
      );
      k.text([0, y + 0.004, FIRE.z1 - 0.175], [1, 0, 0], [0, 0, 1], 'ARMED', 0.04 * k.unit, {
        color: SHEET.ink,
        weight: '800',
      });
      for (let i = 0; i < 4; i++) {
        k.dot(
          [-0.15 + i * 0.1, y + 0.006, FIRE.z0 + 0.28],
          1.3,
          i === 3 ? PAL.gold : ACCENT.ledGreen,
          INK.hair
        );
      }
      // The key switch, and the pull handle under its guard.
      k.dot([-0.12, y + 0.006, FIRE.z0 + 0.12], 2.2, MAT.alu.m, INK.detail);
      k.shape(onY(y + 0.01, 0.02, FIRE.z0 + 0.06, 0.2, FIRE.z0 + 0.18), MAT.mustard.m, INK.detail);
    });
  },
};

export const extinguisher: OfficeObject = {
  name: 'Fire extinguisher',
  blurb: 'A CO₂ extinguisher on its stand by the wall, its horn ready.',
  bounds: box3([-0.2, -0.2, 0], [0.2, 0.2, 0.82]),
  footprint: box3([-0.13, -0.13, 0], [0.13, 0.13, 0.75]),
  shadow(k) {
    k.castShadow(Iso.corners([-0.12, -0.12, 0], [0.12, 0.12, 0.72]));
  },
  draw(k) {
    k.box([-0.16, -0.16, 0], [0.16, 0.16, 0.04], MAT.graphite, { ink: INK.detail, rim: false });
    k.cylinder(0, 0, 0.04, 0.62, 0.11, MAT.tomato, INK.panel);
    k.cylinder(0, 0, 0.62, 0.68, 0.05, MAT.graphite, INK.detail);
    k.rod([0, 0, 0.7], [0.1, 0.04, 0.74], 0.018, MAT.graphite, INK.hair);
    k.rod([0, 0, 0.68], [0.05, 0.1, 0.55], 0.015, MAT.rubber, INK.hair);
    k.rod([0.05, 0.1, 0.55], [0.06, 0.13, 0.3], 0.018, MAT.rubber, INK.hair);
    k.text([0, 0.115, 0.32], [1, 0, 0], [0, 0, 1], 'CO₂', 0.06 * k.unit, {
      color: PAL.cream,
      weight: '800',
    });
  },
};

const CART = { w: 0.74, d: 0.5, h: 0.92 } as const;

export const crashCart: OfficeObject = {
  name: 'Crash cart',
  blurb:
    'For when a machine will not answer over the network: a little monitor and a keyboard on wheels.',
  bounds: box3(
    [-CART.w / 2 - 0.04, -CART.d / 2 - 0.04, 0],
    [CART.w / 2 + 0.04, CART.d / 2 + 0.06, CART.h + 0.48]
  ),
  footprint: box3([-CART.w / 2, -CART.d / 2, 0], [CART.w / 2, CART.d / 2, CART.h + 0.42]),
  shadow(k) {
    k.castShadow(Iso.corners([-CART.w / 2, -CART.d / 2, 0.1], [CART.w / 2, CART.d / 2, CART.h]));
  },
  draw(k) {
    const hw = CART.w / 2;
    const hd = CART.d / 2;
    for (const [x, y] of [
      [-hw + 0.06, -hd + 0.06],
      [hw - 0.06, -hd + 0.06],
      [-hw + 0.06, hd - 0.06],
      [hw - 0.06, hd - 0.06],
    ]) {
      k.ball([x, y, 0.05], 0.05, MAT.rubber, INK.detail);
      k.rod([x, y, 0.08], [x, y, CART.h], 0.02, MAT.alu, INK.hair);
    }
    k.slab(-hw, -hd, hw, hd, 0.3, 0.34, 0.03, MAT.graphite, INK.detail);
    // Spare cables coiled on the bottom shelf.
    for (let i = 0; i < 3; i++) {
      cable(
        k,
        [
          [-0.2 + i * 0.15, -0.1, 0.35],
          [-0.1 + i * 0.15, 0.12, 0.42],
          [0.0 + i * 0.15, -0.05, 0.36],
        ],
        RAINBOW[i * 2],
        1
      );
    }
    k.slab(-hw, -hd, hw, hd, CART.h - 0.04, CART.h, 0.03, MAT.graphite, INK.panel);
    // The keyboard, and the little monitor on its arm.
    k.box([-0.24, 0.02, CART.h], [0.2, 0.2, CART.h + 0.025], MAT.charcoal, { ink: INK.detail });
    k.rod([0, -0.12, CART.h], [0, -0.12, CART.h + 0.12], 0.02, MAT.alu, INK.hair);
    k.box([-0.22, -0.16, CART.h + 0.1], [0.22, -0.1, CART.h + 0.42], MAT.graphite, {
      ink: INK.panel,
      decorate: {
        '+y': () => {
          const y = -0.1 + 0.004;
          k.fill(onY(y, -0.19, CART.h + 0.13, 0.19, CART.h + 0.39), '#10201c');
          k.text(
            [-0.17, y + 0.003, CART.h + 0.33],
            [1, 0, 0],
            [0, 0, 1],
            'root@b1:~#',
            0.045 * k.unit,
            {
              color: ACCENT.ledGreen,
              font: FONT.mono,
              weight: '700',
              align: 'left',
            }
          );
          k.text(
            [-0.17, y + 0.003, CART.h + 0.27],
            [1, 0, 0],
            [0, 0, 1],
            'uptime 412d',
            0.04 * k.unit,
            {
              color: '#6f9c92',
              font: FONT.mono,
              weight: '700',
              align: 'left',
            }
          );
          k.fill(onY(y + 0.003, -0.17, CART.h + 0.2, -0.13, CART.h + 0.23), ACCENT.ledGreen);
        },
      },
    });
  },
};

export const stickyNote: OfficeObject = {
  name: 'Sticky note',
  blurb: 'Stuck to a rack in a hurry: do not unplug.',
  bounds: box3([-0.12, -0.01, 1.0], [0.12, 0.04, 1.26]),
  footprint: box3([-0.1, 0, 1.02], [0.1, 0.02, 1.24]),
  shadow() {},
  draw(k) {
    const face: V3[] = [
      [-0.1, 0.012, 1.03],
      [0.1, 0.012, 1.02],
      [0.1, 0.012, 1.22],
      [-0.09, 0.012, 1.24],
    ];
    k.shape(face, '#fbe27a', INK.detail);
    k.fill(
      [
        [-0.09, 0.013, 1.2],
        [0.1, 0.013, 1.19],
        [0.1, 0.013, 1.22],
        [-0.09, 0.013, 1.24],
      ],
      '#f4cf45'
    );
    for (const [line, z] of [
      ['DO NOT', 1.15],
      ['UNPLUG!', 1.09],
    ] as const) {
      k.text([0.005, 0.016, z], [1, 0, 0], [0, 0, 1], line, 0.05 * k.unit, {
        color: '#c23b2b',
        font: FONT.hand,
        weight: '700',
      });
    }
  },
};

export const coffeeMug: OfficeObject = {
  name: 'Forgotten mug',
  blurb: 'Someone’s coffee, left on top of a rack and long gone cold.',
  bounds: box3([-0.09, -0.07, 0], [0.1, 0.07, 0.14]),
  footprint: box3([-0.06, -0.06, 0], [0.06, 0.06, 0.12]),
  shadow(k) {
    k.castShadow(Iso.corners([-0.05, -0.05, 0], [0.05, 0.05, 0.11]));
  },
  draw(k) {
    k.rod([0.05, 0, 0.085], [0.085, 0, 0.06], 0.012, MAT.tomato, INK.hair);
    k.rod([0.085, 0, 0.06], [0.05, 0, 0.03], 0.012, MAT.tomato, INK.hair);
    k.cylinder(0, 0, 0, 0.11, 0.052, MAT.tomato, INK.panel);
    k.fill(
      Array.from({ length: 12 }, (_, i): V3 => {
        const a = (i / 12) * Math.PI * 2;
        return [Math.cos(a) * 0.042, Math.sin(a) * 0.042, 0.1];
      }),
      '#5b3a26'
    );
  },
};

// ---- the thermometer ------------------------------------------------------------------

const DIAL = { r: 0.17, z: 1.55, d: 0.06 } as const;
/** The dial's range, in degrees: what the needle sweeps from and to. */
export const DIAL_RANGE = { lo: 14, hi: 26 } as const;

/** The needle's angle for a temperature: straight up at the middle of the range, ±130°. */
export function needleAngle(celsius: number): number {
  const t =
    (Math.min(DIAL_RANGE.hi, Math.max(DIAL_RANGE.lo, celsius)) - DIAL_RANGE.lo) /
    (DIAL_RANGE.hi - DIAL_RANGE.lo);
  return ((-130 + 260 * t) * Math.PI) / 180;
}

export const thermometer: OfficeObject = {
  name: 'Wall thermometer',
  blurb:
    'A brass dial by the air handlers: the floor’s temperature, warming a little through the day outside.',
  bounds: box3(
    [-DIAL.r - 0.04, -0.01, DIAL.z - DIAL.r - 0.12],
    [DIAL.r + 0.04, DIAL.d + 0.04, DIAL.z + DIAL.r + 0.04]
  ),
  footprint: box3([-DIAL.r, 0, DIAL.z - DIAL.r], [DIAL.r, DIAL.d, DIAL.z + DIAL.r]),
  shadow() {},
  draw(k, state) {
    const celsius = typeof state?.celsius === 'number' ? state.celsius : 18;
    const y: number = DIAL.d;
    const ring = (r: number, at = y): V3[] =>
      Array.from({ length: 28 }, (_, i): V3 => {
        const a = (i / 28) * Math.PI * 2;
        return [Math.cos(a) * r, at, DIAL.z + Math.sin(a) * r];
      });
    k.prism(
      Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2;
        return [Math.cos(a) * DIAL.r, DIAL.z + Math.sin(a) * DIAL.r] as [number, number];
      }),
      'y',
      0,
      y,
      MAT.brass,
      { ink: INK.panel }
    );
    k.shape(ring(DIAL.r - 0.025, y + 0.003), PAL.cream, INK.detail);
    for (let c = DIAL_RANGE.lo; c <= DIAL_RANGE.hi; c += 1) {
      const a = needleAngle(c);
      const long = c % 2 === 0;
      const r0 = DIAL.r - (long ? 0.065 : 0.05);
      const r1 = DIAL.r - 0.035;
      k.line(
        [
          [Math.sin(a) * r0, y + 0.005, DIAL.z + Math.cos(a) * r0],
          [Math.sin(a) * r1, y + 0.005, DIAL.z + Math.cos(a) * r1],
        ],
        long ? 0.9 : 0.5,
        false,
        c >= 22 ? MAT.tomato.d : SHEET.ink
      );
    }
    k.text(
      [0, y + 0.006, DIAL.z - 0.09],
      [1, 0, 0],
      [0, 0, 1],
      `${celsius.toFixed(1)}°C`,
      0.045 * k.unit,
      {
        color: SHEET.ink,
        weight: '800',
        font: FONT.mono,
      }
    );
    const a = needleAngle(celsius);
    k.line(
      [
        [-Math.sin(a) * 0.03, y + 0.008, DIAL.z - Math.cos(a) * 0.03],
        [Math.sin(a) * (DIAL.r - 0.05), y + 0.008, DIAL.z + Math.cos(a) * (DIAL.r - 0.05)],
      ],
      1.3,
      false,
      MAT.tomato.d
    );
    k.dot([0, y + 0.01, DIAL.z], 1.6, MAT.brass.d, INK.hair);
  },
};

// ---- the emergency power off button -----------------------------------------------

const EPO = { w: 0.36, z0: 1.05, z1: 1.45, d: 0.05 } as const;
/** How far the clear cover lifts open, in degrees. */
const COVER_OPEN = 110;

export const epoButton: OfficeObject = {
  name: 'Emergency power off',
  blurb: 'The big red button under its flip cover. Pressing it only dims the lights, mercifully.',
  bounds: box3([-EPO.w / 2 - 0.04, -0.01, EPO.z0 - 0.12], [EPO.w / 2 + 0.04, 0.34, EPO.z1 + 0.32]),
  footprint: box3([-EPO.w / 2, 0, EPO.z0], [EPO.w / 2, EPO.d, EPO.z1]),
  shadow() {},
  draw(k, state) {
    const cover = frac(state, 'cover', 0);
    const pressed = frac(state, 'pressed', 0);
    wallBox(k, EPO.w, EPO.d, EPO.z0, EPO.z1, MAT.mustard, () => {
      const y = EPO.d + 0.003;
      // Hazard stripes round the edge.
      for (let i = 0; i < 8; i++) {
        const x = -EPO.w / 2 + i * (EPO.w / 8);
        k.fill(
          [
            [x, y, EPO.z0],
            [x + 0.025, y, EPO.z0],
            [x + 0.045, y, EPO.z0 + 0.04],
            [x + 0.02, y, EPO.z0 + 0.04],
          ],
          SHEET.ink
        );
      }
      k.text([0, y + 0.004, EPO.z1 - 0.07], [1, 0, 0], [0, 0, 1], 'EMERGENCY', 0.04 * k.unit, {
        color: SHEET.ink,
        weight: '800',
      });
      k.text([0, y + 0.004, EPO.z0 + 0.06], [1, 0, 0], [0, 0, 1], 'POWER OFF', 0.04 * k.unit, {
        color: SHEET.ink,
        weight: '800',
      });
    });
    // The mushroom button, pushed in a little while pressed.
    const out = EPO.d + 0.06 - pressed * 0.035;
    const zc = (EPO.z0 + EPO.z1) / 2;
    k.rod([0, EPO.d, zc], [0, out, zc], 0.07, MAT.tomato, INK.panel);
    k.ball([0, out, zc], 0.06, MAT.tomato, INK.detail);
    // The clear cover, hinged along the top, lifted `cover` of the way.
    const a = (COVER_OPEN * cover * Math.PI) / 180;
    const hingeZ = EPO.z1 - 0.02;
    const len = EPO.z1 - EPO.z0 - 0.04;
    const at = (x: number, t: number, o: number): V3 => [
      x,
      EPO.d + 0.11 * (1 - t) * Math.cos(a) + o + Math.sin(a) * len * t,
      hingeZ - Math.cos(a) * len * t,
    ];
    const pane: V3[] = [
      at(-EPO.w / 2 + 0.03, 0, 0),
      at(EPO.w / 2 - 0.03, 0, 0),
      at(EPO.w / 2 - 0.03, 1, 0),
      at(-EPO.w / 2 + 0.03, 1, 0),
    ];
    k.fill(pane, MAT.glass.l, 0.35);
    k.line(pane, INK.detail, true, mix(MAT.glass.d, SHEET.line, 0.3));
  },
};

// ---- the maintenance robot ------------------------------------------------------------

const BOT = { w: 0.5, d: 0.42, h: 0.62 } as const;

export const maintenanceBot: OfficeObject = {
  name: 'Maintenance robot',
  blurb:
    'Rolls the cold aisles on its rounds, stopping to swap a drive, and comes running when a rack smokes.',
  bounds: box3(
    [-BOT.w / 2 - 0.05, -BOT.d / 2 - 0.05, 0],
    [BOT.w / 2 + 0.05, BOT.d / 2 + 0.4, BOT.h + 0.35]
  ),
  footprint: box3([-BOT.w / 2, -BOT.d / 2, 0], [BOT.w / 2, BOT.d / 2, BOT.h]),
  motions: [
    {
      frames: 4,
      fps: 3,
      draw(k, frame) {
        k.dot(
          [0, 0, BOT.h + 0.28],
          frame % 2 === 0 ? 2.6 : 1.6,
          frame % 2 === 0 ? PAL.gold : MAT.mustard.d,
          INK.hair
        );
      },
    },
  ],
  shadow(k) {
    k.castShadow(Iso.corners([-BOT.w / 2, -BOT.d / 2, 0], [BOT.w / 2, BOT.d / 2, BOT.h]));
  },
  draw(k, state) {
    const reach = frac(state, 'reach', 0);
    for (const x of [-BOT.w / 2 + 0.05, BOT.w / 2 - 0.05]) {
      for (const y of [-BOT.d / 2 + 0.06, BOT.d / 2 - 0.06]) {
        k.ball([x, y, 0.055], 0.055, MAT.rubber, INK.detail);
      }
    }
    k.slab(
      -BOT.w / 2,
      -BOT.d / 2,
      BOT.w / 2,
      BOT.d / 2,
      0.06,
      BOT.h,
      0.08,
      MAT.mint,
      INK.silhouette
    );
    k.box([-0.16, BOT.d / 2 - 0.02, 0.32], [0.16, BOT.d / 2 + 0.005, 0.52], MAT.graphite, {
      ink: INK.detail,
      decorate: {
        '+y': () => {
          // Its face: two little eyes on a screen.
          k.dot([-0.06, BOT.d / 2 + 0.01, 0.43], 1.5, ACCENT.ledGreen);
          k.dot([0.06, BOT.d / 2 + 0.01, 0.43], 1.5, ACCENT.ledGreen);
        },
      },
    });
    k.rod([0, 0, BOT.h], [0, 0, BOT.h + 0.25], 0.015, MAT.alu, INK.hair);
    // A spare drive in its tray on top, and the arm that reaches out with it.
    k.box([-0.18, -0.15, BOT.h], [-0.02, 0.05, BOT.h + 0.05], MAT.machine, { ink: INK.detail });
    const tip: V3 = [0.12, BOT.d / 2 + 0.05 + reach * 0.3, 0.5 + reach * 0.45];
    k.rod([0.12, 0.05, BOT.h], [0.12, 0.08, BOT.h + 0.12], 0.022, MAT.alu, INK.hair);
    k.rod([0.12, 0.08, BOT.h + 0.12], tip, 0.02, MAT.alu, INK.hair);
    k.box(
      [tip[0] - 0.05, tip[1] - 0.02, tip[2] - 0.03],
      [tip[0] + 0.05, tip[1] + 0.03, tip[2] + 0.03],
      MAT.mustard,
      {
        ink: INK.detail,
      }
    );
  },
};
