import { AgentopiaEvent, EventKind, LEAD_WORKER, ToolKind, ToolStatus } from '@agentopia/core';

import { Scenario, TimedEvent } from './harness';

/**
 * Scenario scripts, one per event kind. These are harness-agnostic: they are
 * written in the normalized event vocabulary, so the same scenario showcases
 * any harness's choreography — the story picks the registry.
 */

const EPOCH = 1_000_000;
const SESSION = 's-story';

function ev(at: number, kind: EventKind, over: Partial<AgentopiaEvent> = {}): TimedEvent {
  return { at, event: { ts: EPOCH + at, kind, session: SESSION, worker: LEAD_WORKER, ...over } };
}

function toolEv(
  at: number,
  kind: 'tool.start' | 'tool.end',
  tool: ToolKind,
  status: ToolStatus,
  over: Partial<AgentopiaEvent> = {}
): TimedEvent {
  return ev(at, kind, {
    tool: { id: 't1', name: tool, kind: tool, status, detail: TOOL_DETAILS[tool] },
    ...over,
  });
}

/** Flavor text for the tool speech bubbles, per kind. */
const TOOL_DETAILS: Record<ToolKind, string> = {
  read: 'src/director.ts',
  search: 'stationForTool',
  edit: 'renderer.ts',
  delete: 'old-notes.md',
  move: 'assets/sprites',
  execute: 'yarn test',
  think: 'plan the fix',
  fetch: 'pixijs.com/docs',
  other: 'figma export',
};

export function sessionStartScenario(): Scenario {
  return {
    events: [ev(0, 'session.start')],
    watch: LEAD_WORKER,
    durationMs: 6000,
    isMain: (a) => a?.state === 'thinking',
  };
}

export function sessionEndScenario(): Scenario {
  return {
    events: [ev(0, 'session.start'), ev(800, 'session.end')],
    watch: LEAD_WORKER,
    durationMs: 5000,
    phaseStartMs: 800,
    isMain: (a) => a?.state === 'idle',
  };
}

export function turnUserScenario(): Scenario {
  // A long human pause first, so the prompt has something to wake: by the
  // time it lands the lead has dozed off at its desk.
  return {
    events: [ev(0, 'session.start'), ev(300, 'turn.stop'), ev(50_000, 'turn.user')],
    watch: LEAD_WORKER,
    durationMs: 56_000,
    speed: 6,
    phaseStartMs: 50_000,
    isMain: (a) => a?.state === 'thinking',
  };
}

export function turnStopScenario(): Scenario {
  return {
    events: [
      ev(0, 'session.start'),
      toolEv(300, 'tool.start', 'edit', 'in_progress'),
      toolEv(2100, 'tool.end', 'edit', 'completed'),
      ev(2400, 'turn.stop', { meta: { text: 'done — tests are green' } }),
    ],
    watch: LEAD_WORKER,
    durationMs: 40_000,
    speed: 4,
    phaseStartMs: 2400,
    isMain: (a) => a?.state === 'waiting',
  };
}

export function workerStartScenario(): Scenario {
  return {
    events: [
      ev(0, 'session.start'),
      ev(400, 'worker.start', { worker: 'a1', workerType: 'Explore' }),
    ],
    watch: 'a1',
    durationMs: 8000,
    phaseStartMs: 400,
    isMain: (a) => a?.state === 'walking',
  };
}

export function workerStopScenario(): Scenario {
  return {
    events: [
      ev(0, 'session.start'),
      ev(200, 'worker.start', { worker: 'a1', workerType: 'Explore' }),
      ev(4500, 'worker.stop', { worker: 'a1' }),
    ],
    watch: 'a1',
    durationMs: 10_000,
    phaseStartMs: 4500,
    isMain: (a) => a?.state === 'walking',
  };
}

export function toolStartScenario(kind: ToolKind, mcp = false): Scenario {
  const meta = mcp ? { mcp: true } : undefined;
  return {
    events: [
      ev(0, 'session.start'),
      toolEv(400, 'tool.start', kind, 'in_progress', { meta }),
      toolEv(3400, 'tool.end', kind, 'completed', { meta }),
    ],
    watch: LEAD_WORKER,
    durationMs: 10_000,
    phaseStartMs: 400,
  };
}

export function toolEndScenario(status: 'completed' | 'failed', kind: ToolKind = 'read'): Scenario {
  return {
    events: [
      ev(0, 'session.start'),
      toolEv(400, 'tool.start', kind, 'in_progress'),
      toolEv(2400, 'tool.end', kind, status),
    ],
    watch: LEAD_WORKER,
    durationMs: 10_000,
    phaseStartMs: 2400,
    isMain: status === 'failed' ? (a) => a?.state === 'slump' : undefined,
  };
}

