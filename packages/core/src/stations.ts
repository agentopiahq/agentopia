import { CubicleEvent, ToolKind } from './events';

/**
 * The office floor plan, in tile space.
 *
 * ~48 x 18 tiles. Everything positional lives here — station spots, desk
 * slots, the door — and never in a renderer. Positions are tile coordinates;
 * actors interpolate between them with fractional offsets.
 */

export const GRID = { width: 48, height: 18 } as const;

export type StationId =
  | 'door'
  | 'human_desk'
  | 'archive'
  | 'map_wall'
  | 'workbench'
  | 'terminal_rack'
  | 'phone_booth'
  | 'mail_room'
  | 'whiteboard'
  | 'box_room'
  | 'coffee';

export interface Point {
  x: number;
  y: number;
}

export interface Station {
  id: StationId;
  /** Where a worker stands to use it. */
  spot: Point;
  label: string;
}

/**
 * Stations hug the walls; desks fill the middle. The door is bottom-left, the
 * human sits bottom-center facing the room, and the coffee machine is far
 * right — walks to it cross the office, which is the point.
 */
export const STATIONS: Record<StationId, Station> = {
  door: { id: 'door', spot: { x: 2, y: 15 }, label: 'Door' },
  human_desk: { id: 'human_desk', spot: { x: 22, y: 15 }, label: 'You' },
  archive: { id: 'archive', spot: { x: 4, y: 3 }, label: 'Archive' },
  map_wall: { id: 'map_wall', spot: { x: 12, y: 2 }, label: 'Map wall' },
  whiteboard: { id: 'whiteboard', spot: { x: 21, y: 2 }, label: 'Whiteboard' },
  workbench: { id: 'workbench', spot: { x: 30, y: 2 }, label: 'Workbench' },
  terminal_rack: { id: 'terminal_rack', spot: { x: 39, y: 3 }, label: 'Terminal rack' },
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
      return 'terminal_rack';
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
