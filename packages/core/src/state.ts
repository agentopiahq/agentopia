import { CubicleEvent, LEAD_WORKER, TOOL_KINDS, ToolKind, ToolRef } from './events';

/**
 * What the office looks like right now.
 *
 * This is a pure projection of the event stream: no timing, no animation, no
 * walk paths. The director turns this plus a clock into actor beats; the
 * renderer never sees events at all.
 */

export type OfficePhase =
  'empty' | 'working' | 'waiting_on_user' | 'awaiting_approval' | 'compacting' | 'closed';

export interface Worker {
  id: string;
  type?: string;
  joinedAt: number;
  /** The tool call in flight, if any. */
  tool?: ToolRef;
  toolCount: number;
  failures: number;
}

export interface Task {
  id: string;
  subject: string;
  done: boolean;
}

/**
 * Session-long tallies. These drive set dressing: paper stacks grow with
 * reads, the whiteboard fills with tasks, pizza boxes accumulate with time.
 */
export interface OfficeCounters {
  byKind: Record<ToolKind, number>;
  turns: number;
  failures: number;
  compactions: number;
  approvals: number;
}

export interface OfficeState {
  session?: string;
  startedAt?: number;
  lastEventAt?: number;
  phase: OfficePhase;
  workers: Record<string, Worker>;
  tasks: Task[];
  counters: OfficeCounters;
}

function emptyCounters(): OfficeCounters {
  const byKind = {} as Record<ToolKind, number>;
  for (const kind of TOOL_KINDS) {
    byKind[kind] = 0;
  }
  return { byKind, turns: 0, failures: 0, compactions: 0, approvals: 0 };
}

export function emptyOffice(): OfficeState {
  return {
    phase: 'empty',
    workers: {},
    tasks: [],
    counters: emptyCounters(),
  };
}

function withWorker(state: OfficeState, event: CubicleEvent): Record<string, Worker> {
  const existing = state.workers[event.worker];
  if (existing) {
    return {
      ...state.workers,
      [event.worker]: { ...existing, type: event.workerType ?? existing.type },
    };
  }
  return {
    ...state.workers,
    [event.worker]: {
      id: event.worker,
      type: event.workerType,
      joinedAt: event.ts,
      toolCount: 0,
      failures: 0,
    },
  };
}

function withoutWorker(state: OfficeState, id: string): Record<string, Worker> {
  if (id === LEAD_WORKER) {
    return state.workers;
  }
  const next = { ...state.workers };
  delete next[id];
  return next;
}

function patchWorker(
  workers: Record<string, Worker>,
  id: string,
  patch: (worker: Worker) => Worker
): Record<string, Worker> {
  const worker = workers[id];
  if (!worker) {
    return workers;
  }
  return { ...workers, [id]: patch(worker) };
}

/**
 * The reducer. Pure, total, and tolerant of a missing event — hooks can be
 * dropped, and the office should degrade rather than throw.
 */
export function reduce(state: OfficeState, event: CubicleEvent): OfficeState {
  const base: OfficeState = { ...state, lastEventAt: event.ts };

  switch (event.kind) {
    case 'session.start': {
      const fresh = emptyOffice();
      return {
        ...fresh,
        session: event.session,
        startedAt: event.ts,
        lastEventAt: event.ts,
        phase: 'working',
        workers: {
          [LEAD_WORKER]: {
            id: LEAD_WORKER,
            type: event.workerType,
            joinedAt: event.ts,
            toolCount: 0,
            failures: 0,
          },
        },
      };
    }

    case 'session.end':
      return { ...base, phase: 'closed' };

    case 'turn.user':
      return { ...base, phase: 'working', workers: withWorker(base, event) };

    case 'turn.stop':
      return {
        ...base,
        phase: 'waiting_on_user',
        counters: { ...base.counters, turns: base.counters.turns + 1 },
      };

    case 'worker.start':
      return { ...base, phase: 'working', workers: withWorker(base, event) };

    case 'worker.stop':
      return { ...base, workers: withoutWorker(base, event.worker) };

    case 'tool.start': {
      const workers = withWorker(base, event);
      return {
        ...base,
        phase: 'working',
        workers: patchWorker(workers, event.worker, (worker) => ({ ...worker, tool: event.tool })),
      };
    }

    case 'tool.end': {
      const workers = withWorker(base, event);
      const failed = event.tool?.status === 'failed';
      const kind = event.tool?.kind;
      return {
        ...base,
        workers: patchWorker(workers, event.worker, (worker) => ({
          ...worker,
          tool: undefined,
          toolCount: worker.toolCount + 1,
          failures: worker.failures + (failed ? 1 : 0),
        })),
        counters: {
          ...base.counters,
          byKind: kind
            ? { ...base.counters.byKind, [kind]: base.counters.byKind[kind] + 1 }
            : base.counters.byKind,
          failures: base.counters.failures + (failed ? 1 : 0),
        },
      };
    }

    case 'approval.request':
      return {
        ...base,
        phase: 'awaiting_approval',
        counters: { ...base.counters, approvals: base.counters.approvals + 1 },
      };

    case 'approval.denied':
      return { ...base, phase: 'working' };

    case 'context.compact':
      return {
        ...base,
        phase: 'compacting',
        counters: { ...base.counters, compactions: base.counters.compactions + 1 },
      };

    case 'task.created': {
      const id = String(event.meta?.taskId ?? event.tool?.detail ?? base.tasks.length);
      if (base.tasks.some((task) => task.id === id)) {
        return base;
      }
      const subject = String(event.meta?.subject ?? event.tool?.detail ?? '');
      return { ...base, tasks: [...base.tasks, { id, subject, done: false }] };
    }

    case 'task.completed': {
      const id = String(event.meta?.taskId ?? '');
      return {
        ...base,
        tasks: base.tasks.map((task) => (task.id === id ? { ...task, done: true } : task)),
      };
    }

    case 'notify':
      return base;

    default:
      return base;
  }
}

export function reduceAll(events: CubicleEvent[], initial = emptyOffice()): OfficeState {
  return events.reduce(reduce, initial);
}
