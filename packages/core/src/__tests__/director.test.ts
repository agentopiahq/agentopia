import { TALK_MS } from '../choreography';
import { manualClock, seededRng } from '../clock';
import { CYCLE_MS } from '../cycles';
import {
  DEFAULT_BUS,
  Director,
  IDLE_LEAVE_MS,
  IDLE_REST_MS,
  OfficeFrame,
  TEMPO_MAX,
} from '../director';
import { AgentopiaEvent, EventKind, LEAD_WORKER } from '../events';
import { HUMAN_HOME, askSpotFor } from '../human';
import { SequencedEvent } from '../reader';
import { DESKS, STATIONS, WALK_TILES_PER_SEC, cabinetsFor, deskFor, helperSpot } from '../stations';

let seq = 0;

function ev(kind: EventKind, over: Partial<AgentopiaEvent> = {}, bus?: string): SequencedEvent {
  return {
    seq: seq++,
    bus,
    event: { ts: 1000, kind, session: 's1', worker: LEAD_WORKER, ...over },
  };
}

function toolStart(
  over: Partial<AgentopiaEvent> = {},
  tool: Partial<NonNullable<AgentopiaEvent['tool']>> = {},
  bus?: string
) {
  return ev(
    'tool.start',
    {
      tool: { id: 't1', name: 'Read', kind: 'read', status: 'in_progress', ...tool },
      ...over,
    },
    bus
  );
}

function toolEnd(
  over: Partial<AgentopiaEvent> = {},
  tool: Partial<NonNullable<AgentopiaEvent['tool']>> = {},
  bus?: string
) {
  return ev(
    'tool.end',
    {
      tool: { id: 't1', name: 'Read', kind: 'read', status: 'completed', ...tool },
      ...over,
    },
    bus
  );
}

function find(frame: OfficeFrame, worker: string, bus = DEFAULT_BUS) {
  return frame.actors.find((a) => a.bus === bus && a.worker === worker);
}

function actor(frame: OfficeFrame, worker: string, bus = DEFAULT_BUS) {
  const found = find(frame, worker, bus);
  if (!found) {
    throw new Error(`no actor ${bus}/${worker} in frame`);
  }
  return found;
}

function desk(frame: OfficeFrame, bus = DEFAULT_BUS) {
  return frame.desks.find((d) => d.bus === bus);
}

/** Step the clock in small ticks, calling frame() as a rAF loop would. */
function run(
  director: Director,
  clock: ReturnType<typeof manualClock>,
  ms: number,
  tick = 50,
  onTick?: (t: number) => void
) {
  let frame = director.frame();
  for (let t = 0; t < ms; t += tick) {
    clock.advance(tick);
    onTick?.(t + tick);
    frame = director.frame();
  }
  return frame;
}

/**
 * A wait that covers a walk, scaled to the walking speed: `ms` is how long it
 * takes at six tiles a second, which these waits were first measured at.
 */
function walkMs(ms: number): number {
  return Math.ceil((ms * 6) / WALK_TILES_PER_SEC);
}

/** At a spot, or pacing just either side of it, thinking. */
function expectNear(pos: { x: number; y: number }, spot: { x: number; y: number }): void {
  expect(Math.hypot(pos.x - spot.x, pos.y - spot.y)).toBeLessThan(0.4);
}

/** Run until `done` holds of a frame, or `maxMs` passes; the last frame either way. */
function until(
  director: Director,
  clock: ReturnType<typeof manualClock>,
  done: (frame: OfficeFrame) => boolean,
  maxMs = 10000
): OfficeFrame {
  let frame = director.frame();
  for (let t = 0; t < maxMs && !done(frame); t += 50) {
    frame = run(director, clock, 50);
  }
  return frame;
}

/** A session opens and its lead reaches the desk. */
function setup() {
  seq = 0;
  const clock = manualClock(1000);
  const director = new Director({ clock, rng: seededRng(7) });
  director.ingest(ev('session.start'));
  // Until it is in at the desk, and a moment more.
  for (let i = 0; i < 400; i++) {
    const lead = find(run(director, clock, 50), LEAD_WORKER);
    if (lead && lead.state === 'thinking') {
      break;
    }
  }
  run(director, clock, 300);
  return { clock, director };
}

