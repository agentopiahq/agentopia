/**
 * The office floor plan, in tile space.
 *
 * One office, 22 x 22 tiles, zoned the way a real one is. Seen from the home
 * view (the far corner at the top):
 *
 * - Along the far right wall, the support strip: a glass meeting room in the
 *   far corner, two phone booths, the speaker, the print corner (a copier and
 *   a printer), and the kitchen, with a bar table in front of it.
 * - The far left wall is the window wall; the desks stand together in its
 *   daylight toward its near corner, one block of two rows of four, side-on
 *   to the glass so no screen faces it. A huddle table and the freestanding
 *   sprint board stand in the open floor beside them; café tables stand by
 *   the kitchen.
 * - A storage bank of cabinets on the near right wall, and a low pair
 *   behind the desk block, so every desk has filing close by.
 * - Along the near wall, the entrance in the middle, a corner sofa on its
 *   left and the lounge (sofas, an armchair, a bean bag) on its right.
 *
 * Everything tall stands against the far walls, so nothing hides the floor.
 * Everything positional lives here — desk seats, the helper spots around each
 * desk, the furniture, the speaker and the door — and never in a renderer.
 * Positions are tile coordinates; actors interpolate between them with
 * fractional offsets.
 */

export const GRID = { width: 22, height: 22 } as const;

export interface Point {
  x: number;
  y: number;
}

/**
 * Spots on the floor a worker can be sent to. Tool work never goes anywhere:
 * it happens at the worker's own desk (`own_desk`). The floor stations are
 * for the few events that leave the desk — the door for arrivals and
 * departures, the speaker for asking you something, the cabinets for filing
 * context away.
 */
export type FloorStationId = 'door' | 'speaker' | 'printers' | 'copiers';

/**
 * Pseudo-stations resolve per worker: `own_desk` is the lead's seat or a
 * helper's spot beside it, and `cabinets` is the cabinet nearest the
 * worker's desk.
 */
export type StationId = FloorStationId | 'own_desk' | 'cabinets';

export interface Station {
  id: FloorStationId;
  /** Where a worker stands to use it. */
  spot: Point;
  label: string;
}

export const STATIONS: Record<FloorStationId, Station> = {
  door: { id: 'door', spot: { x: 12.7, y: 20.4 }, label: 'Door' },
  speaker: { id: 'speaker', spot: { x: 12.6, y: 3.8 }, label: 'Speaker' },
  printers: { id: 'printers', spot: { x: 15.8, y: 3.3 }, label: 'Printers' },
  copiers: { id: 'copiers', spot: { x: 14.0, y: 3.5 }, label: 'Copiers' },
};

export type FurnitureKind = 'speaker' | 'printer' | 'copier' | 'cabinet' | 'door';

/** Which way a piece's front faces, along the floor. */
export type Faces = '+x' | '-x' | '+y' | '-y';

/** A piece of set dressing and where it sits. Renderers draw these; nobody walks to them. */
export interface Furniture {
  kind: FurnitureKind;
  at: Point;
  /** Which way its front faces, where it matters (cabinets). */
  faces?: Faces;
}

/**
 * The speaker hangs on the far right wall between the booths and the print
 * corner; the copier and the printer stand side by side against that wall;
 * the cabinets make one storage bank on the near right wall; the door is in
 * the middle of the near wall, its anchor at its foot.
 */
export const FURNITURE: Furniture[] = [
  { kind: 'speaker', at: { x: 12.6, y: 1.1 } },
  { kind: 'copier', at: { x: 14.0, y: 2.1 } },
  { kind: 'printer', at: { x: 15.8, y: 1.9 } },
  { kind: 'cabinet', at: { x: 4.6, y: 7.3 }, faces: '+y' },
  { kind: 'cabinet', at: { x: 5.45, y: 7.3 }, faces: '+y' },
  { kind: 'cabinet', at: { x: 21.3, y: 8.4 }, faces: '-x' },
  { kind: 'cabinet', at: { x: 21.3, y: 9.25 }, faces: '-x' },
  { kind: 'cabinet', at: { x: 21.3, y: 10.1 }, faces: '-x' },
  { kind: 'cabinet', at: { x: 21.3, y: 10.95 }, faces: '-x' },
  { kind: 'door', at: { x: 12.7, y: 21.1 } },
];

