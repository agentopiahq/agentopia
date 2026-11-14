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
 * Nobody walks through any of it: `OBSTACLES` is the floor it all takes up,
 * and every walk is routed round it (`route.ts`).
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
   * Its task chair, pushed back and swung aside to the right of the seat
   * while nobody sits at the desk (the office pulls it in under a seated
   * lead).
   */
  chair: Point;
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
    chair: { x: x + 0.85, y: y + 0.1 },
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
 * Rooms within the room: set dressing walled off from the open floor. The
 * booths are closed boxes walks go round; the meeting room is walked into,
 * through the double door in its front glass (see `MEETING_DOOR`).
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

/** The meeting room, whose glass sides walks go round and whose door they go through. */
export const MEETING: Enclosure = ROOMS.find((room) => room.kind === 'meeting') ?? ROOMS[0];

/**
 * The meeting room's double door: the two glass panels at the end of its
 * front glass nearest the open floor, two tiles wide.
 */
export const MEETING_DOOR = { x0: MEETING.x1 - 2, x1: MEETING.x1, y: MEETING.y1 } as const;

/** The meeting room's table, with its six chairs round it: one block nobody walks through. */
export const MEETING_TABLE: Rect = (() => {
  const cx = (MEETING.x0 + MEETING.x1) / 2;
  const cy = (MEETING.y0 + MEETING.y1) / 2;
  return { x0: cx - 2.2, y0: cy - 1.2, x1: cx + 2.2, y1: cy + 1.2 };
})();

/**
 * The fastest the legs ever go, in full strides (both feet) a second. Past
 * it nothing steps any quicker: the figure breaks into a run instead, its
 * legs a wheel.
 */
export const MAX_STRIDES_PER_SEC = 3.5;

/**
 * How each gait covers the ground: tiles per full stride, and the fastest it
 * goes, which is where the legs hit `MAX_STRIDES_PER_SEC`. The viewer steps
 * the legs by the distance covered, so they never glide; the director picks
 * the gait by speed, so they never blur.
 */
export const GAIT = {
  walking: { cycle: 0.95, max: 0.95 * MAX_STRIDES_PER_SEC },
  sprinting: { cycle: 1.4, max: 1.4 * MAX_STRIDES_PER_SEC },
  pacing: { cycle: 0.55, max: 0.55 * MAX_STRIDES_PER_SEC },
} as const;

/** An unhurried walk, in tiles a second: as fast as walking legs go. */
export const WALK_TILES_PER_SEC = GAIT.walking.max;

/** A floor rectangle, in tiles. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The floor inside the four walls: as far as anyone can walk. */
export const INSIDE: Rect = { x0: 0.6, y0: 1.3, x1: 21.7, y1: 21.7 };

/** How far the desk stands behind its seat, centre to seat. */
export const DESK_SEAT_GAP = 1.25;
/** Half a desk's width and depth. */
export const DESK_HALF = { w: 1.2, d: 0.5 } as const;

/** Where the plants stand: corners and zone edges nobody walks through. */
export const PLANTS: Point[] = [
  { x: 1.15, y: 6.4 },
  { x: 1.15, y: 15.4 },
  { x: 2.95, y: 21.2 },
  { x: 11.3, y: 21.15 },
  { x: 14.1, y: 21.15 },
  { x: 21.2, y: 4.3 },
  { x: 21.2, y: 12.9 },
  { x: 8.6, y: 21.15 },
];

/**
 * The pets' bowls: a food bowl and a water bowl each for the cat and the dog,
 * in a row against the right wall at the kitchen end, between the plant and
 * the café table. A pet eats standing at the bowl, facing the wall.
 */
export const PET_BOWLS = {
  cat: { food: { x: 21.42, y: 4.86 }, water: { x: 21.42, y: 5.1 } },
  dog: { food: { x: 21.42, y: 5.34 }, water: { x: 21.42, y: 5.58 } },
} as const;

/** The dog's bed: a round cushion in the sun under the window, by the desks. */
export const DOG_BED = { x: 2.7, y: 8.15, r: 0.42 } as const;

/**
 * The floor the rest of the set dressing stands on — the pieces core never
 * sends anyone to, but which every walk has to go round. The viewer draws
 * them, and its room test keeps each one it draws inside one of these.
 */
