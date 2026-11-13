import { DESKS, FURNITURE, Furniture, GRID, ROOMS } from '@agentopia/core';

import {
  FONT,
  Facing,
  INK,
  Iso,
  V2,
  V3,
  ellipse,
  lift,
  plane,
  roundRect,
  viewToward,
} from './kit/iso';
import { MAT, Mat, PAL, PLANKS, SHEET, SUN, mix } from './kit/palette';
import { DESK_SEAT_GAP, OBJECTS, ObjectName, SPEAKER_Z, WINDOW } from './objects';
import { Placement, drawObject } from './objects/bake';
import { BLIND_Z } from './objects/wall';

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
  // Inside the meeting room: the sprint board on its back wall, the screen on its side.
  { name: 'whiteboard', place: { at: [3.6, WALL_Y, 0], facing: '+y' }, wall: '-y' },
  { name: 'screen', place: { at: [WALL_X, 3.3, 0], facing: '+x' }, wall: '-x' },
  // Over the print corner.
  { name: 'clock', place: { at: [13.9, WALL_Y, 0], facing: '+y' }, wall: '-y' },
  // The window wall, the desks in its daylight; one blind half down.
  { name: 'window', place: { at: [WALL_X, 7.6, 0], facing: '+x' }, wall: '-x' },
  { name: 'windowBlind', place: { at: [WALL_X, 13.2, 0], facing: '+x' }, wall: '-x' },
  { name: 'window', place: { at: [WALL_X, 17.6, 0], facing: '+x' }, wall: '-x' },
  // The near walls: either side of the door, and over the lounge.
  { name: 'window', place: { at: [4.6, WALL_Y1, 0], facing: '-y' }, wall: '+y' },
  { name: 'windowBlind', place: { at: [18.6, WALL_Y1, 0], facing: '-y' }, wall: '+y' },
  { name: 'window', place: { at: [WALL_X1, 15.2, 0], facing: '-x' }, wall: '+x' },
  { name: 'window', place: { at: [WALL_X1, 18.4, 0], facing: '-x' }, wall: '+x' },
];

/** Where the plants stand: corners and zone edges nobody walks through. */
const PLANT_SPOTS: V2[] = [
  [1.15, 5.9],
  [1.15, 15.4],
  [1.15, 21.15],
  [11.3, 21.15],
  [14.1, 21.15],
  [21.2, 6.0],
  [21.2, 12.9],
  [8.6, 21.15],
];

/**
 * A task chair at every desk, pushed back and swung aside to the right of
 * the seat: the lead works standing, so its chair waits beside it.
 */
const DESK_CHAIRS: RoomPiece[] = DESKS.map((desk) => ({
  name: 'deskChair',
  place: { at: [desk.seat.x + 0.85, desk.seat.y + 0.1, 0], facing: '-y' },
}));

/** Four chairs round a point, a gap of `r` out, each facing in. */
function chairsAround(cx: number, cy: number, rx: number, ry: number, first = 0): RoomPiece[] {
  const spots: Array<[number, number, Facing]> = [
    [cx, cy - ry, '+y'],
    [cx, cy + ry, '-y'],
    [cx - rx, cy, '+x'],
    [cx + rx, cy, '-x'],
  ];
  return spots.map(([x, y, facing], i) => ({
    name: (i + first) % 2 === 0 ? 'meetingChair' : 'meetingChairAlt',
    place: { at: [x, y, 0], facing },
  }));
}

/**
 * The rooms within the room, from core's floor plan. A room's sides that do
 * not stand against a wall are glass, a panel per tile, the door the panel
 * nearest the open floor; inside the meeting room, its table and chairs.
 */
function enclosurePieces(): RoomPiece[] {
  const out: RoomPiece[] = [];
  const against = (v: number, wall: number): boolean => Math.abs(v - wall) < 0.05;
  for (const room of ROOMS) {
    const cx = (room.x0 + room.x1) / 2;
    const cy = (room.y0 + room.y1) / 2;
    if (room.kind === 'booth') {
      out.push({ name: 'booth', place: { at: [cx, cy, 0], facing: '+y' } });
      continue;
    }
    // The side along x (front or back) that is open, and the side along y.
    const yGlass = against(room.y0, WALL_Y) ? room.y1 : room.y0;
    const xGlass = against(room.x0, WALL_X) ? room.x1 : room.x0;
    const xs = Math.round(room.x1 - room.x0);
    for (let i = 0; i < xs; i++) {
      // The door is the panel at the end nearest the open floor.
      const door = xGlass === room.x1 ? i === xs - 1 : i === 0;
      out.push({
        name: door ? 'glassDoor' : 'glassPanel',
        place: { at: [room.x0 + i + 0.5, yGlass, 0], facing: '+y' },
      });
    }
    for (let i = 0; i < Math.round(room.y1 - room.y0); i++) {
      out.push({ name: 'glassPanel', place: { at: [xGlass, room.y0 + i + 0.5, 0], facing: '+x' } });
    }
    out.push({ name: 'meetingTable', place: { at: [cx, cy, 0], facing: '+y' } });
    out.push(...chairsAround(cx - 1.0, cy, 0, 0.95).slice(0, 2));
    out.push(...chairsAround(cx, cy, 1.95, 0.95, 1));
    out.push(...chairsAround(cx + 1.0, cy, 0, 0.95).slice(0, 2));
  }
  return out;
}

