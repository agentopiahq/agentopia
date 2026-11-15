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

/** What one pet does in one frame, and how far it is from the nearest avatar. */
interface PetStep {
  view: PetView;
  nearest: number;
}

/**
 * Half an hour of a seeded office, kept as each pet's frames. Every check
 * below reads the same few runs instead of playing its own: a run is most of
 * what these tests cost.
 */
const SEEDS = [3, 7, 19] as const;
const RUN_MS = 30 * 60_000;
const runs = new Map<number, Map<string, PetStep[]>>();
function petRun(seed: number): Map<string, PetStep[]> {
  let steps = runs.get(seed);
  if (!steps) {
    const { clock, director } = office(seed);
    const out = new Map<string, PetStep[]>();
    run(director, clock, RUN_MS, (f) => {
      for (const view of f.pets) {
        const nearest = Math.min(
          ...f.actors.map((a) => Math.hypot(a.pos.x - view.pos.x, a.pos.y - view.pos.y))
        );
        out.set(view.id, [...(out.get(view.id) ?? []), { view, nearest }]);
      }
    });
    runs.set(seed, out);
    steps = out;
  }
  return steps;
}
const allSteps = (): PetStep[] => SEEDS.flatMap((seed) => [...petRun(seed).values()].flat());
const petOf = (seed: number, kind: PetKind): PetView[] =>
  [...petRun(seed).values()]
    .flat()
    .filter((s) => s.view.kind === kind)
    .map((s) => s.view);

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

  it.each(SEEDS)(
    'has each pet move through many activities, never the same twice running (seed %d)',
    (seed) => {
      for (const steps of petRun(seed).values()) {
        const list: string[] = [];
        for (const { view } of steps) {
          if (view.activity && list[list.length - 1] !== view.activity) {
            list.push(view.activity);
          }
        }
        expect(new Set(list).size).toBeGreaterThanOrEqual(5);
      }
    }
  );

  it('sends the pets to their own bowls to eat and drink', () => {
    const at = new Map<string, Point[]>();
    for (const { view: p } of allSteps()) {
      if (p.act === 'eat' || p.act === 'drink') {
        at.set(`${p.kind} ${p.act}`, [...(at.get(`${p.kind} ${p.act}`) ?? []), p.pos]);
      }
    }
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

  it.each(SEEDS)('has the cat jump up onto somewhere high, and back down (seed %d)', (seed) => {
    let up = 0;
    let downAfterUp = false;
    for (const cat of petOf(seed, 'cat')) {
      if (cat.z > 0.7 && cat.act !== 'jump') {
        up += 1;
      }
      if (up > 0 && cat.z === 0 && cat.act !== 'jump') {
        downAfterUp = true;
      }
    }
    expect(up).toBeGreaterThan(0);
    expect(downAfterUp).toBe(true);
  });

  it.each(SEEDS)(
    'only leaves the floor by jumping, and never stands inside the furniture (seed %d)',
    (seed) => {
      const wrong: string[] = [];
      for (const steps of petRun(seed).values()) {
        let before: PetView | undefined;
        for (const { view: p } of steps) {
          if (before && before.z !== p.z && p.act !== 'jump' && before.act !== 'jump') {
            wrong.push(`${p.id} rose from ${before.z} to ${p.z} without a jump`);
          }
          if (p.z === 0 && p.act !== 'jump' && inObstacle(p.pos)) {
            wrong.push(`${p.id} at (${p.pos.x.toFixed(2)}, ${p.pos.y.toFixed(2)}) ${p.act}`);
          }
          before = p;
        }
      }
      expect(wrong.slice(0, 5)).toEqual([]);
    }
  );

  it('keeps the dog beside whoever it follows', () => {
    const gaps = allSteps()
      .filter(
        ({ view: dog }) =>
          dog.kind === 'dog' &&
          (dog.act === 'beg' || (dog.activity === 'follow' && dog.act === 'sit'))
      )
      .map((s) => s.nearest);
    expect(gaps.length).toBeGreaterThan(0);
    const close = gaps.filter((g) => g < 1.6).length;
    expect(close / gaps.length).toBeGreaterThan(0.8);
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
});