export const SET_DRESSING: Rect[] = [
  // Along the far right wall: the print corner, then the kitchen strip.
  { x0: 13.3, y0: 1.3, x1: 16.35, y1: 2.65 },
  { x0: 16.35, y0: 1.3, x1: 21.7, y1: 2.05 },
  { x0: 17.7, y0: 4.6, x1: 19.5, y1: 5.4 },
  // The café tables, each with a chair either side.
  { x0: 14.1, y0: 6.3, x1: 16.3, y1: 7.3 },
  { x0: 16.5, y0: 7.4, x1: 18.7, y1: 8.4 },
  { x0: 19.1, y0: 5.9, x1: 21.3, y1: 6.9 },
  // The storage bank on the near right wall, and the pair behind the desks.
  { x0: 21.0, y0: 7.95, x1: 21.7, y1: 11.4 },
  { x0: 4.15, y0: 7.0, x1: 5.9, y1: 7.6 },
  // The sprint board and the huddle table with its four chairs.
  { x0: 14.45, y0: 9.85, x1: 18.35, y1: 10.8 },
  { x0: 15.15, y0: 11.15, x1: 17.65, y1: 13.65 },
  // The lounge: the screen, the two sofas, the armchair, the bean bag and
  // its side table.
  { x0: 17.15, y0: 17.2, x1: 20.05, y1: 17.6 },
  { x0: 17.1, y0: 19.05, x1: 20.1, y1: 21.7 },
  { x0: 20.6, y0: 18.75, x1: 21.7, y1: 20.45 },
  { x0: 15.5, y0: 19.0, x1: 17.1, y1: 20.55 },
  // The corner sofa and its coffee table, and the bookshelf.
  { x0: 0.6, y0: 18.45, x1: 2.95, y1: 21.45 },
  { x0: 4.75, y0: 20.35, x1: 7.25, y1: 20.85 },
  // The pets' bowls by the right wall, and the dog's bed under the window.
  { x0: 21.25, y0: 4.7, x1: 21.7, y1: 5.75 },
  {
    x0: DOG_BED.x - DOG_BED.r,
    y0: DOG_BED.y - DOG_BED.r,
    x1: DOG_BED.x + DOG_BED.r,
    y1: DOG_BED.y + DOG_BED.r,
  },
  // The plants.
  ...PLANTS.map(({ x, y }) => ({ x0: x - 0.22, y0: y - 0.22, x1: x + 0.22, y1: y + 0.22 })),
];

/** Half the floor a desk's task chair takes, swung aside: it is built wide, to the avatar. */
const CHAIR_HALF = 0.42;

/**
 * Everything nobody walks through: every desk and its chair, the rooms within
 * the room, and the set dressing. Walks go round them (see `route`).
 */
export const OBSTACLES: Rect[] = [
  ...DESKS.flatMap((d): Rect[] => [
    {
      x0: d.seat.x - DESK_HALF.w,
      y0: d.seat.y - DESK_SEAT_GAP - DESK_HALF.d,
      x1: d.seat.x + DESK_HALF.w,
      y1: d.seat.y - DESK_SEAT_GAP + DESK_HALF.d,
    },
    {
      x0: d.chair.x - CHAIR_HALF,
      y0: d.chair.y - CHAIR_HALF,
      x1: d.chair.x + CHAIR_HALF,
      y1: d.chair.y + CHAIR_HALF,
    },
  ]),
  // A booth's glass stands astride its edge.
  ...ROOMS.filter((room) => room.kind === 'booth').map(({ x0, y0, x1, y1 }) => ({
    x0: x0 - 0.05,
    y0: y0 - 0.05,
    x1: x1 + 0.05,
    y1: y1 + 0.05,
  })),
  // The meeting room's two glass sides, open at its door, and its table.
  { x0: MEETING.x0, y0: MEETING.y1 - 0.06, x1: MEETING_DOOR.x0, y1: MEETING.y1 + 0.06 },
  { x0: MEETING.x1 - 0.06, y0: MEETING.y0, x1: MEETING.x1 + 0.06, y1: MEETING.y1 + 0.06 },
  MEETING_TABLE,
  ...SET_DRESSING,
];
