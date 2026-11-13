import { DESKS, FURNITURE, Furniture, GRID } from '@agentopia/core';

import { FONT, Facing, INK, Iso, V2, V3, lift, plane, roundRect, viewToward } from './kit/iso';
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
 * Everything here is static for a given view, so it is drawn once into one
 * canvas: the paper, the slab, the walls and what hangs on them, the rugs, the
 * labels, and the cast shadow of every piece of furniture. The furniture itself
 * is *not* on the sheet — it stands among the cast and is sorted with them
 * (see `ROOM_PIECES`), so a worker can walk behind a copier.
 *
 * The office can be turned (`yaw`): the room has four walls, and only the ones
 * on the far side of the viewer are drawn, fading out as they swing round, so
 * a wall never stands between you and the room. What hangs on a wall goes
 * with it.
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
/** The walls: how thick and how tall, in tiles. */
const WALL = { t: 0.3, h: 2.8 };
/** The home view's two back walls' inner faces, where most things hang. */
export const WALL_X = FLOOR.x0 + WALL.t;
export const WALL_Y = FLOOR.y0 + WALL.t;
/** The other two walls' inner faces, seen only once the office is turned. */
const WALL_X1 = FLOOR.x1 - WALL.t;
const WALL_Y1 = FLOOR.y1 - WALL.t;
/** The floor point the office turns about: the middle of the slab. */
export const PIVOT: V2 = [(FLOOR.x0 + FLOOR.x1) / 2, (FLOOR.y0 + FLOOR.y1) / 2];

/** The four walls, by the way they face out of the room. */
export type WallSide = '-x' | '-y' | '+x' | '+y';
const OUTWARD: Record<WallSide, V2> = { '-x': [-1, 0], '-y': [0, -1], '+x': [1, 0], '+y': [0, 1] };

/**
 * How solid a wall is drawn from this yaw, 0..1: a wall whose inside faces
 * the viewer stands; one swinging round toward the viewer fades away before
 * it can block the room.
 */
export function wallAlpha(side: WallSide, yaw: number): number {
  const [vx, vy] = viewToward(yaw);
  const len = Math.hypot(vx, vy);
  const [ox, oy] = OUTWARD[side];
  const away = -(ox * vx + oy * vy) / len;
  return Math.max(0, Math.min(1, (away - 0.08) / 0.3));
}

/** Where the door stands: in the near-left wall, opposite the home view's back. */
const DOOR_X = FURNITURE.find((piece) => piece.kind === 'door')?.at.x ?? 2.4;
const DOOR_HALF = 0.78;

/** A piece of furniture that stands among the cast. */
export interface RoomPiece {
  name: ObjectName;
  place: Placement;
  /** The wall it hangs on, for the pieces that hang. */
  wall?: WallSide;
}

