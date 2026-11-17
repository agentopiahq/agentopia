import {
  ANSWER_LINES,
  BRIEFS,
  MIN_WORK_MS,
  SLUMP_MS,
  TALK_MS,
  answerFor,
  approvalSlot,
  askFor,
  briefFor,
  choreographyFor,
  claudeChoreography,
  defaultChoreography,
} from '../choreography';
import { AnimationContext, ChoreographyRegistry } from '../choreography/types';
import { manualClock, seededRng } from '../clock';
import { Director } from '../director';
import { AgentopiaEvent, EventKind, LEAD_WORKER, TOOL_KINDS, ToolKind } from '../events';
import { emptySession } from '../state';
import { STATIONS } from '../stations';

function ctx(event: Partial<AgentopiaEvent> & { kind: EventKind }): AnimationContext {
  return {
    event: { ts: 1000, session: 's1', worker: LEAD_WORKER, ...event },
    session: emptySession(),
  };
}

function toolCtx(kind: ToolKind, over: Partial<NonNullable<AgentopiaEvent['tool']>> = {}) {
  return ctx({
    kind: 'tool.start',
    tool: { id: 't1', name: 'Read', kind, status: 'in_progress', ...over },
  });
}

describe('defaultChoreography', () => {
  it('covers every event kind', () => {
    const kinds: EventKind[] = [
      'session.start',
      'session.end',
      'turn.user',
      'turn.stop',
      'worker.start',
      'worker.stop',
      'tool.start',
      'tool.end',
      'approval.request',
      'approval.denied',
      'context.compact',
      'context.compacted',
      'task.created',
      'task.completed',
      'notify',
    ];
    for (const kind of kinds) {
      expect(defaultChoreography[kind]).toBeDefined();
    }
  });

  it.each(TOOL_KINDS.map((kind) => [kind]))('stages a %s tool.start at the desk', (kind) => {
    const segments = defaultChoreography['tool.start']!.main!(toolCtx(kind, { detail: 'a.ts' }));
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      station: 'own_desk',
      state: 'working',
      minMs: MIN_WORK_MS,
      openSlot: 't1',
      coalesce: true,
      screen: 'Read a.ts',
    });
  });

  it('keeps an MCP tool at the desk too', () => {
    const context = toolCtx('read');
    context.event.meta = { mcp: true };
    const segments = defaultChoreography['tool.start']!.main!(context);
    expect(segments[0].station).toBe('own_desk');
  });

  it('puts just the tool name on the monitor when there is no detail', () => {
    const segments = defaultChoreography['tool.start']!.main!(toolCtx('execute', { name: 'Bash' }));
    expect(segments[0].screen).toBe('Bash');
  });

  it('stages nothing for a tool.start without a tool', () => {
    const segments = defaultChoreography['tool.start']!.main!(ctx({ kind: 'tool.start' }));
    expect(segments).toEqual([]);
  });

  it('releases the open slot quietly on success', () => {
    const release = defaultChoreography['tool.end']!.release!(
      ctx({
        kind: 'tool.end',
        tool: { id: 't1', name: 'Read', kind: 'read', status: 'completed' },
      })
    );
    expect([release].flat()[0]).toEqual({ slot: 't1', into: undefined });
  });

  it('answers yes to an ask still held open about the call, and only if it is', () => {
    const releases = [
      defaultChoreography['tool.end']!.release!(
        ctx({
          kind: 'tool.end',
          tool: { id: 't1', name: 'Bash', kind: 'execute', status: 'completed' },
        })
      ),
    ].flat();
    const asks = releases.filter((r) => r?.slot.startsWith('approval:'));
    expect(asks.map((r) => r?.slot)).toEqual([
      approvalSlot(LEAD_WORKER, 't1'),
      approvalSlot(LEAD_WORKER, 'Bash'),
    ]);
    for (const ask of asks) {
      expect(ask).toMatchObject({ on: 'lead', ifOpen: true });
      expect(ask?.into).toMatchObject({
        station: 'human',
        state: 'waiting',
        answer: { yes: true },
      });
    }
  });

  it('morphs a failed tool.end into a slump at the desk', () => {
    const release = defaultChoreography['tool.end']!.release!(
      ctx({
        kind: 'tool.end',
        tool: { id: 't1', name: 'Bash', kind: 'execute', status: 'failed' },
      })
    );
    expect([release].flat()[0]?.into).toMatchObject({
      station: 'own_desk',
      state: 'slump',
      minMs: SLUMP_MS,
    });
  });

  it('sends the lead to the human, asking for the call already under way, and holds the ask open', () => {
    const choreography = defaultChoreography['approval.request']!;
    expect(choreography.scope).toBe('lead');
    const session = emptySession();
    session.workers[LEAD_WORKER] = {
      id: LEAD_WORKER,
      joinedAt: 0,
      toolCount: 1,
      failures: 0,
      tools: { toolu_9: { id: 'toolu_9', name: 'Bash', kind: 'execute', status: 'in_progress' } },
    };
    const c = {
      ...ctx({
        kind: 'approval.request',
        tool: { name: 'Bash', kind: 'execute', status: 'pending', detail: 'yarn test' },
      }),
      session,
    };
    expect(choreography.main!(c)[0]).toMatchObject({
      station: 'human',
      state: 'talking',
      minMs: TALK_MS,
      bubble: 'may I run “yarn test”?',
      openSlot: approvalSlot(LEAD_WORKER, 'toolu_9'),
    });
    // The call stops holding the desk: it cannot run until you say.
    expect(choreography.release!(c)).toEqual({ slot: 'toolu_9', on: 'worker' });
  });

  it.each([
    ['Bash', 'execute', 'yarn test', 'may I run “yarn test”?'],
    ['Edit', 'edit', 'src/director.ts', 'may I edit src/director.ts?'],
    ['Write', 'edit', 'docs/notes.md', 'may I write docs/notes.md?'],
    ['WebFetch', 'fetch', 'github.com', 'may I open github.com?'],
    ['WebSearch', 'fetch', 'pixi v8 blend modes', 'may I search for “pixi v8 blend modes”?'],
    ['AskUserQuestion', 'other', undefined, 'can I ask you something?'],
    ['mcp__ccd_directory__change_directory', 'other', undefined, 'may I change directory?'],
    ['mcp__linear__issue_tracker', 'other', undefined, 'may I use issue tracker?'],
    ['Workflow', 'other', undefined, 'may I use Workflow?'],
    ['execute', 'execute', 'yarn build', 'may I run “yarn build”?'],
    ['Grep', 'search', 'TODO', 'may I search for TODO?'],
    ['Bash', 'execute', undefined, 'may I run a command?'],
  ] as const)('asks for a %s call as exactly as it can', (name, kind, detail, ask) => {
    expect(
      askFor({
        ts: 1,
        kind: 'approval.request',
        session: 's',
        worker: LEAD_WORKER,
        tool: { name, kind, status: 'pending', detail },
      })
    ).toBe(ask);
  });

  it('asks to go ahead when the event says nothing about what, and fits a long command in the bubble', () => {
    const base = { ts: 1, kind: 'approval.request', session: 's', worker: LEAD_WORKER } as const;
    expect(askFor(base)).toBe('may I go ahead?');
    const long = askFor({
      ...base,
      tool: {
        name: 'Bash',
        kind: 'execute',
        status: 'pending',
        detail: 'rm -rf build && '.repeat(9),
      },
    });
    expect(long.length).toBeLessThanOrEqual(46);
    expect(long).toMatch(/^may I run “rm -rf build.*…”\?$/);
  });

  it('answers the same way for the same event, nodding, giving a thumbs up or saying yes', () => {
    const at = (ts: number) =>
      answerFor({ ts, kind: 'tool.end', session: 's', worker: LEAD_WORKER }, true);
    expect(at(5)).toEqual(at(5));
    const gestures = new Set<string>();
    for (let ts = 0; ts < 60; ts++) {
      const answer = at(ts);
      expect(answer.yes).toBe(true);
      gestures.add(answer.gesture);
      if (answer.gesture === 'say') {
        expect(ANSWER_LINES.yes).toContain(answer.line);
      } else {
        expect(answer.line).toBeUndefined();
      }
    }
    expect(gestures).toEqual(new Set(['nod', 'thumbs', 'say']));
  });

  it('says no with a shake of the head or out loud', () => {
    const gestures = new Set<string>();
    for (let ts = 0; ts < 60; ts++) {
      const answer = answerFor({ ts, kind: 'turn.stop', session: 's', worker: LEAD_WORKER }, false);
      expect(answer.yes).toBe(false);
      gestures.add(answer.gesture);
    }
    expect(gestures).toEqual(new Set(['shake', 'say']));
  });

  it.each(['approval.denied', 'turn.stop', 'turn.user'] as const)(
    'answers no to every ask still held open on %s',
    (kind) => {
      const release = defaultChoreography[kind]!.release!(ctx({ kind }));
      expect(release).toMatchObject({
        slot: 'approval:',
        prefix: true,
        on: 'lead',
        ifOpen: true,
        into: { station: 'human', state: 'waiting', answer: { yes: false } },
      });
    }
  );

  it('sends the whole session to the cabinets to compact, at double dwell', () => {
    const choreography = defaultChoreography['context.compact']!;
    expect(choreography.scope).toBe('session');
    const segments = choreography.main!(ctx({ kind: 'context.compact' }));
    expect(segments[0]).toMatchObject({ station: 'cabinets', minMs: MIN_WORK_MS * 2 });
  });

  it.each([
    [{ text: 'done — tests are green' }, 'done — tests are green'],
    [{ text: '' }, undefined],
    [undefined, undefined],
  ])('signs off at the desk with the turn.stop reply from meta %p', (meta, expected) => {
    const segments = defaultChoreography['turn.stop']!.main!(ctx({ kind: 'turn.stop', meta }));
    if (expected === undefined) {
      expect(segments).toEqual([]);
    } else {
      expect(segments).toEqual([
        { station: 'own_desk', state: 'talking', minMs: TALK_MS, bubble: expected },
      ]);
    }
  });

  it('never interrupts on a turn boundary: the prompt stages nothing but the answer to an open ask', () => {
    const turn = defaultChoreography['turn.user']!;
    expect(turn).toMatchObject({ scope: 'lead', ensure: false });
    expect(turn.main).toBeUndefined();
    expect(defaultChoreography['turn.stop']).toMatchObject({ scope: 'lead', ensure: false });
  });

  it('briefs a helper on worker.start: both sides talk at the desk', () => {
    const choreography = defaultChoreography['worker.start']!;
    expect(choreography.enters).toBe(true);
    const context = ctx({ kind: 'worker.start', worker: 'a1', workerType: 'Explore' });
    expect(choreography.main!(context)).toEqual([
      { station: 'own_desk', state: 'talking', minMs: TALK_MS },
    ]);
    expect(choreography.lead!(context)).toEqual([
      { station: 'own_desk', state: 'talking', minMs: TALK_MS, bubble: briefFor(context.event) },
    ]);
    expect(BRIEFS.Explore).toContain(briefFor(context.event));
  });

  it('briefs with what the event says the helper was asked, when it says', () => {
    const event = {
      ...ctx({ kind: 'worker.start', worker: 'a1' }).event,
      meta: { brief: 'find the flaky test' },
    };
    expect(briefFor(event)).toBe('find the flaky test');
  });

  it('varies the brief from helper to helper, the same each time for one', () => {
    const said = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((worker) =>
      briefFor(ctx({ kind: 'worker.start', worker, workerType: 'Explore' }).event)
    );
    expect(new Set(said).size).toBeGreaterThan(1);
    expect(briefFor(ctx({ kind: 'worker.start', worker: 'a1', workerType: 'Explore' }).event)).toBe(
      said[0]
    );
    expect(said.some((line) => line.includes(': go'))).toBe(false);
    for (const line of Object.values(BRIEFS).flat()) {
      expect(line).toMatch(/please|could you|would you|thanks/i);
    }
  });

  it('walks workers out on worker.stop', () => {
    expect(defaultChoreography['worker.stop']).toMatchObject({ departs: true });
  });
});

