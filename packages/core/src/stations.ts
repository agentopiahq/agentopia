import { CubicleEvent, ToolKind } from './events';

/**
 * The office floor plan, in tile space.
 *
 * ~48 x 18 tiles. Everything positional lives here — station spots, desk
 * slots, the door — and never in a renderer. Positions are tile coordinates;
 * actors interpolate between them with fractional offsets.
 */

export const GRID = { width: 48, height: 18 } as const;

export type FloorStationId =
  | 'door'
  | 'human_desk'
  | 'archive'
  | 'map_wall'
  | 'workbench'
  | 'phone_booth'
  | 'mail_room'
  | 'whiteboard'
  | 'box_room'
  | 'coffee';

/**
 * `own_desk` is a pseudo-station: it resolves to the acting worker's own desk
 * slot. Shell work happens at the worker's own computer, not a shared rack.
 */
export type StationId = FloorStationId | 'own_desk';

export interface Point {
  x: number;
  y: number;
}

export interface Station {
  id: FloorStationId;
  /** Where a worker stands to use it. */
  spot: Point;
  label: string;
}

/**
 * Stations hug the walls; desks fill the middle. The door is bottom-left, the
 * human sits bottom-center facing the room, and the coffee machine is far
 * right — walks to it cross the office, which is the point.
 */
export const STATIONS: Record<FloorStationId, Station> = {
  door: { id: 'door', spot: { x: 2, y: 15 }, label: 'Door' },
  human_desk: { id: 'human_desk', spot: { x: 22, y: 15 }, label: 'You' },
  archive: { id: 'archive', spot: { x: 4, y: 3 }, label: 'Archive' },
  map_wall: { id: 'map_wall', spot: { x: 13, y: 2 }, label: 'Map wall' },
  whiteboard: { id: 'whiteboard', spot: { x: 24, y: 2 }, label: 'Whiteboard' },
  workbench: { id: 'workbench', spot: { x: 35, y: 2 }, label: 'Workbench' },
  phone_booth: { id: 'phone_booth', spot: { x: 45, y: 7 }, label: 'Phone booth' },
  mail_room: { id: 'mail_room', spot: { x: 45, y: 12 }, label: 'Mail room' },
  box_room: { id: 'box_room', spot: { x: 2, y: 8 }, label: 'Box room' },
  coffee: { id: 'coffee', spot: { x: 44, y: 15 }, label: 'Coffee' },
};

/**
 * Worker desks, two rows across the middle of the room. The lead always takes
 * slot 0 — front row, nearest the human. Slot order is the seating order for
 * arriving subagents.
 */
export const DESKS: Point[] = [
  { x: 14, y: 11 },
  { x: 22, y: 11 },
  { x: 30, y: 11 },
  { x: 14, y: 7 },
  { x: 22, y: 7 },
  { x: 30, y: 7 },
  { x: 38, y: 11 },
  { x: 38, y: 7 },
];

/**
 * Where a tool call sends its worker.
 *
 * MCP tools go to the mail room whatever their kind, and memory reads go to
 * the archive like other reads (the renderer distinguishes them by prop, not
 * by station).
 */
export function stationForTool(kind: ToolKind, meta?: CubicleEvent['meta']): StationId {
  if (meta?.mcp) {
    return 'mail_room';
  }
  switch (kind) {
    case 'read':
      return 'archive';
    case 'search':
      return 'map_wall';
    case 'edit':
      return 'workbench';
    case 'delete':
    case 'move':
      return 'box_room';
    case 'execute':
      return 'own_desk';
    case 'fetch':
      return 'phone_booth';
    case 'think':
      return 'whiteboard';
    case 'other':
      return 'mail_room';
    default:
      return 'mail_room';
  }
}

export function deskFor(slot: number): Point {
  return DESKS[slot % DESKS.length];
}

export const WALK_TILES_PER_SEC = 6;
