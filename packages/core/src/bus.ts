/**
 * The wire format between the hook emitter and the viewer.
 *
 * This is a *data* contract, not a code dependency: `plugins/<harness>/hooks/emit.mjs`
 * writes these records and imports nothing, because it has to run from a bare
 * directory with no node_modules. Keep the two in sync by hand, and keep the
 * shape flat and small — records are capped at 1200 bytes so that concurrent
 * appends from parallel hooks stay atomic.
 *
 * A bus file holds two kinds of line. The first is a header written by the CLI
 * before the agent starts; the rest are hook records. The `cubicle.` prefix is
 * reserved for lines cubicle writes about itself, so it can never collide with
 * a harness event name.
 */

export const CUBICLE_HEADER_EV = 'cubicle.session';

/**
 * The first line of every bus file: what the CLI knew before the agent started.
 *
 * This replaces a sidecar meta.json. One file per session means one source of
 * truth, and a recording stays self-describing when it is copied or shared.
 */
export interface SessionHeader {
  ts: number;
  ev: typeof CUBICLE_HEADER_EV;
  harness: string;
  cwd: string;
  argv: string[];
  version: string;
}

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

export type BusRecord = RawRecord | SessionHeader;

export function isSessionHeader(record: BusRecord): record is SessionHeader {
  return record.ev === CUBICLE_HEADER_EV;
}

/**
 * Parse one bus line. Returns null rather than throwing: a truncated final
 * line is normal when tailing a file that is being appended to.
 */
export function parseRecord(line: string): BusRecord | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as BusRecord;
    if (typeof record.ts !== 'number' || typeof record.ev !== 'string') {
      return null;
    }
    if (isSessionHeader(record) && typeof record.harness !== 'string') {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function parseRecords(text: string): BusRecord[] {
  const out: BusRecord[] = [];
  for (const line of text.split('\n')) {
    const record = parseRecord(line);
    if (record) {
      out.push(record);
    }
  }
  return out;
}

/**
 * The harness session ids seen in a bus, in first-appearance order.
 *
 * There can be more than one: `/clear` starts a fresh harness session inside the
 * same wrapper run. The reverse also happens — `claude -c` resumes one harness
 * session across two separate cubicle sessions — so the relationship is N:M and
 * neither id can stand in for the other.
 */
export function harnessSessionIds(records: BusRecord[]): string[] {
  const seen: string[] = [];
  for (const record of records) {
    if (isSessionHeader(record)) {
      continue;
    }
    if (record.sid && !seen.includes(record.sid)) {
      seen.push(record.sid);
    }
  }
  return seen;
}