describe('choreographyFor', () => {
  it.each([
    ['claude', claudeChoreography],
    ['codex', defaultChoreography],
    [undefined, defaultChoreography],
  ])('resolves %p', (harness, expected) => {
    expect(choreographyFor(harness)).toBe(expected);
  });
});

describe('Director with a custom registry', () => {
  it('stages events per the injected choreography, not a built-in table', () => {
    // A harness that insists all reads happen at the printers.
    const registry: ChoreographyRegistry = {
      ...defaultChoreography,
      'tool.start': {
        main: () => [{ station: 'printers', state: 'working', minMs: 900 }],
      },
    };
    const clock = manualClock(1000);
    const director = new Director({ clock, rng: seededRng(7), choreography: registry });
    const ingest = (event: AgentopiaEvent, seq: number) => director.ingest({ seq, event });

    ingest({ ts: 1000, kind: 'session.start', session: 's1', worker: LEAD_WORKER }, 0);
    ingest(
      {
        ts: 1000,
        kind: 'tool.start',
        session: 's1',
        worker: LEAD_WORKER,
        tool: { id: 't1', name: 'Read', kind: 'read', status: 'in_progress' },
      },
      1
    );

    let frame = director.frame();
    for (let t = 0; t < 8000; t += 50) {
      clock.advance(50);
      frame = director.frame();
      const lead = frame.actors.find((a) => a.worker === LEAD_WORKER)!;
      if (lead.state === 'working') {
        break;
      }
    }
    const lead = frame.actors.find((a) => a.worker === LEAD_WORKER)!;
    expect(lead.station).toBe('printers');
    expect(lead.pos).toEqual(STATIONS.printers.spot);
  });
});
