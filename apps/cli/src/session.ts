import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

import { busPath, metaPath, sessionDir, sessionsDir } from './paths';

export interface SessionMeta {
  id: string;
  harness: string;
  cwd: string;
  startedAt: number;
  argv: string[];
}

/** Local time, so `cubicle sessions` reads the same clock the id was minted on. */
function newSessionId(now: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `${date}-${time}-${randomBytes(3).toString('hex')}`;
}

export function createSession(harness: string, argv: string[]): SessionMeta {
  const meta: SessionMeta = {
    id: newSessionId(new Date()),
    harness,
    cwd: process.cwd(),
    startedAt: Date.now(),
    argv,
  };
  mkdirSync(sessionDir(meta.id), { recursive: true });
  writeFileSync(metaPath(meta.id), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(busPath(meta.id), '');
  return meta;
}

export function readSessionMeta(id: string): SessionMeta | null {
  const path = metaPath(id);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SessionMeta;
  } catch {
    return null;
  }
}

/** Newest first. */
export function listSessions(limit = 20): SessionMeta[] {
  const root = sessionsDir();
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .map((id) => readSessionMeta(id))
    .filter((meta): meta is SessionMeta => meta !== null)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

export function latestSessionId(): string | null {
  return listSessions(1)[0]?.id ?? null;
}