export function approvalRequestScenario(): Scenario {
  return {
    events: [ev(0, 'session.start'), ev(400, 'approval.request'), ev(4500, 'approval.denied')],
    watch: LEAD_WORKER,
    durationMs: 11_000,
    phaseStartMs: 400,
  };
}

export function approvalDeniedScenario(): Scenario {
  return { ...approvalRequestScenario(), phaseStartMs: 4500 };
}

export function contextCompactScenario(): Scenario {
  return {
    events: [
      ev(0, 'session.start'),
      ev(300, 'worker.start', { worker: 'a1', workerType: 'code-reviewer' }),
      ev(2800, 'context.compact'),
      ev(7000, 'context.compacted'),
    ],
    watch: LEAD_WORKER,
    durationMs: 15_000,
    phaseStartMs: 2800,
  };
}

export function contextCompactedScenario(): Scenario {
  return { ...contextCompactScenario(), phaseStartMs: 7000 };
}

export function taskCreatedScenario(): Scenario {
  return {
    events: [
      ev(0, 'session.start'),
      ev(600, 'task.created', { meta: { taskId: '1', subject: 'Fix the flaky test' } }),
    ],
    watch: LEAD_WORKER,
    durationMs: 4000,
    phaseStartMs: 600,
    isMain: () => false,
  };
}

export function taskCompletedScenario(): Scenario {
  return {
    events: [
      ev(0, 'session.start'),
      ev(400, 'task.created', { meta: { taskId: '1', subject: 'Fix the flaky test' } }),
      ev(1200, 'task.completed', { meta: { taskId: '1' } }),
    ],
    watch: LEAD_WORKER,
    durationMs: 4000,
    phaseStartMs: 1200,
    isMain: () => false,
  };
}

export function notifyScenario(): Scenario {
  return {
    events: [
      ev(0, 'session.start'),
      ev(600, 'notify', { meta: { message: 'needs your attention' } }),
    ],
    watch: LEAD_WORKER,
    durationMs: 4000,
    phaseStartMs: 600,
    isMain: () => false,
  };
}

/**
 * The floor: three sessions sharing the office. One works through a batch
 * with helpers, one asks for approval, one signs off and goes quiet. The
 * story to open when judging how the desks read side by side.
 */
export function floorScenario(): Scenario {
  const on = (bus: string, timed: TimedEvent): TimedEvent => ({
    ...timed,
    bus,
    event: { ...timed.event, session: `s-${bus}` },
  });
  const events: TimedEvent[] = [
    on('a', ev(0, 'session.start', { meta: { sessionName: 'fix the flaky test' } })),
    on('b', ev(1200, 'session.start', { meta: { sessionName: 'write the release notes' } })),
    on('c', ev(2400, 'session.start', { meta: { sessionName: 'migrate the schema' } })),

    on('a', ev(3000, 'turn.user')),
    on('a', toolEv(3400, 'tool.start', 'read', 'in_progress')),
    on('a', toolEv(5400, 'tool.end', 'read', 'completed')),
    on('a', ev(6000, 'worker.start', { worker: 'a1', workerType: 'Explore' })),
    on('a', ev(7000, 'worker.start', { worker: 'a2', workerType: 'code-reviewer' })),
    on('a', ev(7600, 'worker.start', { worker: 'a3', workerType: 'Explore' })),
    on('a', ev(8200, 'worker.start', { worker: 'a4', workerType: 'Explore' })),
    on(
      'a',
      toolEv(9000, 'tool.start', 'execute', 'in_progress', {
        tool: {
          id: 'x1',
          name: 'Bash',
          kind: 'execute',
          status: 'in_progress',
          detail: 'yarn test',
        },
      })
    ),
    on(
      'a',
      toolEv(12_000, 'tool.end', 'execute', 'failed', {
        tool: { id: 'x1', name: 'Bash', kind: 'execute', status: 'failed', detail: 'yarn test' },
      })
    ),

    on('b', ev(4000, 'turn.user')),
    on(
      'b',
      toolEv(4600, 'tool.start', 'edit', 'in_progress', {
        tool: {
          id: 'e1',
          name: 'Edit',
          kind: 'edit',
          status: 'in_progress',
          detail: 'CHANGELOG.md',
        },
      })
    ),
    on(
      'b',
      toolEv(7000, 'tool.end', 'edit', 'completed', {
        tool: { id: 'e1', name: 'Edit', kind: 'edit', status: 'completed', detail: 'CHANGELOG.md' },
      })
    ),
    on('b', ev(7800, 'turn.stop', { meta: { text: 'notes drafted' } })),

    on('c', ev(5000, 'turn.user')),
    on('c', ev(6500, 'approval.request')),
    on('c', ev(13_000, 'approval.denied')),
    on('c', ev(13_500, 'turn.stop', { meta: { text: 'ok, skipping that' } })),

    on('a', ev(14_000, 'worker.stop', { worker: 'a2' })),
    on(
      'a',
      toolEv(15_000, 'tool.start', 'execute', 'in_progress', {
        tool: {
          id: 'x2',
          name: 'Bash',
          kind: 'execute',
          status: 'in_progress',
          detail: 'yarn test',
        },
      })
    ),
    on(
      'a',
      toolEv(18_000, 'tool.end', 'execute', 'completed', {
        tool: { id: 'x2', name: 'Bash', kind: 'execute', status: 'completed', detail: 'yarn test' },
      })
    ),
    on('a', ev(19_000, 'turn.stop', { meta: { text: 'green' } })),
  ];
  events.sort((x, y) => x.event.ts - y.event.ts);
  return { events, watch: LEAD_WORKER, watchBus: 'a', durationMs: 26_000 };
}