const FACING: Record<Faces, Point> = {
  '+x': { x: 1, y: 0 },
  '-x': { x: -1, y: 0 },
  '+y': { x: 0, y: 1 },
  '-y': { x: 0, y: -1 },
};

/** Which way a cabinet faces: as laid out, else toward the middle of the room. */
export function cabinetFaces(piece: Furniture): Faces {
  return piece.faces ?? (piece.at.x < GRID.width / 2 ? '+x' : '-x');
}

/** Where a worker stands to use each cabinet: just in front of it. */
export const CABINET_SPOTS: Point[] = FURNITURE.filter((piece) => piece.kind === 'cabinet').map(
  (piece) => {
    const d = FACING[cabinetFaces(piece)];
    return { x: piece.at.x + d.x * 1.3, y: piece.at.y + d.y * 1.3 };
  }
);

/** How many subagents are animated around one desk. The rest are counted. */
export const HELPERS_PER_DESK = 3;

export interface Desk {
  /** Where the lead sits; the desk itself is drawn just above it. */
  seat: Point;
  /**
   * Where helpers stand: just behind the lead on its left and right, and one
   * a step further back. Behind, not beside, so the desks can stand side by
   * side in a row with no gap for anyone to stand in.
   */
  helpers: Point[];
}

function desk(x: number, y: number): Desk {
  return {
    seat: { x, y },
    helpers: [
      { x: x - 0.8, y: y + 1.3 },
      { x: x + 0.8, y: y + 1.3 },
      { x, y: y + 2.3 },
    ],
  };
}

/**
 * Eight desks pulled together into one block toward the window wall's near
 * corner: two rows of four, side by side, every desk facing the same way,
 * with room for helpers behind each row. One desk per live session; slot
 * order is the seating order for arriving sessions.
 */
const DESK_PITCH = 2.6;
const DESK_ROWS = [11.0, 15.8];
const DESK_COLUMNS = [2.9, 2.9 + DESK_PITCH, 2.9 + 2 * DESK_PITCH, 2.9 + 3 * DESK_PITCH];
export const DESKS: Desk[] = DESK_ROWS.flatMap((y) => DESK_COLUMNS.map((x) => desk(x, y)));

export function deskFor(slot: number): Point {
  return DESKS[slot % DESKS.length].seat;
}

export function helperSpot(slot: number, index: number): Point {
  return DESKS[slot % DESKS.length].helpers[index % HELPERS_PER_DESK];
}

/** The cabinet nearest a desk — the one its session files into. */
export function cabinetsFor(slot: number): Point {
  const seat = deskFor(slot);
  let best = CABINET_SPOTS[0];
  let bestDist = Infinity;
  for (const spot of CABINET_SPOTS) {
    const d = Math.hypot(spot.x - seat.x, spot.y - seat.y);
    if (d < bestDist) {
      bestDist = d;
      best = spot;
    }
  }
  return best;
}

/**
 * Rooms within the room: set dressing walled off from the open floor. Nobody
 * is sent into one yet, so each sits where no walk crosses it — every route
 * is a straight line, between the door, the speaker, the cabinets, the
 * stations and the desks, and none of them passes through the far corner
 * the meeting room and the booths stand in.
 */
export interface Enclosure {
  kind: 'meeting' | 'booth';
  /** Its floor rectangle, in tiles. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const ROOMS: Enclosure[] = [
  // A glass meeting room in the corner, against the two near walls.
  // In the far corner, against the two far walls. Its two glass sides are
  // whole numbers of tiles long, a panel a tile; it is big enough for the
  // avatar to walk in through its double door and all the way round its
  // table, a tile clear of every chair.
  { kind: 'meeting', x0: 0.6, y0: 1.3, x1: 7.6, y1: 5.8 },
  // Two phone booths beside it, each roomy enough for the avatar inside.
  { kind: 'booth', x0: 8.0, y0: 1.4, x1: 9.8, y1: 3.1 },
  { kind: 'booth', x0: 10.1, y0: 1.4, x1: 11.9, y1: 3.1 },
];

export const WALK_TILES_PER_SEC = 6;
