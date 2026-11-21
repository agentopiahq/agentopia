#!/usr/bin/env node
/**
 * agentopia relay forwarder, for sessions that run somewhere your office is
 * not: a Claude Code cloud session, a devbox. The emitter (emit.mjs) still
 * only appends to a local bus file and never touches the network; this
 * process follows those files and posts what they gain to a relay
 * (agentopia.town by default), where your office picks them up.
 *
 * Everything leaves sealed. AGENTOPIA_RELAY is the pairing token that
 * `agentopia relay pair` printed: it derives both the channel (where the
 * batches are kept) and the AES-256-GCM key (what they are sealed with). The
 * relay only ever sees the channel and ciphertext, so it can neither read
 * the events nor forge them. The CLI's `src/relay/envelope.ts` opens what
 * this seals; a test holds the two to one format.
 *
 * Same packaging rules as the emitter: node builtins only, no build step.
 *
 *   node relay.mjs ensure   (a hook) start the forwarder unless it is running
 *   node relay.mjs run      the forwarder: follow the buses until quiet
 *   node relay.mjs once     one pass, then exit (tests)
 *
 * `ensure` prints nothing and always exits 0, like every hook here.
 */
import { spawn } from 'node:child_process';
import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'https://www.agentopia.town/api/relay';

/** How often the forwarder looks for new lines. */
const TICK_MS = 1000;

/** The longest it waits after a failed post. */
const MAX_BACKOFF_MS = 30_000;

/**
 * A forwarder with nothing new for this long exits; the next prompt's
 * `ensure` starts another. Keeps an idle container from holding a process.
 */
const IDLE_EXIT_MS = 20 * 60 * 1000;

/** Plaintext bytes per sealed batch, under the relay's body limit. */
const MAX_BATCH_BYTES = 128 * 1024;

/** How long one post may take before it counts as failed. */
const POST_TIMEOUT_MS = 10_000;

const BUS_NAME = /^[A-Za-z0-9._-]{1,100}$/;

function drainStdin() {
  try {
    const buf = Buffer.alloc(65536);
    while (readSync(0, buf, 0, buf.length, null) > 0) {
      // A hook's payload; ensure has no use for it.
    }
  } catch {
    // No stdin, or not readable: nothing to drain.
  }
}

/** The channel and key a pairing token stands for. Must match envelope.ts. */
export function relayKeys(token) {
  const derive = (info, length) =>
    Buffer.from(hkdfSync('sha256', token, Buffer.alloc(0), info, length));
  return {
    channel: derive('agentopia relay channel', 16).toString('hex'),
    key: derive('agentopia relay key', 32),
  };
}

/** base64url(iv | ciphertext | tag) of a JSON value. Must match envelope.ts. */
export function seal(key, value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url');
}

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || '';
}

function stateDir(home) {
  return `${home}/.agentopia/relay`;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Start the forwarder once. The lock file holds its pid; a lock whose pid is
 * gone is stale and taken over, so a container restored from sleep (which
 * keeps files but not processes) starts a fresh one on the next prompt.
 */
function ensure() {
  drainStdin();
  const token = process.env.AGENTOPIA_RELAY;
  const home = homeDir();
  if (!token || !home) {
    return;
  }
  const dir = stateDir(home);
  const lock = `${dir}/forwarder.lock`;
  mkdirSync(dir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try {
      fd = openSync(lock, 'wx');
    } catch {
      const pid = Number(readFileSync(lock, 'utf8').trim());
      if (alive(pid)) {
        return;
      }
      try {
        unlinkSync(lock);
      } catch {
        // Someone else took it over first; the retry finds theirs.
      }
      continue;
    }
    try {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run'], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.unref();
      writeFileSync(lock, String(child.pid ?? ''));
    } finally {
      closeSync(fd);
    }
    return;
  }
}

/** Every bus under ~/.agentopia/sessions, by its directory name. */
function buses(home) {
  const root = `${home}/.agentopia/sessions`;
  let names = [];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  return names
    .filter((name) => BUS_NAME.test(name))
    .map((name) => ({ name, path: `${root}/${name}/bus.jsonl` }))
    .filter((bus) => existsSync(bus.path));
}

/** The whole lines a bus gained past `offset`, and where they end. */
function newLines(path, offset) {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return null;
  }
  if (size <= offset) {
    return null;
  }
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(size - offset);
    readSync(fd, buf, 0, buf.length, offset);
    const end = buf.lastIndexOf(0x0a);
    if (end < 0) {
      return null;
    }
    const lines = buf
      .subarray(0, end)
      .toString('utf8')
      .split('\n');
    return { lines, next: offset + end + 1 };
  } finally {
    closeSync(fd);
  }
}

