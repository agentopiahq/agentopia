import { manualClock, seededRng } from '../clock';
import { CONVERSATIONS } from '../conversations';
import { Actor, DEFAULT_BUS, Director, LEAD_IDLE_AFTER_MS, OfficeFrame } from '../director';
import { AgentopiaEvent, EventKind, LEAD_WORKER } from '../events';
import {
  CAFE_SEATS,
  IDLE_ACTIVITIES,
  IdlePlanContext,
  LOITER_SPOTS,
  MEETING_SEATS,
  SOFA_SEATS,
  idleSpots,
} from '../idle';
import { SequencedEvent } from '../reader';
import { CLEARANCE, isWalkable, route } from '../route';
import { DESKS, MEETING_DOOR, OBSTACLES, Point, STATIONS } from '../stations';

let seq = 0;

function ev(
  kind: EventKind,
  bus = DEFAULT_BUS,
  over: Partial<AgentopiaEvent> = {}
): SequencedEvent {
  return { seq: seq++, bus, event: { ts: 1000, kind, session: bus, worker: LEAD_WORKER, ...over } };
}

function office(residents = 4, seed = 7) {
  seq = 0;
  const clock = manualClock(1000);
  const director = new Director({ clock, rng: seededRng(seed), idleLife: { residents } });
  return { clock, director };
}

function run(
  director: Director,
  clock: ReturnType<typeof manualClock>,
  ms: number,
  onFrame?: (frame: OfficeFrame) => void,
  tick = 100
): OfficeFrame {
  let frame = director.frame();
  for (let t = 0; t < ms; t += tick) {
    clock.advance(tick);
    frame = director.frame();
    onFrame?.(frame);
  }
  return frame;
}

const residents = (frame: OfficeFrame): Actor[] =>
  frame.actors.filter((a) => a.role === 'resident');
const leads = (frame: OfficeFrame): Actor[] => frame.actors.filter((a) => a.role === 'lead');

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

const blocked = (p: Point, pad = CLEARANCE * 0.5): boolean =>
  OBSTACLES.some(
    (r) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.y > r.y0 - pad && p.y < r.y1 + pad
  );

/** The corner sofa's own floor, which its far seat's way in runs along. */
const blockedOnlyBySofa = (p: Point): boolean => p.x < 3.1 && p.y > 20.5;

