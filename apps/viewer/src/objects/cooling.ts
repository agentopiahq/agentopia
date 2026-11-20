import { INK, Iso, V3 } from '../kit/iso';
import { ACCENT, MAT, Mat, SHEET, mix } from '../kit/palette';
import { FAN_FPS, FAN_FRAMES, FanFace, fanBlades, fanHousing } from './fan';
import { RACK } from './serverRack';
import { OfficeObject, box3 } from './types';

/**
 * The server floor's cooling: big air handlers along the back wall, and slim
 * coolers at the end of every run of racks, each with fans that spin (as
 * `motions`) behind their guards.
 */

/** Cream enamel with a cool cast: the air handlers' panels. */
const ENAMEL: Mat = { l: '#f6f7f1', m: '#dfe3dc', d: '#aab3ab' };

/** A rectangle on the plane y, from x0..x1 and z0..z1. */
const onY = (y: number, x0: number, z0: number, x1: number, z1: number): V3[] => [
  [x0, y, z0],
  [x1, y, z0],
  [x1, y, z1],
  [x0, y, z1],
];

/** A little readout: a lit panel with a snowflake and the temperature it holds. */
function readout(
  k: Iso,
  y: number,
  x: number,
  z: number,
  w: number,
  s: 1 | -1,
  text: string
): void {
  const panel = onY(y + s * 0.006, x - w / 2, z - 0.06, x + w / 2, z + 0.06);
  k.shape(panel, mix(ACCENT.lcd, '#1d4a40', 0.75), INK.detail);
  k.text([x + s * 0.02, y + s * 0.01, z - 0.03], [s, 0, 0], [0, 0, 1], text, 0.075 * k.unit, {
    color: ACCENT.lcd,
    weight: '800',
  });
  // A snowflake: three crossed strokes.
  const c: V3 = [x - s * (w / 2 - 0.045), y + s * 0.01, z];
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    const dx = Math.cos(a) * 0.028;
    const dz = Math.sin(a) * 0.028;
    k.line(
      [
        [c[0] - dx * s, c[1], c[2] - dz],
        [c[0] + dx * s, c[1], c[2] + dz],
      ],
      0.6,
      false,
      ACCENT.lcd
    );
  }
}

// ---- the air handler -------------------------------------------------------------

/** The air handler's size, in tiles. */
const AH = { w: 1.5, d: 0.85, h: 2.2 } as const;
/** Its two big fans, side by side up top, and how big. */
const AH_FANS: V3[] = [
  [-0.36, AH.d / 2, 1.5],
  [0.36, AH.d / 2, 1.5],
];
const AH_FAN_R = 0.28;

/**
 * A computer-room air handler against the back wall: a tall cream cabinet
 * with two big fans behind their guards up top, a readout holding the room at
 * eighteen degrees, and louvres below where the cold air comes out.
 * Local frame: origin at the middle of its base, front (+y) to the room.
 */
