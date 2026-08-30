import { manualClock, seededRng } from '../clock';
import { Director, OfficeFrame } from '../director';
import { AgentopiaEvent, EventKind, LEAD_WORKER } from '../events';
import { SequencedEvent } from '../reader';
import { STATIONS, deskFor } from '../stations';

let seq = 0;

function ev(kind: EventKind, over: Partial<AgentopiaEvent> = {}): SequencedEvent {
  return {
    seq: seq++,
    event: { ts: 1000, kind, session: 's1', worker: LEAD_WORKER, ...over },
  };
}

function toolStart(
  over: Partial<AgentopiaEvent> = {},
  tool: Partial<NonNullable<AgentopiaEvent['tool']>> = {}
) {
  return ev('tool.start', {
    tool: { id: 't1', name: 'Read', kind: 'read', status: 'in_progress', ...tool },
    ...over,
  });
}

function toolEnd(
  over: Partial<AgentopiaEvent> = {},
  tool: Partial<NonNullable<AgentopiaEvent['tool']>> = {}
) {
  return ev('tool.end', {
    tool: { id: 't1', name: 'Read', kind: 'read', status: 'completed', ...tool },
    ...over,
  });
}

function actor(frame: OfficeFrame, id: string) {
  const found = frame.actors.find((a) => a.id === id);
  if (!found) {
    throw new Error(`no actor ${id} in frame`);
  }
  return found;
}

/** Step the clock in small ticks, calling frame() as a rAF loop would. */
function run(director: Director, clock: ReturnType<typeof manualClock>, ms: number, tick = 50) {
  let frame = director.frame();
  for (let t = 0; t < ms; t += tick) {
    clock.advance(tick);
    frame = director.frame();
  }
  return frame;
}

function setup() {
  seq = 0;
  const clock = manualClock(1000);
  const director = new Director({ clock, rng: seededRng(7) });
  director.ingest(ev('session.start'));
  director.frame();
  return { clock, director };
}

