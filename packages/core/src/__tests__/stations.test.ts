import { CLEARANCE, isWalkable, route } from '../route';
import { CABINET_SPOTS, DESKS, INSIDE, OBSTACLES, Point, STATIONS, helperSpot } from '../stations';

/** The places a worker leaves its desk for. */
const away: Array<[string, Point]> = [
  ...Object.values(STATIONS).map((s): [string, Point] => [s.id, s.spot]),
  ...CABINET_SPOTS.map((p, i): [string, Point] => [`cabinet ${i}`, p]),
];
/** Every worker's home: a lead's seat, a helper's spot. */
const homes: Array<[string, Point]> = DESKS.flatMap((desk, slot): Array<[string, Point]> => [
  [`desk ${slot}`, desk.seat],
  ...desk.helpers.map((_, i): [string, Point] => [`helper ${slot}.${i}`, helperSpot(slot, i)]),
]);
const places = [...away, ...homes];

/** Every point along a walk, a twentieth of a tile apart. */
function along(from: Point, path: Point[]): Point[] {
  const out: Point[] = [];
  let a = from;
  for (const b of path) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 20));
    for (let k = 0; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    a = b;
  }
  return out;
}

/** The obstacle a point stands in, feet and all, if any. */
function hit(p: Point, pad = CLEARANCE * 0.5): number {
  return OBSTACLES.findIndex(
    (r) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.y > r.y0 - pad && p.y < r.y1 + pad
  );
}

describe('the floor plan', () => {
  it.each(places)('leaves %s clear to stand at', (_name, spot) => {
    expect(isWalkable(spot)).toBe(true);
  });

  it('keeps every desk chair beside its seat, clear of the desk next along', () => {
    for (const desk of DESKS) {
      expect(isWalkable(desk.seat)).toBe(true);
      expect(Math.hypot(desk.chair.x - desk.seat.x, desk.chair.y - desk.seat.y)).toBeLessThan(1);
    }
  });
});

describe('walking routes', () => {
  it('walks straight when nothing is in the way', () => {
    expect(route({ x: 13, y: 18 }, { x: 13, y: 5 })).toEqual([{ x: 13, y: 5 }]);
  });

  it('stays put going nowhere', () => {
    expect(route({ x: 13, y: 18 }, { x: 13, y: 18 })).toEqual([]);
  });

  it('gives the same route every time', () => {
    const a = route(STATIONS.door.spot, DESKS[0].seat);
    expect(route(STATIONS.door.spot, DESKS[0].seat)).toEqual(a);
  });

  it('gives a fresh route each time, so a walker eating its own leaves the next one whole', () => {
    const a = route(STATIONS.door.spot, DESKS[1].seat);
    const want = a.map((p) => ({ ...p }));
    a.shift();
    a[0].x += 1;
    expect(route(STATIONS.door.spot, DESKS[1].seat)).toEqual(want);
  });

  it.each(away)('goes round every desk, chair and room to and from %s', (station, s) => {
    const walks = homes.flatMap(([home, h]): Array<[string, Point, string, Point]> => [
      [station, s, home, h],
      [home, h, station, s],
    ]);
    // Wrong steps are collected and checked once: an expect per point, a
    // twentieth of a tile apart on every walk, was most of this test's time.
    const wrong: string[] = [];
    for (const [from, a, to, b] of walks) {
      const path = route(a, b);
      expect(path.length === 0 || path[path.length - 1]).toEqual(path.length === 0 || b);
      for (const p of along(a, path)) {
        const at = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;
        const i = hit(p);
        if (i !== -1) {
          const r = OBSTACLES[i];
          wrong.push(
            `${from} -> ${to} walks through (${r.x0}, ${r.y0})-(${r.x1}, ${r.y1}) at ${at}`
          );
        }
        if (!(p.x > INSIDE.x0 && p.y > INSIDE.y0 && p.x < INSIDE.x1 && p.y < INSIDE.y1)) {
          wrong.push(`${from} -> ${to} leaves the floor at ${at}`);
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it.each(homes.filter(([name]) => name.startsWith('desk')))(
    'brings a helper in from the door to its spot at %s, round the desks',
    (name, seat) => {
      const slot = Number(name.split(' ')[1]);
      for (const spot of [seat, ...DESKS[slot].helpers]) {
        const through = along(STATIONS.door.spot, route(STATIONS.door.spot, spot)).filter(
          (p) => hit(p) !== -1
        );
        expect(through).toEqual([]);
      }
    }
  );

  it('still gets somewhere from inside an obstacle', () => {
    const chair = DESKS[0].chair;
    const path = route(chair, STATIONS.door.spot);
    expect(path[path.length - 1]).toEqual(STATIONS.door.spot);
  });
});
