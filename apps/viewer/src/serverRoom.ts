import { FURNITURE } from '@agentopia/core';

import { FONT, INK, Iso, V2, V3 } from './kit/iso';
import { MAT, Mat, SHEET, mix } from './kit/palette';
import { OBJECTS, ObjectName } from './objects';
import { Placement } from './objects/bake';
import { RUN_RACKS } from './objects/cableTray';
import { COOLER } from './objects/cooling';
import { RACK } from './objects/serverRack';
import {
  Block,
  FLOOR,
  MarginLabel,
  SHADOW_SOFTNESS,
  SHEET_H,
  SHEET_W,
  WALL,
  WALL_X,
  WALL_Y,
  WallSide,
  drawLabel,
  drawWallFoot,
  drawWalls,
  letter,
  paperAt,
  sheetPen,
  wallAlpha,
} from './room';
import { styled } from './styles/context';

/**
 * The server floor, one floor under the office, as its own Tinycharts sheet:
 * the same paper, the same slab and walls, laid out for machines instead of
 * people. Six rows of racks, two runs to a row with a cross aisle between,
 * fronts facing fronts across the cold aisles and backs facing backs across
 * the hot ones; a slim cooler closing every run at the cross aisle; a yellow
 * cable tray riding over every run; big air handlers along the back wall;
 * and the stairwell door where the office's door is, upstairs.
 *
 * The floor is a raised floor of square tiles, perforated in the cold aisles,
 * and its cut shows the plenum under it: pedestals, cable trunks and the
 * cold air. It is scenery only: no one works down here yet, so nothing in
 * core knows about it, and its layout lives here.
 */

/** A piece of the server floor, and its own beat for its moving parts. */
export interface FloorPiece {
  name: ObjectName;
  place: Placement;
  /** Offsets where its motions' loops start, so no two racks blink together. */
  phase: number;
}

/** The rows of racks: each one's middle along y, and which way its fronts face. */
export const RACK_ROWS: ReadonlyArray<{ y: number; facing: '+y' | '-y' }> = [
  { y: 3.8, facing: '+y' },
  { y: 6.8, facing: '-y' },
  { y: 9.6, facing: '+y' },
  { y: 12.6, facing: '-y' },
  { y: 15.4, facing: '+y' },
  { y: 18.4, facing: '-y' },
];

/** Each row's two runs: where the racks start along x, and which end the cooler closes. */
const RUNS: ReadonlyArray<{ x0: number; cooler: 'end' | 'start' }> = [
  // Left of the cross aisle, its cooler at the aisle.
  { x0: 3.2, cooler: 'end' },
  // Right of it, its cooler first, at the aisle.
  { x0: 12.6, cooler: 'start' },
];

/** The aisles between the rows, by kind: cold where fronts face, hot where backs do. */
export const AISLES: ReadonlyArray<{ y0: number; y1: number; kind: 'cold' | 'hot' }> = (() => {
  const out: Array<{ y0: number; y1: number; kind: 'cold' | 'hot' }> = [];
  for (let i = 0; i < RACK_ROWS.length - 1; i++) {
    const a = RACK_ROWS[i];
    const b = RACK_ROWS[i + 1];
    out.push({
      y0: a.y + RACK.d / 2,
      y1: b.y - RACK.d / 2,
      kind: a.facing === '+y' ? 'cold' : 'hot',
    });
  }
  return out;
})();

