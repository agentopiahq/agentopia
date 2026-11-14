import {
  CABINET_SPOTS,
  CAFE_SEATS,
  DESKS,
  MEETING_SEATS,
  Point,
  SOFA_SEATS,
  STATIONS,
  idleSpots,
  isWalkable,
} from '@agentopia/core';

import { Box3, Iso, V2, V3, drawOrder, hull, separation, viewToward } from '../kit/iso';
import { OBJECTS } from '../objects';
import { worldBox } from '../objects/bake';
import { AVATAR } from '../objects/scale';
import { DESK_PIECES, ROOM_PIECES, sheetPoint } from '../room';
import { partsOverSitter } from '../seating';

/**
 * Every spot an avatar stands or sits at, against every piece of furniture:
 * wherever the two overlap on screen and one is plainly in front of the
 * other, the office draws them that way round. This is the renderer's sort
 * (`sortCast`) on the same boxes: the figure sorts by its feet and is tested
 * for overlap by how wide and tall it is drawn. A piece in parts (a sofa, a
 * café chair) sorts as each of its parts, as the office bakes it.
 */

const HALF = 0.22;
const HEIGHT = 1.4;

const pieces = [...ROOM_PIECES, ...DESK_PIECES].flatMap((piece, key) => {
  const k = new Iso({} as CanvasRenderingContext2D, { unit: 32 });
  k.place(piece.place.at, piece.place.facing);
  const obj = OBJECTS[piece.name];
  const one = (name: string, footprint: Box3, seat: boolean) => ({
    name,
    key,
    seat,
    at: piece.place.at,
    facing: piece.place.facing,
    box: worldBox(k, footprint),
  });
  return obj.parts
    ? obj.parts.map((part) => one(`${piece.name} ${part.name}`, part.footprint, part.seat === true))
    : [one(piece.name, obj.footprint, false)];
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

/** The piece a sitter is in: the smallest whose floor it is on, as the office finds it. */
function seatOf(p: Point): number {
  let best = -1;
  let bestArea = Infinity;
  pieces.forEach(({ box: [[x0, y0], [x1, y1]] }, i) => {
    const area = (x1 - x0) * (y1 - y0);
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && area < bestArea) {
      best = i;
      bestArea = area;
    }
  });
  return best;
}

/**
 * The seat rule for a sitter at `me` in a seat in parts, as `sortCast` has
 * it: every part of its seat is placed against it by `partsOverSitter`.
 */
function sitterRule(spot: Point, me: number, sitter: Box3, view: V3): Array<[number, number]> {
  const at = seatOf(spot);
  if (at < 0 || !pieces[at].seat) {
    return [];
  }
  const own = pieces.flatMap((p, i) => (p.key === pieces[at].key ? [i] : []));
  const over = partsOverSitter(
    own.map((i) => ({ box: pieces[i].box, seat: pieces[i].seat })),
    sitter,
    view
  );
  return own.map((i, k) => (over[k] ? [me, i] : [i, me]));
}

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
      const before = sitterRule(spot, me, boxes[me], view);
      const order = drawOrder(boxes, view, screen, { outlineBoxes: outlines, before });
      const rank = new Map(order.map((i, r) => [i, r]));
      const mine = outlineOf(outlines[me]);
      const wrong: string[] = [];
      pieces.forEach((piece, i) => {
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

/**
 * Every side of every object, all along it: an avatar standing just off its
 * near sides is drawn over it, and one just off its far sides is drawn under
 * it wherever the two overlap. The all-hands screen and the sprint board are
 * the wide, thin pieces a plain sort used to get wrong.
 */
describe('layering round every object, from the home view', () => {
  const view = viewToward(0);
  const screen = (w: [number, number, number]): V2 => sheetPoint(w, 0);
  const outlineOf = (b: Box3): V2[] => hull(Iso.corners(b[0], b[1]).map(screen));
  const GAP = 0.32;

  const around = pieces.flatMap((piece, i) => {
    const [[x0, y0], [x1, y1]] = piece.box;
    const along = (a: number, b: number): number[] => {
      const n = Math.max(1, Math.ceil((b - a) / 0.25));
      return Array.from({ length: n + 1 }, (_, k) => a + ((b - a) * k) / n);
    };
    const sides: Array<[string, Point, boolean]> = [
      ...along(x0, x1).map((x): [string, Point, boolean] => ['+y', { x, y: y1 + GAP }, true]),
      ...along(y0, y1).map((y): [string, Point, boolean] => ['+x', { x: x1 + GAP, y }, true]),
      ...along(x0, x1).map((x): [string, Point, boolean] => ['-y', { x, y: y0 - GAP }, false]),
      ...along(y0, y1).map((y): [string, Point, boolean] => ['-x', { x: x0 - GAP, y }, false]),
    ];
    return sides
      .filter(([, p]) => isWalkable(p))
      .map(([side, p, near]) => ({ i, piece, side, p, near }));
  });

  const names = [
    ...new Set(around.map((a) => `${a.piece.name} at (${a.piece.at[0]}, ${a.piece.at[1]})`)),
  ];

  it.each(names)('draws an avatar on the right side of the %s, all along it', (name) => {
    const wrong: string[] = [];
    for (const { i, piece, side, p, near } of around) {
      if (`${piece.name} at (${piece.at[0]}, ${piece.at[1]})` !== name) {
        continue;
      }
      const boxes = [...pieces.map((q) => q.box), figure(p)];
      const outlines = [...pieces.map((q) => q.box), outline(p)];
      const me = boxes.length - 1;
      if (!overlapping(outlineOf(outlines[me]), outlineOf(piece.box))) {
        continue;
      }
      const order = drawOrder(boxes, view, screen, { outlineBoxes: outlines });
      const after = order.indexOf(me) > order.indexOf(i);
      if (after !== near) {
        wrong.push(`${side} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('draws an avatar anywhere in front of the all-hands screen over it', () => {
    const i = pieces.findIndex((p) => p.name === 'projectionScreen');
    const [[x0], [x1, y1]] = pieces[i].box;
    for (let x = x0; x <= x1; x += 0.1) {
      const p = { x, y: y1 + 0.3 };
      const boxes = [...pieces.map((q) => q.box), figure(p)];
      const outlines = [...pieces.map((q) => q.box), outline(p)];
      const order = drawOrder(boxes, view, screen, { outlineBoxes: outlines });
      expect(order.indexOf(boxes.length - 1)).toBeGreaterThan(order.indexOf(i));
    }
  });
});

describe('layering with a crowd', () => {
  it('keeps every avatar the right way round every object with the whole office full', () => {
    const view = viewToward(0);
    const screen = (w: [number, number, number]): V2 => sheetPoint(w, 0);
    const outlineOf = (b: Box3): V2[] => hull(Iso.corners(b[0], b[1]).map(screen));
    const crowd = spots.map(([, p]) => p).filter((p) => !seatAt(p));
    const boxes = [...pieces.map((q) => q.box), ...crowd.map(figure)];
    const outlines = [...pieces.map((q) => q.box), ...crowd.map(outline)];
    const order = drawOrder(boxes, view, screen, { outlineBoxes: outlines });
    const rank = new Map(order.map((i, r) => [i, r]));
    const wrong: string[] = [];
    crowd.forEach((p, k) => {
      const me = pieces.length + k;
      pieces.forEach((piece, i) => {
        if (!overlapping(outlineOf(outlines[me]), outlineOf(piece.box))) {
          return;
        }
        const c = separation(boxes[me], piece.box, view);
        if (c !== 0 && Math.sign((rank.get(me) ?? 0) - (rank.get(i) ?? 0)) !== c) {
          wrong.push(`(${p.x}, ${p.y}) vs ${piece.name} at (${piece.at[0]}, ${piece.at[1]})`);
        }
      });
    });
    expect(wrong).toEqual([]);
  });
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

/**
 * T's case: an avatar sat on the lounge sofa, seen from behind, was drawn
 * under the whole sofa — cushions and all — so it looked to stand behind it.
 * Every seat is in parts now: whoever sits in it is drawn over the seat they
 * sit on, under its back only when the back is between them and the viewer,
 * and under an arm only on the viewer's side of them.
 */
describe.each([
  ['the home view', 0],
  ['a quarter turn round', Math.PI / 2],
  ['half way round', Math.PI],
  ['three quarters round', (3 * Math.PI) / 2],
])('sitting, from %s', (_view, yaw) => {
  const view = viewToward(yaw);
  const screen = (w: [number, number, number]): V2 => sheetPoint(w, yaw);
  const all = [...SOFA_SEATS, ...CAFE_SEATS.flat(), ...MEETING_SEATS];

  it.each(all.map((s, i): [string, (typeof all)[number]] => [`seat ${i}`, s]))(
    'draws an avatar in %s over its seat, and its back and arms where they stand',
    (_name, seat) => {
      const at = seatOf(seat.spot);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(pieces[at].seat).toBe(true);
      const boxes = [...pieces.map((p) => p.box), figure(seat.spot)];
      const outlines = [...pieces.map((p) => p.box), outline(seat.spot)];
      const me = boxes.length - 1;
      const before = sitterRule(seat.spot, me, boxes[me], view);
      const order = drawOrder(boxes, view, screen, { outlineBoxes: outlines, before });
      const rank = new Map(order.map((i, r) => [i, r]));
      // Which way the sitter faces, and which way is toward the viewer, on the floor.
      const fx = seat.faceTo.x - seat.spot.x;
      const fy = seat.faceTo.y - seat.spot.y;
      const wrong: string[] = [];
      pieces.forEach((part, i) => {
        if (part.key !== pieces[at].key) {
          return;
        }
        const [[x0, y0], [x1, y1]] = part.box;
        const toward =
          ((x0 + x1) / 2 - seat.spot.x) * view[0] + ((y0 + y1) / 2 - seat.spot.y) * view[1];
        const over = part.seat
          ? false
          : part.name.endsWith('back')
            ? fx * view[0] + fy * view[1] < 0
            : toward > 0;
        if ((rank.get(i) ?? 0) > (rank.get(me) ?? 0) !== over) {
          wrong.push(`${part.name} ${over ? 'under' : 'over'} the sitter`);
        }
      });
      expect(wrong).toEqual([]);
    }
  );
});
