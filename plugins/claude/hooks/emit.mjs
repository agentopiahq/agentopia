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
import { appendFileSync, mkdirSync, readFileSync, readSync, readdirSync } from 'node:fs';
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

/**
 * Claude Code's own name for this session, so the bus stays self-describing
 * and nothing downstream has to read a second source. Best effort from two
 * private stores: the desktop app's session title (what the user sees, keyed
 * by the `cliSessionId` field — the file name is the store's own id), falling
 * back to the live-session registry's short name ("agentopia-a9").
 *
 * This does real file reads, so it runs only on turn-level events — never on
 * a tool call. Names change over a session's life; each sample re-reads them.
 */
function sessionName(sid, home) {
  if (typeof sid !== 'string' || !sid || !home) {
    return undefined;
  }
  const stores = [
    `${home}/Library/Application Support/Claude/claude-code-sessions`,
    process.env.APPDATA ? `${process.env.APPDATA}/Claude/claude-code-sessions` : '',
    `${home}/.config/Claude/claude-code-sessions`,
  ];
  for (const root of stores) {
    for (const account of root ? listDir(root) : []) {
      for (const org of listDir(`${root}/${account}`)) {
        for (const file of listDir(`${root}/${account}/${org}`)) {
          if (!file.startsWith('local_') || !file.endsWith('.json')) {
            continue;
          }
          const record = readJson(`${root}/${account}/${org}/${file}`);
          if (record && record.cliSessionId === sid && typeof record.title === 'string') {
            const title = clip(record.title, 120);
            if (title) {
              return title;
            }
          }
        }
      }
    }
  }
  const registry = `${home}/.claude/sessions`;
  for (const file of listDir(registry)) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const record = readJson(`${registry}/${file}`);
    if (record && record.sessionId === sid && typeof record.name === 'string') {
      const name = clip(record.name, 120);
      if (name) {
        return name;
      }
    }
  }
  return undefined;
}

/** The turn-level events that carry a session-name sample. */
const NAME_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd'];

/** Event-specific fields worth animating, kept tiny. */
function describeEvent(ev, p) {
  switch (ev) {
    case 'UserPromptSubmit':
      return { msg: clip(p.prompt, 80) };
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

  if (NAME_EVENTS.includes(ev)) {
    record.name = sessionName(payload.session_id, home);
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