describe('Director', () => {
  it('seats the lead at desk 0 on session start', () => {
    const { director } = setup();
    const lead = actor(director.frame(), LEAD_WORKER);

    expect(lead.pos).toEqual(deskFor(0));
    expect(lead.state).toBe('thinking');
  });

  it('walks the lead to the archive for a read, then home when it ends', () => {
    const { clock, director } = setup();
    director.ingest(toolStart());

    const mid = run(director, clock, 400);
    expect(actor(mid, LEAD_WORKER).state).toBe('walking');

    const there = run(director, clock, 4000);
    expect(actor(there, LEAD_WORKER).pos).toEqual(STATIONS.archive.spot);
    expect(actor(there, LEAD_WORKER).state).toBe('working');

    director.ingest(toolEnd());
    director.ingest(ev('turn.stop'));
    const home = run(director, clock, 4000);
    expect(actor(home, LEAD_WORKER).pos).toEqual(deskFor(0));
  });

  it('holds a fast tool call for the dwell minimum instead of flickering', () => {
    const { clock, director } = setup();
    // Start and end arrive in the same burst, like a 30ms parallel read.
    director.ingest(toolStart());
    director.ingest(toolEnd());

    const arrived = run(director, clock, 2500);
    expect(actor(arrived, LEAD_WORKER).state).toBe('working');
  });

  it('coalesces consecutive same-station beats into one', () => {
    const { clock, director } = setup();
    for (let i = 0; i < 5; i++) {
      director.ingest(toolStart({}, { id: `t${i}` }));
      director.ingest(toolEnd({}, { id: `t${i}` }));
    }

    // Five reads: exactly one walk to the archive, one (longer) work beat,
    // then home. The worker must never bounce back and forth mid-batch.
    const states = new Set<string>();
    let arrivals = 0;
    let wasThere = false;
    let frame = director.frame();
    for (let t = 0; t < 12000; t += 50) {
      clock.advance(50);
      frame = director.frame();
      const lead = actor(frame, LEAD_WORKER);
      states.add(lead.state);
      const there =
        Math.hypot(lead.pos.x - STATIONS.archive.spot.x, lead.pos.y - STATIONS.archive.spot.y) <
        0.1;
      if (there && !wasThere) {
        arrivals++;
      }
      wasThere = there;
    }
    expect(states.has('working')).toBe(true);
    expect(arrivals).toBe(1);
    // And with the batch done, the worker heads home rather than loitering.
    expect(actor(frame, LEAD_WORKER).pos).toEqual(deskFor(0));
  });

  it('walks a subagent in from the door and out again', () => {
    const { clock, director } = setup();
    director.ingest(ev('worker.start', { worker: 'a1', workerType: 'Explore' }));

    const arriving = director.frame();
    expect(actor(arriving, 'a1').pos).toEqual(STATIONS.door.spot);

    const seated = run(director, clock, 6000);
    expect(actor(seated, 'a1').pos).toEqual(deskFor(1));
    expect(actor(seated, 'a1').label).toBe('Explore');

    director.ingest(ev('worker.stop', { worker: 'a1' }));
    run(director, clock, 8000);
    expect(director.frame().actors.some((a) => a.id === 'a1')).toBe(false);
  });

  it('keeps two busy workers at their own stations simultaneously', () => {
    const { clock, director } = setup();
    director.ingest(ev('worker.start', { worker: 'a1', workerType: 'Explore' }));
    director.ingest(toolStart({}, { id: 'L', kind: 'edit' }));
    director.ingest(toolStart({ worker: 'a1' }, { id: 'S', name: 'Bash', kind: 'execute' }));

    const frame = run(director, clock, 8000);
    expect(actor(frame, LEAD_WORKER).station).toBe('workbench');
    // Shell work happens at the subagent's own desk, not a shared station.
    expect(actor(frame, 'a1').station).toBe('own_desk');
    expect(actor(frame, 'a1').pos).toEqual(deskFor(1));
  });

  it('slumps on a failed tool call before recovering', () => {
    const { clock, director } = setup();
    director.ingest(toolStart({}, { name: 'Bash', kind: 'execute' }));
    // Execute happens at the worker's own desk — no walk needed.
    run(director, clock, 1500);
    director.ingest(toolEnd({}, { name: 'Bash', kind: 'execute', status: 'failed' }));

    const frame = run(director, clock, 300);
    expect(actor(frame, LEAD_WORKER).state).toBe('slump');
  });

  it('reports lag and sprints when far behind', () => {
    const { clock, director } = setup();
    // A burst of beats whose event timestamps race ahead of the animation.
    for (let i = 0; i < 6; i++) {
      const kind = i % 2 === 0 ? 'read' : 'execute';
      director.ingest(toolStart({ ts: 1000 + i * 100 }, { id: `t${i}`, kind }));
      director.ingest(toolEnd({ ts: 11000 + i * 100 }, { id: `t${i}`, kind }));
    }

    const frame = director.frame();
    expect(frame.lagMs).toBeGreaterThan(LAG_IS_VISIBLE);

    const states = new Set<string>();
    for (let t = 0; t < 3000; t += 50) {
      clock.advance(50);
      states.add(actor(director.frame(), LEAD_WORKER).state);
    }
    expect(states.has('sprinting')).toBe(true);
  });

  it('never puts the prompt on the lead, and emits no human actor for now', () => {
    const { director } = setup();
    director.ingest(ev('turn.user', { meta: { text: 'please fix the tests' } }));

    const frame = director.frame();
    expect(actor(frame, LEAD_WORKER).bubble).toBeUndefined();
    expect(frame.actors.some((a) => a.id === 'human')).toBe(false);
  });

  it('escalates the lead from waiting to coffee as the human dawdles', () => {
    const { clock, director } = setup();
    director.ingest(ev('turn.stop'));

    const early = run(director, clock, 3000);
    expect(actor(early, LEAD_WORKER).state).toBe('waiting');

    const later = run(director, clock, 40000, 100);
    expect(['coffee', 'walking', 'pacing']).toContain(actor(later, LEAD_WORKER).state);
  });

  it('does not report epoch-sized lag on the first event', () => {
    seq = 0;
    const clock = manualClock(1788000000000);
    const director = new Director({ clock, rng: seededRng(7) });
    director.ingest(ev('session.start', { ts: 1788000000000 }));

    expect(director.frame().lagMs).toBe(0);
  });

  it('is deterministic: same events and clock, same frames', () => {
    const play = (): OfficeFrame => {
      seq = 0;
      const clock = manualClock(1000);
      const director = new Director({ clock, rng: seededRng(7) });
      director.ingest(ev('session.start'));
      director.ingest(ev('worker.start', { worker: 'a1', workerType: 'Explore' }));
      director.ingest(toolStart({ worker: 'a1' }, { kind: 'execute' }));
      return run(director, clock, 5000);
    };

    expect(play()).toEqual(play());
  });
});

const LAG_IS_VISIBLE = 6000;
