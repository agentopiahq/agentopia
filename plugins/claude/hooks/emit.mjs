#!/usr/bin/env node
/**
 * agentopia hook emitter.
 *
 * Runs once per agent lifecycle event. Reads the hook payload on stdin,
 * distills it to a small flat record, and appends one JSON line to the event
 * bus. It prints nothing and always exits 0, so it can never block or perturb
 * the session it is observing.
 *
 * Three rules govern this file, all of them load-bearing:
 *
 *   1. No imports beyond node builtins. Agents load this plugin by pointing at
 *      a directory on disk — there is no install step and no node_modules.
 *   2. No interpretation. It extracts facts; the viewer decides what they mean.
 *      That keeps the harness-specific mapping in one place (packages/core)
 *      instead of smeared across a file that runs in the hot path.
 *   3. No network, ever. This runs in the agent's critical path.
 *
 * Its entire cost is process startup, roughly 20ms. Keep it that way.
 */
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname } from 'node:path';

/**
 * Sanity backstop, not an atomicity requirement. Measured on this platform:
 * 8 concurrent appenders x 200 records showed zero torn lines even at 256KB
 * per record — O_APPEND writes to a local file land whole (and the reader
 * drops a torn line anyway). What actually keeps records small is the content
 * policy: clip() bounds every free-text field. This cap only guards against a
 * pathological payload producing an absurd record.
 */
const MAX_LINE = 65536;

/**
 * Which harness this plugin records, stamped on every record so a bus with no
 * header (hooks installed via settings) still says whose it is. Matches the
 * plugin's directory name and its id in the CLI's `HARNESSES`.
 */
const HARNESS = 'claude';

function readStdin() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  for (;;) {
    let n;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (err) {
      if (err.code === 'EAGAIN') {
        continue;
      }
      break;
    }
    if (n === 0) {
      break;
    }
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function clip(value, max) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const flat = value.replace(/\s+/g, ' ').trim();
  if (!flat) {
    return undefined;
  }
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** `a/b/c/file.ts` -> `c/file.ts`. Enough to recognize, short enough for a bubble. */
function shortPath(p) {
  if (typeof p !== 'string' || !p) {
    return undefined;
  }
  const dir = basename(dirname(p));
  const file = basename(p);
  return dir && dir !== '.' && dir !== '/' ? `${dir}/${file}` : file;
}

/** The one detail that best describes a tool call, per tool. */
function describeTool(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  const out = {};
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      out.path = clip(i.file_path, 200);
      out.detail = shortPath(i.file_path);
      break;
    case 'Glob':
    case 'Grep':
      out.detail = clip(i.pattern, 40);
      break;
    case 'Bash':
      out.detail = clip(i.command, 70);
      break;
    case 'Agent':
    case 'Task':
      out.detail = clip(i.description || i.prompt, 40);
      // The type being *spawned*, which is not the same thing as `atype` (the
      // agent this hook is running inside). Keeping them apart matters: the
      // Agent call itself belongs to the delegating worker's desk.
      out.spawn = clip(i.subagent_type, 40);
      break;
    case 'WebFetch':
      try {
        out.detail = new URL(i.url).host;
      } catch {
        out.detail = clip(i.url, 40);
      }
      break;
    case 'WebSearch':
      out.detail = clip(i.query, 40);
      break;
    case 'Skill':
      out.detail = clip(i.skill, 40);
      break;
    case 'Workflow':
      out.detail = clip(i.name || i.description, 40);
      break;
    case 'TodoWrite':
      out.detail = Array.isArray(i.todos) ? `${i.todos.length} todos` : undefined;
      break;
    default:
      out.detail = clip(i.description || i.query || i.pattern || i.prompt, 40);
  }
  return out;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function listDir(path) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

/** Where the desktop app keeps its sessions, one store per platform. */
function desktopStores(home) {
  return [
    `${home}/Library/Application Support/Claude/claude-code-sessions`,
    process.env.APPDATA ? `${process.env.APPDATA}/Claude/claude-code-sessions` : '',
    `${home}/.config/Claude/claude-code-sessions`,
  ].filter(Boolean);
}

/**
 * Titles the desktop app gives a session before it has a real one ("Local
 * session (from a project)"). They name no session, so they count as none.
 */
const PLACEHOLDER_TITLE =
  /^(?:untitled|new session|(?:local|remote|cloud) session(?: \([^)]*\))?)$/i;

