import { Iso } from '../kit/iso';
import { OBJECTS } from '../objects';
import { worldBox } from '../objects/bake';
import { AVATAR } from '../objects/scale';
import { RACK, RACK_KINDS, lightOn, rackUnits } from '../objects/serverRack';
import { FLOOR, WALL } from '../room';
import { AISLES, RACK_COUNT, RACK_ROWS, SERVER_PIECES } from '../serverRoom';

const pen = (): Iso => new Iso({} as CanvasRenderingContext2D, { unit: 32 });

const boxOf = (i: number) => {
  const piece = SERVER_PIECES[i];
  const k = pen();
  k.place(piece.place.at, piece.place.facing);
  return worldBox(k, OBJECTS[piece.name].footprint);
};

describe('the server floor', () => {
  it('stands its racks a touch taller than the avatar', () => {
    expect(RACK.h).toBeGreaterThan(AVATAR.height);
    expect(RACK.h).toBeLessThan(WALL.h);
  });

  it.each(RACK_KINDS)('fills a %s rack to its last unit', (kind) => {
    expect(rackUnits(kind)).toBe(18);
  });

  it('holds six rows of two runs of seven racks', () => {
    expect(RACK_COUNT).toBe(RACK_ROWS.length * 2 * 7);
  });

  it('keeps everything inside its walls', () => {
    SERVER_PIECES.forEach((piece, i) => {
      if (piece.name === 'door') {
        return;
      }
      const [lo, hi] = boxOf(i);
      expect(lo[0]).toBeGreaterThanOrEqual(FLOOR.x0 + WALL.t - 1e-6);
      expect(lo[1]).toBeGreaterThanOrEqual(FLOOR.y0 + WALL.t - 1e-6);
      expect(hi[0]).toBeLessThanOrEqual(FLOOR.x1 - WALL.t + 1e-6);
      expect(hi[1]).toBeLessThanOrEqual(FLOOR.y1 - WALL.t + 1e-6);
    });
  });

  it('never stands two pieces in one place', () => {
    const standing = SERVER_PIECES.map((piece, i) => ({ piece, box: boxOf(i) })).filter(
      ({ piece }) => piece.name !== 'cableTray'
    );
    for (let i = 0; i < standing.length; i++) {
      for (let j = i + 1; j < standing.length; j++) {
        const [a0, a1] = standing[i].box;
        const [b0, b1] = standing[j].box;
        const apart = [0, 1].some((ax) => a1[ax] <= b0[ax] + 1e-6 || b1[ax] <= a0[ax] + 1e-6);
        expect(apart).toBe(true);
      }
    }
  });

  it('faces fronts across the cold aisles and backs across the hot ones', () => {
    expect(AISLES.map((a) => a.kind)).toEqual(['cold', 'hot', 'cold', 'hot', 'cold']);
    for (const aisle of AISLES) {
      expect(aisle.y1 - aisle.y0).toBeGreaterThan(1.5);
    }
  });

  it.each([['steady'], ['slow'], ['flicker']] as const)(
    'blinks a %s light the same way every time',
    (blink) => {
      const once = Array.from({ length: 6 }, (_, f) => lightOn(blink, 3, f));
      const again = Array.from({ length: 6 }, (_, f) => lightOn(blink, 3, f));
      expect(once).toEqual(again);
    }
  );
});
