import { manualClock, seededRng } from '../clock';
import { Director, OFFICE_IDLE_LIFE, OfficeFrame } from '../director';
import { PET_JUMP_MS, PetView } from '../petLife';
import {
  CAT_PERCHES,
  DOG_BED_PERCH,
  PET_ACTIVITIES,
  PET_HOMES,
  PetKind,
  bowlSpot,
  petSpots,
} from '../pets';
import { isWalkable, route } from '../route';
import { DOG_BED, OBSTACLES, PET_BOWLS, Point, STATIONS } from '../stations';

function office(seed = 7, pets: readonly PetKind[] = OFFICE_IDLE_LIFE.pets) {
  const clock = manualClock(1000);
  const director = new Director({ clock, rng: seededRng(seed), idleLife: { residents: 4, pets } });
  return { clock, director };
}

function run(
  director: Director,
  clock: ReturnType<typeof manualClock>,
  ms: number,
  onFrame: (frame: OfficeFrame) => void = () => undefined,
  tick = 100
): void {
  director.frame();
  for (let t = 0; t < ms; t += tick) {
    clock.advance(tick);
    onFrame(director.frame());
  }
}

const inObstacle = (p: Point): boolean =>
  OBSTACLES.some((r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1);

describe('the pet activity list', () => {
  it.each(petSpots())('leaves %s clear to stand at', (_name, spot) => {
    expect(isWalkable(spot)).toBe(true);
  });

  it.each(petSpots())('can reach %s from the door', (_name, spot) => {
    const path = route(STATIONS.door.spot, spot);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(spot);
  });

  it.each(CAT_PERCHES.map((p): [string, (typeof CAT_PERCHES)[number]] => [p.id, p]))(
    'puts the %s perch on top of something, a jump from clear floor',
    (_name, perch) => {
      expect(inObstacle(perch.at)).toBe(true);
      expect(perch.z).toBeGreaterThan(0.5);
      expect(Math.hypot(perch.base.x - perch.at.x, perch.base.y - perch.at.y)).toBeLessThan(1.4);
    }
  );

  it('puts the dog bed perch on the bed', () => {
    expect(Math.hypot(DOG_BED_PERCH.at.x - DOG_BED.x, DOG_BED_PERCH.at.y - DOG_BED.y)).toBeLessThan(
      DOG_BED.r
    );
    expect(isWalkable(DOG_BED_PERCH.base)).toBe(true);
  });

  it.each(['cat', 'dog'] as const)('gives the %s a bowl of each, within reach', (kind) => {
    for (const bowl of ['food', 'water'] as const) {
      const spot = bowlSpot(kind, bowl);
      const at = PET_BOWLS[kind][bowl];
      expect(Math.hypot(spot.x - at.x, spot.y - at.y)).toBeLessThan(0.7);
      expect(isWalkable(spot)).toBe(true);
    }
  });

  it.each(['cat', 'dog'] as const)('has the %s eat, drink, nap and play', (kind) => {
    const ids = PET_ACTIVITIES.filter((a) => a.kinds.includes(kind)).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['eat', 'drink', 'sun-nap', 'play', 'visit']));
  });

  it('starts each pet somewhere it can stand', () => {
    for (const home of Object.values(PET_HOMES)) {
      expect(isWalkable(home)).toBe(true);
    }
  });
});

