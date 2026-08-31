import {
  MIN_WORK_MS,
  SLUMP_MS,
  choreographyFor,
  claudeChoreography,
  defaultChoreography,
} from '../choreography';
import { AnimationContext, ChoreographyRegistry } from '../choreography/types';
import { manualClock, seededRng } from '../clock';
import { Director } from '../director';
import { AgentopiaEvent, EventKind, LEAD_WORKER, ToolKind } from '../events';
import { emptyOffice } from '../state';
import { STATIONS } from '../stations';

function ctx(event: Partial<AgentopiaEvent> & { kind: EventKind }): AnimationContext {
  return {
    event: { ts: 1000, session: 's1', worker: LEAD_WORKER, ...event },
    office: emptyOffice(),
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

  it.each([
    ['read', 'archive'],
    ['search', 'map_wall'],
    ['edit', 'workbench'],
    ['delete', 'box_room'],
    ['move', 'box_room'],
    ['execute', 'own_desk'],
    ['fetch', 'phone_booth'],
    ['think', 'whiteboard'],
    ['other', 'mail_room'],
  ] as const)('stages a %s tool.start at the %s', (kind, station) => {
    const segments = defaultChoreography['tool.start']!.main!(toolCtx(kind));
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      station,
      state: 'working',
      minMs: MIN_WORK_MS,
      openSlot: 't1',
      coalesce: true,
    });
  });

  it('sends any MCP tool to the mail room regardless of kind', () => {
    const context = toolCtx('read');
    context.event.meta = { mcp: true };
    const segments = defaultChoreography['tool.start']!.main!(context);
    expect(segments[0].station).toBe('mail_room');
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
    expect(release).toEqual({ slot: 't1', into: undefined });
  });

  it('morphs a failed tool.end into a slump at the tool station', () => {
    const release = defaultChoreography['tool.end']!.release!(
      ctx({
        kind: 'tool.end',
        tool: { id: 't1', name: 'Bash', kind: 'execute', status: 'failed' },
      })
    );
    expect(release?.into).toMatchObject({ station: 'own_desk', state: 'slump', minMs: SLUMP_MS });
  });

  it('stands the petitioner at the human desk asking "may I?"', () => {
    const segments = defaultChoreography['approval.request']!.main!(
      ctx({ kind: 'approval.request' })
    );
    expect(segments[0]).toMatchObject({ station: 'human_desk', bubble: 'may I?' });
  });

  it('sends the whole office to the box room to compact, at double dwell', () => {
    const choreography = defaultChoreography['context.compact']!;
    expect(choreography.scope).toBe('office');
    const segments = choreography.main!(ctx({ kind: 'context.compact' }));
    expect(segments[0]).toMatchObject({ station: 'box_room', minMs: MIN_WORK_MS * 2 });
  });

  it.each([
    [{ text: 'done — tests are green' }, 'done — tests are green'],
    [{ text: '' }, undefined],
    [undefined, undefined],
  ])('bubbles the turn.stop reply from meta %p', (meta, expected) => {
    const bubble = defaultChoreography['turn.stop']!.bubble!(ctx({ kind: 'turn.stop', meta }));
    expect(bubble).toBe(expected);
  });

  it('recalls the lead on both turn boundaries', () => {
    expect(defaultChoreography['turn.user']).toMatchObject({ scope: 'lead', interrupt: true });
    expect(defaultChoreography['turn.stop']).toMatchObject({ scope: 'lead', interrupt: true });
  });

  it('walks workers in on worker.start and out on worker.stop', () => {
    expect(defaultChoreography['worker.start']).toMatchObject({ enters: true });
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
    // A harness that insists all reads happen at the whiteboard.
    const registry: ChoreographyRegistry = {
      ...defaultChoreography,
      'tool.start': {
        main: () => [{ station: 'whiteboard', state: 'working', minMs: 900 }],
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
    for (let t = 0; t < 6000; t += 50) {
      clock.advance(50);
      frame = director.frame();
      const lead = frame.actors.find((a) => a.id === LEAD_WORKER)!;
      if (lead.state === 'working') {
        break;
      }
    }
    const lead = frame.actors.find((a) => a.id === LEAD_WORKER)!;
    expect(lead.station).toBe('whiteboard');
    expect(lead.pos).toEqual(STATIONS.whiteboard.spot);
  });
});