describe('the idle activity list', () => {
  it.each(idleSpots())('leaves %s clear to stand at', (_name, spot) => {
    expect(isWalkable(spot)).toBe(true);
  });

  it.each([
    ...SOFA_SEATS.map((s, i): [string, Point] => [`sofa seat ${i}`, s.spot]),
    ...CAFE_SEATS.flat().map((s, i): [string, Point] => [`café seat ${i}`, s.spot]),
    ...MEETING_SEATS.map((s, i): [string, Point] => [`meeting seat ${i}`, s.spot]),
  ])('walks to the %s round everything but the seat itself', (_name, spot) => {
    // A seat with a way in is walked to by it, then straight in.
    const via = [...SOFA_SEATS, ...CAFE_SEATS.flat(), ...MEETING_SEATS].find(
      (s) => s.spot === spot
    )?.via;
    const from = { x: 13, y: 15 };
    const path = via ? [...route(from, via), spot] : route(from, spot);
    expect(path[path.length - 1]).toEqual(spot);
    for (const p of along(from, path)) {
      if (Math.hypot(p.x - spot.x, p.y - spot.y) > 1.1 && !(via && blockedOnlyBySofa(p))) {
        expect(blocked(p)).toBe(false);
      }
    }
  });

  it('goes into the meeting room through its door', () => {
    const path = route({ x: 13, y: 15 }, MEETING_SEATS[0].spot);
    const crossing = along({ x: 13, y: 15 }, path).find((p) => p.y < MEETING_DOOR.y);
    expect(crossing?.x).toBeGreaterThan(MEETING_DOOR.x0);
    expect(crossing?.x).toBeLessThan(MEETING_DOOR.x1);
  });

  it('has unique ids', () => {
    const ids = IDLE_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(IDLE_ACTIVITIES.map((a): [string, (typeof IDLE_ACTIVITIES)[number]] => [a.id, a]))(
    'plans %s in an empty office, one list of timed steps per person',
    (_id, activity) => {
      const ctx: IdlePlanContext = {
        rng: seededRng(3),
        from: { x: 13, y: 15 },
        freeDesks: DESKS.map((d) => d.seat),
        taken: () => false,
      };
      const plans = activity.plan(ctx);
      expect(plans).not.toBeNull();
      expect(plans).toHaveLength(activity.people);
      for (const steps of plans ?? []) {
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
          expect(step.ms).toBeGreaterThan(0);
        }
      }
    }
  );

  it('raises a blind before looking out, and lowers it after only some of the time', () => {
    const blinds = IDLE_ACTIVITIES.find((a) => a.id === 'blinds');
    let lowered = 0;
    const runs = 200;
    for (let seed = 0; seed < runs; seed++) {
      const [steps] =
        blinds?.plan({
          rng: seededRng(seed),
          from: { x: 13, y: 15 },
          freeDesks: [],
          taken: () => false,
        }) ?? [];
      const acts = steps.map((s) => `${s.act}${s.pull ? `:${s.pull}` : ''}`);
      expect([
        ['reach:up', 'swing'],
        ['reach:up', 'swing', 'reach:down'],
      ]).toContainEqual(acts);
      for (const step of steps) {
        expect(step.spot).toEqual(steps[0].spot);
      }
      lowered += acts.length === 3 ? 1 : 0;
    }
    expect(lowered).toBeGreaterThan(runs * 0.3);
    expect(lowered).toBeLessThan(runs * 0.7);
  });

  it('unwinds on open floor: arms swinging facing the viewer, or swaying side to side any way round', () => {
    const unwind = IDLE_ACTIVITIES.find((a) => a.id === 'unwind');
    const arms = new Set<string>();
    const acts = { sway: 0, swing: 0 };
    let straightAtViewer = 0;
    let swingsTurnedAway = 0;
    const runs = 300;
    for (let seed = 0; seed < runs; seed++) {
      const plan = unwind?.plan({
        rng: seededRng(seed),
        from: { x: 13, y: 15 },
        freeDesks: [],
        taken: () => false,
      });
      const [step] = plan?.[0] ?? [];
      expect(step.seated).toBeUndefined();
      expect(LOITER_SPOTS).toContainEqual(step.spot);
      const d = { x: (step.faceTo?.x ?? 0) - step.spot.x, y: (step.faceTo?.y ?? 0) - step.spot.y };
      expect(Math.max(Math.abs(d.x), Math.abs(d.y))).toBeCloseTo(1);
      const towardViewer = d.x > 0 || d.y > 0;
      if (step.act === 'sway') {
        acts.sway += 1;
        arms.add(step.arms ?? 'none');
        // The arm swing is drawn from the front: never turned away.
        expect(towardViewer).toBe(true);
        straightAtViewer += d.x > 0 && d.y > 0 ? 1 : 0;
      } else {
        expect(step.act).toBe('swing');
        expect(step.arms).toBeUndefined();
        acts.swing += 1;
        swingsTurnedAway += towardViewer ? 0 : 1;
      }
    }
    expect(arms).toEqual(new Set(['with', 'against']));
    expect(acts.sway / runs).toBeGreaterThan(0.35);
    expect(acts.swing / runs).toBeGreaterThan(0.35);
    expect(straightAtViewer / acts.sway).toBeGreaterThan(0.35);
    expect(straightAtViewer).toBeLessThan(acts.sway);
    // Side to side reads from any side, the back included.
    expect(swingsTurnedAway).toBeGreaterThan(0);
    expect(swingsTurnedAway).toBeLessThan(acts.swing / 2);
  });

  it('plans nothing when every spot is taken', () => {
    const ctx: IdlePlanContext = {
      rng: seededRng(3),
      from: { x: 13, y: 15 },
      freeDesks: [],
      taken: () => true,
    };
    for (const activity of IDLE_ACTIVITIES) {
      expect(activity.plan(ctx)).toBeNull();
    }
  });
});

describe('Director with idle life', () => {
  it('has four residents on the floor from the first frame', () => {
    const { director } = office();
    const frame = director.frame();
    expect(residents(frame)).toHaveLength(4);
    for (const r of residents(frame)) {
      expect(isWalkable(r.pos)).toBe(true);
    }
  });

  it('keeps each resident busy with a mix of everything on the list, never twice running', () => {
    const { clock, director } = office();
    const seen = new Set<string>();
    const lastBy = new Map<string, string>();
    run(director, clock, 20 * 60_000, (frame) => {
      for (const r of residents(frame)) {
        const id = r.activity?.id;
        if (!id) {
          continue;
        }
        seen.add(id);
        const avatar = r.avatar ?? r.id;
        const last = lastBy.get(avatar);
        if (last !== id) {
          lastBy.set(avatar, id);
        }
      }
    });
    expect([...seen].sort()).toEqual(IDLE_ACTIVITIES.map((a) => a.id).sort());
  });

  it('never runs the same activity twice in a row', () => {
    const { clock, director } = office();
    const history = new Map<string, string[]>();
    let previous = new Map<string, string | undefined>();
    run(director, clock, 10 * 60_000, (frame) => {
      const now = new Map<string, string | undefined>();
      for (const r of residents(frame)) {
        const avatar = r.avatar ?? r.id;
        const id = r.activity?.id;
        now.set(avatar, id);
        if (id && previous.get(avatar) !== id) {
          const list = history.get(avatar) ?? [];
          list.push(id);
          history.set(avatar, list);
        }
      }
      previous = now;
    });
    for (const list of history.values()) {
      expect(list.length).toBeGreaterThan(5);
      for (let i = 1; i < list.length; i++) {
        expect(list[i]).not.toBe(list[i - 1]);
      }
    }
  });

  it('pairs two up for a chat, facing each other and taking turns to talk', () => {
    const { clock, director } = office();
    let overlap = false;
    run(director, clock, 20 * 60_000, (frame) => {
      const chatting = residents(frame).filter(
        (r) => r.activity?.id === 'chat' && r.activity.faceTo
      );
      if (chatting.length === 2) {
        const talking = chatting.filter((r) => r.state === 'talking');
        expect(talking.length).toBeLessThanOrEqual(1);
        overlap = overlap || talking.length === 1;
      }
    });
    expect(overlap).toBe(true);
  });

  it('plays a conversation from the pool, line by line, the two taking turns', () => {
    const { clock, director } = office();
    const said: Array<{ avatar: string; line: string }> = [];
    run(director, clock, 20 * 60_000, (frame) => {
      for (const r of residents(frame)) {
        const who = r.avatar ?? r.id;
        const last = said.filter((s) => s.avatar === who).pop();
        const line = r.bubble;
        if (r.activity?.id === 'chat' && line !== undefined && line !== last?.line) {
          said.push({ avatar: who, line });
        }
      }
    });
    // Enough chats to matter, every line from a script, and each reply from
    // the other one in the pair.
    const lines = new Set(CONVERSATIONS.flat());
    expect(said.length).toBeGreaterThan(30);
    for (const s of said) {
      expect(lines.has(s.line)).toBe(true);
    }
    const replies = said.slice(1).filter((s, i) => {
      const script = CONVERSATIONS.find((c) => c.includes(said[i].line));
      const at = script?.indexOf(said[i].line) ?? -1;
      return script !== undefined && script[at + 1] === s.line;
    });
    expect(replies.length).toBeGreaterThan(10);
    for (const reply of replies) {
      const prev = said[said.indexOf(reply) - 1];
      expect(reply.avatar).not.toBe(prev.avatar);
    }
  });

  it('never puts two avatars on one seat at once', () => {
    const { clock, director } = office(6);
    run(director, clock, 10 * 60_000, (frame) => {
      const seated = frame.actors.filter((a) => a.activity?.seated);
      for (const a of seated) {
        for (const b of seated) {
          if (a !== b) {
            expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThan(0.5);
          }
        }
      }
    });
  });

  it("makes a resident the new session's lead, so the floor stays at four", () => {
    const { clock, director } = office();
    const before = run(director, clock, 5000);
    const avatars = residents(before).map((r) => r.avatar);
    director.ingest(ev('session.start', 'a'));
    const frame = director.frame();
    const lead = leads(frame)[0];
    expect(lead).toBeDefined();
    expect(avatars).toContain(lead.avatar);
    expect(lead.pos).not.toEqual(STATIONS.door.spot);
    expect(residents(frame)).toHaveLength(3);
  });

  it('keeps an ended session’s lead on as a resident, and frees the desk', () => {
    const { clock, director } = office();
    director.ingest(ev('session.start', 'a'));
    const seated = run(director, clock, 6000);
    const avatar = leads(seated)[0].avatar;
    director.ingest(ev('session.end', 'a'));
    const after = run(director, clock, 3000);
    expect(after.desks).toEqual([]);
    expect(leads(after)).toHaveLength(0);
    expect(residents(after)).toHaveLength(4);
    expect(residents(after).map((r) => r.avatar)).toContain(avatar);
  });

  it('has no residents while every avatar slot is a lead, and none walk through the door to make up', () => {
    const { clock, director } = office();
    for (const bus of ['a', 'b', 'c', 'd', 'e']) {
      director.ingest(ev('session.start', bus));
    }
    const frame = run(director, clock, 8000);
    expect(leads(frame)).toHaveLength(5);
    expect(residents(frame)).toHaveLength(0);
  });

  it('sends a quiet lead off to do something, and calls it straight back to work', () => {
    const { clock, director } = office();
    director.ingest(ev('session.start', 'a'));
    run(director, clock, 4000);
    director.ingest(ev('turn.stop', 'a'));
    let wandered = false;
    run(director, clock, LEAD_IDLE_AFTER_MS + 60_000, (frame) => {
      const lead = leads(frame)[0];
      wandered = wandered || lead.activity !== undefined;
    });
    expect(wandered).toBe(true);

    director.ingest(ev('turn.user', 'a'));
    const back = run(director, clock, 15_000);
    const lead = leads(back)[0];
    expect(lead.activity).toBeUndefined();
    // Back at its desk, or pacing beside it over the prompt.
    const seat = DESKS[back.desks[0].slot].seat;
    expect(Math.hypot(lead.pos.x - seat.x, lead.pos.y - seat.y)).toBeLessThan(1);
  });

  it('is deterministic: same seed and clock, same frames', () => {
    const sample = (): string => {
      const { clock, director } = office();
      const frames: OfficeFrame[] = [];
      run(director, clock, 60_000, (frame) => frames.push(frame), 500);
      return JSON.stringify(frames);
    };
    expect(sample()).toBe(sample());
  });
});
