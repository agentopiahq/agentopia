/**
 * The office floor plan, in tile space.
 *
 * One office, 22 x 22 tiles, zoned the way a real one is. Seen from the home
 * view (the far corner at the top):
 *
 * - Along the far right wall, the support strip: a glass meeting room in the
 *   far corner, two phone booths, the speaker, the print corner (a copier and
 *   a printer), and the kitchen, with a bar table in front of it.
 * - The far left wall is the window wall; the desks stand in its daylight,
 *   three across and two deep, side-on to the glass so no screen faces it.
 * - A storage bank of cabinets on the near right wall, and a pair between the
 *   windows on the left, so every desk has filing close by.
 * - Along the near wall, the entrance in the middle, with a huddle table on
 *   its left and the lounge (sofa, armchair, a bean bag) on its right.
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
  speaker: { id: 'speaker', spot: { x: 11.6, y: 2.9 }, label: 'Speaker' },
  printers: { id: 'printers', spot: { x: 14.8, y: 3.3 }, label: 'Printers' },
  copiers: { id: 'copiers', spot: { x: 13.0, y: 3.5 }, label: 'Copiers' },
};

export type FurnitureKind = 'speaker' | 'printer' | 'copier' | 'cabinet' | 'door';

/** A piece of set dressing and where it sits. Renderers draw these; nobody walks to them. */
export interface Furniture {
  kind: FurnitureKind;
  at: Point;
}

/**
 * The speaker hangs on the far right wall between the booths and the print
 * corner; the copier and the printer stand side by side against that wall;
 * the cabinets make one storage bank on the near right wall; the door is in
 * the middle of the near wall, its anchor at its foot.
 */
export const FURNITURE: Furniture[] = [
  { kind: 'speaker', at: { x: 11.6, y: 1.1 } },
  { kind: 'copier', at: { x: 13.0, y: 2.1 } },
  { kind: 'printer', at: { x: 14.8, y: 1.9 } },
  { kind: 'cabinet', at: { x: 0.95, y: 9.85 } },
  { kind: 'cabinet', at: { x: 0.95, y: 10.7 } },
  { kind: 'cabinet', at: { x: 21.3, y: 8.4 } },
  { kind: 'cabinet', at: { x: 21.3, y: 9.25 } },
  { kind: 'cabinet', at: { x: 21.3, y: 10.1 } },
  { kind: 'cabinet', at: { x: 21.3, y: 10.95 } },
  { kind: 'door', at: { x: 12.7, y: 21.1 } },
];

/** Where a worker stands to use each cabinet: just inside it, off the wall. */
export const CABINET_SPOTS: Point[] = FURNITURE.filter((piece) => piece.kind === 'cabinet').map(
  ({ at }) => ({ x: at.x < GRID.width / 2 ? at.x + 1.3 : at.x - 1.3, y: at.y })
);

/** How many subagents are animated around one desk. The rest are counted. */
export const HELPERS_PER_DESK = 3;

export interface Desk {
  /** Where the lead sits; the desk itself is drawn just above it. */
  seat: Point;
  /** Where helpers stand: left of the desk, right of it, and in front. */
  helpers: Point[];
}

function desk(x: number, y: number): Desk {
  return {
    seat: { x, y },
    helpers: [
      { x: x - 1.9, y: y + 0.4 },
      { x: x + 1.9, y: y + 0.4 },
      { x, y: y + 1.8 },
    ],
  };
}

/**
 * Six desks, three across and two deep, in the window wall's daylight, with
 * the main aisle from the door running up between the second and third
 * columns. One desk per live session; slot order is the seating order for
 * arriving sessions.
 */
export const DESKS: Desk[] = [
  desk(4.6, 9.8),
  desk(10.0, 9.8),
  desk(15.4, 9.8),
  desk(4.6, 14.6),
  desk(10.0, 14.6),
  desk(15.4, 14.6),
];

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
  // whole numbers of tiles long, a panel a tile.
  { kind: 'meeting', x0: 0.6, y0: 1.3, x1: 6.6, y1: 5.3 },
  // Two phone booths beside it.
  { kind: 'booth', x0: 7.1, y0: 1.4, x1: 8.5, y1: 2.9 },
  { kind: 'booth', x0: 8.9, y0: 1.4, x1: 10.3, y1: 2.9 },
];

export const WALK_TILES_PER_SEC = 6;
