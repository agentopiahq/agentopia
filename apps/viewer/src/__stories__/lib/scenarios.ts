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
  // A long human pause first, so the recall has somewhere to walk back from
  // (the lead has wandered to the coffee machine by the time the prompt lands).
  return {
    events: [ev(0, 'session.start'), ev(300, 'turn.stop'), ev(26_000, 'turn.user')],
    watch: LEAD_WORKER,
    durationMs: 32_000,
    speed: 4,
    phaseStartMs: 26_000,
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
