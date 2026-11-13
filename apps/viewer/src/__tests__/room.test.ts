import {
  CABINET_SPOTS,
  DESKS,
  FURNITURE,
  GRID,
  INSIDE,
  OBSTACLES,
  cabinetFaces,
} from '@agentopia/core';

import { Iso } from '../kit/iso';
import { OBJECTS } from '../objects';
import { worldBox } from '../objects/bake';
import {
  DESK_PIECES,
  ROOM_PIECES,
  SHEET_H,
  SHEET_W,
  WALL_X,
  WALL_Y,
  sheetPoint,
  wallAlpha,
} from '../room';

const pen = (): Iso => new Iso({} as CanvasRenderingContext2D, { unit: 32 });

describe('the room', () => {
  it('stands a desk in front of every seat core hands out', () => {
    expect(DESK_PIECES).toHaveLength(DESKS.length);
    DESKS.forEach((desk, i) => {
      const k = pen();
      const piece = DESK_PIECES[i];
      k.place(piece.place.at, piece.place.facing);
      const [lo, hi] = worldBox(k, OBJECTS.desk.footprint);
      // The seat is in front of the desk, inside its width.
      expect(desk.seat.y).toBeGreaterThan(hi[1]);
      expect(desk.seat.x).toBeGreaterThan(lo[0]);
      expect(desk.seat.x).toBeLessThan(hi[0]);
    });
  });

  it.each(['cabinet', 'printer', 'copier', 'door'] as const)(
    'draws every %s core lays out',
    (kind) => {
      const wanted = FURNITURE.filter((piece) => piece.kind === kind).length;
      expect(ROOM_PIECES.filter((piece) => piece.name === kind)).toHaveLength(wanted);
    }
  );

  it('turns each cabinet the way core lays it out, drawers to where its user stands', () => {
    const cabinets = FURNITURE.filter((piece) => piece.kind === 'cabinet');
    const pieces = ROOM_PIECES.filter((p) => p.name === 'cabinet');
    pieces.forEach((piece, i) => {
      expect(piece.place.facing).toBe(cabinetFaces(cabinets[i]));
      // The spot a worker files from is in front of the drawers.
      const k = pen();
      k.place(piece.place.at, piece.place.facing);
      const front = k.world([0, 1, 0]);
      const spot = CABINET_SPOTS[i];
      expect(Math.hypot(front[0] - spot.x, front[1] - spot.y)).toBeLessThan(0.5);
    });
  });

  it('keeps every standing piece inside the walls and on the floor', () => {
    for (const piece of [...ROOM_PIECES, ...DESK_PIECES]) {
      const k = pen();
      k.place(piece.place.at, piece.place.facing);
      const [lo, hi] = worldBox(k, OBJECTS[piece.name].footprint);
      expect(lo[0]).toBeGreaterThanOrEqual(WALL_X - 1e-6);
      expect(lo[1]).toBeGreaterThanOrEqual(WALL_Y - 1e-6);
      expect(hi[0]).toBeLessThanOrEqual(GRID.width + 1e-6);
      expect(hi[1]).toBeLessThanOrEqual(GRID.height + 1e-6);
    }
  });

  it('bounds core’s walkable floor by the walls', () => {
    expect(INSIDE.x0).toBeCloseTo(WALL_X);
    expect(INSIDE.y0).toBeCloseTo(WALL_Y);
  });

  // Core routes every walk round its obstacles; a piece the room draws that
  // core does not know about is one the avatar would walk straight through.
  // The front door is the one piece everyone walks through.
  it.each(
    [...ROOM_PIECES, ...DESK_PIECES]
      .filter((piece) => piece.name !== 'door')
      .map((piece): [string, (typeof ROOM_PIECES)[number]] => [
        `${piece.name} at (${piece.place.at[0]}, ${piece.place.at[1]})`,
        piece,
      ])
  )('stands the %s where core routes walks round it', (_name, piece) => {
    const k = pen();
    k.place(piece.place.at, piece.place.facing);
    const [lo, hi] = worldBox(k, OBJECTS[piece.name].footprint);
    const n = 5;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = lo[0] + ((hi[0] - lo[0]) * (i + 0.5)) / n;
        const y = lo[1] + ((hi[1] - lo[1]) * (j + 0.5)) / n;
        const covered = OBSTACLES.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
        if (!covered) {
          throw new Error(`(${x.toFixed(2)}, ${y.toFixed(2)}) is not in any core obstacle`);
        }
      }
    }
  });

  it('fits the whole floor on the sheet', () => {
    for (const corner of [
      [WALL_X, WALL_Y, 3],
      [GRID.width, WALL_Y, 0],
      [WALL_X, GRID.height, 0],
      [GRID.width, GRID.height, -1],
    ] as const) {
      const [x, y] = sheetPoint([corner[0], corner[1], corner[2]]);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(SHEET_W);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(SHEET_H);
    }
  });
});

describe('turning the room', () => {
  it.each<[number, string[]]>([
    [0, ['-x', '-y']],
    [Math.PI, ['+x', '+y']],
    [Math.PI / 2, ['-x', '+y']],
  ])('stands only the far walls at yaw %d', (yaw, far) => {
    const standing = (['-x', '-y', '+x', '+y'] as const).filter(
      (side) => wallAlpha(side, yaw) > 0.5
    );
    expect([...standing].sort()).toEqual([...far].sort());
  });

  it('puts the home view exactly where the unturned sheet was', () => {
    const p: [number, number, number] = [5, 7, 1];
    const [x, y] = sheetPoint(p, 0);
    const turnedTwice = sheetPoint(p, Math.PI * 2);
    expect(turnedTwice[0]).toBeCloseTo(x);
    expect(turnedTwice[1]).toBeCloseTo(y);
  });
});
