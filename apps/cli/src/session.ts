import {
  AGENTOPIA_HEADER_EV,
  LEGACY_HARNESS,
  SessionHeader,
  busHarness,
  harnessSessionIds,
  isSessionHeader,
  parseRecord,
  parseRecords,
} from '@agentopia/core';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';

import { busPath, sessionDir, sessionsDir } from './paths';
import { VERSION } from './version';

export interface SessionSummary extends SessionHeader {
  id: string;
  /** First harness session id seen. There may be more; see harnessSessionIds. */
  harnessSession?: string;
  /** When the bus was last written, ms. The best liveness signal a file has. */
  updatedAt: number;
  /** The last record is a session end: the agent said goodbye. */
  ended: boolean;
}

/** A bus written more recently than this may still have a live agent behind it. */
export const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** The harness event that closes a session. */
const SESSION_END_EVENTS = new Set(['SessionEnd']);

/** Local time, so `agentopia sessions` reads the same clock the id was minted on. */
function newSessionId(now: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `${date}-${time}-${randomBytes(3).toString('hex')}`;
}

/**
 * Start a recording. The header is the first line of the bus rather than a
 * sidecar file, so a session is exactly one file and stays self-describing if
 * it is copied elsewhere.
 */
/** A -p prompt can arrive as one enormous argv entry; the header identifies the
 * session, it does not need to preserve the payload. */
function clipArg(arg: string): string {
  return arg.length > 2000 ? `${arg.slice(0, 1999)}\u2026` : arg;
}

export function createSession(
  harness: string,
  argv: string[]
): { id: string; header: SessionHeader } {
  const id = newSessionId(new Date());
  const header: SessionHeader = {
    ts: Date.now(),
    ev: AGENTOPIA_HEADER_EV,
    harness,
    cwd: process.cwd(),
    argv: argv.map(clipArg),
    version: VERSION,
  };
  mkdirSync(sessionDir(id), { recursive: true });
  writeFileSync(busPath(id), `${JSON.stringify(header)}\n`);
  return { id, header };
}

/**
 * Read the head of a file without pulling a long session into memory — but
 * always enough of it. A fixed-size read could truncate the header line, so
 * keep reading until the head contains at least `lines` newlines (or EOF, or a
 * generous upper bound for the truly pathological).
 */
function readHead(path: string, lines = 2, maxBytes = 1024 * 1024): string {
  const fd = openSync(path, 'r');
  try {
    const chunks: Buffer[] = [];
    let seen = 0;
    let offset = 0;
    const buf = Buffer.alloc(65536);
    while (seen < lines && offset < maxBytes) {
      const read = readSync(fd, buf, 0, buf.length, offset);
      if (read === 0) {
        break;
      }
      const chunk = Buffer.from(buf.subarray(0, read));
      offset += read;
      seen += chunk.filter((byte) => byte === 0x0a).length;
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** The last complete line of a file, without reading the whole thing. */
function readLastLine(path: string, size: number, window = 16384): string {
  const start = Math.max(0, size - window);
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    const read = readSync(fd, buf, 0, buf.length, start);
    const lines = buf.subarray(0, read).toString('utf8').split('\n');
    // A trailing newline leaves an empty last element; a torn tail is skipped.
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines[lines.length - 1] ?? '';
  } finally {
    closeSync(fd);
  }
}

/** Has the agent behind this bus said goodbye? Reads only the tail. */
export function busEnded(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  const size = statSync(path).size;
  if (size === 0) {
    return false;
  }
  const last = parseRecord(readLastLine(path, size));
  return last !== null && !isSessionHeader(last) && SESSION_END_EVENTS.has(last.ev);
}

/**
 * Summarize a bus file wherever it lives. `id` is only a label: for a session
 * in the sessions directory it is the directory name, and for a standalone
 * file (`watch --bus`) it is whatever the caller wants displayed.
 */
export function readSummaryFromBus(path: string, id: string): SessionSummary | null {
  if (!existsSync(path)) {
    return null;
  }

  const head = readHead(path);
  const records = parseRecords(head);
  const [first] = records;
  if (!first) {
    return null;
  }

  const liveness = { updatedAt: statSync(path).mtimeMs, ended: busEnded(path) };

  if (isSessionHeader(first)) {
    return {
      ...first,
      id,
      harnessSession: harnessSessionIds(records)[0],
      ...liveness,
    };
  }

  // No header: recorded without the wrapper (hooks installed via settings —
  // the desktop-app path). Synthesize a summary from the first hook record,
  // which the emitter stamps with its harness.
  return {
    ts: first.ts,
    ev: AGENTOPIA_HEADER_EV,
    harness: busHarness(records) ?? LEGACY_HARNESS,
    cwd: '',
    argv: [],
    version: '',
    id,
    harnessSession: harnessSessionIds(records)[0],
    ...liveness,
  };
}

export function readSessionSummary(id: string): SessionSummary | null {
  return readSummaryFromBus(busPath(id), id);
}

/** Newest first. */
export function listSessions(limit = 20): SessionSummary[] {
  const root = sessionsDir();
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .map((id) => readSessionSummary(id))
    .filter((summary): summary is SessionSummary => summary !== null)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

/**
 * The session most recently written to — not most recently started. A long
 * session that is still going beats a stub that began a minute ago.
 */
export function latestSessionId(): string | null {
  const sessions = listSessions(Number.MAX_SAFE_INTEGER);
  if (sessions.length === 0) {
    return null;
  }
  return sessions.reduce((best, s) => (s.updatedAt > best.updatedAt ? s : best)).id;
}

/**
 * Sessions that may still have an agent behind them: not ended, and written
 * within the live window. Most recently written first, which is the order the
 * office seats them in when there are more than it has desks for.
 */
export function liveSessions(now = Date.now(), windowMs = LIVE_WINDOW_MS): SessionSummary[] {
  return listSessions(Number.MAX_SAFE_INTEGER)
    .filter((s) => !s.ended && now - s.updatedAt <= windowMs)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Accept either identity.
 *
 * An agentopia id names one wrapper run; a harness session id names an agent
 * conversation, which may span several runs. Users see the latter in the
 * agent's own tooling, so `agentopia tail <uuid>` should just work.
 */
export function resolveSessionId(idOrHarnessSession: string): string | null {
  if (existsSync(busPath(idOrHarnessSession))) {
    return idOrHarnessSession;
  }

  const root = sessionsDir();
  if (!existsSync(root)) {
    return null;
  }

  const matches = readdirSync(root)
    .filter((id) => existsSync(busPath(id)))
    .filter((id) =>
      harnessSessionIds(parseRecords(readFileSync(busPath(id), 'utf8'))).includes(
        idOrHarnessSession
      )
    )
    .sort();

  // Resume reuses one harness session across runs; the newest is what you want.
  return matches.length > 0 ? matches[matches.length - 1] : null;
}