/** The kitchen and print corner along the far right wall, past the booths. */
const SUPPORT: RoomPiece[] = [
  { name: 'kitchenCounter', place: { at: [18.4, WALL_Y + 0.32, 0], facing: '+y' } },
  { name: 'fridge', place: { at: [21.27, WALL_Y + 0.37, 0], facing: '+y' } },
  { name: 'standingTable', place: { at: [18.4, 4.9, 0], facing: '+y' } },
  { name: 'waterCooler', place: { at: [15.78, WALL_Y + 0.24, 0], facing: '+y' } },
];

/** The lounge, on the right of the door, and the bean bag corner. */
export const LOUNGE_RUG = { x: 17.0, y: 20.6, r: 1.0 } as const;
const LOUNGE: RoomPiece[] = [
  { name: 'sofa', place: { at: [21.25, 19.4, 0], facing: '-x' } },
  { name: 'coffeeTable', place: { at: [19.9, 19.4, 0], facing: '-x' } },
  { name: 'armchair', place: { at: [18.5, 19.4, 0], facing: '+x' } },
  { name: 'beanBag', place: { at: [16.7, 20.4, 0], facing: '+y' } },
  { name: 'sideTable', place: { at: [17.7, 21.1, 0], facing: '+y' } },
];

/** The huddle table, on the left of the door, four chairs round it. */
const HUDDLE: RoomPiece[] = [
  { name: 'huddleTable', place: { at: [4.6, 19.6, 0], facing: '+y' } },
  ...chairsAround(4.6, 19.6, 0.95, 0.95),
];