/** Things fixed to the walls: drawn on the sheet, never sorted. */
const WALL_PIECES: RoomPiece[] = [
  { name: 'whiteboard', place: { at: [5.2, WALL_Y, 0], facing: '+y' }, wall: '-y' },
  { name: 'clock', place: { at: [13.2, WALL_Y, 0], facing: '+y' }, wall: '-y' },
  { name: 'window', place: { at: [WALL_X, 4.4, 0], facing: '+x' }, wall: '-x' },
  { name: 'window', place: { at: [WALL_X, 16.8, 0], facing: '+x' }, wall: '-x' },
  { name: 'window', place: { at: [WALL_X1, 4.4, 0], facing: '-x' }, wall: '+x' },
  { name: 'window', place: { at: [WALL_X1, 11, 0], facing: '-x' }, wall: '+x' },
  { name: 'window', place: { at: [WALL_X1, 16.8, 0], facing: '-x' }, wall: '+x' },
  { name: 'window', place: { at: [8.5, WALL_Y1, 0], facing: '-y' }, wall: '+y' },
  { name: 'window', place: { at: [15.5, WALL_Y1, 0], facing: '-y' }, wall: '+y' },
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
      return { name: 'speaker', place: { at: [x, WALL_Y, 0], facing: '+y' }, wall: '-y' };
    case 'shutter':
      return { name: 'shutter', place: { at: [x, WALL_Y, 0], facing: '+y' }, wall: '-y' };
    case 'door':
      // Set into the wall nearest it, in the middle of the wall's thickness.
      return { name: 'door', place: { at: [x, FLOOR.y1 - WALL.t / 2, 0], facing: '+y' } };
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

/** A pen on the sheet, seen from a yaw. */
export function sheetPen(ctx: CanvasRenderingContext2D, yaw = 0, shadowAlpha?: number): Iso {
  return new Iso(ctx, { unit: TILE, origin: ORIGIN, yaw, pivot: PIVOT, shadowAlpha });
}

const PROBE = (yaw: number): Iso => sheetPen({} as CanvasRenderingContext2D, yaw);

/** A world point on the sheet, seen from a yaw. */
export function sheetPoint(w: V3, yaw = 0): V2 {
  return PROBE(yaw).screenOfWorld(w);
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
  /** The wall the part hangs on, if it does: no label once that wall is gone. */
  wall?: WallSide;
}

const LABELS: MarginLabel[] = [
  {
    title: 'SPEAKER',
    note: 'where you speak up',
    at: [430, 66],
    align: 'left',
    to: SPEAKER_AT,
    wall: '-y',
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
    to: [2.4, 21.85, 1.6],
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

/**
 * Where a label's text sits from a yaw, and which way it runs. At the home
 * view that is exactly where it was laid out; turned, the label keeps the same
 * place relative to its part — the offset from the part swings round with the
 * part's direction from the middle of the room — so it travels with the room.
 */
function labelPlace(label: MarginLabel, yaw: number): { at: V2; align: 'left' | 'right' } {
  if (yaw === 0) {
    return { at: label.at, align: label.align };
  }
  const centre = (y: number): V2 => sheetPoint([PIVOT[0], PIVOT[1], 0], y);
  const [hx, hy] = sheetPoint(label.to, 0);
  const [cx0, cy0] = centre(0);
  const [tx, ty] = sheetPoint(label.to, yaw);
  const [cx, cy] = centre(yaw);
  const turn = Math.atan2(ty - cy, tx - cx) - Math.atan2(hy - cy0, hx - cx0);
  const ox = label.at[0] - hx;
  const oy = label.at[1] - hy;
  const x = tx + ox * Math.cos(turn) - oy * Math.sin(turn);
  const y = ty + ox * Math.sin(turn) + oy * Math.cos(turn);
  return { at: [x, Math.max(60, Math.min(SHEET_H - 70, y))], align: x < tx ? 'left' : 'right' };
}

/** The sheet's own lettering, which labels keep clear of: x0, y0, x1, y1. */
const KEEP_CLEAR: Array<[number, number, number, number]> = [
  [40, 40, 410, 130],
  [40, 130, 480, 215],
  [SHEET_W - 300, 40, SHEET_W, 160],
  [40, SHEET_H - 60, 900, SHEET_H],
];

function drawLabel(ctx: CanvasRenderingContext2D, label: MarginLabel, yaw: number): void {
  // A part on a wall that has faded away takes its label with it.
  if (label.wall && wallAlpha(label.wall, yaw) < 0.5) {
    return;
  }
  const place = labelPlace(label, yaw);
  const align = place.align;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 21px ${FONT.hand}`;
  const titleW = spacedWidth(ctx, label.title, 2.2);
  ctx.font = `400 18px ${FONT.hand}`;
  const noteW = ctx.measureText(label.note).width;
  // Keep the whole block on the sheet.
  const w = Math.max(titleW, noteW);
  const x =
    align === 'left'
      ? Math.max(40, Math.min(SHEET_W - 40 - w, place.at[0]))
      : Math.min(SHEET_W - 40, Math.max(40 + w, place.at[0]));
  let y = place.at[1];
  // Turned, a label can drift into the title block, the readout or the
  // footnote: step it clear of them.
  const left = align === 'left' ? x : x - w;
  for (const [x0, y0, x1, y1] of yaw === 0 ? [] : KEEP_CLEAR) {
    if (left < x1 && left + w > x0 && y - 20 < y1 && y + 30 > y0) {
      y = y0 > SHEET_H / 2 ? y0 - 34 : y1 + 24;
    }
  }

  ctx.textAlign = align;
  ctx.fillStyle = SHEET.ink;
  ctx.font = `400 21px ${FONT.hand}`;
  drawSpaced(ctx, label.title, x, y, 2.2, align);
  ctx.fillStyle = SHEET.lead;
  ctx.font = `400 18px ${FONT.hand}`;
  letter(ctx, label.note, x, y + 22);

  // The leader: from just past the title's end, a short level run, then down
  // to the part, ending on a dot.
  const startX = align === 'left' ? x + titleW + 10 : x - titleW - 10;
  const [tx, ty] = sheetPoint(label.to, yaw);
  const elbowX = align === 'left' ? Math.max(startX + 24, tx - 60) : Math.min(startX - 24, tx + 60);
  ctx.save();
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
  ctx.restore();
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
    letter(ctx, ch, cx, y);
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

/** The paper, drawn once per resolution: it does not turn with the office. */
const paperCache = new Map<number, HTMLCanvasElement>();

function paperAt(resolution: number): HTMLCanvasElement {
  let canvas = paperCache.get(resolution);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = Math.ceil(SHEET_W * resolution);
    canvas.height = Math.ceil(SHEET_H * resolution);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.scale(resolution, resolution);
    drawPaper(ctx);
    paperCache.set(resolution, canvas);
  }
  return canvas;
}

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
}

/**
 * Letter text with a halo of paper round it, so it reads wherever it lands —
 * the turning office can swing a wall or a corner of floor under any of it.
 */
export function letter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = SHEET.paper;
  ctx.lineWidth = 5;
  ctx.strokeText(text, x, y);
  ctx.restore();
  ctx.fillText(text, x, y);
}

/** The title block and the footnote, laid over everything else on the sheet. */
function drawLettering(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = SHEET.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 70px ${FONT.title}`;
  letter(ctx, 'Agentopia', 60, 120);
  ctx.fillStyle = SHEET.lead;
  ctx.font = `400 21px ${FONT.hand}`;
  letter(ctx, 'every live coding session, at a desk of its own', 64, 156);
  ctx.font = `400 19px ${FONT.hand}`;
  letter(
    ctx,
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
  const boards = 0.18;
  // The cut faces we can see, whichever two (or one) face the viewer.
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
  let seed = 917;
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
    k.fill([a, b, down(b, -depth), down(a, -depth)], k.tone(n, MAT.board));
    k.fill([a, b, down(b, -boards), down(a, -boards)], k.tone(n, MAT.wood));
    k.line([down(a, -boards), down(b, -boards)], INK.detail);
    // Flecks of aggregate in the cut concrete.
    for (let i = 0; i < 45; i++) {
      const t = next();
      const z = -(boards + 0.12 + next() * (depth - boards - 0.24));
      const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z];
      k.dot(p, 0.6 + next() * 0.8, mix(MAT.board.d, '#000000', 0.12));
    }
    outline.push(down(a, -depth), down(b, -depth));
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
    top.map((p) => k.P(p)),
    INK.panel
  );
  k.silhouette(outline, INK.silhouette);
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

/** One wall: its solid boxes (a wall with a doorway is three), and its inner face. */
interface Wall {
  side: WallSide;
  boxes: Array<[V3, V3]>;
  /** The inner face's two ends along the floor, for the skirting and the rail. */
  inner: [V2, V2];
}

function walls(): Wall[] {
  const { t, h } = WALL;
  const { x0, y0, x1, y1 } = FLOOR;
  const d0 = DOOR_X - DOOR_HALF;
  const d1 = DOOR_X + DOOR_HALF;
  return [
    {
      side: '-y',
      boxes: [
        [
          [x0, y0, 0],
          [x1, y0 + t, h],
        ],
      ],
      inner: [
        [x0 + t, y0 + t],
        [x1 - t, y0 + t],
      ],
    },
    {
      side: '-x',
      boxes: [
        [
          [x0, y0, 0],
          [x0 + t, y1, h],
        ],
      ],
      inner: [
        [x0 + t, y0 + t],
        [x0 + t, y1 - t],
      ],
    },
    {
      side: '+x',
      boxes: [
        [
          [x1 - t, y0, 0],
          [x1, y1, h],
        ],
      ],
      inner: [
        [x1 - t, y0 + t],
        [x1 - t, y1 - t],
      ],
    },
    {
      side: '+y',
      // Left of the doorway, the lintel over it, and the rest.
      boxes: [
        [
          [x0, y1 - t, 0],
          [d0, y1, h],
        ],
        [
          [d0, y1 - t, 2.2],
          [d1, y1, h],
        ],
        [
          [d1, y1 - t, 0],
          [x1, y1, h],
        ],
      ],
      inner: [
        [x0 + t, y1 - t],
        [x1 - t, y1 - t],
      ],
    },
  ];
}

/**
 * The walls that stand from this yaw, back to front, each with a skirting
 * board and a dado rail along its inner face. Returns how solid each is.
 */
function drawWalls(k: Iso, yaw: number): void {
  k.place([0, 0, 0]);
  const ctx = k.ctx;
  const standing = walls()
    .map((wall) => ({ wall, alpha: wallAlpha(wall.side, yaw) }))
    .filter(({ alpha }) => alpha > 0.01)
    .sort((a, b) => {
      const mid = (w: Wall): V3 => {
        const [[ax, ay], [bx, by]] = w.inner;
        return [(ax + bx) / 2, (ay + by) / 2, 0];
      };
      return k.depth(mid(a.wall)) - k.depth(mid(b.wall));
    });
  for (const { wall, alpha } of standing) {
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const [lo, hi] of wall.boxes) {
      k.box(lo, hi, MAT.wall, { ink: INK.silhouette });
    }
    const [[ax, ay], [bx, by]] = wall.inner;
    for (const [z0, z1, tone] of [
      [0, 0.2, MAT.wood],
      [1.0, 1.05, MAT.wood],
    ] as const) {
      const [ox, oy] = OUTWARD[wall.side];
      k.shape(
        [
          [ax, ay, z0],
          [bx, by, z0],
          [bx, by, z1],
          [ax, ay, z1],
        ],
        k.tone([-ox, -oy, 0], tone),
        INK.hair
      );
    }
    ctx.restore();
  }
}

/**
 * Bake the whole static sheet into one canvas at a device resolution. The
 * furniture's shadows are painted into a layer of their own first and laid
 * down in one pass, so two overlapping shadows are not twice as dark.
 */
export interface BakeOptions {
  /** Draw into this canvas instead of a fresh one: the drag's draft reuses one. */
  into?: HTMLCanvasElement;
}

export function bakeSheet(
  resolution: number,
  yaw = 0,
  options: BakeOptions = {}
): HTMLCanvasElement {
  const canvas = options.into ?? document.createElement('canvas');
  const w = Math.ceil(SHEET_W * resolution);
  const h = Math.ceil(SHEET_H * resolution);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(paperAt(resolution), 0, 0);
  ctx.scale(resolution, resolution);
  const k = sheetPen(ctx, yaw);

  drawFloor(k);
  drawRugs(k);
  drawWalls(k, yaw);

  // Every cast shadow, in its own layer, then laid down at one strength.
  const shade = document.createElement('canvas');
  shade.width = canvas.width;
  shade.height = canvas.height;
  const sctx = shade.getContext('2d') as CanvasRenderingContext2D;
  sctx.scale(resolution, resolution);
  const sk = sheetPen(sctx, yaw, 1);
  for (const piece of [...ROOM_PIECES, ...DESK_PIECES, ...MOUNTED]) {
    if (piece.wall && wallAlpha(piece.wall, yaw) < 0.5) {
      continue;
    }
    sk.place(piece.place.at, piece.place.facing);
    OBJECTS[piece.name].shadow(sk);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = SHEET.shadowAlpha;
  ctx.drawImage(shade, 0, 0);
  ctx.restore();

  for (const piece of MOUNTED) {
    const alpha = piece.wall ? wallAlpha(piece.wall, yaw) : 1;
    if (alpha <= 0.01) {
      continue;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    drawObject(k, OBJECTS[piece.name], piece.place, false);
    ctx.restore();
  }
  for (const label of LABELS) {
    drawLabel(ctx, label, yaw);
  }
  drawLettering(ctx);
  return canvas;
}

/** How solid the wall the speaker hangs on is, from a yaw: its sound fades with it. */
export const speakerAlpha = (yaw: number): number => wallAlpha('-y', yaw);

/** Where the live status pill and the session's name sit: under the subtitle. */
export const STATUS_LINE = { x: 64, y: 192 } as const;

/** The readout's place on the sheet: right-aligned, top right. */
export const READOUT = { x: SHEET_W - 60, y: 62 } as const;
