import { normalizeClaudeCode, toolKindFor } from '../adapters/claude';
import { RawRecord } from '../bus';
import { EventKind, LEAD_WORKER, ToolKind, ToolStatus } from '../events';

function raw(over: Partial<RawRecord> & { ev: string }): RawRecord {
  return { ts: 1000, sid: 's1', ...over };
}

describe('toolKindFor', () => {
  it.each<[string, ToolKind]>([
    ['Read', 'read'],
    ['Glob', 'search'],
    ['Grep', 'search'],
    ['Edit', 'edit'],
    ['Write', 'edit'],
    ['NotebookEdit', 'edit'],
    ['Bash', 'execute'],
    ['WebFetch', 'fetch'],
    ['WebSearch', 'fetch'],
    ['Agent', 'think'],
    ['TodoWrite', 'think'],
    ['mcp__linear__list_issues', 'other'],
    ['SomethingBrandNew', 'other'],
  ])('maps %s to %s', (name, kind) => {
    expect(toolKindFor(name)).toBe(kind);
  });

  it('falls back to other for a missing name', () => {
    expect(toolKindFor(undefined)).toBe('other');
  });
});

describe('normalizeClaudeCode', () => {
  it.each<[string, EventKind]>([
    ['SessionStart', 'session.start'],
    ['SessionEnd', 'session.end'],
    ['UserPromptSubmit', 'turn.user'],
    ['Stop', 'turn.stop'],
    ['StopFailure', 'turn.stop'],
    ['SubagentStart', 'worker.start'],
    ['SubagentStop', 'worker.stop'],
    ['PermissionRequest', 'approval.request'],
    ['PermissionDenied', 'approval.denied'],
    ['PreCompact', 'context.compact'],
    ['PostCompact', 'context.compacted'],
    ['TaskCreated', 'task.created'],
    ['TaskCompleted', 'task.completed'],
    ['Notification', 'notify'],
    ['UserPromptExpansion', 'notify'],
  ])('maps %s to %s', (ev, kind) => {
    expect(normalizeClaudeCode(raw({ ev }))?.kind).toBe(kind);
  });

  it.each<[string, EventKind, ToolStatus]>([
    ['PreToolUse', 'tool.start', 'in_progress'],
    ['PostToolUse', 'tool.end', 'completed'],
    ['PostToolUseFailure', 'tool.end', 'failed'],
  ])('maps %s to %s with status %s', (ev, kind, status) => {
    const event = normalizeClaudeCode(raw({ ev, tool: 'Read', detail: 'a/b.ts' }));

    expect(event?.kind).toBe(kind);
    expect(event?.tool).toMatchObject({ name: 'Read', kind: 'read', status, detail: 'a/b.ts' });
  });

  it('drops events it does not animate', () => {
    expect(normalizeClaudeCode(raw({ ev: 'ConfigChange' }))).toBeNull();
  });

  it('attributes main-thread work to the lead', () => {
    expect(normalizeClaudeCode(raw({ ev: 'PreToolUse', tool: 'Bash' }))?.worker).toBe(LEAD_WORKER);
  });

  it('attributes in-subagent work to that subagent desk', () => {
    const event = normalizeClaudeCode(
      raw({ ev: 'PreToolUse', tool: 'Bash', aid: 'ag1', atype: 'code-review' })
    );

    expect(event).toMatchObject({ worker: 'ag1', workerType: 'code-review' });
  });

  it('keeps a delegating Agent call on the delegator desk, not the spawned one', () => {
    // Regression: the emitter used to write subagent_type into `atype`, which
    // made the lead's own Agent call look like it came from the new subagent.
    const event = normalizeClaudeCode(
      raw({ ev: 'PreToolUse', tool: 'Agent', spawn: 'Explore', detail: 'find files' })
    );

    expect(event?.worker).toBe(LEAD_WORKER);
    expect(event?.workerType).toBeUndefined();
    expect(event?.meta?.spawns).toBe('Explore');
  });

  it('ignores an agent type that arrives without an agent id', () => {
    const event = normalizeClaudeCode(raw({ ev: 'PreToolUse', tool: 'Bash', atype: 'Explore' }));

    expect(event?.worker).toBe(LEAD_WORKER);
    expect(event?.workerType).toBeUndefined();
  });

  it('types the lead from SessionStart in an --agent session', () => {
    const event = normalizeClaudeCode(raw({ ev: 'SessionStart', atype: 'reviewer' }));

    expect(event).toMatchObject({ worker: LEAD_WORKER, workerType: 'reviewer' });
  });

  it('carries session and turn correlation through', () => {
    const event = normalizeClaudeCode(raw({ ev: 'UserPromptSubmit', sid: 'sX', pid: 'pY' }));

    expect(event).toMatchObject({ session: 'sX', turn: 'pY' });
  });

  it.each([
    ['/home/me/.claude/memory/notes.md', true],
    ['/repo/CLAUDE.md', true],
    ['/repo/AGENTS.md', true],
    ['/repo/src/index.ts', false],
  ])('flags %s as memory=%s', (path, expected) => {
    const event = normalizeClaudeCode(raw({ ev: 'PreToolUse', tool: 'Read', path }));
    expect(Boolean(event?.meta?.memory)).toBe(expected);
  });

  it('flags MCP tool calls so they can go to the mail room', () => {
    const event = normalizeClaudeCode(raw({ ev: 'PreToolUse', tool: 'mcp__linear__list_issues' }));
    expect(event?.meta?.mcp).toBe(true);
  });

  it('carries the tool_use_id so start and end can be paired', () => {
    const event = normalizeClaudeCode(raw({ ev: 'PreToolUse', tool: 'Read', tuid: 'toolu_1' }));
    expect(event?.tool?.id).toBe('toolu_1');
  });

  it.each(['PermissionRequest', 'PermissionDenied'])(
    'says what a %s is about: the tool, its detail and its call, still pending',
    (ev) => {
      const event = normalizeClaudeCode(
        raw({ ev, tool: 'Bash', detail: 'yarn test', tuid: 'toolu_2' })
      );
      expect(event?.tool).toEqual({
        id: 'toolu_2',
        name: 'Bash',
        kind: 'execute',
        status: 'pending',
        detail: 'yarn test',
      });
    }
  );

  it('carries the record id for durable identity', () => {
    const event = normalizeClaudeCode(raw({ ev: 'PreToolUse', tool: 'Read', rid: 'r1' }));
    expect(event?.meta?.rid).toBe('r1');
  });

  it('carries tool duration through as metadata', () => {
    const event = normalizeClaudeCode(raw({ ev: 'PostToolUse', tool: 'Bash', ms: 1234 }));
    expect(event?.meta?.durationMs).toBe(1234);
  });

  it.each(['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd'])(
    'carries the sampled session name on %s',
    (ev) => {
      const event = normalizeClaudeCode(raw({ ev, name: 'Fix the flaky tests' }));
      expect(event?.meta?.sessionName).toBe('Fix the flaky tests');
    }
  );

  it('omits sessionName when the record carries no sample', () => {
    const event = normalizeClaudeCode(raw({ ev: 'Stop' }));
    expect(event?.meta?.sessionName).toBeUndefined();
  });
});