export const airHandler: OfficeObject = {
  name: 'Air handler',
  blurb: 'Keeps the server floor cold: two big fans, louvres, and the room held at 18°.',
  bounds: box3([-AH.w / 2 - 0.02, -AH.d / 2, 0], [AH.w / 2 + 0.02, AH.d / 2 + 0.06, AH.h + 0.04]),
  footprint: box3([-AH.w / 2, -AH.d / 2, 0], [AH.w / 2, AH.d / 2, AH.h]),
  motions: [
    {
      frames: FAN_FRAMES,
      fps: FAN_FPS,
      draw(k, frame) {
        for (const c of AH_FANS) {
          fanBlades(k, [c[0], c[1] + 0.006, c[2]], '+y', AH_FAN_R, frame, MAT.cobalt, MAT.alu);
        }
      },
    },
  ],

  shadow(k) {
    k.castShadow(Iso.corners([-AH.w / 2, -AH.d / 2, 0], [AH.w / 2, AH.d / 2, AH.h]));
  },

  draw(k) {
    const { w, d, h } = AH;
    const hw = w / 2;
    const y = d / 2;
    k.box([-hw + 0.04, -y + 0.04, 0], [hw - 0.04, y - 0.04, 0.08], MAT.graphite, {
      ink: INK.detail,
      rim: false,
    });
    k.box([-hw, -y, 0.08], [hw, y, h], ENAMEL, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          // Two doors' seams, and a cool blue band along the top.
          k.line(
            [
              [0, y + 0.002, 0.12],
              [0, y + 0.002, h - 0.24],
            ],
            INK.detail,
            false
          );
          k.lit(onY(y + 0.003, -hw, h - 0.2, hw, h - 0.06), [0, 1, 0], MAT.cobalt);
          k.line(onY(y + 0.003, -hw, h - 0.2, hw, h - 0.06), INK.hair, true);
          k.text(
            [-hw + 0.08, y + 0.006, h - 0.165],
            [1, 0, 0],
            [0, 0, 1],
            'COOL AIR',
            0.085 * k.unit,
            {
              color: SHEET.paper,
              weight: '800',
              align: 'left',
            }
          );
          for (const c of AH_FANS) {
            fanHousing(k, c, '+y', AH_FAN_R, MAT.alu);
          }
          readout(k, y, 0, 1.05, 0.42, 1, '18°');
          // Louvres: a stack of slats, each lit along its top lip.
          for (let i = 0; i < 9; i++) {
            const z = 0.22 + i * 0.075;
            for (const [x0, x1] of [
              [-hw + 0.08, -0.04],
              [0.04, hw - 0.08],
            ]) {
              k.fill(onY(y + 0.004, x0, z, x1, z + 0.045), mix(ENAMEL.d, '#000000', 0.18));
              k.line(
                [
                  [x0, y + 0.005, z + 0.045],
                  [x1, y + 0.005, z + 0.045],
                ],
                0.6,
                false,
                mix(ENAMEL.l, '#ffffff', 0.5)
              );
            }
          }
          // A pull on each door.
          for (const x of [-0.08, 0.08]) {
            k.box([x - 0.012, y, 0.95], [x + 0.012, y + 0.03, 1.15], MAT.alu, { ink: INK.detail });
          }
        },
        '+z': () => {
          // The intake grille on top, where the hot air is drawn back in.
          for (let i = 0; i < 8; i++) {
            const yy = -y + 0.1 + i * 0.085;
            k.line(
              [
                [-hw + 0.1, yy, h + 0.002],
                [hw - 0.1, yy, h + 0.002],
              ],
              0.7,
              false,
              mix(ENAMEL.d, '#000000', 0.2)
            );
          }
        },
      },
    });
  },
};

// ---- the in-row cooler ------------------------------------------------------------

/** The in-row cooler's size: as deep and tall as a rack, but slim. */
export const COOLER = { w: 0.5, d: RACK.d, h: RACK.h } as const;
const CW = COOLER.w / 2;
const CD = COOLER.d / 2;
/** Its three fans, stacked up each face. */
const COOLER_FAN_Z = [0.55, 1.05, 1.55];
const COOLER_FAN_R = 0.17;

/** The cooler's steel, a cool mint against the racks' graphite. */
const COOLER_MAT: Mat = { l: '#bfe3d6', m: '#93c9b6', d: '#5f9784' };

/** One face of the cooler: a fan stack behind a grille, a readout over it. */
function coolerFace(k: Iso, face: FanFace): void {
  const s = face === '+y' ? 1 : -1;
  const y = s * CD;
  const panel = onY(y + s * 0.002, -CW + 0.04, 0.16, CW - 0.04, COOLER.h - 0.06);
  k.fill(panel, mix(COOLER_MAT.d, '#000000', 0.15));
  k.line(panel, INK.detail, true);
  for (const z of COOLER_FAN_Z) {
    fanHousing(k, [0, y, z], face, COOLER_FAN_R, COOLER_MAT);
  }
  if (face === '+y') {
    readout(k, y, 0, COOLER.h - 0.2, 0.34, 1, '18°');
  } else {
    // The warm side: an amber readout, the air it takes in.
    const panel2 = onY(y - 0.006, -0.17, COOLER.h - 0.26, 0.17, COOLER.h - 0.14);
    k.shape(panel2, mix(MAT.mustard.d, '#3a2a10', 0.6), INK.detail);
    k.text([0, y - 0.01, COOLER.h - 0.23], [-1, 0, 0], [0, 0, 1], '35°', 0.075 * k.unit, {
      color: MAT.mustard.l,
      weight: '800',
    });
  }
}

