import { RawRecord } from '../bus';
import { CubicleEvent, LEAD_WORKER, ToolKind, ToolStatus } from '../events';

/**
 * Claude Code source adapter: raw bus records to normalized events.
 *
 * This is the only file in the pipeline that knows Claude Code exists.
 * A second harness is a sibling module, not a change here.
 */

const TOOL_KINDS_BY_NAME: Record<string, ToolKind> = {
  Read: 'read',
  Glob: 'search',
  Grep: 'search',
  Edit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'execute',
  WebFetch: 'fetch',
  WebSearch: 'fetch',
  // Delegation and planning all read as "thinking at the whiteboard". The
  // interesting beat for a subagent is worker.start, not the tool call itself.
  Agent: 'think',
  Task: 'think',
  Workflow: 'think',
  Skill: 'think',
  TodoWrite: 'think',
  ExitPlanMode: 'think',
};

const MCP_PREFIX = 'mcp__';

export function toolKindFor(name: string | undefined): ToolKind {
  if (!name) {
    return 'other';
  }
  return TOOL_KINDS_BY_NAME[name] ?? 'other';
}

export function isMcpTool(name: string | undefined): boolean {
  return typeof name === 'string' && name.startsWith(MCP_PREFIX);
}

/**
 * Reading memory or project instructions gets its own animation — the worker
 * goes to the ledger rather than the general archive.
 */
export function isMemoryPath(path: string | undefined): boolean {
  if (!path) {
    return false;
  }
  if (path.includes('/memory/')) {
    return true;
  }
  const file = path.split('/').pop() ?? '';
  return file === 'CLAUDE.md' || file === 'AGENTS.md';
}

const TOOL_STATUS_BY_EVENT: Record<string, ToolStatus> = {
  PreToolUse: 'in_progress',
  PostToolUse: 'completed',
  PostToolUseFailure: 'failed',
};

function toolMeta(record: RawRecord): CubicleEvent['meta'] {
  const meta: Record<string, string | number | boolean> = {};
  if (isMcpTool(record.tool)) {
    meta.mcp = true;
  }
  if (isMemoryPath(record.path)) {
    meta.memory = true;
  }
  if (typeof record.ms === 'number') {
    meta.durationMs = record.ms;
  }
  if (record.spawn) {
    meta.spawns = record.spawn;
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function withMeta(
  event: CubicleEvent,
  meta: Record<string, string | number | boolean>
): CubicleEvent {
  const entries = Object.entries(meta).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return event;
  }
  return { ...event, meta: { ...event.meta, ...Object.fromEntries(entries) } };
}

/**
 * Returns null for records we deliberately do not animate, so that hooking a
 * new event is a one-line change here rather than a schema migration.
 */
export function normalizeClaudeCode(record: RawRecord): CubicleEvent | null {
  // `atype` means "the agent this hook fired inside", so it only labels a desk
  // when `aid` identifies that desk. A SessionStart in an --agent session is the
  // one case where it legitimately types the lead.
  const typed = Boolean(record.aid) || record.ev === 'SessionStart';
  const base = {
    ts: record.ts,
    session: record.sid ?? 'unknown',
    turn: record.pid,
    worker: record.aid ?? LEAD_WORKER,
    workerType: typed ? record.atype : undefined,
  };

  switch (record.ev) {
    case 'SessionStart':
      return withMeta(
        { ...base, kind: 'session.start' },
        {
          source: record.src ?? '',
          model: record.model ?? '',
        }
      );

    case 'SessionEnd':
      return withMeta({ ...base, kind: 'session.end' }, { reason: record.src ?? '' });

    case 'UserPromptSubmit':
      return withMeta({ ...base, kind: 'turn.user' }, { text: record.msg ?? '' });

    case 'UserPromptExpansion':
      return withMeta(
        { ...base, kind: 'notify' },
        {
          channel: 'command',
          text: record.msg ?? '',
        }
      );

    case 'Stop':
      return withMeta({ ...base, kind: 'turn.stop' }, { text: record.msg ?? '' });

    case 'StopFailure':
      return withMeta({ ...base, kind: 'turn.stop' }, { error: record.msg ?? '' });

    case 'SubagentStart':
      return { ...base, kind: 'worker.start' };

    case 'SubagentStop':
      return withMeta({ ...base, kind: 'worker.stop' }, { text: record.msg ?? '' });

    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure': {
      const status = TOOL_STATUS_BY_EVENT[record.ev];
      const event: CubicleEvent = {
        ...base,
        kind: record.ev === 'PreToolUse' ? 'tool.start' : 'tool.end',
        tool: {
          name: record.tool ?? 'unknown',
          kind: toolKindFor(record.tool),
          status,
          detail: record.detail,
        },
      };
      const meta = toolMeta(record);
      return meta ? { ...event, meta } : event;
    }

    case 'PermissionRequest':
      return withMeta({ ...base, kind: 'approval.request' }, { tool: record.detail ?? '' });

    case 'PermissionDenied':
      return withMeta({ ...base, kind: 'approval.denied' }, { tool: record.detail ?? '' });

    case 'PreCompact':
      return withMeta({ ...base, kind: 'context.compact' }, { trigger: record.src ?? '' });

    case 'PostCompact':
      return { ...base, kind: 'context.compacted' };

    case 'TaskCreated':
      return withMeta(
        { ...base, kind: 'task.created' },
        {
          taskId: record.task ?? '',
          subject: record.subject ?? '',
        }
      );

    case 'TaskCompleted':
      return withMeta(
        { ...base, kind: 'task.completed' },
        {
          taskId: record.task ?? '',
          subject: record.subject ?? '',
        }
      );

    case 'Notification':
      return withMeta(
        { ...base, kind: 'notify' },
        {
          channel: record.src ?? '',
          text: record.msg ?? '',
        }
      );

    default:
      return null;
  }
}

export function normalizeAllClaudeCode(records: RawRecord[]): CubicleEvent[] {
  const out: CubicleEvent[] = [];
  for (const record of records) {
    const event = normalizeClaudeCode(record);
    if (event) {
      out.push(event);
    }
  }
  return out;
}
