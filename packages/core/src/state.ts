import { AgentopiaEvent, LEAD_WORKER, TOOL_KINDS, ToolKind, ToolRef } from './events';
import { isPlaceholderName, promptName } from './sessionNames';

/**
 * What the office looks like right now.
 *
 * The office holds one `SessionState` per live session — one per bus file,
 * which is one agent process, which is one lead at one desk. Each is a pure
 * projection of that session's event stream: no timing, no animation, no walk
 * paths. The director turns the office plus a clock into actor beats; the
 * renderer never sees events at all.
 */

export type SessionPhase =
  'empty' | 'working' | 'waiting_on_user' | 'awaiting_approval' | 'compacting' | 'closed';

export interface Worker {
  id: string;
  type?: string;
  joinedAt: number;
  /**
   * Tool calls in flight, keyed by `toolSlot`.
   *
   * A map rather than a single value because one worker really can have several
   * calls running at once — a parallel batch of reads is the common case. A
   * single slot would make the worker look like it teleports between spots.
   */
  tools: Record<string, ToolRef>;
  toolCount: number;
  failures: number;
}

/**
 * The key a tool call occupies while in flight.
 *
 * Prefers the harness's tool_use_id. Without one, falls back to the tool name,
 * which collapses concurrent calls of the same tool into one slot — wrong, but
 * bounded, and the same behaviour as before ids were recorded.
 */
export function toolSlot(tool: ToolRef): string {
  return tool.id ?? tool.name;
}

/** Every tool call this worker currently has running. */
export function inFlight(worker: Worker): ToolRef[] {
  return Object.values(worker.tools);
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
export interface SessionCounters {
  byKind: Record<ToolKind, number>;
  turns: number;
  failures: number;
  compactions: number;
  approvals: number;
}

export interface SessionState {
  session?: string;
  /**
   * The harness's own name for the session. The emitter samples it onto
   * turn-level records, so it arrives with catch-up, follows a rename, and
   * travels with a copied recording. The latest sample wins; a placeholder
   * (see `isPlaceholderName`) is no sample.
   */
  name?: string;
  /**
   * The first thing asked, cut down to a few words: what the desk is called
   * until the harness names the session (see `deskName`).
   */
  prompt?: string;
  startedAt?: number;
  lastEventAt?: number;
  phase: SessionPhase;
  workers: Record<string, Worker>;
  tasks: Task[];
  counters: SessionCounters;
}

/** Every live session, keyed by bus. */
export interface OfficeState {
  sessions: Record<string, SessionState>;
}

function emptyCounters(): SessionCounters {
  const byKind = {} as Record<ToolKind, number>;
  for (const kind of TOOL_KINDS) {
    byKind[kind] = 0;
  }
  return { byKind, turns: 0, failures: 0, compactions: 0, approvals: 0 };
}

export function emptySession(): SessionState {
  return {
    phase: 'empty',
    workers: {},
    tasks: [],
    counters: emptyCounters(),
  };
}

export function emptyOffice(): OfficeState {
  return { sessions: {} };
}

/** Subagents currently on the books for a session. The lead is not one. */
export function subagentCount(state: SessionState): number {
  return Object.keys(state.workers).filter((id) => id !== LEAD_WORKER).length;
}

function withWorker(state: SessionState, event: AgentopiaEvent): Record<string, Worker> {
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
      tools: {},
      toolCount: 0,
      failures: 0,
    },
  };
}

function withoutWorker(state: SessionState, id: string): Record<string, Worker> {
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

function nameFrom(event: AgentopiaEvent): string | undefined {
  const name = event.meta?.sessionName;
  return typeof name === 'string' && !isPlaceholderName(name) ? name : undefined;
}

/** What a session's desk is called: its own name, else its first prompt. */
export function deskName(state: SessionState): string | undefined {
  return state.name ?? state.prompt;
}

/**
 * The per-session reducer. Pure, total, and tolerant of a missing event —
 * hooks can be dropped, and the office should degrade rather than throw.
 */
export function reduce(state: SessionState, event: AgentopiaEvent): SessionState {
  const base: SessionState = {
    ...state,
    lastEventAt: event.ts,
    name: nameFrom(event) ?? state.name,
  };

  switch (event.kind) {
    case 'session.start': {
      // Compaction fires a SessionStart with source "compact" mid-session. That
      // is bookkeeping, not a new office: wiping here would destroy the
      // accreted set dressing every time a long session compacts. Resume
      // ("resume") opens a new bus file anyway, and clear ("clear") is a
      // deliberate fresh start — both of those do reset.
      if (event.meta?.source === 'compact') {
        return { ...base, phase: 'working' };
      }
      const fresh = emptySession();
      return {
        ...fresh,
        session: event.session,
        name: nameFrom(event),
        startedAt: event.ts,
        lastEventAt: event.ts,
        phase: 'working',
        workers: {
          [LEAD_WORKER]: {
            id: LEAD_WORKER,
            type: event.workerType,
            joinedAt: event.ts,
            tools: {},
            toolCount: 0,
            failures: 0,
          },
        },
      };
    }

    case 'session.end':
      return { ...base, phase: 'closed' };

    case 'turn.user':
      return {
        ...base,
        phase: 'working',
        prompt: base.prompt ?? promptName(event.meta?.text),
        workers: withWorker(base, event),
      };

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
      const tool = event.tool;
      if (!tool) {
        return { ...base, phase: 'working', workers };
      }
      return {
        ...base,
        phase: 'working',
        workers: patchWorker(workers, event.worker, (worker) => ({
          ...worker,
          tools: { ...worker.tools, [toolSlot(tool)]: tool },
        })),
      };
    }

    case 'tool.end': {
      const workers = withWorker(base, event);
      const failed = event.tool?.status === 'failed';
      const kind = event.tool?.kind;
      return {
        ...base,
        workers: patchWorker(workers, event.worker, (worker) => {
          const tools = { ...worker.tools };
          if (event.tool) {
            delete tools[toolSlot(event.tool)];
          }
          return {
            ...worker,
            tools,
            toolCount: worker.toolCount + 1,
            failures: worker.failures + (failed ? 1 : 0),
          };
        }),
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

    case 'context.compacted':
      return { ...base, phase: 'working' };

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

export function reduceAll(events: AgentopiaEvent[], initial = emptySession()): SessionState {
  return events.reduce(reduce, initial);
}

/**
 * Fold one bus's event into the office. Sessions never touch each other: a
 * `session.start` wipes its own session and nobody else's.
 */
export function reduceOffice(office: OfficeState, bus: string, event: AgentopiaEvent): OfficeState {
  const current = office.sessions[bus] ?? emptySession();
  return { sessions: { ...office.sessions, [bus]: reduce(current, event) } };
}