/**
 * An in-row cooler, closing a run of racks: slim and mint, three fans up its
 * front blowing cold air into the cold aisle and three up its back drawing
 * the hot aisle's air in. Local frame: origin at the middle of its base,
 * front (+y) to the cold aisle, like a rack's.
 */
export const inRowCooler: OfficeObject = {
  name: 'In-row cooler',
  blurb: 'Closes each run of racks: cold air out of the front, the hot aisle drawn in at the back.',
  bounds: box3([-CW - 0.01, -CD - 0.04, 0], [CW + 0.01, CD + 0.04, COOLER.h + 0.02]),
  footprint: box3([-CW, -CD, 0], [CW, CD, COOLER.h]),
  motions: [
    {
      frames: FAN_FRAMES,
      fps: FAN_FPS,
      draw(k, frame) {
        for (const face of ['+y', '-y'] as const) {
          const y = (face === '+y' ? 1 : -1) * (CD + 0.006);
          for (const z of COOLER_FAN_Z) {
            fanBlades(k, [0, y, z], face, COOLER_FAN_R, frame, MAT.graphite, COOLER_MAT);
          }
        }
      },
    },
  ],

  shadow(k) {
    k.castShadow(Iso.corners([-CW, -CD, 0], [CW, CD, COOLER.h]));
  },

  draw(k) {
    k.box([-CW + 0.03, -CD + 0.03, 0], [CW - 0.03, CD - 0.03, 0.07], MAT.graphite, {
      ink: INK.detail,
      rim: false,
    });
    k.box([-CW, -CD, 0.07], [CW, CD, COOLER.h], COOLER_MAT, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => coolerFace(k, '+y'),
        '-y': () => coolerFace(k, '-y'),
        '+x': () => coolerSide(k, 1),
        '-x': () => coolerSide(k, -1),
      },
    });
  },
};

/** A cooler's side: a big snowflake decal on a pressed panel. */
function coolerSide(k: Iso, s: 1 | -1): void {
  const x = s * (CW + 0.003);
  k.line(
    [
      [x, -CD + 0.08, 0.2],
      [x, CD - 0.08, 0.2],
      [x, CD - 0.08, COOLER.h - 0.1],
      [x, -CD + 0.08, COOLER.h - 0.1],
    ],
    INK.hair,
    true,
    mix(COOLER_MAT.d, '#000000', 0.2)
  );
  const c: V3 = [x, 0, 1.15];
  const r = 0.22;
  const ink = mix(COOLER_MAT.l, '#ffffff', 0.55);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 2;
    const dy = Math.cos(a) * r;
    const dz = Math.sin(a) * r;
    k.line(
      [
        [x, c[1] - dy, c[2] - dz],
        [x, c[1] + dy, c[2] + dz],
      ],
      1.6,
      false,
      ink
    );
    for (const t of [-1, 1]) {
      // A little fork at each arm's end.
      const ey = c[1] + t * dy * 0.75;
      const ez = c[2] + t * dz * 0.75;
      const fa = a + Math.PI / 2;
      k.line(
        [
          [x, ey - Math.cos(fa) * 0.05 + t * dy * 0.15, ez - Math.sin(fa) * 0.05 + t * dz * 0.15],
          [x, ey, ez],
          [x, ey + Math.cos(fa) * 0.05 + t * dy * 0.15, ez + Math.sin(fa) * 0.05 + t * dz * 0.15],
        ],
        1.1,
        false,
        ink
      );
    }
  }
}
