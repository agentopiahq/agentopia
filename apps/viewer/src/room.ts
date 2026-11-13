import { DESKS, FURNITURE, Furniture, GRID } from '@agentopia/core';

import { FONT, Facing, INK, Iso, V2, V3, lift, plane, roundRect } from './kit/iso';
import { MAT, PAL, SHEET, mix } from './kit/palette';
import { DESK_SEAT_GAP, OBJECTS, ObjectName, SPEAKER_Z } from './objects';
import { Placement, drawObject } from './objects/bake';

/**
 * The office as one Tinycharts sheet: an annotated scene.
 *
 * A cream sheet of paper with a faint isometric construction grid; the title
 * block top left; the readout top right (the renderer writes it, since it
 * changes); and in the middle the office, standing on a cut slab of floor with
 * two back walls, like a cutaway model. Margin labels in small capitals name
 * the parts of the office that do something, each with a hand-lettered note
 * and a leader line down to the thing itself.
 *
 * Everything here is static, so it is drawn once into one canvas: the paper,
 * the slab, the walls and what hangs on them, the rugs, the labels, and the
 * cast shadow of every piece of furniture. The furniture itself is *not* on
 * the sheet — it stands among the cast and is sorted with them (see
 * `ROOM_PIECES`), so a worker can walk behind a copier.
 */

/** Screen pixels per tile on the sheet. */
export const TILE = 32;

/** The sheet, in sheet pixels. */
export const SHEET_W = 1360;
export const SHEET_H = 980;
/** Where world (0, 0, 0) — the floor's back corner — lands on the sheet. */
export const ORIGIN: V2 = [690, 168];

/** The floor slab: its outer edge, and how deep the cut is. */
const FLOOR = { x0: 0.3, y0: 1.0, x1: GRID.width, y1: GRID.height, depth: 1.05 };
/** The two back walls: how thick and how tall, in tiles. */
const WALL = { t: 0.3, h: 2.8 };
/** The walls' inner faces, which is where anything hung on them sits. */
export const WALL_X = FLOOR.x0 + WALL.t;
export const WALL_Y = FLOOR.y0 + WALL.t;

/** A piece of furniture that stands among the cast. */
export interface RoomPiece {
  name: ObjectName;
  place: Placement;
}

/** Things fixed to the walls: drawn on the sheet, never sorted. */
const WALL_PIECES: RoomPiece[] = [
  { name: 'whiteboard', place: { at: [5.2, WALL_Y, 0], facing: '+y' } },
  { name: 'clock', place: { at: [13.2, WALL_Y, 0], facing: '+y' } },
  { name: 'window', place: { at: [WALL_X, 4.4, 0], facing: '+x' } },
  { name: 'window', place: { at: [WALL_X, 16.8, 0], facing: '+x' } },
];

/** Where the plants stand: corners nobody walks through. */
const PLANT_SPOTS: V2[] = [
  [13.2, 2.4],
  [1.4, 16.4],
  [GRID.width - 1.2, 16.4],
  [GRID.width - 1.2, 19.6],
];

/** Which way each kind of core furniture faces, and where it really stands. */
function pieceFor(piece: Furniture): RoomPiece {
  const [x, y] = [piece.at.x, piece.at.y];
  switch (piece.kind) {
    case 'speaker':
      return { name: 'speaker', place: { at: [x, WALL_Y, 0], facing: '+y' } };
    case 'shutter':
      return { name: 'shutter', place: { at: [x, WALL_Y, 0], facing: '+y' } };
    case 'cabinet': {
      // Cabinets stand against the side they are nearest, drawers to the room.
      const facing: Facing = x < GRID.width / 2 ? '+x' : '-x';
      return { name: 'cabinet', place: { at: [x, y, 0], facing } };
    }
    default:
      return { name: piece.kind, place: { at: [x, y, 0], facing: '+y' } };
  }
}

const isWallMounted = (piece: Furniture): boolean =>
  piece.kind === 'speaker' || piece.kind === 'shutter';

/** The desks, where core seats each session. */
export const DESK_PIECES: RoomPiece[] = DESKS.map((desk) => ({
  name: 'desk',
  place: { at: [desk.seat.x, desk.seat.y - DESK_SEAT_GAP, 0], facing: '+y' },
}));

/** Everything that stands on the floor among the cast, except the desks. */
export const ROOM_PIECES: RoomPiece[] = [
  ...FURNITURE.filter((piece) => !isWallMounted(piece)).map(pieceFor),
  ...PLANT_SPOTS.map(([x, y]): RoomPiece => ({ name: 'plant', place: { at: [x, y, 0] } })),
];

