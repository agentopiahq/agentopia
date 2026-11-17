import { manualClock, seededRng } from '../clock';
import { Director, OFFICE_IDLE_LIFE, OfficeFrame } from '../director';
import { LEAD_WORKER } from '../events';
import { HUMAN_HOME, HUMAN_SPOTS, STAND_SPOTS, askSpotFor, promptLine } from '../human';
import { SequencedEvent } from '../reader';
import { isWalkable, route } from '../route';
import { STATIONS } from '../stations';

let seq = 0;
const ev = (
  kind: SequencedEvent['event']['kind'],
  meta?: Record<string, string>
): SequencedEvent => ({
  seq: seq++,
  event: { ts: 1000 + seq, kind, session: 's1', worker: LEAD_WORKER, ...(meta ? { meta } : {}) },
});

function office(idle: boolean, seed = 3) {
  const clock = manualClock(1000);
  const director = new Director({
    clock,
    rng: seededRng(seed),
    ...(idle ? { idleLife: OFFICE_IDLE_LIFE } : {}),
  });
  return { clock, director };
}

function run(
  director: Director,
  clock: ReturnType<typeof manualClock>,
  ms: number,
  onFrame: (frame: OfficeFrame) => void = () => undefined,
  tick = 100
): OfficeFrame {
  let frame = director.frame();
  for (let t = 0; t < ms; t += tick) {
    clock.advance(tick);
    frame = director.frame();
    onFrame(frame);
  }
  return frame;
}

const label = (i: number): string => `${HUMAN_SPOTS[i].pose} ${i}`;

describe('where the human sits', () => {
  it.each(HUMAN_SPOTS.map((s, i): [string, (typeof HUMAN_SPOTS)[number]] => [label(i), s]))(
    'leaves clear floor in front of the %s spot for a lead to ask at, reachable from the door',
    (_name, spot) => {
      const ask = askSpotFor(spot);
      expect(isWalkable(ask)).toBe(true);
      expect(Math.hypot(ask.x - spot.spot.x, ask.y - spot.spot.y)).toBeLessThan(2.6);
      const path = route(STATIONS.door.spot, ask);
      expect(path[path.length - 1]).toEqual(ask);
    }
  );

  it('sits on seats most of the time, and on the floor now and then', () => {
    const seats = HUMAN_SPOTS.filter((s) => s.pose === 'seat');
    const floor = HUMAN_SPOTS.filter((s) => s.pose === 'floor');
    expect(floor.length).toBeGreaterThan(0);
    const weight = (spots: typeof HUMAN_SPOTS) => spots.reduce((sum, s) => sum + s.weight, 0);
    expect(weight(seats)).toBeGreaterThan(weight(floor) * 3);
  });
});

describe('the human in the office', () => {
  it('is there from the first frame, sat at home, with no idle life', () => {
    const { clock, director } = office(false);
    const first = director.frame().human;
    expect(first.role).toBe('human');
    expect(first.pos).toEqual(HUMAN_HOME.spot);
    expect(first.activity).toMatchObject({ act: 'sit', seated: true });
    const later = run(director, clock, 10 * 60_000, undefined, 1000).human;
    expect(later.pos).toEqual(HUMAN_HOME.spot);
  });

  it('moves between spots with idle life, the floor and standing among them, never into a taken seat', () => {
    const { clock, director } = office(true);
    const visited = new Set<string>();
    const shared: string[] = [];
    run(
      director,
      clock,
      40 * 60_000,
      (f) => {
        const human = f.human;
        if (!human.activity) {
          return;
        }
        const at = HUMAN_SPOTS.findIndex(
          (s) => Math.hypot(s.spot.x - human.pos.x, s.spot.y - human.pos.y) < 0.05
        );
        visited.add(at >= 0 ? HUMAN_SPOTS[at].pose : 'nowhere');
        for (const a of f.actors) {
          if (
            human.activity.seated &&
            a.activity?.seated &&
            Math.hypot(a.pos.x - human.pos.x, a.pos.y - human.pos.y) < 0.4
          ) {
            shared.push(`${a.id} at (${a.pos.x.toFixed(2)}, ${a.pos.y.toFixed(2)})`);
          }
        }
      },
      250
    );
    expect(visited).toEqual(new Set(['seat', 'floor', 'stand']));
    expect(shared.slice(0, 3)).toEqual([]);
  });

  it('stands about swaying now and then, on their feet, both ways of swinging the arms', () => {
    const swings = new Set<string>();
    for (const seed of [3, 5, 8, 13]) {
      const { clock, director } = office(true, seed);
      run(
        director,
        clock,
        40 * 60_000,
        (f) => {
          const activity = f.human.activity;
          if (activity?.act !== 'sway') {
            return;
          }
          expect(activity.seated).toBeUndefined();
          expect(f.human.state).not.toBe('walking');
          expect(STAND_SPOTS.map((s) => s.spot)).toContainEqual(f.human.pos);
          swings.add(activity.arms ?? 'none');
        },
        250
      );
    }
    expect(swings).toEqual(new Set(['with', 'against']));
  });

  it('stays put while a lead walks over to ask, and thinks it over while asked', () => {
    const { clock, director } = office(true, 11);
    director.ingest(ev('session.start'));
    run(director, clock, 2000);
    director.ingest(ev('approval.request'));
    const start = director.frame().human.pos;
    const states = new Set<string>();
    let asked = false;
    run(director, clock, 12_000, (f) => {
      expect(f.human.pos).toEqual(start);
      states.add(f.human.state);
      const lead = f.actors.find((a) => a.role === 'lead');
      if (lead?.station === 'human' && lead.state === 'talking') {
        asked = true;
      }
    });
    expect(asked).toBe(true);
    expect(states.has('thinking')).toBe(true);
  });

  it('talks when a prompt lands, and says it', () => {
    const { clock, director } = office(false);
    director.ingest(ev('session.start'));
    director.ingest(ev('turn.user', { text: 'fix   the\nflaky test' }));
    const human = director.frame().human;
    expect(human.state).toBe('talking');
    expect(human.bubble).toBe('fix the flaky test');
    expect(run(director, clock, 5000).human.bubble).toBeUndefined();
  });
});

describe('promptLine', () => {
  it.each([
    ['short', 'short'],
    ['  spaced\tout  ', 'spaced out'],
    ['x'.repeat(80), `${'x'.repeat(47)}…`],
  ])('fits %j into the bubble', (text, want) => {
    expect(promptLine(text)).toBe(want);
  });
});
