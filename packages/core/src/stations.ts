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
export type FloorStationId =
  'door' | 'speaker' | 'printers' | 'copiers' | 'shutter' | 'cabinets_left' | 'cabinets_right';

/**
 * Pseudo-stations resolve per worker: `own_desk` is the lead's seat or a
 * helper's spot beside it, and `cabinets` is whichever wall of cabinets is
 * nearer the worker's desk.
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
  cabinets_left: { id: 'cabinets_left', spot: { x: 2.7, y: 10 }, label: 'Cabinets' },
  cabinets_right: { id: 'cabinets_right', spot: { x: 19.3, y: 10 }, label: 'Cabinets' },
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

/** The wall of cabinets on the same side of the room as a desk. */
export function cabinetsFor(slot: number): Point {
  return deskFor(slot).x < GRID.width / 2
    ? STATIONS.cabinets_left.spot
    : STATIONS.cabinets_right.spot;
}

export const WALK_TILES_PER_SEC = 6;