/** Every distinct state the lead passes through, in order. */
function statesOf(
  director: Director,
  clock: ReturnType<typeof manualClock>,
  ms: number,
  worker = LEAD_WORKER
): string[] {
  const states: string[] = [];
  run(director, clock, ms, 50, () => {
    const found = find(director.frame(), worker);
    const state = found?.state ?? 'absent';
    if (states[states.length - 1] !== state) {
      states.push(state);
    }
  });
  return states;
}

describe('Director seating', () => {
  it('walks a new session in through the door to desk 0', () => {
    seq = 0;
    const clock = manualClock(1000);
    const director = new Director({ clock, rng: seededRng(7) });
    director.ingest(ev('session.start'));

    const arriving = director.frame();
    expect(actor(arriving, LEAD_WORKER).pos).toEqual(STATIONS.door.spot);
    expect(actor(arriving, LEAD_WORKER).role).toBe('lead');

    const seated = run(director, clock, walkMs(3000));
    expect(actor(seated, LEAD_WORKER).pos).toEqual(deskFor(0));
    expect(actor(seated, LEAD_WORKER).state).toBe('thinking');
    expect(desk(seated)).toMatchObject({ slot: 0, phase: 'working', subagents: 0 });
  });

  it('gives each bus its own desk and namespaces the actors', () => {
    seq = 0;
    const clock = manualClock(1000);
    const director = new Director({ clock, rng: seededRng(7) });
    director.ingest(ev('session.start', {}, 'a'));
    director.ingest(ev('session.start', {}, 'b'));

    const frame = run(director, clock, walkMs(3000));
    expect(frame.desks.map((d) => [d.bus, d.slot])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(actor(frame, LEAD_WORKER, 'a').id).toBe('a/lead');
    expect(actor(frame, LEAD_WORKER, 'b').pos).toEqual(deskFor(1));
  });

  it('titles the desk with the session name once it arrives', () => {
    const { director } = setup();
    expect(desk(director.frame())?.name).toBeUndefined();

    director.ingest(ev('turn.user', { meta: { sessionName: 'fix the tests' } }));
    expect(desk(director.frame())?.name).toBe('fix the tests');
  });

  it('makes a session past the last desk wait, and seats it when a desk frees', () => {
    seq = 0;
    const clock = manualClock(1000);
    const director = new Director({ clock, rng: seededRng(7) });
    // One more session than there are desks.
    const buses = Array.from({ length: DESKS.length + 1 }, (_, i) => String.fromCharCode(97 + i));
    const extra = buses[buses.length - 1];
    for (const bus of buses) {
      director.ingest(ev('session.start', {}, bus));
    }

    const full = run(director, clock, walkMs(3000));
    expect(full.desks.map((d) => d.bus)).toEqual(buses.slice(0, DESKS.length));
    expect(full.waiting).toBe(1);
    expect(find(full, LEAD_WORKER, extra)).toBeUndefined();

    director.ingest(ev('session.end', {}, 'c'));
    const after = run(director, clock, walkMs(6000));
    expect(after.waiting).toBe(0);
    expect(desk(after, extra)?.slot).toBe(2);
    expect(find(after, LEAD_WORKER, 'c')).toBeUndefined();
  });

  it('ignores a repeated seq, so a reconnect cannot double the tallies', () => {
    const { director } = setup();
    const start = toolStart();
    const end = toolEnd();
    director.ingest(start);
    director.ingest(end);
    director.ingest(start);
    director.ingest(end);

    expect(director.office().sessions[DEFAULT_BUS].counters.byKind.read).toBe(1);
  });

  it('does not report epoch-sized lag on the first event', () => {
    seq = 0;
    const clock = manualClock(1788000000000);
    const director = new Director({ clock, rng: seededRng(7) });
    director.ingest(ev('session.start', { ts: 1788000000000 }));

    expect(director.frame().lagMs).toBe(0);
  });
});

describe('Director at the desk', () => {
  it('types at the desk for a read and puts it on the monitor', () => {
    const { clock, director } = setup();
    director.ingest(toolStart({}, { detail: 'src/a.ts' }));

    // The lead finishes the turn of its swivel first, then gets to the keys.
    const frame = run(director, clock, 300 + CYCLE_MS.thinking);
    const lead = actor(frame, LEAD_WORKER);
    expect(lead.state).toBe('working');
    expect(lead.station).toBe('own_desk');
    expect(lead.pos).toEqual(deskFor(0));
    expect(desk(frame)?.screen).toBe('Read src/a.ts');

    director.ingest(toolEnd());
    const done = run(director, clock, 2000);
    expect(actor(done, LEAD_WORKER).state).toBe('thinking');
    expect(desk(done)?.screen).toBeUndefined();
  });

  it('holds a fast tool call for the dwell minimum instead of flickering', () => {
    const { clock, director } = setup();
    // Start and end arrive in the same burst, like a 30ms parallel read.
    director.ingest(toolStart());
    director.ingest(toolEnd());

    const arrived = run(director, clock, 500 + CYCLE_MS.thinking);
    expect(actor(arrived, LEAD_WORKER).state).toBe('working');
  });

  it('coalesces a batch of reads into one longer beat at the desk', () => {
    const { clock, director } = setup();
    for (let i = 0; i < 5; i++) {
      director.ingest(toolStart({}, { id: `t${i}` }));
      director.ingest(toolEnd({}, { id: `t${i}` }));
    }

    // The swivel it was in comes round, then one stretch of working, then
    // straight back to thinking (the walks that follow are the idle pacing,
    // not the batch).
    const states = statesOf(director, clock, 12000);
    expect(states.slice(0, 3)).toEqual(['thinking', 'working', 'thinking']);
    expect(states.filter((state) => state === 'working')).toHaveLength(1);
  });

  it('slumps on a failed tool call before recovering', () => {
    const { clock, director } = setup();
    director.ingest(toolStart({}, { name: 'Bash', kind: 'execute' }));
    run(director, clock, 1500 + CYCLE_MS.thinking);
    director.ingest(toolEnd({}, { name: 'Bash', kind: 'execute', status: 'failed' }));

    const frame = run(director, clock, 300 + CYCLE_MS.typing);
    expect(actor(frame, LEAD_WORKER).state).toBe('slump');
  });

  it('never cuts a beat: the sign-off waits for the running tool, then plays in full', () => {
    const { clock, director } = setup();
    director.ingest(toolStart({}, { name: 'Bash', kind: 'execute' }));
    run(director, clock, 1000);
    director.ingest(ev('turn.stop', { meta: { text: 'done' } }));

    // The prompt reply must not pull the lead off the running command.
    const still = run(director, clock, 2000);
    expect(actor(still, LEAD_WORKER).state).toBe('working');
    expect(desk(still)?.phase).toBe('waiting_on_user');

    // The tap it is in finishes, then the sign-off plays.
    director.ingest(toolEnd({}, { name: 'Bash', kind: 'execute' }));
    const states = statesOf(director, clock, TALK_MS + 2000 + CYCLE_MS.typing);
    expect(states).toEqual(['working', 'talking', 'waiting']);
    expect(actor(director.frame(), LEAD_WORKER).bubble).toBeUndefined();
  });

  it('keeps every queued beat when a prompt lands mid-batch', () => {
    const { clock, director } = setup();
    director.ingest(toolStart({}, { id: 'a', name: 'Bash', kind: 'execute' }));
    director.ingest(toolEnd({}, { id: 'a', name: 'Bash', kind: 'execute', status: 'failed' }));
    director.ingest(ev('turn.user'));

    // The slump still plays: nothing interrupts it.
    const states = statesOf(director, clock, 4000);
    expect(states).toContain('slump');
  });

  it('shows a backlog as stress, plays the current beat through, then jumps to the last', () => {
    const { clock, director } = setup();
    // Six replies whose timestamps race far ahead of the animation.
    for (let i = 0; i < 6; i++) {
      director.ingest(ev('turn.stop', { ts: 1000 + i * 3000, meta: { text: `reply ${i}` } }));
    }

    const frame = director.frame();
    expect(frame.lagMs).toBeGreaterThan(6000);
    expect(desk(frame)?.stress).toBeGreaterThan(0);
    expect(actor(frame, LEAD_WORKER).stress).toBe(desk(frame)?.stress);

    // The first reply, already playing, is spoken in full; the middle of the
    // queue is skipped; the newest reply is spoken last.
    const bubbles: string[] = [];
    let talkingFrames = 0;
    run(director, clock, 20000, 50, () => {
      const lead = find(director.frame(), LEAD_WORKER);
      if (lead?.state === 'talking') {
        talkingFrames += 1;
      }
      if (lead?.bubble && bubbles[bubbles.length - 1] !== lead.bubble) {
        bubbles.push(lead.bubble);
      }
    });
    expect(bubbles).toEqual(['reply 0', 'reply 5']);
    // Two full talks, less one sampling tick at each state boundary: the first
    // played fast, with the queue behind it, the last at its own pace.
    expect(talkingFrames * 50).toBeGreaterThanOrEqual(TALK_MS / TEMPO_MAX + TALK_MS - 100);
    expect(desk(director.frame())?.stress).toBe(0);
  });

  it('keeps a short backlog whole: nothing is skipped when only a little behind', () => {
    const { clock, director } = setup();
    for (let i = 0; i < 3; i++) {
      director.ingest(ev('turn.stop', { ts: 1000 + i * 1000, meta: { text: `reply ${i}` } }));
    }

    const bubbles: string[] = [];
    run(director, clock, 10000, 50, () => {
      const bubble = find(director.frame(), LEAD_WORKER)?.bubble;
      if (bubble && bubbles[bubbles.length - 1] !== bubble) {
        bubbles.push(bubble);
      }
    });
    expect(bubbles).toEqual(['reply 0', 'reply 1', 'reply 2']);
  });

  it('runs flat out between spots when far behind', () => {
    const { clock, director } = setup();
    director.ingest(ev('approval.request', { ts: 1000 }));
    director.ingest(ev('approval.denied', { ts: 1000 }));
    director.ingest(ev('context.compact', { ts: 20000 }));

    const states = new Set<string>();
    run(director, clock, 4000, 50, () => states.add(actor(director.frame(), LEAD_WORKER).state));
    expect(states.has('running')).toBe(true);
  });

  it('sprints, short of running, when beats pile up but it is not far behind', () => {
    const { clock, director } = setup();
    director.ingest(ev('approval.request'));
    director.ingest(ev('context.compact'));

    const states = new Set<string>();
    run(director, clock, 4000, 50, () => states.add(actor(director.frame(), LEAD_WORKER).state));
    expect(states.has('sprinting')).toBe(true);
    expect(states.has('running')).toBe(false);
  });

  it('walks over to the human to ask for approval, and the human thinks it over', () => {
    const { clock, director } = setup();
    director.ingest(ev('approval.request'));

    const there = until(director, clock, (f) => actor(f, LEAD_WORKER).state === 'talking');
    expect(actor(there, LEAD_WORKER).pos).toEqual(askSpotFor(HUMAN_HOME));
    expect(actor(there, LEAD_WORKER).station).toBe('human');
    expect(actor(there, LEAD_WORKER).bubble).toBe('may I?');
    expect(desk(there)?.phase).toBe('awaiting_approval');
    expect(run(director, clock, 100).human.state).toBe('thinking');
  });

  it('files context away at the cabinets on its own side of the room', () => {
    const { clock, director } = setup();
    director.ingest(ev('context.compact'));

    const there = until(director, clock, (f) => actor(f, LEAD_WORKER).state === 'working');
    expect(actor(there, LEAD_WORKER).pos).toEqual(cabinetsFor(0));
    expect(actor(there, LEAD_WORKER).state).toBe('working');
  });

  it('has the human say the prompt when one lands', () => {
    const { clock, director } = setup();
    expect(director.frame().human.state).toBe('idle');
    director.ingest(ev('turn.user', { meta: { text: 'add a test for the parser' } }));

    const talking = director.frame().human;
    expect(talking.state).toBe('talking');
    expect(talking.bubble).toBe('add a test for the parser');
    expect(run(director, clock, 4000).human.state).toBe('idle');
  });
});

describe('Director helpers', () => {
  it('walks a helper in from the door to a spot beside the lead, with a briefing', () => {
    const { clock, director } = setup();
    director.ingest(ev('worker.start', { worker: 'a1', workerType: 'Explore' }));

    const arriving = director.frame();
    expect(actor(arriving, 'a1').pos).toEqual(STATIONS.door.spot);
    expect(actor(arriving, 'a1').role).toBe('helper');
    expect(desk(arriving)?.subagents).toBe(1);

    const seen = new Set<string>();
    const seated = run(director, clock, walkMs(6000), 50, () => {
      const frame = director.frame();
      seen.add(`lead:${actor(frame, LEAD_WORKER).state}`);
      seen.add(`a1:${actor(frame, 'a1').state}`);
    });
    expectNear(actor(seated, 'a1').pos, helperSpot(0, 0));
    expect(actor(seated, 'a1').label).toBe('Explore');
    expect(seen.has('lead:talking')).toBe(true);
    expect(seen.has('a1:talking')).toBe(true);

    director.ingest(ev('worker.stop', { worker: 'a1' }));
    run(director, clock, walkMs(8000));
    expect(find(director.frame(), 'a1')).toBeUndefined();
    expect(desk(director.frame())?.subagents).toBe(0);
  });

  it('keeps a helper working at its own spot while the lead works at the seat', () => {
    const { clock, director } = setup();
    director.ingest(ev('worker.start', { worker: 'a1', workerType: 'Explore' }));
    run(director, clock, walkMs(6000));
    director.ingest(toolStart({}, { id: 'L', kind: 'edit' }));
    director.ingest(toolStart({ worker: 'a1' }, { id: 'S', name: 'Bash', kind: 'execute' }));

    const frame = run(director, clock, 1000);
    expect(actor(frame, LEAD_WORKER).station).toBe('own_desk');
    expect(actor(frame, LEAD_WORKER).pos).toEqual(deskFor(0));
    expect(actor(frame, 'a1').station).toBe('own_desk');
    expect(actor(frame, 'a1').pos).toEqual(helperSpot(0, 0));
  });

  it('draws at most three helpers per desk and counts the rest', () => {
    const { clock, director } = setup();
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) {
      director.ingest(ev('worker.start', { worker: id, workerType: 'Explore' }));
    }

    const frame = run(director, clock, walkMs(6000));
    const helpers = frame.actors.filter((a) => a.role === 'helper');
    expect(helpers.map((a) => a.worker)).toEqual(['a1', 'a2', 'a3']);
    helpers.forEach((helper, i) => expectNear(helper.pos, helperSpot(0, i)));
    expect(desk(frame)?.subagents).toBe(5);

    // A spot frees, and the next helper's own work brings it onto the floor.
    director.ingest(ev('worker.stop', { worker: 'a2' }));
    run(director, clock, walkMs(6000));
    director.ingest(toolStart({ worker: 'a4' }, { id: 'x', kind: 'execute' }));
    const later = run(director, clock, walkMs(6000));
    expectNear(actor(later, 'a4').pos, helperSpot(0, 1));
    expect(desk(later)?.subagents).toBe(4);
  });

  it("finishes a helper's running tool before walking it out", () => {
    const { clock, director } = setup();
    director.ingest(ev('worker.start', { worker: 'a1', workerType: 'Explore' }));
    run(director, clock, walkMs(6000));
    director.ingest(toolStart({ worker: 'a1' }, { id: 'S', name: 'Bash', kind: 'execute' }));
    run(director, clock, 500);
    director.ingest(ev('worker.stop', { worker: 'a1' }));

    const still = run(director, clock, 2000);
    expect(actor(still, 'a1').state).toBe('working');

    director.ingest(toolEnd({ worker: 'a1' }, { id: 'S', name: 'Bash', kind: 'execute' }));
    run(director, clock, walkMs(6000));
    expect(find(director.frame(), 'a1')).toBeUndefined();
  });
});

