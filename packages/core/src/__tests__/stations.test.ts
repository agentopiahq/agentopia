import { CABINET_SPOTS, DESKS, Enclosure, Point, ROOMS, STATIONS, helperSpot } from '../stations';

/** Does the straight walk from a to b pass through a room (or near it)? */
function crosses(a: Point, b: Point, room: Enclosure, margin = 0.4): boolean {
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (
      x > room.x0 - margin &&
      x < room.x1 + margin &&
      y > room.y0 - margin &&
      y < room.y1 + margin
    ) {
      return true;
    }
  }
  return false;
}

/** Every place a worker is ever sent. */
const places: Array<[string, Point]> = [
  ...Object.values(STATIONS).map((s): [string, Point] => [s.id, s.spot]),
  ...CABINET_SPOTS.map((p, i): [string, Point] => [`cabinet ${i}`, p]),
  ...DESKS.flatMap((desk, slot): Array<[string, Point]> => [
    [`desk ${slot}`, desk.seat],
    ...desk.helpers.map((_, i): [string, Point] => [`helper ${slot}.${i}`, helperSpot(slot, i)]),
  ]),
];

describe('the rooms within the room', () => {
  it.each(ROOMS.map((room, i): [string, Enclosure] => [`${room.kind} ${i}`, room]))(
    'keeps the %s clear of every walk',
    (_name, room) => {
      for (const [, a] of places) {
        expect(crosses(a, a, room)).toBe(false);
        for (const [, b] of places) {
          if (crosses(a, b, room)) {
            throw new Error(`a walk from (${a.x}, ${a.y}) to (${b.x}, ${b.y}) crosses it`);
          }
        }
      }
    }
  );
});