const MOUNTED: RoomPiece[] = [...FURNITURE.filter(isWallMounted).map(pieceFor), ...WALL_PIECES];

/** Where the speaker's sound comes from, in world tiles. */
export const SPEAKER_AT: V3 = (() => {
  const speaker = FURNITURE.find((piece) => piece.kind === 'speaker');
  return [speaker ? speaker.at.x : 1.7, WALL_Y + 0.26, SPEAKER_Z];
})();

/** A world point on the sheet. */
export function sheetPoint(w: V3): V2 {
  return [
    (w[0] - w[1]) * Math.cos(Math.PI / 6) * TILE + ORIGIN[0],
    (w[0] + w[1]) * Math.sin(Math.PI / 6) * TILE - w[2] * TILE + ORIGIN[1],
  ];
}

// ---- margin labels ---------------------------------------------------------

interface MarginLabel {
  title: string;
  note: string;
  /** Where the text block sits, on the sheet. */
  at: V2;
  align: 'left' | 'right';
  /** The world point the leader runs to. */
  to: V3;
}

const LABELS: MarginLabel[] = [
  {
    title: 'SPEAKER',
    note: 'where you speak up',
    at: [430, 66],
    align: 'left',
    to: SPEAKER_AT,
  },
  {
    title: 'CABINETS',
    note: 'context, filed away',
    at: [62, 262],
    align: 'left',
    to: [1.3, 10, 1.2],
  },
  {
    title: 'THE DOOR',
    note: 'helpers file in and out',
    at: [62, 640],
    align: 'left',
    to: [2.4, 21.1, 1.6],
  },
  {
    title: 'COPIERS',
    note: 'paper jam, probably',
    at: [1300, 236],
    align: 'right',
    to: [17.2, 2.4, 1.2],
  },
  {
    title: 'DESKS',
    note: 'one per live session',
    at: [1300, 660],
    align: 'right',
    to: [16.5, 15.4 - DESK_SEAT_GAP, 0.8],
  },
];

function drawLabel(ctx: CanvasRenderingContext2D, label: MarginLabel): void {
  const [x, y] = label.at;
  ctx.textAlign = label.align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = SHEET.ink;
  ctx.font = `400 21px ${FONT.hand}`;
  drawSpaced(ctx, label.title, x, y, 2.2, label.align);
  const titleW = spacedWidth(ctx, label.title, 2.2);
  ctx.fillStyle = SHEET.lead;
  ctx.font = `400 18px ${FONT.hand}`;
  ctx.fillText(label.note, x, y + 22);

  // The leader: from just past the title's end, a short level run, then down
  // to the part, ending on a dot.
  const startX = label.align === 'left' ? x + titleW + 10 : x - titleW - 10;
  const [tx, ty] = sheetPoint(label.to);
  const elbowX =
    label.align === 'left' ? Math.max(startX + 24, tx - 60) : Math.min(startX - 24, tx + 60);
  ctx.beginPath();
  ctx.moveTo(startX, y - 7);
  ctx.lineTo(elbowX, y - 7);
  ctx.lineTo(tx, ty);
  ctx.strokeStyle = SHEET.ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(startX, y - 7, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = SHEET.paper;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tx, ty, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = SHEET.ink;
  ctx.fill();
}

/** Small capitals: letter-spaced by hand, since canvas spacing is not everywhere yet. */
function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'right'
): void {
  const saved = ctx.textAlign;
  ctx.textAlign = 'left';
  const total = spacedWidth(ctx, text, spacing);
  let cx = align === 'left' ? x : x - total;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = saved;
}

function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let w = 0;
  for (const ch of text) {
    w += ctx.measureText(ch).width + spacing;
  }
  return w - spacing;
}

// ---- the sheet -------------------------------------------------------------