/** Lines in batches of at most MAX_BATCH_BYTES, each with the offset it ends at. */
function batches(lines, start, next) {
  const out = [];
  let batch = [];
  let bytes = 0;
  let offset = start;
  for (const line of lines) {
    // Offsets count every byte, blank lines included, so a batch always ends
    // on a line boundary; only the lines themselves skip the blanks.
    const size = Buffer.byteLength(line, 'utf8') + 1;
    if (batch.length > 0 && bytes + size > MAX_BATCH_BYTES) {
      out.push({ lines: batch, next: offset });
      batch = [];
      bytes = 0;
    }
    if (line.trim()) {
      batch.push(line);
      bytes += size;
    }
    offset += size;
  }
  if (batch.length > 0) {
    out.push({ lines: batch, next });
  }
  return out;
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  });
  return res.ok;
}

/**
 * One pass over every bus: post what each gained since the last pass, in
 * order, advancing a bus's offset only once its batch is accepted. Returns
 * whether anything was sent, or 'failed' if a post did not go through (the
 * rest waits for the next pass, so nothing goes out of order).
 */
async function pass(home, keys, url, offsets) {
  let sent = false;
  for (const bus of buses(home)) {
    const start = offsets[bus.name] ?? 0;
    const found = newLines(bus.path, start);
    if (!found) {
      continue;
    }
    for (const batch of batches(found.lines, start, found.next)) {
      let ok = false;
      try {
        ok = await post(`${url}/${keys.channel}`, {
          b: seal(keys.key, { v: 1, bus: bus.name, lines: batch.lines }),
        });
      } catch {
        ok = false;
      }
      if (!ok) {
        return 'failed';
      }
      offsets[bus.name] = batch.next;
      writeFileSync(`${stateDir(home)}/offsets.json`, JSON.stringify(offsets));
      sent = true;
    }
    // Every batch went through; trailing blank lines are done with too.
    offsets[bus.name] = found.next;
  }
  return sent;
}

async function forward(loop) {
  const token = process.env.AGENTOPIA_RELAY;
  const home = homeDir();
  if (!token || !home) {
    return;
  }
  const url = (process.env.AGENTOPIA_RELAY_URL || DEFAULT_URL).replace(/\/+$/, '');
  const keys = relayKeys(token);
  mkdirSync(stateDir(home), { recursive: true });
  const offsets = readJson(`${stateDir(home)}/offsets.json`) || {};
  let quietSince = Date.now();
  let backoff = TICK_MS;
  for (;;) {
    const result = await pass(home, keys, url, offsets);
    if (!loop) {
      return;
    }
    if (result === 'failed') {
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    } else {
      backoff = TICK_MS;
      if (result) {
        quietSince = Date.now();
      } else if (Date.now() - quietSince > IDLE_EXIT_MS) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
}

function releaseLock() {
  const lock = `${stateDir(homeDir())}/forwarder.lock`;
  try {
    if (Number(readFileSync(lock, 'utf8').trim()) === process.pid) {
      unlinkSync(lock);
    }
  } catch {
    // Already gone.
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const mode = process.argv[2];
  if (mode === 'run' || mode === 'once') {
    forward(mode === 'run')
      .catch(() => undefined)
      .finally(() => {
        if (mode === 'run') {
          releaseLock();
        }
        process.exit(0);
      });
  } else {
    try {
      ensure();
    } catch {
      // The office is cosmetic. Never surface an error into the session.
    }
    process.exit(0);
  }
}