/** A desktop session record's title, if it is the record for this session and a real one. */
function desktopTitle(path, sid) {
  const record = readJson(path);
  if (record && record.cliSessionId === sid && typeof record.title === 'string') {
    const title = clip(record.title, 120);
    return title && !PLACEHOLDER_TITLE.test(title) ? title : undefined;
  }
  return undefined;
}

/**
 * How much of the transcript's end to search for a `/rename`. Claude Code
 * writes the custom title again as the session goes on, so the latest one is
 * near the end; a bounded read keeps a long transcript from costing more.
 */
const TRANSCRIPT_TAIL = 512 * 1024;

/** The end of a file, as text, or nothing. */
function readTail(path, bytes) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Nothing to do.
      }
    }
  }
}

/** The name given with `/rename`: the transcript's latest `custom-title` line. */
function customTitle(transcript, sid) {
  if (typeof transcript !== 'string' || !transcript) {
    return undefined;
  }
  const text = readTail(transcript, TRANSCRIPT_TAIL);
  if (!text) {
    return undefined;
  }
  let at = text.lastIndexOf('"custom-title"');
  for (let tries = 0; at >= 0 && tries < 20; tries++) {
    const start = text.lastIndexOf('\n', at) + 1;
    const end = text.indexOf('\n', at);
    try {
      const record = JSON.parse(text.slice(start, end < 0 ? text.length : end));
      if (
        record &&
        record.type === 'custom-title' &&
        (!record.sessionId || record.sessionId === sid)
      ) {
        const title = clip(record.customTitle, 120);
        if (title) {
          return title;
        }
      }
    } catch {
      // A torn first line, or the words in some other line. Keep looking.
    }
    at = start > 0 ? text.lastIndexOf('"custom-title"', start - 1) : -1;
  }
  return undefined;
}

/**
 * Claude Code's own name for this session, so the bus stays self-describing
 * and nothing downstream has to read a second source. Best effort, in order:
 * the name given with `/rename` (the transcript's custom title), the desktop
 * app's session title (what the user sees, keyed by the `cliSessionId`
 * field — the file name is the store's own id), and a name the user gave the
 * live-session registry. The registry's own derived name ("agentopia-a9") and
 * the desktop app's placeholder title name nothing, so they count as no name;
 * with none, the office names the desk after the session's first prompt.
 *
 * The desktop app writes its title a moment after the first prompt. A live
 * desktop session's registry record names its desktop record
 * (`hostSessionId`), which makes the title a direct read: cheap enough to
 * sample on every finished tool call, so a long first turn picks the title up
 * as soon as it exists instead of waiting for the turn to end. Only the
 * turn-level samples (`full`) read the transcript for a rename, or scan the
 * whole desktop store for a session that has already left the registry.
 *
 * Returns the name and where it came from: `custom`, `desktop` or nothing.
 */
