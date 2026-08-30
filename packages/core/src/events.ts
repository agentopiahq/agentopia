/**
 * The normalized event vocabulary every harness adapter produces.
 *
 * Tool kinds and statuses are taken from the Agent Client Protocol
 * (https://agentclientprotocol.com) rather than invented here, so that an
 * ACP-speaking agent can become a source adapter with almost no translation,
 * and so that station mapping has a stable vocabulary to key off.
 */

export const TOOL_KINDS = [
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'other',
] as const;

export type ToolKind = (typeof TOOL_KINDS)[number];

export const TOOL_STATUSES = ['pending', 'in_progress', 'completed', 'failed'] as const;

export type ToolStatus = (typeof TOOL_STATUSES)[number];

export const EVENT_KINDS = [
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
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

/** The main thread's worker id. Subagents use their harness-provided agent id. */
export const LEAD_WORKER = 'lead';

export interface ToolRef {
  name: string;
  kind: ToolKind;
  status: ToolStatus;
  /** Short human-readable label, already truncated by the adapter. */
  detail?: string;
}

export interface CubicleEvent {
  /** Emitter wall clock, milliseconds since epoch. */
  ts: number;
  kind: EventKind;
  session: string;
  /** Claude Code `prompt_id` / Codex `turn_id`. Groups events by user turn. */
  turn?: string;
  /** Which desk this belongs to. `LEAD_WORKER` for the main thread. */
  worker: string;
  /** Agent type, used for the nameplate and the persistent prop. */
  workerType?: string;
  tool?: ToolRef;
  meta?: Record<string, string | number | boolean>;
}

export function isToolKind(value: string): value is ToolKind {
  return (TOOL_KINDS as readonly string[]).includes(value);
}

export function isEventKind(value: string): value is EventKind {
  return (EVENT_KINDS as readonly string[]).includes(value);
}