describe('Director idle life', () => {
  it('waits, then naps when the session goes quiet', () => {
    const { clock, director } = setup();
    director.ingest(ev('turn.stop'));

    const early = run(director, clock, 3000);
    expect(actor(early, LEAD_WORKER).state).toBe('waiting');

    const later = run(director, clock, IDLE_REST_MS, 500);
    expect(actor(later, LEAD_WORKER).state).toBe('napping');
  });

  it('leaves and frees the desk after a long silence, and comes back on the next event', () => {
    const { clock, director } = setup();
    director.ingest(ev('turn.stop'));

    const gone = run(director, clock, IDLE_LEAVE_MS + walkMs(5000), 500);
    expect(gone.actors).toEqual([]);
    expect(gone.desks).toEqual([]);
    expect(gone.waiting).toBe(0);

    director.ingest(ev('turn.user'));
    const back = director.frame();
    expect(actor(back, LEAD_WORKER).pos).toEqual(STATIONS.door.spot);
    expect(desk(back)?.slot).toBe(0);
  });

  it('walks everyone out when the session ends, once their beats finish', () => {
    const { clock, director } = setup();
    director.ingest(ev('worker.start', { worker: 'a1', workerType: 'Explore' }));
    run(director, clock, walkMs(6000));
    director.ingest(toolStart({}, { id: 'L', name: 'Bash', kind: 'execute' }));
    director.ingest(ev('session.end'));

    // The end closes the tool that never reported back, but the beat still
    // plays (once the lead is back from any pacing) before anyone moves.
    const still = until(director, clock, (f) => actor(f, LEAD_WORKER).state === 'working');
    expect(actor(still, LEAD_WORKER).state).toBe('working');
    expect(desk(still)?.phase).toBe('closed');

    const after = run(director, clock, walkMs(8000));
    expect(after.actors).toEqual([]);
    expect(after.desks).toEqual([]);
  });

  it('returns to its old desk if it is still free, otherwise takes a new one', () => {
    seq = 0;
    const clock = manualClock(1000);
    const director = new Director({ clock, rng: seededRng(7) });
    director.ingest(ev('session.start', {}, 'a'));
    director.ingest(ev('session.start', {}, 'b'));
    director.ingest(ev('session.start', {}, 'c'));
    run(director, clock, 3000);

    // b and c go quiet while a keeps working.
    let n = 0;
    const keepAlive = (): void => {
      director.ingest(toolStart({ ts: clock.now() }, { id: `k${n}` }, 'a'));
      director.ingest(toolEnd({ ts: clock.now() }, { id: `k${n}` }, 'a'));
      n += 1;
    };
    run(director, clock, IDLE_LEAVE_MS + 10000, 500, (t) => {
      if (t % 20000 === 0) {
        keepAlive();
      }
    });
    expect(director.frame().desks.map((d) => d.bus)).toEqual(['a']);

    // c returns first: desk 2 was its own and is free, so it goes there, not to desk 1.
    director.ingest(ev('turn.user', {}, 'c'));
    expect(desk(director.frame(), 'c')?.slot).toBe(2);

    // A newcomer takes desk 1; when b returns, its old desk is taken, so it gets desk 3.
    director.ingest(ev('session.start', {}, 'd'));
    expect(desk(director.frame(), 'd')?.slot).toBe(1);
    director.ingest(ev('turn.user', {}, 'b'));
    expect(desk(director.frame(), 'b')?.slot).toBe(3);
  });
});

