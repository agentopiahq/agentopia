import { AgentopiaEvent, ToolKind } from './events';

/**
 * The office floor plan, in tile space.
 *
 * ~48 x 18 tiles. Everything positional lives here — station spots, desk
 * slots, the door — and never in a renderer. Positions are tile coordinates;
 * actors interpolate between them with fractional offsets.
 */

export const GRID = { width: 22, height: 22 } as const;

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
 * A cozy square room. Stations hug the walls; desks fill the middle. The door
 * is bottom-left, the human sits bottom-center facing the room, and the
 * coffee machine is bottom-right — walks to it cross the office, which is
 * the point.
 */
export const STATIONS: Record<FloorStationId, Station> = {
  door: { id: 'door', spot: { x: 2, y: 19 }, label: 'Door' },
  human_desk: { id: 'human_desk', spot: { x: 11, y: 19 }, label: 'You' },
  archive: { id: 'archive', spot: { x: 3.4, y: 2.6 }, label: 'Archive' },
  map_wall: { id: 'map_wall', spot: { x: 8.6, y: 2.4 }, label: 'Map wall' },
  whiteboard: { id: 'whiteboard', spot: { x: 13.6, y: 2.4 }, label: 'Whiteboard' },
  workbench: { id: 'workbench', spot: { x: 18.6, y: 2.6 }, label: 'Workbench' },
  phone_booth: { id: 'phone_booth', spot: { x: 19.6, y: 8 }, label: 'Phone booth' },
  mail_room: { id: 'mail_room', spot: { x: 19.6, y: 13 }, label: 'Mail room' },
  box_room: { id: 'box_room', spot: { x: 2.2, y: 9 }, label: 'Box room' },
  coffee: { id: 'coffee', spot: { x: 19, y: 19 }, label: 'Coffee' },
};

/**
 * Worker desks, two rows across the middle of the room. The lead always takes
 * slot 0 — front row, nearest the human. Slot order is the seating order for
 * arriving subagents.
 */
export const DESKS: Point[] = [
  { x: 6, y: 14 },
  { x: 11, y: 14 },
  { x: 16, y: 14 },
  { x: 6, y: 9 },
  { x: 11, y: 9 },
  { x: 16, y: 9 },
];

/**
 * Where a tool call sends its worker.
 *
 * MCP tools go to the mail room whatever their kind, and memory reads go to
 * the archive like other reads (the renderer distinguishes them by prop, not
 * by station).
 */
export function stationForTool(kind: ToolKind, meta?: AgentopiaEvent['meta']): StationId {
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
