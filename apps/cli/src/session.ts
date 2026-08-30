import {
  AGENTOPIA_HEADER_EV,
  SessionHeader,
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
  writeFileSync,
} from 'node:fs';

import { busPath, sessionDir, sessionsDir } from './paths';
import { VERSION } from './version';

export interface SessionSummary extends SessionHeader {
  id: string;
  /** First harness session id seen. There may be more; see harnessSessionIds. */
  harnessSession?: string;
}

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

export function readSessionSummary(id: string): SessionSummary | null {
  const path = busPath(id);
  if (!existsSync(path)) {
    return null;
  }

  const head = readHead(path);
  const records = parseRecords(head);
  const [first] = records;
  if (!first) {
    return null;
  }

  if (isSessionHeader(first)) {
    return {
      ...first,
      id,
      harnessSession: harnessSessionIds(records)[0],
    };
  }

  // No header: recorded without the wrapper (hooks installed via settings —
  // the desktop-app path). Synthesize a summary from the first hook record.
  return {
    ts: first.ts,
    ev: AGENTOPIA_HEADER_EV,
    harness: 'claude',
    cwd: '',
    argv: [],
    version: '',
    id,
    harnessSession: harnessSessionIds(records)[0],
  };
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

export function latestSessionId(): string | null {
  return listSessions(1)[0]?.id ?? null;
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
