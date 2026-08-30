#!/usr/bin/env node
/**
 * cubicle hook emitter.
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
import { appendFileSync, mkdirSync, readSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** Stay well under PIPE_BUF so concurrent appends from parallel hooks stay atomic. */
const MAX_LINE = 1200;

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
  const bus = process.env.CUBICLE_BUS;
  if (!bus) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch {
    return;
  }

  const ev = payload.hook_event_name || 'Unknown';
  const record = {
    ts: Date.now(),
    ev,
    sid: payload.session_id,
    // Claude Code calls it prompt_id, Codex calls it turn_id. Same idea.
    pid: payload.prompt_id || payload.turn_id,
    // Present only when the hook fires from inside a subagent.
    aid: payload.agent_id,
    atype: payload.agent_type,
    mode: payload.permission_mode,
    tool: payload.tool_name,
    ...describeEvent(ev, payload),
  };

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
