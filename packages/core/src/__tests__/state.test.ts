import { CubicleEvent, EventKind, LEAD_WORKER, ToolKind } from '../events';
import { OfficePhase, emptyOffice, reduce, reduceAll } from '../state';

function event(kind: EventKind, over: Partial<CubicleEvent> = {}): CubicleEvent {
  return { ts: 1000, kind, session: 's1', worker: LEAD_WORKER, ...over };
}

function toolEvent(kind: EventKind, tool: Partial<NonNullable<CubicleEvent['tool']>> = {}) {
  return event(kind, {
    tool: { name: 'Read', kind: 'read', status: 'completed', ...tool },
  });
}

describe('reduce', () => {
  it.each<[EventKind, OfficePhase]>([
    ['session.start', 'working'],
    ['turn.user', 'working'],
    ['turn.stop', 'waiting_on_user'],
    ['worker.start', 'working'],
    ['approval.request', 'awaiting_approval'],
    ['approval.denied', 'working'],
    ['context.compact', 'compacting'],
    ['context.compacted', 'working'],
    ['session.end', 'closed'],
  ])('%s puts the office in phase %s', (kind, phase) => {
    expect(reduce(emptyOffice(), event(kind)).phase).toBe(phase);
  });

  it.each<[EventKind]>([['notify'], ['task.created'], ['tool.start']])(
    '%s records the event timestamp',
    (kind) => {
      expect(reduce(emptyOffice(), event(kind, { ts: 4242 })).lastEventAt).toBe(4242);
    }
  );

  it('session.start seats the lead and clears prior state', () => {
    const dirty = reduce(emptyOffice(), event('worker.start', { worker: 'a1' }));
    const state = reduce(dirty, event('session.start', { ts: 50 }));

    expect(Object.keys(state.workers)).toEqual([LEAD_WORKER]);
    expect(state.startedAt).toBe(50);
  });

  it('worker.start seats a named subagent at its own desk', () => {
    const state = reduce(
      emptyOffice(),
      event('worker.start', { worker: 'a1', workerType: 'code-review' })
    );

    expect(state.workers.a1).toMatchObject({ id: 'a1', type: 'code-review', toolCount: 0 });
  });

  it('worker.stop empties the desk but never evicts the lead', () => {
    const withSub = reduceAll([
      event('worker.start', { worker: 'a1' }),
      event('worker.start', { worker: LEAD_WORKER }),
    ]);

    expect(reduce(withSub, event('worker.stop', { worker: 'a1' })).workers.a1).toBeUndefined();
    expect(
      reduce(withSub, event('worker.stop', { worker: LEAD_WORKER })).workers[LEAD_WORKER]
    ).toBeDefined();
  });

  it('tool.start parks the in-flight tool on the worker, tool.end clears it', () => {
    const started = reduce(emptyOffice(), toolEvent('tool.start', { status: 'in_progress' }));
    expect(started.workers[LEAD_WORKER].tool?.name).toBe('Read');

    const ended = reduce(started, toolEvent('tool.end'));
    expect(ended.workers[LEAD_WORKER].tool).toBeUndefined();
    expect(ended.workers[LEAD_WORKER].toolCount).toBe(1);
  });

  it.each<[ToolKind]>([['read'], ['edit'], ['search'], ['execute'], ['fetch']])(
    'tool.end tallies a completed %s for set dressing',
    (kind) => {
      const state = reduce(emptyOffice(), toolEvent('tool.end', { kind }));
      expect(state.counters.byKind[kind]).toBe(1);
    }
  );

  it('a failed tool call counts against both the worker and the office', () => {
    const state = reduce(emptyOffice(), toolEvent('tool.end', { status: 'failed' }));

    expect(state.counters.failures).toBe(1);
    expect(state.workers[LEAD_WORKER].failures).toBe(1);
  });

  it('tool events for an unseen worker seat them rather than dropping the beat', () => {
    const state = reduce(emptyOffice(), toolEvent('tool.end'));
    expect(state.workers[LEAD_WORKER]).toBeDefined();
  });

  it('tracks tasks onto the whiteboard and crosses them off', () => {
    const created = reduce(
      emptyOffice(),
      event('task.created', { meta: { taskId: 't1', subject: 'ship it' } })
    );
    expect(created.tasks).toEqual([{ id: 't1', subject: 'ship it', done: false }]);

    const repeated = reduce(created, event('task.created', { meta: { taskId: 't1' } }));
    expect(repeated.tasks).toHaveLength(1);

    const done = reduce(repeated, event('task.completed', { meta: { taskId: 't1' } }));
    expect(done.tasks[0].done).toBe(true);
  });

  it('counts turns and compactions across a session', () => {
    const state = reduceAll([
      event('session.start'),
      event('turn.stop'),
      event('turn.user'),
      event('turn.stop'),
      event('context.compact'),
    ]);

    expect(state.counters).toMatchObject({ turns: 2, compactions: 1 });
  });

  it('never mutates the state it is given', () => {
    const before = emptyOffice();
    const snapshot = JSON.stringify(before);

    reduce(before, toolEvent('tool.end', { kind: 'edit' }));

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