describe('Director pacing and tempo', () => {
  it('gets a thinking lead up to pace behind its chair, then sits it down again', () => {
    const { clock, director } = setup();
    const seat = deskFor(0);
    const states = new Set<string>();
    let furthest = 0;
    run(director, clock, 30000, 50, () => {
      const lead = actor(director.frame(), LEAD_WORKER);
      states.add(lead.state);
      furthest = Math.max(furthest, Math.hypot(lead.pos.x - seat.x, lead.pos.y - seat.y));
    });
    expect(states).toContain('pacing');
    expect(furthest).toBeGreaterThan(0.9);
    expect(actor(director.frame(), LEAD_WORKER).pos).toEqual(seat);
  });

  it('paces a thinking helper across its spot, and lands the leg before working', () => {
    const { clock, director } = setup();
    director.ingest(ev('worker.start', { worker: 'a1', workerType: 'Explore' }));
    run(director, clock, walkMs(6000));
    // Catch it halfway along a leg.
    let helper = actor(director.frame(), 'a1');
    for (let i = 0; i < 200 && helper.state !== 'pacing'; i++) {
      helper = actor(run(director, clock, 50), 'a1');
    }
    expect(helper.state).toBe('pacing');

    director.ingest(toolStart({ worker: 'a1' }, { id: 'h1' }));
    const states = statesOf(director, clock, 4000, 'a1');
    // It walks the leg it is on to the end before it turns to the work.
    expect(states[0]).toBe('pacing');
    expect(states).toContain('working');
    expect(states.indexOf('working')).toBeGreaterThan(0);
  });

  it('plays queued beats faster, and back at its own pace once caught up', () => {
    const { clock, director } = setup();
    for (let i = 0; i < 4; i++) {
      director.ingest(ev('turn.stop', { ts: 1000 + i * 100, meta: { text: `reply ${i}` } }));
    }
    const busy = run(director, clock, 100);
    expect(actor(busy, LEAD_WORKER).tempo).toBeGreaterThan(1);

    const calm = run(director, clock, 15000);
    expect(actor(calm, LEAD_WORKER).tempo).toBe(1);
  });

  it("counts each state's animation time from when the state began", () => {
    const { clock, director } = setup();
    director.ingest(ev('turn.stop', { meta: { text: 'done' } }));
    let talking = actor(director.frame(), LEAD_WORKER);
    for (let i = 0; i < 100 && talking.state !== 'talking'; i++) {
      talking = actor(run(director, clock, 50), LEAD_WORKER);
    }
    expect(talking.phase).toBeLessThan(100);
    const later = actor(run(director, clock, 500), LEAD_WORKER);
    expect(later.state).toBe('talking');
    expect(later.phase).toBeGreaterThan(talking.phase ?? 0);
  });
});