/**
 * One run of a lead worker, a couple of subagents, and every event kind the
 * vocabulary has — taking a request, delegating it, hitting a failure,
 * waiting on approval, compacting, and signing off.
 *
 * This is the story to open when showing someone what the office *is*, so it
 * is written for narrative rather than coverage: the beats are spaced so the
 * walks between stations read, and the failure lands after enough calm that
 * the slump registers. It still touches all 15 kinds, and `EVENT_KINDS` is
 * asserted against it so a new kind cannot be added without appearing here.
 */
export function showcaseScenario(): Scenario {
  /** A tool call and its result, with an id unique to the call. */
  const work = (
    at: number,
    ms: number,
    kind: ToolKind,
    detail: string,
    over: { worker?: string; status?: ToolStatus } = {}
  ): TimedEvent[] => {
    const worker = over.worker ?? LEAD_WORKER;
    const tool = { id: `${worker}-${at}`, name: kind, kind, detail };
    return [
      ev(at, 'tool.start', { worker, tool: { ...tool, status: 'in_progress' } }),
      ev(at + ms, 'tool.end', { worker, tool: { ...tool, status: over.status ?? 'completed' } }),
    ];
  };

  const events: TimedEvent[] = [
    ev(0, 'session.start'),
    ev(600, 'turn.user'),
    ev(1200, 'task.created', { meta: { taskId: '1', subject: 'Fix the flaky test' } }),

    // The lead orients itself before handing anything out.
    ...work(1600, 2400, 'read', 'src/director.ts'),
    ...work(4600, 2400, 'search', 'stationForTool'),

    // Two subagents arrive and get on with their own work.
    ev(7400, 'worker.start', { worker: 'a1', workerType: 'Explore' }),
    ev(8000, 'task.created', { meta: { taskId: '2', subject: 'Add a regression test' } }),
    ...work(8800, 3000, 'read', 'packages/core', { worker: 'a1' }),
    ev(12200, 'worker.start', { worker: 'a2', workerType: 'code-reviewer' }),
    ...work(12600, 2600, 'search', 'walk targets', { worker: 'a1' }),
    ...work(13400, 3000, 'read', 'renderer.ts', { worker: 'a2' }),
    ...work(15600, 2800, 'think', 'plan the fix'),

    // Your turn: someone stands at your desk and waits.
    ev(19000, 'approval.request'),
    ev(22500, 'approval.denied'),

    // The edit lands, the tests do not, and then they do.
    ...work(23500, 3000, 'edit', 'renderer.ts'),
    ...work(27000, 2800, 'execute', 'yarn test', { status: 'failed' }),
    ...work(30600, 3400, 'execute', 'yarn test'),
    ev(34600, 'task.completed', { meta: { taskId: '1' } }),

    ev(35400, 'worker.stop', { worker: 'a1' }),
    ev(36400, 'notify', { meta: { message: 'needs your attention' } }),

    // The room thins out while context is packed down.
    ev(38200, 'context.compact'),
    ev(42000, 'context.compacted'),
    ...work(43000, 2600, 'fetch', 'pixijs.com/docs'),
    ev(46200, 'worker.stop', { worker: 'a2' }),
    ev(47000, 'task.completed', { meta: { taskId: '2' } }),
    ev(48000, 'turn.stop'),
    ev(52000, 'session.end'),
  ];

  // Authoring order is not chronological: `work` emits a call's start and end
  // together, so an overlapping call's start lands after the earlier call's
  // end. The harness feeds strictly by index and stops at the first event in
  // the future, which would hold those starts back until the earlier end came
  // due. Sorting is stable, so ties keep the order written above — a
  // `worker.start` still precedes the work that worker does.
  events.sort((a, b) => a.event.ts - b.event.ts);
  return { events, watch: LEAD_WORKER, durationMs: 58_000 };
}
