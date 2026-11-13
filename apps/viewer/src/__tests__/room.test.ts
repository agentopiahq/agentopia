import { DESKS, FURNITURE, GRID } from '@agentopia/core';

import { Iso } from '../kit/iso';
import { OBJECTS } from '../objects';
import { worldBox } from '../objects/bake';
import { DESK_PIECES, ROOM_PIECES, SHEET_H, SHEET_W, WALL_X, WALL_Y, sheetPoint } from '../room';

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

  it('turns each cabinet to face the room', () => {
    for (const piece of ROOM_PIECES.filter((p) => p.name === 'cabinet')) {
      const left = piece.place.at[0] < GRID.width / 2;
      expect(piece.place.facing).toBe(left ? '+x' : '-x');
    }
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