describe('Director catch-up', () => {
  it('seats a caught-up session instantly, with its helpers in place', () => {
    seq = 0;
    const clock = manualClock(5000);
    const director = new Director({ clock, rng: seededRng(7) });
    director.reconstruct(ev('session.start'));
    director.reconstruct(ev('worker.start', { worker: 'a1', workerType: 'Explore' }));

    const frame = director.frame();
    expect(actor(frame, LEAD_WORKER).pos).toEqual(deskFor(0));
    expect(actor(frame, 'a1').pos).toEqual(helperSpot(0, 0));
    expect(frame.lagMs).toBe(0);
  });

  it('leaves a recording that went quiet long before the newest one off the floor', () => {
    seq = 0;
    const now = 10_000_000;
    const clock = manualClock(now);
    const director = new Director({ clock, rng: seededRng(7) });
    director.reconstruct(ev('session.start', { ts: now }, 'fresh'));
    director.reconstruct(ev('session.start', { ts: now - IDLE_LEAVE_MS - 1 }, 'stale'));

    const frame = director.frame();
    expect(frame.desks.map((d) => d.bus)).toEqual(['fresh']);
    expect(frame.waiting).toBe(0);

    // Until it speaks up again.
    director.ingest(toolStart({ ts: now }, {}, 'stale'));
    expect(director.frame().desks.map((d) => d.bus)).toEqual(['fresh', 'stale']);
  });
});

describe('Director determinism', () => {
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
