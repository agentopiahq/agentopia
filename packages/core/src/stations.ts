/**
 * The office floor plan, in tile space.
 *
 * One open-plan room, 22 x 22 tiles. Everything positional lives here — desk
 * seats, the helper spots around each desk, the furniture, the speaker and
 * the door — and never in a renderer. Positions are tile coordinates; actors
 * interpolate between them with fractional offsets.
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
export type FloorStationId = 'door' | 'speaker' | 'printers' | 'copiers' | 'shutter';

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
  door: { id: 'door', spot: { x: 2.4, y: 20.2 }, label: 'Door' },
  speaker: { id: 'speaker', spot: { x: 2.2, y: 3.2 }, label: 'Speaker' },
  printers: { id: 'printers', spot: { x: 10.2, y: 3.8 }, label: 'Printers' },
  copiers: { id: 'copiers', spot: { x: 16.2, y: 3.8 }, label: 'Copiers' },
  shutter: { id: 'shutter', spot: { x: 19.8, y: 3.4 }, label: 'Shutter' },
};

export type FurnitureKind = 'speaker' | 'printer' | 'copier' | 'shutter' | 'cabinet' | 'door';

/** A piece of set dressing and where it sits. Renderers draw these; nobody walks to them. */
export interface Furniture {
  kind: FurnitureKind;
  at: Point;
}

/**
 * The speaker hangs top-left; printers stand top-middle with the copiers to
 * their right and the shutter in the top-right corner; cabinets line both
 * side walls; the door stands upright in the bottom-left corner, its anchor
 * at its foot.
 */
export const FURNITURE: Furniture[] = [
  { kind: 'speaker', at: { x: 1.7, y: 1.1 } },
  { kind: 'printer', at: { x: 9.2, y: 2.4 } },
  { kind: 'printer', at: { x: 11.2, y: 2.4 } },
  { kind: 'copier', at: { x: 15.2, y: 2.4 } },
  { kind: 'copier', at: { x: 17.2, y: 2.4 } },
  { kind: 'shutter', at: { x: 19.9, y: 1.1 } },
  { kind: 'cabinet', at: { x: 1.3, y: 7.4 } },
  { kind: 'cabinet', at: { x: 1.3, y: 10 } },
  { kind: 'cabinet', at: { x: 1.3, y: 12.6 } },
  { kind: 'cabinet', at: { x: 20.7, y: 7.4 } },
  { kind: 'cabinet', at: { x: 20.7, y: 10 } },
  { kind: 'cabinet', at: { x: 20.7, y: 12.6 } },
  { kind: 'door', at: { x: 2.4, y: 21.1 } },
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
 * Six desks in two rows of three across the middle of the room. One desk per
 * live session; slot order is the seating order for arriving sessions.
 */
export const DESKS: Desk[] = [
  desk(5.5, 8.6),
  desk(11, 8.6),
  desk(16.5, 8.6),
  desk(5.5, 15.4),
  desk(11, 15.4),
  desk(16.5, 15.4),
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
 * stations and the desks, and none of them passes through the front-right
 * corner, which is where these stand.
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
  // Its two glass sides are whole numbers of tiles long, a panel a tile.
  { kind: 'meeting', x0: 15.7, y0: 18.7, x1: GRID.width - 0.3, y1: GRID.height - 0.3 },
  // Two phone booths beside it.
  { kind: 'booth', x0: 11.6, y0: 20.0, x1: 13.0, y1: 21.5 },
  { kind: 'booth', x0: 13.6, y0: 20.0, x1: 15.0, y1: 21.5 },
];

export const WALK_TILES_PER_SEC = 6;
