/**
 * The wire format between the hook emitter and the viewer.
 *
 * This is a *data* contract, not a code dependency: `plugin/hooks/emit.mjs`
 * writes these records and imports nothing, because it has to run from a bare
 * directory with no node_modules. Keep the two in sync by hand, and keep the
 * shape flat and small — records are capped at 1200 bytes so that concurrent
 * appends from parallel hooks stay atomic.
 */

export interface RawRecord {
  /** Emitter wall clock, milliseconds since epoch. */
  ts: number;
  /** The harness's own event name, e.g. `PreToolUse`. */
  ev: string;
  /** session_id */
  sid?: string;
  /** prompt_id (Claude Code) or turn_id (Codex). */
  pid?: string;
  /** agent_id — present only when the hook fired inside a subagent. */
  aid?: string;
  /** agent_type */
  atype?: string;
  /** permission_mode */
  mode?: string;
  /** tool_name */
  tool?: string;
  /** Short label derived from tool_input. */
  detail?: string;
  /** Absolute file path, for file tools. */
  path?: string;
  /** For delegation tools: the agent type being spawned. Not the same as `atype`. */
  spawn?: string;
  /** PostToolUse true, PostToolUseFailure false. */
  ok?: boolean;
  /** duration_ms */
  ms?: number;
  /** SessionStart source, SessionEnd reason, compact trigger, notification type. */
  src?: string;
  /** Prompt text, notification message, or last assistant message. */
  msg?: string;
  model?: string;
  task?: string;
  subject?: string;
  /** Set when the record was too long and detail fields were dropped. */
  trunc?: boolean;
}

/**
 * Parse one bus line. Returns null rather than throwing: a truncated final
 * line is normal when tailing a file that is being appended to.
 */
export function parseRecord(line: string): RawRecord | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as RawRecord;
    if (typeof record.ts !== 'number' || typeof record.ev !== 'string') {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function parseRecords(text: string): RawRecord[] {
  const out: RawRecord[] = [];
  for (const line of text.split('\n')) {
    const record = parseRecord(line);
    if (record) {
      out.push(record);
    }
  }
  return out;
}