function sessionName(sid, home, full, transcript, renamed) {
  if (typeof sid !== 'string' || !sid || !home) {
    return { name: undefined, source: undefined };
  }
  if (full) {
    const custom = customTitle(transcript, sid);
    if (custom) {
      return { name: custom, source: 'custom' };
    }
  }
  // Renamed once, and the rename has scrolled out of the transcript's tail:
  // a rename is final, so nothing else may stand in for it.
  if (renamed) {
    return { name: undefined, source: undefined };
  }
  let live = null;
  const registry = `${home}/.claude/sessions`;
  for (const file of listDir(registry)) {
    if (file.endsWith('.json')) {
      const record = readJson(`${registry}/${file}`);
      if (record && record.sessionId === sid) {
        live = record;
        break;
      }
    }
  }
  const host =
    live &&
    typeof live.hostSessionId === 'string' &&
    /^local_[A-Za-z0-9-]+$/.test(live.hostSessionId)
      ? live.hostSessionId
      : undefined;
  if (host || full) {
    for (const root of desktopStores(home)) {
      for (const account of listDir(root)) {
        for (const org of listDir(`${root}/${account}`)) {
          const dir = `${root}/${account}/${org}`;
          const files = host ? [`${host}.json`] : listDir(dir);
          for (const file of files) {
            if (file.startsWith('local_') && file.endsWith('.json')) {
              const title = desktopTitle(`${dir}/${file}`, sid);
              if (title) {
                return { name: title, source: 'desktop' };
              }
            }
          }
        }
      }
    }
  }
  if (
    full &&
    live &&
    typeof live.name === 'string' &&
    typeof live.nameSource === 'string' &&
    live.nameSource !== 'derived'
  ) {
    return { name: clip(live.name, 120) || undefined, source: undefined };
  }
  return { name: undefined, source: undefined };
}

/** The turn-level events that carry a full session-name sample. */
const NAME_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd'];

/** Finished tool calls, which carry a cheap sample: a desktop title or nothing. */
const TOOL_NAME_EVENTS = ['PostToolUse', 'PostToolUseFailure'];

/**
 * Once the bus has the desktop title, a tool call re-checks it for a rename
 * at most this often. Until then, every finished tool call looks for it.
 */
const TITLE_RECHECK_MS = 5 * 60 * 1000;

/**
 * What this bus last recorded as its title: an empty marker beside it, its
 * mtime saying when, holding `custom` once the session has been renamed. The
 * emitter is a fresh process per hook, so this is the only memory it has
 * between calls. It is the emitter's own cache, not session metadata —
 * nothing downstream reads it, and a lost marker only costs a few extra reads.
 */
function titleMarker(bus) {
  return `${bus}.titled`;
}

/** When the title was last recorded, and whether it was a rename. */
function titleRecorded(bus) {
  try {
    const at = statSync(titleMarker(bus)).mtimeMs;
    return { at, renamed: readFileSync(titleMarker(bus), 'utf8') === 'custom' };
  } catch {
    return undefined;
  }
}

function markTitleRecorded(bus, source) {
  try {
    mkdirSync(dirname(bus), { recursive: true });
    writeFileSync(titleMarker(bus), source === 'custom' ? 'custom' : '');
  } catch {
    // Best effort; the next tool call just checks again.
  }
}

/** Elements holding what was asked, when a prompt arrives wrapped in markup. */
const SPOKEN = ['cited', 'message', 'note'];

/**
 * A prompt's readable text. Some hosts wrap the words in markup (the desktop
 * app's project threads relay `<relay ...><note>…</note></relay>`), and a clip
 * of the raw prompt would keep only the opening tag. Extraction, not
 * interpretation: the words are the prompt's own, minus reminders and, for a
 * prompt that opens with a tag, the markup. A plain prompt keeps its tags.
 */
function promptText(prompt) {
  if (typeof prompt !== 'string') {
    return undefined;
  }
  let text = prompt.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ');
  if (!/^\s*<[A-Za-z]/.test(text)) {
    return text;
  }
  for (const tag of SPOKEN) {
    const found = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(text);
    if (found && found[1].trim()) {
      text = found[1];
      break;
    }
  }
  return text.replace(/<\/?[A-Za-z][\w:-]*(?:\s[^<>]*)?\/?>/g, ' ');
}