describe('the pets in the office', () => {
  it('has a cat and a dog on the floor from the first frame', () => {
    const { director } = office();
    const frame = director.frame();
    expect(frame.pets.map((p) => p.kind).sort()).toEqual(['cat', 'dog']);
  });

  it('keeps pets out of an office without them', () => {
    const clock = manualClock(1000);
    const director = new Director({ clock, rng: seededRng(7), idleLife: { residents: 4 } });
    expect(director.frame().pets).toEqual([]);
  });

  it('plays the same pets from the same seed', () => {
    const trace = (): string[] => {
      const { clock, director } = office(11);
      const out: string[] = [];
      run(director, clock, 60_000, (f) => {
        for (const p of f.pets) {
          out.push(`${p.id} ${p.pos.x.toFixed(3)} ${p.pos.y.toFixed(3)} ${p.act}`);
        }
      });
      return out;
    };
    expect(trace()).toEqual(trace());
  });

  it.each([3, 7, 19])(
    'has each pet move through many activities, never the same twice running (seed %d)',
    (seed) => {
      const { clock, director } = office(seed);
      const seen = new Map<string, string[]>();
      run(director, clock, 20 * 60_000, (f) => {
        for (const p of f.pets) {
          const list = seen.get(p.id) ?? [];
          if (p.activity && list[list.length - 1] !== p.activity) {
            list.push(p.activity);
          }
          seen.set(p.id, list);
        }
      });
      for (const list of seen.values()) {
        expect(new Set(list).size).toBeGreaterThanOrEqual(5);
      }
    }
  );

  it('sends the pets to their own bowls to eat and drink', () => {
    const { clock, director } = office(5);
    const at = new Map<string, Point[]>();
    run(director, clock, 30 * 60_000, (f) => {
      for (const p of f.pets) {
        if (p.act === 'eat' || p.act === 'drink') {
          at.set(`${p.kind} ${p.act}`, [...(at.get(`${p.kind} ${p.act}`) ?? []), p.pos]);
        }
      }
    });
    for (const kind of ['cat', 'dog'] as const) {
      for (const [act, bowl] of [
        ['eat', 'food'],
        ['drink', 'water'],
      ] as const) {
        const spots = at.get(`${kind} ${act}`) ?? [];
        expect(spots.length).toBeGreaterThan(0);
        const want = bowlSpot(kind, bowl);
        for (const p of spots) {
          expect(Math.hypot(p.x - want.x, p.y - want.y)).toBeLessThan(0.05);
        }
      }
    }
  });

  it('has the cat jump up onto somewhere high, and back down', () => {
    const { clock, director } = office(3);
    let up = 0;
    let downAfterUp = false;
    run(director, clock, 30 * 60_000, (f) => {
      const cat = f.pets.find((p) => p.kind === 'cat') as PetView;
      if (cat.z > 0.7 && cat.act !== 'jump') {
        up += 1;
      }
      if (up > 0 && cat.z === 0 && cat.act !== 'jump') {
        downAfterUp = true;
      }
    });
    expect(up).toBeGreaterThan(0);
    expect(downAfterUp).toBe(true);
  });

  it('only leaves the floor by jumping, and never stands inside the furniture', () => {
    const { clock, director } = office(9);
    const wrong: string[] = [];
    let last = new Map<string, PetView>();
    run(director, clock, 20 * 60_000, (f) => {
      for (const p of f.pets) {
        const before = last.get(p.id);
        if (before && before.z !== p.z && p.act !== 'jump' && before.act !== 'jump') {
          wrong.push(`${p.id} rose from ${before.z} to ${p.z} without a jump`);
        }
        if (p.z === 0 && p.act !== 'jump' && inObstacle(p.pos)) {
          wrong.push(`${p.id} at (${p.pos.x.toFixed(2)}, ${p.pos.y.toFixed(2)}) ${p.act}`);
        }
      }
      last = new Map(f.pets.map((p) => [p.id, p]));
    });
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('jumps in the time a jump takes', () => {
    const { clock, director } = office(3);
    const spans: number[] = [];
    let since: number | null = null;
    run(
      director,
      clock,
      30 * 60_000,
      (f) => {
        const cat = f.pets.find((p) => p.kind === 'cat') as PetView;
        if (cat.act === 'jump' && since === null) {
          since = f.at;
        } else if (cat.act !== 'jump' && since !== null) {
          spans.push(f.at - since);
          since = null;
        }
      },
      20
    );
    expect(spans.length).toBeGreaterThan(0);
    for (const ms of spans) {
      expect(ms).toBeLessThanOrEqual(PET_JUMP_MS + 40);
    }
  });

  it('keeps the dog beside whoever it follows', () => {
    const { clock, director } = office(13);
    const gaps: number[] = [];
    run(director, clock, 30 * 60_000, (f) => {
      const dog = f.pets.find((p) => p.kind === 'dog') as PetView;
      if (dog.act === 'beg' || (dog.activity === 'follow' && dog.act === 'sit')) {
        const near = Math.min(
          ...f.actors.map((a) => Math.hypot(a.pos.x - dog.pos.x, a.pos.y - dog.pos.y))
        );
        gaps.push(near);
      }
    });
    expect(gaps.length).toBeGreaterThan(0);
    const close = gaps.filter((g) => g < 1.6).length;
    expect(close / gaps.length).toBeGreaterThan(0.8);
  });
});