/** Which way each kind of core furniture faces, and where it really stands. */
function pieceFor(piece: Furniture): RoomPiece {
  const [x, y] = [piece.at.x, piece.at.y];
  switch (piece.kind) {
    case 'speaker':
      return { name: 'speaker', place: { at: [x, WALL_Y, 0], facing: '+y' }, wall: '-y' };
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

const isWallMounted = (piece: Furniture): boolean => piece.kind === 'speaker';

/** The desks, where core seats each session. */
export const DESK_PIECES: RoomPiece[] = DESKS.map((desk) => ({
  name: 'desk',
  place: { at: [desk.seat.x, desk.seat.y - DESK_SEAT_GAP, 0], facing: '+y' },
}));

/** Everything that stands on the floor among the cast, except the desks. */
export const ROOM_PIECES: RoomPiece[] = [
  ...FURNITURE.filter((piece) => !isWallMounted(piece)).map(pieceFor),
  ...PLANT_SPOTS.map(([x, y]): RoomPiece => ({ name: 'plant', place: { at: [x, y, 0] } })),
  ...DESK_CHAIRS,
  ...enclosurePieces(),
  ...SUPPORT,
  ...LOUNGE,
  ...HUDDLE,
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
    title: 'MEETING ROOM',
    note: 'for when a plan needs talking through',
    at: [62, 262],
    align: 'left',
    to: [3.6, 3.3, 1.0],
  },
  {
    title: 'PHONE BOOTHS',
    note: 'quiet calls',
    at: [560, 66],
    align: 'left',
    to: [8.7, 2.15, 2.2],
  },
  {
    title: 'SPEAKER',
    note: 'where you speak up',
    at: [1330, 200],
    align: 'right',
    to: SPEAKER_AT,
    wall: '-y',
  },
  {
    title: 'KITCHEN',
    note: 'coffee, snacks, the fridge',
    at: [1330, 290],
    align: 'right',
    to: [18.4, 1.7, 1.0],
  },
  {
    title: 'DESKS',
    note: 'one per live session',
    at: [1330, 770],
    align: 'right',
    to: [15.4, 14.6 - DESK_SEAT_GAP, 0.8],
  },
  {
    title: 'CABINETS',
    note: 'context, filed away',
    at: [1330, 660],
    align: 'right',
    to: [21.3, 9.6, 1.2],
  },
  {
    title: 'LOUNGE',
    note: 'sofa, armchair, a bean bag',
    at: [1330, 885],
    align: 'right',
    to: [19.9, 19.4, 0.5],
  },
  {
    title: 'THE DOOR',
    note: 'helpers file in and out',
    at: [62, 760],
    align: 'left',
    to: [12.7, 21.85, 1.6],
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

  drawPlanks(k, next);
  k.inkScreen(
    top.map((p) => k.P(p)),
    INK.panel
  );
  k.silhouette(outline, INK.silhouette);
}

/** Plank rows run along x, this wide; boards in a row are this long, give or take. */
const PLANK = { w: 0.7, len: 3.4, spread: 1.8 } as const;

/**
 * The floor's boards: each one its own oak tone, with a few streaks of grain
 * and a darker seam, their butt joints staggered row to row, then a sheen of
 * varnish over the lot, brightest toward the windows.
 */
function drawPlanks(k: Iso, next: () => number): void {
  const { x0, y0, x1, y1 } = FLOOR;
  const ctx = k.ctx;
  const seam = mix(MAT.floor.d, '#000000', 0.15);
  for (let y = y0, row = 0; y < y1 - 1e-6; y += PLANK.w, row++) {
    const yb = Math.min(y1, y + PLANK.w);
    let x = x0 - next() * PLANK.len;
    while (x < x1) {
      const len = PLANK.len + (next() - 0.5) * PLANK.spread;
      const a = Math.max(x0, x);
      const b = Math.min(x1, x + len);
      if (b - a > 0.02) {
        const tone = PLANKS[Math.floor(next() * PLANKS.length)];
        const quad: V3[] = [
          [a, y, 0],
          [b, y, 0],
          [b, yb, 0],
          [a, yb, 0],
        ];
        k.fill(quad, k.grade(quad, [0, 0, 1], tone));
        // Grain: two or three long, faint streaks along the board.
        ctx.save();
        ctx.strokeStyle = mix(tone, '#5a3518', 0.35);
        ctx.lineWidth = 0.55;
        ctx.globalAlpha = 0.35;
        const streaks = 2 + Math.floor(next() * 2);
        for (let i = 0; i < streaks; i++) {
          const v = y + PLANK.w * (0.18 + next() * 0.64);
          const s0 = a + (b - a) * next() * 0.3;
          const s1 = b - (b - a) * next() * 0.3;
          const bow = (next() - 0.5) * 0.08;
          const p0 = k.P([s0, v, 0]);
          const pm = k.P([(s0 + s1) / 2, v + bow, 0]);
          const p1 = k.P([s1, v, 0]);
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]);
          ctx.quadraticCurveTo(pm[0], pm[1], p1[0], p1[1]);
          ctx.stroke();
        }
        // Now and then a knot.
        if (next() < 0.12) {
          const [kx, ky] = k.P([a + (b - a) * (0.2 + next() * 0.6), y + PLANK.w * 0.5, 0]);
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.ellipse(kx, ky, 2.4, 1.2, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        // The butt joint at the board's end.
        if (b < x1 - 0.01) {
          k.line(
            [
              [b, y, 0],
              [b, yb, 0],
            ],
            INK.hair,
            false,
            seam
          );
        }
      }
      x += len;
    }
    k.line(
      [
        [x0, yb, 0],
        [x1, yb, 0],
      ],
      INK.hair,
      false,
      seam
    );
  }
  // Varnish: a soft sheen across the boards, brightest toward the windows.
  const [ax, ay] = k.P([x0, (y0 + y1) / 2, 0]);
  const [bx, by] = k.P([x1, (y0 + y1) / 2, 0]);
  const sheen = ctx.createLinearGradient(ax, ay, bx, by);
  sheen.addColorStop(0, 'rgba(255,248,226,0.16)');
  sheen.addColorStop(0.5, 'rgba(255,248,226,0.04)');
  sheen.addColorStop(1, 'rgba(60,30,10,0.06)');
  k.fill(
    [
      [x0, y0, 0],
      [x1, y0, 0],
      [x1, y1, 0],
      [x0, y1, 0],
    ],
    sheen
  );
}

/**
 * Daylight through the windows on the home view's left wall: each pane laid
 * on the floor as a warm patch, thrown into the room and down, with the
 * window's cross bars left in shadow between them. Drawn under the furniture.
 */
function drawSunlight(k: Iso, yaw: number): void {
  const alpha = wallAlpha('-x', yaw);
  if (alpha <= 0.01) {
    return;
  }
  // Where a point on the wall lands on the floor: in along x, a little along y.
  const SUN_DIR: V2 = [1.05, 0.42];
  const land = (y: number, z: number): V3 => [WALL_X + z * SUN_DIR[0], y + z * SUN_DIR[1], 0.004];
  const ctx = k.ctx;
  ctx.save();
  ctx.globalAlpha *= alpha;
  k.place([0, 0, 0]);
  for (const piece of WALL_PIECES) {
    if ((piece.name !== 'window' && piece.name !== 'windowBlind') || piece.wall !== '-x') {
      continue;
    }
    const wy = piece.place.at[1];
    const { x0, x1, z0, transom } = WINDOW;
    const z1 = piece.name === 'windowBlind' ? Math.min(BLIND_Z, transom) : transom;
    // Three lights, cut by the two mullions. The window's local +x runs along
    // world -y on this wall.
    const third = (x1 - x0) / 3;
    const panes: Array<[number, number, number, number]> = [0, 1, 2].map((i) => [
      x0 + i * third + (i > 0 ? 0.03 : 0),
      x0 + (i + 1) * third - (i < 2 ? 0.03 : 0),
      z0,
      z1,
    ]);
    for (const [u0, u1, lo, hi] of panes) {
      const quad: V3[] = [
        land(wy - u0, lo),
        land(wy - u1, lo),
        land(wy - u1, hi),
        land(wy - u0, hi),
      ];
      const near = k.P(land(wy, lo));
      const far = k.P(land(wy, hi));
      const paint = ctx.createLinearGradient(near[0], near[1], far[0], far[1]);
      paint.addColorStop(0, SUN.color);
      paint.addColorStop(1, mix(SUN.color, '#ffffff', 0.4));
      k.fill(quad, paint, SUN.alpha);
    }
  }
  ctx.restore();
}

/** On the floor: a plain round sage rug under the bean bag corner, after the reference. */
function drawFloorMarks(k: Iso): void {
  k.place([0, 0, 0]);
  const { x, y, r } = LOUNGE_RUG;
  const rug = lift(plane.z(0.004), ellipse(x, y, r, r, 40));
  k.fill(rug, k.grade(rug, [0, 0, 1], '#a9b98f'));
  k.line(rug, INK.detail, true, '#7f9068');
  k.line(lift(plane.z(0.005), ellipse(x, y, r - 0.1, r - 0.1, 40)), INK.hair, true, '#c3d0aa');
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

/** Each wall's paint, by side. The home view's back right wall is the feature wall. */
const PAINT: Record<WallSide, Mat> = {
  '-y': MAT.sand,
  '-x': MAT.paint,
  '+x': MAT.paint,
  '+y': MAT.paint,
};
/** Heights on the wall: the skirting, the wainscot and its rail, the cornice. */
const TRIM = { skirt: 0.2, rail: 1.0, railTop: 1.07, cornice: 0.1 } as const;

/**
 * The walls that stand from this yaw, back to front. Each is cut plaster on
 * its top and ends, painted on its inner face — the paint grading darker into
 * the floor and the corners — with a panelled wainscot below a cream dado
 * rail, a skirting board, and a cornice along the top.
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
    const [ox, oy] = OUTWARD[wall.side];
    const inward: V3 = [-ox, -oy, 0];
    const paint = PAINT[wall.side];
    const wainscot: Mat = {
      l: mix(paint.l, '#000000', 0.1),
      m: mix(paint.m, '#000000', 0.1),
      d: mix(paint.d, '#000000', 0.1),
    };
    for (const [lo, hi] of wall.boxes) {
      k.box(lo, hi, MAT.wall, { ink: INK.silhouette, rim: false });
      if (!k.facing(inward)) {
        continue;
      }
      // This box's inner face, between two heights.
      const face = (za: number, zb: number): V3[] | null => {
        const z0 = Math.max(lo[2], za);
        const z1 = Math.min(hi[2], zb);
        if (z1 - z0 < 1e-3) {
          return null;
        }
        const along = wall.side === '-y' || wall.side === '+y';
        const fixed =
          wall.side === '-x' || wall.side === '-y'
            ? along
              ? hi[1]
              : hi[0]
            : along
              ? lo[1]
              : lo[0];
        const [a0, a1] = along ? [lo[0], hi[0]] : [lo[1], hi[1]];
        const at = (a: number, z: number): V3 => (along ? [a, fixed, z] : [fixed, a, z]);
        return [at(a0, z0), at(a1, z0), at(a1, z1), at(a0, z1)];
      };
      const band = (za: number, zb: number, m: Mat, ink = 0): void => {
        const q = face(za, zb);
        if (q) {
          k.lit(q, inward, m);
          if (ink > 0) {
            k.line(q, ink, true);
          }
        }
      };
      band(TRIM.railTop, hi[2], paint);
      band(TRIM.skirt, TRIM.rail, wainscot);
      // The wainscot's raised panels.
      const panelled = face(TRIM.skirt + 0.12, TRIM.rail - 0.1);
      if (panelled) {
        const [p0, p1] = [panelled[0], panelled[1]];
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        const count = Math.max(1, Math.round(len / 1.5));
        const z0 = panelled[0][2];
        const z1 = panelled[2][2];
        for (let i = 0; i < count; i++) {
          const t0 = (i + 0.08) / count;
          const t1 = (i + 0.92) / count;
          const at = (t: number, z: number): V3 => [
            p0[0] + (p1[0] - p0[0]) * t + inward[0] * 0.002,
            p0[1] + (p1[1] - p0[1]) * t + inward[1] * 0.002,
            z,
          ];
          const quad = [at(t0, z0), at(t1, z0), at(t1, z1), at(t0, z1)];
          k.line(quad, 0.8, true, mix(wainscot.d, '#000000', 0.15));
          // The lit lower and right edges of each panel catch a highlight.
          k.line([at(t0, z0), at(t1, z0), at(t1, z1)], 0.7, false, mix(paint.l, '#ffffff', 0.3));
        }
      }
      band(0, TRIM.skirt, MAT.trim, INK.hair);
      band(TRIM.rail, TRIM.railTop, MAT.trim, INK.hair);
      band(hi[2] - TRIM.cornice, hi[2], MAT.trim, INK.hair);
      // The corners are darker: a little occlusion at each end of the wall.
      const all = face(0, hi[2]);
      if (all) {
        const [[ix, iy], [jx, jy]] = wall.inner;
        const [a, b] = [k.P([ix, iy, 0]), k.P([jx, jy, 0])];
        const occl = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        const reach = Math.min(0.45, 0.9 / (Math.hypot(jx - ix, jy - iy) || 1));
        occl.addColorStop(0, 'rgba(40,24,10,0.2)');
        occl.addColorStop(reach, 'rgba(40,24,10,0)');
        occl.addColorStop(1 - reach, 'rgba(40,24,10,0)');
        occl.addColorStop(1, 'rgba(40,24,10,0.2)');
        k.fill(all, occl);
      }
    }
    ctx.restore();
  }
}

/** A soft band of shade on the floor along the foot of each standing wall. */
function drawWallFoot(k: Iso, yaw: number): void {
  k.place([0, 0, 0]);
  const ctx = k.ctx;
  for (const wall of walls()) {
    const alpha = wallAlpha(wall.side, yaw);
    if (alpha <= 0.01) {
      continue;
    }
    const [[ax, ay], [bx, by]] = wall.inner;
    const [ox, oy] = OUTWARD[wall.side];
    const w = 0.55;
    const quad: V3[] = [
      [ax, ay, 0.003],
      [bx, by, 0.003],
      [bx - ox * w, by - oy * w, 0.003],
      [ax - ox * w, ay - oy * w, 0.003],
    ];
    const p0 = k.P([ax, ay, 0]);
    const p1 = k.P([ax - ox * w, ay - oy * w, 0]);
    const paint = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
    paint.addColorStop(0, 'rgba(60,34,14,0.28)');
    paint.addColorStop(1, 'rgba(60,34,14,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    k.fill(quad, paint);
    ctx.restore();
  }
}

/**
 * Bake the whole static sheet into one canvas at a device resolution. The
 * furniture's shadows are painted into a layer of their own first and laid
 * down in one pass, so two overlapping shadows are not twice as dark.
 */
/** How soft cast shadows are at the edge, in sheet pixels. */
const SHADOW_SOFTNESS = 1.6;

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
  drawWallFoot(k, yaw);
  drawSunlight(k, yaw);
  drawFloorMarks(k);
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
  // Soften the shadows' edges, as a room's diffuse light does.
  ctx.filter = `blur(${(SHADOW_SOFTNESS * resolution).toFixed(2)}px)`;
  ctx.drawImage(shade, 0, 0);
  ctx.filter = 'none';
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