/** Event-specific fields worth animating, kept tiny. */
function describeEvent(ev, p) {
  switch (ev) {
    case 'UserPromptSubmit':
      return { msg: clip(promptText(p.prompt), 80) };
    case 'UserPromptExpansion':
      return { msg: clip(`/${p.command_name} ${p.command_args || ''}`, 60) };
    case 'SessionStart':
      return { src: clip(p.source, 20), model: clip(p.model, 40) };
    case 'SessionEnd':
      return { src: clip(p.reason, 40) };
    case 'Notification':
      return { msg: clip(p.message, 80), src: clip(p.notification_type, 40) };
    case 'PreCompact':
    case 'PostCompact':
      return { src: clip(p.trigger, 20) };
    case 'Stop':
    case 'SubagentStop':
      return { msg: clip(p.last_assistant_message, 80) };
    case 'StopFailure':
      return { msg: clip(p.error, 80) };
    case 'TaskCreated':
    case 'TaskCompleted':
      return { task: clip(p.task_id, 40), subject: clip(p.task_subject, 60) };
    case 'PermissionRequest':
    case 'PermissionDenied':
      return { detail: clip(p.tool_name, 40) };
    default:
      return {};
  }
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch {
    return;
  }

  const home = process.env.HOME || process.env.USERPROFILE;

  // The wrapper names the bus explicitly. Without a wrapper — hooks installed
  // via settings, which is how the desktop app runs this — derive a bus per
  // harness session, so any session is recorded and `agentopia watch` finds it.
  let bus = process.env.AGENTOPIA_BUS;
  if (!bus) {
    const sid = payload.session_id;
    if (!home || typeof sid !== 'string' || !/^[A-Za-z0-9-]{4,64}$/.test(sid)) {
      return;
    }
    bus = `${home}/.agentopia/sessions/auto-${sid}/bus.jsonl`;
  }

  const ev = payload.hook_event_name || 'Unknown';
  const record = {
    ts: Date.now(),
    // Per-record identity. Concurrent hook processes cannot share a counter
    // without coordinating, and coordination in the agent's critical path is
    // forbidden — so identity is random rather than sequential. Ordering comes
    // from the file, never from this or from ts.
    rid: randomBytes(6).toString('base64url'),
    ev,
    h: HARNESS,
    sid: payload.session_id,
    // Claude Code calls it prompt_id, Codex calls it turn_id. Same idea.
    pid: payload.prompt_id || payload.turn_id,
    // Present only when the hook fires from inside a subagent.
    aid: payload.agent_id,
    atype: payload.agent_type,
    mode: payload.permission_mode,
    tool: payload.tool_name,
    // Pairs a tool.start with its tool.end. A worker can have several calls of
    // the same tool in flight at once, so name and detail cannot pair them.
    tuid: payload.tool_use_id,
    ...describeEvent(ev, payload),
  };

  const full = NAME_EVENTS.includes(ev);
  const recorded = full || TOOL_NAME_EVENTS.includes(ev) ? titleRecorded(bus) : undefined;
  if (
    full ||
    (TOOL_NAME_EVENTS.includes(ev) &&
      !(recorded && (recorded.renamed || record.ts - recorded.at < TITLE_RECHECK_MS)))
  ) {
    const { name, source } = sessionName(
      payload.session_id,
      home,
      full,
      payload.transcript_path,
      Boolean(recorded && recorded.renamed)
    );
    record.name = name;
    if (source) {
      markTitleRecorded(bus, source);
    }
  }

  if (payload.tool_name) {
    Object.assign(record, describeTool(payload.tool_name, payload.tool_input));
  }
  if (ev === 'PostToolUse') {
    record.ok = true;
    if (typeof payload.duration_ms === 'number') {
      record.ms = payload.duration_ms;
    }
  }
  if (ev === 'PostToolUseFailure') {
    record.ok = false;
  }

  for (const key of Object.keys(record)) {
    if (record[key] === undefined || record[key] === null) {
      delete record[key];
    }
  }

  let line = JSON.stringify(record);
  if (line.length > MAX_LINE) {
    delete record.detail;
    delete record.path;
    delete record.msg;
    record.trunc = true;
    line = JSON.stringify(record);
  }

  try {
    mkdirSync(dirname(bus), { recursive: true });
    appendFileSync(bus, `${line}\n`);
  } catch {
    // The office is cosmetic. Never surface an error into the session.
  }
}

try {
  main();
} catch {
  // Same.
}
process.exit(0);