/** A small deterministic hash in [0, 1): which rack stands where. */
function pick(a: number, b: number): number {
  let h = (Math.imul(a + 17, 0x9e3779b1) ^ Math.imul(b + 5, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The racks' object names, most of them compute. */
const RACK_NAMES: ObjectName[] = [
  'serverRack',
  'serverRack',
  'serverRackStorage',
  'serverRackNetwork',
  'serverRackGpu',
  'serverRackMixed',
  'serverRackMixed',
  'serverRackSparse',
];

/** Where the office's door is, upstairs: the stairwell comes down to the same spot. */
const DOOR_X = FURNITURE.find((piece) => piece.kind === 'door')?.at.x ?? 12.7;

/** The air handlers along the back wall, either side of the cross aisle. */
const AIR_HANDLERS: V2[] = [
  [3.0, WALL_Y + 0.5],
  [6.6, WALL_Y + 0.5],
  [15.4, WALL_Y + 0.5],
  [19.0, WALL_Y + 0.5],
];

function layout(): FloorPiece[] {
  const out: FloorPiece[] = [];
  let n = 0;
  RACK_ROWS.forEach((row, r) => {
    RUNS.forEach((run, side) => {
      const racks0 = run.cooler === 'start' ? run.x0 + COOLER.w : run.x0;
      for (let i = 0; i < RUN_RACKS; i++) {
        const name = RACK_NAMES[Math.floor(pick(r * 2 + side, i) * RACK_NAMES.length)];
        out.push({
          name,
          place: { at: [racks0 + (i + 0.5) * RACK.w, row.y, 0], facing: row.facing },
          phase: n++,
        });
      }
      const coolerX =
        run.cooler === 'start' ? run.x0 + COOLER.w / 2 : racks0 + RUN_RACKS * RACK.w + COOLER.w / 2;
      out.push({
        name: 'inRowCooler',
        place: { at: [coolerX, row.y, 0], facing: row.facing },
        phase: n++,
      });
      out.push({
        name: 'cableTray',
        place: { at: [racks0 + (RUN_RACKS * RACK.w) / 2, row.y, 0], facing: row.facing },
        phase: n++,
      });
    });
  });
  for (const [x, y] of AIR_HANDLERS) {
    out.push({ name: 'airHandler', place: { at: [x, y, 0], facing: '+y' }, phase: n++ });
  }
  // The stairwell door, in the near wall where the office's door is upstairs.
  out.push({
    name: 'door',
    place: { at: [DOOR_X, FLOOR.y1 - WALL.t / 2, 0], facing: '+y' },
    phase: n++,
  });
  return out;
}

/** Everything that stands on the server floor. */
export const SERVER_PIECES: readonly FloorPiece[] = layout();

/** How many racks the floor holds. */
export const RACK_COUNT = SERVER_PIECES.filter((piece) =>
  piece.name.startsWith('serverRack')
).length;

// ---- the sheet -------------------------------------------------------------------

/** The walls' paint down here: a cool sage on the feature wall, cream elsewhere. */
const PAINT: Record<WallSide, Mat> = {
  '-y': { l: '#d6e3da', m: '#bfd1c4', d: '#94ab9b' },
  '-x': MAT.paint,
  '+x': MAT.paint,
  '+y': MAT.paint,
};

/** A raised floor tile is this big, and the floor under it is this deep. */
const FLOOR_TILE = 1;
const TILE_TOP = 0.06;
const PLENUM = 0.38;

/** The floor tiles' colours: warm grey, a cool perforated blue, and a warmer hot-aisle cast. */
const TILE_PLAIN = '#ece7da';
const TILE_COLD = '#d9e6ec';
const TILE_HOT = '#f2e2d6';
const GROUT = '#cbc3b1';

/** Which aisle a floor point is in, if any. */
function aisleAt(y: number, x: number): 'cold' | 'hot' | null {
  // Only between the runs' ends: the side passages and the cross aisle are plain.
  if (x < 3.2 || x > 19.2) {
    return null;
  }
  for (const aisle of AISLES) {
    if (y >= aisle.y0 - 1e-6 && y <= aisle.y1 + 1e-6) {
      return aisle.kind;
    }
  }
  return null;
}

/** The slab: raised floor tiles on top, the plenum under them, the concrete under that. */
function drawSlab(k: Iso): void {
  const { x0, y0, x1, y1, depth } = FLOOR;
  k.place([0, 0, 0]);
  const top: V3[] = [
    [x0, y0, 0],
    [x1, y0, 0],
    [x1, y1, 0],
    [x0, y1, 0],
  ];
  const cuts: Array<[V3, V3, V3]> = [
    [
      [1, 0, 0],
      [x1, y0, 0],
      [x1, y1, 0],
    ],
    [
      [0, 1, 0],
      [x1, y1, 0],
      [x0, y1, 0],
    ],
    [
      [-1, 0, 0],
      [x0, y1, 0],
      [x0, y0, 0],
    ],
    [
      [0, -1, 0],
      [x0, y0, 0],
      [x1, y0, 0],
    ],
  ];
  let seed = 4111;
  const next = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const outline: V3[] = [...top];
  for (const [n, a, b] of cuts) {
    if (!k.facing(n)) {
      continue;
    }
    const down = (p: V3, z: number): V3 => [p[0], p[1], z];
    const along = (t: number, z: number): V3 => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      z,
    ];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const zTiles = -TILE_TOP;
    const zFloor = -(TILE_TOP + PLENUM);
    // The concrete, under all of it.
    k.fill(
      [down(a, zFloor), down(b, zFloor), down(b, -depth), down(a, -depth)],
      k.tone(n, MAT.board)
    );
    for (let i = 0; i < 40; i++) {
      const p = along(next(), zFloor - 0.08 - next() * (depth + zFloor - 0.16));
      k.dot(p, 0.6 + next() * 0.8, mix(MAT.board.d, '#000000', 0.12));
    }
    // The plenum: a dark cool void, pedestals holding the tiles up, and cable trunks.
    k.fill(
      [down(a, zTiles), down(b, zTiles), down(b, zFloor), down(a, zFloor)],
      k.tone(n, {
        l: '#5b6670',
        m: '#46505a',
        d: '#323a42',
      })
    );
    // A breath of cold air along it.
    k.fill(
      [
        down(a, zTiles - 0.04),
        down(b, zTiles - 0.04),
        down(b, zTiles - 0.12),
        down(a, zTiles - 0.12),
      ],
      '#a9d6ee',
      0.18
    );
    const steps = Math.round(len / FLOOR_TILE);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const foot = along(t, zFloor);
      const head = along(t, zTiles);
      k.rod(foot, head, 0.025, MAT.alu, INK.hair);
      k.fill(
        [
          along(t - 0.012, zFloor),
          along(t + 0.012, zFloor),
          along(t + 0.012, zFloor + 0.025),
          along(t - 0.012, zFloor + 0.025),
        ],
        MAT.alu.d
      );
    }
    // Cable trunks lying in the plenum: round bundles, end on.
    for (let i = 0; i < steps; i++) {
      if (next() < 0.45) {
        continue;
      }
      const t = (i + 0.3 + next() * 0.4) / steps;
      const colors = [MAT.cobalt, MAT.mustard, MAT.tomato, MAT.mint];
      for (let j = 0; j < 3; j++) {
        const c = along(t + (j - 1) * 0.006, zFloor + 0.06 + (j % 2) * 0.05);
        k.ball(c, 0.035, colors[(i + j) % colors.length], INK.hair);
      }
    }
    // The tiles' own thickness, on top.
    k.fill(
      [a, b, down(b, zTiles), down(a, zTiles)],
      k.tone(n, { l: '#f3efe4', m: '#dcd5c4', d: '#b4ab97' })
    );
    k.line([down(a, zTiles), down(b, zTiles)], INK.detail);
    k.line([down(a, zFloor), down(b, zFloor)], INK.detail);
    for (let i = 0; i <= steps; i++) {
      k.line([along(i / steps, 0), along(i / steps, zTiles)], INK.hair, false, GROUT);
    }
    outline.push(down(a, -depth), down(b, -depth));
  }
  drawTiles(k);
  k.inkScreen(
    top.map((p) => k.P(p)),
    INK.panel
  );
  k.silhouette(outline, INK.silhouette);
}

/** The raised floor: square tiles, perforated where the cold air comes up. */
function drawTiles(k: Iso): void {
  const { x0, y0, x1, y1 } = FLOOR;
  for (let y = y0; y < y1 - 1e-6; y += FLOOR_TILE) {
    for (let x = x0; x < x1 - 1e-6; x += FLOOR_TILE) {
      const xb = Math.min(x1, x + FLOOR_TILE);
      const yb = Math.min(y1, y + FLOOR_TILE);
      const kind = aisleAt((y + yb) / 2, (x + xb) / 2);
      const tone = kind === 'cold' ? TILE_COLD : kind === 'hot' ? TILE_HOT : TILE_PLAIN;
      const quad: V3[] = [
        [x, y, 0],
        [xb, y, 0],
        [xb, yb, 0],
        [x, yb, 0],
      ];
      k.fill(quad, k.grade(quad, [0, 0, 1], tone));
      if (kind === 'cold') {
        // The perforations: a grid of little holes.
        for (let i = 1; i < 6; i++) {
          for (let j = 1; j < 6; j++) {
            k.dot(
              [x + (i / 6) * (xb - x), y + (j / 6) * (yb - y), 0.002],
              0.55,
              mix(TILE_COLD, '#40607a', 0.45)
            );
          }
        }
      }
    }
  }
  for (let y = y0; y <= y1 + 1e-6; y += FLOOR_TILE) {
    k.line(
      [
        [x0, Math.min(y, y1), 0.001],
        [x1, Math.min(y, y1), 0.001],
      ],
      INK.hair,
      false,
      GROUT
    );
  }
  for (let x = x0; x <= x1 + 1e-6; x += FLOOR_TILE) {
    k.line(
      [
        [Math.min(x, x1), y0, 0.001],
        [Math.min(x, x1), y1, 0.001],
      ],
      INK.hair,
      false,
      GROUT
    );
  }
}

/** The aisles' names, stencilled on the floor at the end of each. */
function drawStencils(k: Iso): void {
  k.place([0, 0, 0]);
  for (const aisle of AISLES) {
    const y = (aisle.y0 + aisle.y1) / 2;
    const cold = aisle.kind === 'cold';
    const color = cold ? '#5f8fb8' : '#d0745a';
    const text = cold ? 'COLD AISLE' : 'HOT AISLE';
    // Reading along x, the right way up from the home view.
    for (const x of [1.9, 20.3]) {
      k.text([x, y + 0.14, 0.004], [1, 0, 0], [0, -1, 0], text, 0.28 * k.unit, {
        color: mix(color, '#ffffff', 0.15),
        weight: '800',
        font: FONT.mono,
      });
    }
    // Arrows along the aisle: which way the air goes.
    for (const x of [0.95, 21.25]) {
      const dir = cold ? 1 : -1;
      k.fill(
        [
          [x - 0.12, y - 0.18 * dir, 0.004],
          [x + 0.12, y - 0.18 * dir, 0.004],
          [x, y + 0.2 * dir, 0.004],
        ],
        color,
        0.75
      );
    }
  }
}

/** The signs on the walls: the floor's name by the stairs' end, and a reminder to keep it cool. */
function drawSigns(k: Iso, yaw: number): void {
  k.place([0, 0, 0]);
  const ctx = k.ctx;
  const plaque = (
    side: WallSide,
    c: number,
    z: number,
    w: number,
    h: number,
    lines: string[],
    m: Mat
  ): void => {
    const alpha = wallAlpha(side, yaw);
    if (alpha <= 0.01) {
      return;
    }
    const onWall = (a: number, zz: number, lift = 0.004): V3 =>
      side === '-x' ? [WALL_X + lift, a, zz] : [a, WALL_Y + lift, zz];
    // Along the wall, the way that reads left to right from inside the room.
    const dir = side === '-x' ? -1 : 1;
    const quad: V3[] = [
      onWall(c - (dir * w) / 2, z - h / 2),
      onWall(c + (dir * w) / 2, z - h / 2),
      onWall(c + (dir * w) / 2, z + h / 2),
      onWall(c - (dir * w) / 2, z + h / 2),
    ];
    ctx.save();
    ctx.globalAlpha = alpha;
    const n: V3 = side === '-x' ? [1, 0, 0] : [0, 1, 0];
    k.lit(quad, n, m);
    k.line(quad, INK.panel, true);
    const u: V3 = side === '-x' ? [0, -1, 0] : [1, 0, 0];
    lines.forEach((line, i) => {
      const zz = z + h / 2 - (i + 1) * (h / (lines.length + 0.4)) + 0.02;
      k.text(onWall(c, zz, 0.008), u, [0, 0, 1], line, (i === 0 ? 0.32 : 0.15) * k.unit, {
        color: SHEET.ink,
        font: i === 0 ? FONT.title : FONT.hand,
        weight: '400',
      });
    });
    ctx.restore();
  };
  plaque('-x', 11.0, 2.0, 2.4, 0.95, ['B1', 'server floor'], MAT.trim);
  plaque('-y', 11.0, 2.05, 2.2, 0.7, ['KEEP IT COOL', 'doors shut, aisles clear'], MAT.mustard);
}

/** The floor's margin labels: what each part of it is for. */
const LABELS: MarginLabel[] = [
  {
    title: 'SERVER FLOOR',
    note: 'B1 · one floor under the office',
    at: [62, 262],
    align: 'left',
    to: [WALL_X, 11.0, 1.9],
    wall: '-x',
  },
  {
    title: 'COOLING',
    note: 'air handlers, and a cooler at every run',
    at: [560, 66],
    align: 'left',
    to: [15.4, WALL_Y + 0.5, 2.0],
  },
  {
    title: 'COLD AISLES',
    note: 'fronts face the cold air',
    at: [1330, 290],
    align: 'right',
    to: [19.6, 5.3, 0],
  },
  {
    title: 'HOT AISLES',
    note: 'backs, cables and warm air',
    at: [1330, 660],
    align: 'right',
    to: [19.6, 14.0, 0],
  },
  {
    title: 'RACKS',
    note: `${RACK_COUNT} of them, glass doors front and back`,
    at: [1330, 885],
    align: 'right',
    to: [16.7, 18.4 + RACK.d / 2, 1.6],
  },
  {
    title: 'STAIRS',
    note: 'up to the office',
    at: [62, 760],
    align: 'left',
    to: [DOOR_X, FLOOR.y1 - 0.15, 1.6],
  },
];

/** The server floor's title block, for a sheet that letters its own. */
export const SERVER_LETTERING = [
  { text: 'Server floor', font: FONT.title, size: 64, color: SHEET.ink, x: 60, baseline: 116 },
  {
    text: 'One floor under the office, where the racks hum and the fans never stop.',
    font: FONT.hand,
    size: 20,
    color: SHEET.lead,
    x: 64,
    baseline: 152,
  },
] as const;

export interface ServerBakeOptions {
  /** Draw into this canvas instead of a fresh one: a drag's draft reuses one. */
  into?: HTMLCanvasElement;
  /** Whether to letter the margin labels (the default). */
  labels?: boolean;
  /** Whether to letter the title block on the sheet (the default). */
  lettering?: boolean;
}

/**
 * Bake the server floor's static sheet at a device resolution: paper, slab,
 * walls and signs, every piece's cast shadow, and the labels. The pieces
 * themselves stand on it, sorted (see `serverFloor.ts`).
 */
export function bakeServerSheet(
  resolution: number,
  yaw = 0,
  options: ServerBakeOptions = {}
): HTMLCanvasElement {
  const canvas = options.into ?? document.createElement('canvas');
  const w = Math.ceil(SHEET_W * resolution);
  const h = Math.ceil(SHEET_H * resolution);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = styled(canvas.getContext('2d') as CanvasRenderingContext2D);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(paperAt(resolution), 0, 0);
  ctx.scale(resolution, resolution);
  const k = sheetPen(ctx, yaw);

  drawSlab(k);
  drawWallFoot(k, yaw);
  drawStencils(k);
  drawWalls(k, yaw, PAINT);
  drawSigns(k, yaw);

  const shade = document.createElement('canvas');
  shade.width = canvas.width;
  shade.height = canvas.height;
  const sctx = styled(shade.getContext('2d') as CanvasRenderingContext2D);
  sctx.scale(resolution, resolution);
  const sk = sheetPen(sctx, yaw, 1);
  for (const piece of SERVER_PIECES) {
    sk.place(piece.place.at, piece.place.facing);
    OBJECTS[piece.name].shadow(sk);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = SHEET.shadowAlpha;
  ctx.filter = `blur(${(SHADOW_SOFTNESS * resolution).toFixed(2)}px)`;
  ctx.drawImage(shade, 0, 0);
  ctx.filter = 'none';
  ctx.restore();

  const placed: Block[] = [];
  for (const label of options.labels === false ? [] : LABELS) {
    drawLabel(ctx, label, yaw, placed);
  }
  if (options.lettering !== false) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const line of SERVER_LETTERING) {
      ctx.fillStyle = line.color;
      ctx.font = `400 ${line.size}px ${line.font}`;
      letter(ctx, line.text, line.x, line.baseline);
    }
  }
  return canvas;
}
