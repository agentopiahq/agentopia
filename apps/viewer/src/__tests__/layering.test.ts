import {
  CABINET_SPOTS,
  CAFE_SEATS,
  DESKS,
  MEETING_SEATS,
  Point,
  SOFA_SEATS,
  STATIONS,
  idleSpots,
} from '@agentopia/core';

import { Box3, Iso, V2, drawOrder, hull, separation, viewToward } from '../kit/iso';
import { OBJECTS } from '../objects';
import { worldBox } from '../objects/bake';
import { AVATAR } from '../objects/scale';
import { DESK_PIECES, ROOM_PIECES, sheetPoint } from '../room';

/**
 * Every spot an avatar stands or sits at, against every piece of furniture:
 * wherever the two overlap on screen and one is plainly in front of the
 * other, the office draws them that way round. This is the renderer's sort
 * (`sortCast`) on the same boxes: the figure sorts by its feet and is tested
 * for overlap by how wide and tall it is drawn.
 */

const HALF = 0.22;
const HEIGHT = 1.4;

const pieces = [...ROOM_PIECES, ...DESK_PIECES].map((piece) => {
  const k = new Iso({} as CanvasRenderingContext2D, { unit: 32 });
  k.place(piece.place.at, piece.place.facing);
  return { name: piece.name, at: piece.place.at, box: worldBox(k, OBJECTS[piece.name].footprint) };
});

const figure = (p: Point): Box3 => [
  [p.x - HALF, p.y - HALF, 0],
  [p.x + HALF, p.y + HALF, HEIGHT],
];
const outline = (p: Point): Box3 => [
  [p.x - AVATAR.width / 2, p.y - AVATAR.width / 2, 0],
  [p.x + AVATAR.width / 2, p.y + AVATAR.width / 2, AVATAR.height],
];

function overlapping(a: V2[], b: V2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [px, py] = poly[i];
      const [qx, qy] = poly[(i + 1) % poly.length];
      const nx = qy - py;
      const ny = px - qx;
      const project = (pts: V2[]): [number, number] => {
        const d = pts.map(([x, y]) => x * nx + y * ny);
        return [Math.min(...d), Math.max(...d)];
      };
      const [a0, a1] = project(a);
      const [b0, b1] = project(b);
      if (a1 <= b0 + 0.01 || b1 <= a0 + 0.01) {
        return false;
      }
    }
  }
  return true;
}

const seats = [...SOFA_SEATS, ...CAFE_SEATS.flat(), ...MEETING_SEATS].map((s) => s.spot);
const spots: Array<[string, Point]> = [
  ...Object.values(STATIONS).map((s): [string, Point] => [s.id, s.spot]),
  ...CABINET_SPOTS.map((p, i): [string, Point] => [`cabinet ${i}`, p]),
  ...DESKS.flatMap((desk, slot): Array<[string, Point]> => [
    [`desk ${slot}`, desk.seat],
    ...desk.helpers.map((p, i): [string, Point] => [`helper ${slot}.${i}`, p]),
  ]),
  ...idleSpots(),
];

/** Any seat a spot is on: it sorts against its own seat by the seat rule, not by boxes. */
const seatAt = (p: Point): boolean => seats.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 0.05);

describe.each([
  ['the home view', 0],
  ['a quarter turn round', Math.PI / 2],
  ['half way round', Math.PI],
  ['three quarters round', (3 * Math.PI) / 2],
])('layering, from %s', (_view, yaw) => {
  const view = viewToward(yaw);
  const screen = (w: [number, number, number]): V2 => sheetPoint(w, yaw);
  const outlineOf = (b: Box3): V2[] => hull(Iso.corners(b[0], b[1]).map(screen));

  it.each([...spots, ...seats.map((p, i): [string, Point] => [`seat ${i}`, p])])(
    'draws an avatar at %s the right way round every object it overlaps',
    (_name, spot) => {
      const boxes = [...pieces.map((p) => p.box), figure(spot)];
      const outlines = [...pieces.map((p) => p.box), outline(spot)];
      const me = boxes.length - 1;
      const order = drawOrder(boxes, view, screen, { outlineBoxes: outlines });
      const rank = new Map(order.map((i, r) => [i, r]));
      const mine = outlineOf(outlines[me]);
      const wrong: string[] = [];
      pieces.forEach((piece, i) => {
        if (seatAt(spot) && Math.hypot(piece.at[0] - spot.x, piece.at[1] - spot.y) < 0.9) {
          return;
        }
        if (!overlapping(mine, outlineOf(piece.box))) {
          return;
        }
        const c = separation(boxes[me], piece.box, view);
        if (c !== 0 && Math.sign((rank.get(me) ?? 0) - (rank.get(i) ?? 0)) !== c) {
          wrong.push(`${piece.name} at (${piece.at[0]}, ${piece.at[1]})`);
        }
      });
      expect(wrong).toEqual([]);
    }
  );
});

describe('layering with more than one avatar', () => {
  // T's case: one avatar in front of the all-hands screen, another behind it
  // and a step along. The two are apart diagonally, which says nothing about
  // which of them hides the other; ordering them by whichever axis came first
  // closed a loop through the screen, and the sort broke it by drawing the
  // front avatar behind the screen.
  it('keeps an avatar in front of the projection screen when another stands behind it', () => {
    const view = viewToward(0);
    const screen = (w: [number, number, number]): V2 => sheetPoint(w, 0);
    const front = { x: 17.6, y: 17.9 };
    const behind = { x: 18.6, y: 17.0 };
    const boxes = [...pieces.map((p) => p.box), figure(front), figure(behind)];
    const outlines = [...pieces.map((p) => p.box), outline(front), outline(behind)];
    const order = drawOrder(boxes, view, screen, { outlineBoxes: outlines });
    const rank = new Map(order.map((i, r) => [i, r]));
    const at = pieces.findIndex((p) => p.name === 'projectionScreen');
    const me = pieces.length;
    expect(rank.get(me)).toBeGreaterThan(rank.get(at) ?? Infinity);
    expect(rank.get(me + 1)).toBeLessThan(rank.get(at) ?? -Infinity);
  });
});
