import {
  CUBICLE_HEADER_EV,
  SessionHeader,
  harnessSessionIds,
  isSessionHeader,
  parseRecord,
  parseRecords,
} from '@repo/core';
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

/** Local time, so `cubicle sessions` reads the same clock the id was minted on. */
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
export function createSession(
  harness: string,
  argv: string[]
): { id: string; header: SessionHeader } {
  const id = newSessionId(new Date());
  const header: SessionHeader = {
    ts: Date.now(),
    ev: CUBICLE_HEADER_EV,
    harness,
    cwd: process.cwd(),
    argv,
    version: VERSION,
  };
  mkdirSync(sessionDir(id), { recursive: true });
  writeFileSync(busPath(id), `${JSON.stringify(header)}\n`);
  return { id, header };
}

/** Read the head of a file without pulling a long session into memory. */
function readHead(path: string, bytes = 8192): string {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const read = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read).toString('utf8');
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
  const [firstLine] = head.split('\n');
  const header = firstLine ? parseRecord(firstLine) : null;
  if (!header || !isSessionHeader(header)) {
    return null;
  }

  return {
    ...header,
    id,
    harnessSession: harnessSessionIds(parseRecords(head))[0],
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
 * A cubicle id names one wrapper run; a harness session id names an agent
 * conversation, which may span several runs. Users see the latter in the
 * agent's own tooling, so `cubicle tail <uuid>` should just work.
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