/** The paper, its construction grid, and the title block. */
function drawPaper(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = SHEET.paper;
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);

  // The faint isometric grid the scene was laid out on.
  ctx.save();
  ctx.strokeStyle = SHEET.grid;
  ctx.lineWidth = 0.7;
  const step = TILE * 2;
  const slope = Math.tan(Math.PI / 6);
  for (let i = -40; i < 60; i++) {
    const c = i * step;
    ctx.beginPath();
    ctx.moveTo(ORIGIN[0] - 2000, ORIGIN[1] + c - 2000 * slope);
    ctx.lineTo(ORIGIN[0] + 2000, ORIGIN[1] + c + 2000 * slope);
    ctx.moveTo(ORIGIN[0] - 2000, ORIGIN[1] + c + 2000 * slope);
    ctx.lineTo(ORIGIN[0] + 2000, ORIGIN[1] + c - 2000 * slope);
    ctx.stroke();
  }
  ctx.restore();

  // A soft vignette of paper tooth, deterministic: a scatter of faint flecks.
  ctx.save();
  let seed = 0x2f6b1d;
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = SHEET.lead;
  for (let i = 0; i < 1400; i++) {
    ctx.globalAlpha = 0.03 + next() * 0.05;
    ctx.fillRect(next() * SHEET_W, next() * SHEET_H, 1 + next(), 1 + next());
  }
  ctx.restore();

  // The title block.
  ctx.fillStyle = SHEET.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 70px ${FONT.title}`;
  ctx.fillText('The office', 60, 120);
  ctx.fillStyle = SHEET.lead;
  ctx.font = `400 21px ${FONT.hand}`;
  ctx.fillText('every live coding session, at a desk of its own', 64, 156);

  // The footnote.
  ctx.font = `400 19px ${FONT.hand}`;
  ctx.fillText(
    'Drawn live from your agent hooks. The printers and copiers are for show, for now.',
    64,
    SHEET_H - 34
  );
}

/** The slab of floor: a cut board, boards on top, the cut showing its layers. */
function drawFloor(k: Iso): void {
  const { x0, y0, x1, y1, depth } = FLOOR;
  k.place([0, 0, 0]);
  const top: V3[] = [
    [x0, y0, 0],
    [x1, y0, 0],
    [x1, y1, 0],
    [x0, y1, 0],
  ];
  // The two cut faces we can see: toward +x and toward +y.
  const cutX: V3[] = [
    [x1, y0, 0],
    [x1, y1, 0],
    [x1, y1, -depth],
    [x1, y0, -depth],
  ];
  const cutY: V3[] = [
    [x0, y1, 0],
    [x1, y1, 0],
    [x1, y1, -depth],
    [x0, y1, -depth],
  ];
  k.fill(cutX, MAT.board.m);
  k.fill(cutY, MAT.board.d);
  // The floorboard layer on top of the concrete, and a seam under it.
  const boards = 0.18;
  k.fill(
    [
      [x1, y0, 0],
      [x1, y1, 0],
      [x1, y1, -boards],
      [x1, y0, -boards],
    ],
    MAT.wood.m
  );
  k.fill(
    [
      [x0, y1, 0],
      [x1, y1, 0],
      [x1, y1, -boards],
      [x0, y1, -boards],
    ],
    MAT.wood.d
  );
  k.line(
    [
      [x0, y1, -boards],
      [x1, y1, -boards],
      [x1, y0, -boards],
    ],
    INK.detail
  );
  // Flecks of aggregate in the cut concrete.
  let seed = 917;
  const next = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 90; i++) {
    const along = next();
    const down = boards + 0.12 + next() * (depth - boards - 0.24);
    const onX = i % 2 === 0;
    const p: V3 = onX ? [x1, y0 + along * (y1 - y0), -down] : [x0 + along * (x1 - x0), y1, -down];
    k.dot(p, 0.6 + next() * 0.8, onX ? MAT.board.d : mix(MAT.board.d, '#000000', 0.2));
  }

  k.fill(top, MAT.floor.l);
  // Floorboards: long seams along x, with the butt joints staggered.
  for (let y = y0 + 0.7; y < y1; y += 0.7) {
    k.line(
      [
        [x0, y, 0],
        [x1, y, 0],
      ],
      INK.hair,
      false,
      MAT.floor.d
    );
    const row = Math.round(y / 0.7);
    for (let x = x0 + ((row * 2.3) % 4.6) + 1; x < x1 - 0.3; x += 4.6) {
      k.line(
        [
          [x, y - 0.7, 0],
          [x, y, 0],
        ],
        INK.hair,
        false,
        MAT.floor.d
      );
    }
  }
  k.inkScreen(
    [top[0], top[1], top[2], top[3]].map((p) => k.P(p)),
    INK.panel
  );
  k.silhouette([...top, ...cutX, ...cutY], INK.silhouette);
}

/** A rug under each desk group, so a session's patch reads as its own. */
function drawRugs(k: Iso): void {
  const colors = [PAL.sage, PAL.sky, PAL.pink, PAL.tan, PAL.sky, PAL.sage];
  k.place([0, 0, 0]);
  DESKS.forEach((desk, i) => {
    const { x, y } = desk.seat;
    const outline = roundRect(x - 2.55, y - 2.05, x + 2.55, y + 2.45, 0.25);
    const color = colors[i % colors.length];
    k.shape(lift(plane.z(0.002), outline), mix(color, SHEET.paper, 0.35), INK.detail);
    k.line(
      lift(plane.z(0.003), roundRect(x - 2.35, y - 1.85, x + 2.35, y + 2.25, 0.18)),
      INK.hair,
      true,
      mix(color, '#000000', 0.25)
    );
  });
  // Hazard stripes painted on the floor in front of the loading-bay shutter.
  const shutter = FURNITURE.find((piece) => piece.kind === 'shutter');
  if (shutter) {
    const sx = shutter.at.x;
    const y0 = WALL_Y + 0.05;
    const y1 = WALL_Y + 0.75;
    k.fill(
      [
        [sx - 0.95, y0, 0.002],
        [sx + 0.95, y0, 0.002],
        [sx + 0.95, y1, 0.002],
        [sx - 0.95, y1, 0.002],
      ],
      PAL.gold
    );
    for (let i = 0; i < 7; i++) {
      const a = sx - 0.95 + i * 0.3;
      k.fill(
        [
          [Math.max(sx - 0.95, a), y0, 0.003],
          [Math.min(sx + 0.95, a + 0.14), y0, 0.003],
          [Math.min(sx + 0.95, a + 0.14 + 0.3), y1, 0.003],
          [Math.min(sx + 0.95, a + 0.3), y1, 0.003],
        ],
        SHEET.ink
      );
    }
  }
}

/** The two back walls, with a skirting board and a dado rail along each. */
function drawWalls(k: Iso): void {
  k.place([0, 0, 0]);
  const { t, h } = WALL;
  const { x0, y0, x1, y1 } = FLOOR;
  // The far wall (along x) first, then the near-left wall (along y).
  k.box([x0, y0, 0], [x1, y0 + t, h], MAT.wall, { ink: INK.silhouette });
  k.box([x0, y0 + t, 0], [x0 + t, y1, h], MAT.wall, { ink: INK.silhouette });
  // Skirting boards and dado rails, on the inner faces.
  for (const [z0, z1, m] of [
    [0, 0.2, MAT.wood],
    [1.0, 1.05, MAT.wood],
  ] as const) {
    k.shape(
      [
        [x0 + t, y0 + t, z0],
        [x1, y0 + t, z0],
        [x1, y0 + t, z1],
        [x0 + t, y0 + t, z1],
      ],
      m.d,
      INK.hair
    );
    k.shape(
      [
        [x0 + t, y0 + t, z0],
        [x0 + t, y1, z0],
        [x0 + t, y1, z1],
        [x0 + t, y0 + t, z1],
      ],
      m.m,
      INK.hair
    );
  }
}

/**
 * Bake the whole static sheet into one canvas at a device resolution. The
 * furniture's shadows are painted into a layer of their own first and laid
 * down in one pass, so two overlapping shadows are not twice as dark.
 */
export function bakeSheet(resolution: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(SHEET_W * resolution);
  canvas.height = Math.ceil(SHEET_H * resolution);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(resolution, resolution);
  const k = new Iso(ctx, { unit: TILE, origin: ORIGIN });

  drawPaper(ctx);
  drawFloor(k);
  drawRugs(k);
  drawWalls(k);

  // Every cast shadow, in its own layer, then laid down at one strength.
  const shade = document.createElement('canvas');
  shade.width = canvas.width;
  shade.height = canvas.height;
  const sctx = shade.getContext('2d') as CanvasRenderingContext2D;
  sctx.scale(resolution, resolution);
  const sk = new Iso(sctx, { unit: TILE, origin: ORIGIN, shadowAlpha: 1 });
  for (const piece of [...ROOM_PIECES, ...DESK_PIECES, ...MOUNTED]) {
    sk.place(piece.place.at, piece.place.facing);
    OBJECTS[piece.name].shadow(sk);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = SHEET.shadowAlpha;
  ctx.drawImage(shade, 0, 0);
  ctx.restore();

  for (const piece of MOUNTED) {
    drawObject(k, OBJECTS[piece.name], piece.place, false);
  }
  for (const label of LABELS) {
    drawLabel(ctx, label);
  }
  return canvas;
}

/** The readout's place on the sheet: right-aligned, top right. */
export const READOUT = { x: SHEET_W - 60, y: 62 } as const;
