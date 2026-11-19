import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';

import { agentopiaHome } from './paths';

/**
 * What the floor server says about itself in `~/.agentopia/server.json`, so
 * `start`, `status`, `stop` and a second `watch` can find it. There is one
 * floor per agentopia home: the record is also the lock that keeps a second
 * one from starting on the next port up.
 */
export interface ServerRecord {
  pid: number;
  port: number;
  url: string;
  version: string;
  startedAt: number;
  /** Started by `agentopia start`, so its output goes to the log, not a terminal. */
  detached: boolean;
}

export function serverRecordPath(): string {
  return join(agentopiaHome(), 'server.json');
}

export function serverLogPath(): string {
  return join(agentopiaHome(), 'server.log');
}

function isRecord(value: unknown): value is ServerRecord {
  const r = value as Partial<ServerRecord> | null;
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.pid === 'number' &&
    typeof r.port === 'number' &&
    typeof r.url === 'string' &&
    typeof r.version === 'string' &&
    typeof r.startedAt === 'number'
  );
}

export function readServerRecord(): ServerRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(serverRecordPath(), 'utf8'));
    return isRecord(parsed) ? { ...parsed, detached: Boolean(parsed.detached) } : null;
  } catch {
    return null;
  }
}

export function writeServerRecord(record: ServerRecord): void {
  mkdirSync(agentopiaHome(), { recursive: true });
  // Write then rename, so a reader never sees half a record.
  const tmp = `${serverRecordPath()}.${record.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(tmp, serverRecordPath());
}

/** Remove the record, but only if it is still this pid's: a newer server may have replaced it. */
export function clearServerRecord(pid: number): void {
  const record = readServerRecord();
  if (!record || record.pid === pid) {
    rmSync(serverRecordPath(), { force: true });
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists, it just isn't ours to signal.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** What `/api/server` answers. */
export interface ServerHello {
  pid: number;
  version: string;
}

/**
 * Ask whatever is on the record's port who it is: its hello, `'busy'` when it
 * took the connection but never answered, or null when nothing (or nothing
 * that speaks agentopia) is there. Plain `http.get` with no agent, so nothing
 * keeps the CLI alive once it has its answer.
 */
export function probeServer(port: number, timeoutMs = 2000): Promise<ServerHello | 'busy' | null> {
  return new Promise((resolve) => {
    const req = get(
      { host: '127.0.0.1', port, path: '/api/server', agent: false, timeout: timeoutMs },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const hello = JSON.parse(body) as Partial<ServerHello>;
            resolve(
              res.statusCode === 200 && typeof hello.pid === 'number'
                ? { pid: hello.pid, version: String(hello.version) }
                : null
            );
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => {
      resolve('busy');
      req.destroy();
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * The floor server that is running now, or null. A record whose process is
 * gone, or whose port is closed or answers as someone else (a reused pid,
 * another app on the port), is stale and removed. A live pid whose port is
 * open but slow to answer is taken to be the server, busy.
 */
export async function runningServer(): Promise<ServerRecord | null> {
  const record = readServerRecord();
  if (!record) {
    return null;
  }
  if (isAlive(record.pid)) {
    const hello = await probeServer(record.port);
    if (hello === 'busy' || hello?.pid === record.pid) {
      return record;
    }
  }
  clearServerRecord(record.pid);
  return null;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `check` every `everyMs` until it gives a value, or give up with null after `withinMs`. */
export async function waitFor<T>(
  check: () => T | null | Promise<T | null>,
  withinMs: number,
  everyMs = 100
): Promise<T | null> {
  const deadline = Date.now() + withinMs;
  for (;;) {
    const value = await check();
    if (value !== null) {
      return value;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await sleep(everyMs);
  }
}

/**
 * Stop a running server: ask (SIGTERM, which shuts it down cleanly and
 * removes its record), then insist (SIGKILL) if it is still there after a
 * few seconds. True once it is gone.
 */
export async function stopServer(record: ServerRecord, graceMs = 5000): Promise<boolean> {
  const gone = (): true | null => (isAlive(record.pid) ? null : true);
  try {
    process.kill(record.pid, 'SIGTERM');
  } catch {
    // Already gone, or not ours to signal; the checks below tell which.
  }
  let stopped = (await waitFor(gone, graceMs)) === true;
  if (!stopped) {
    try {
      process.kill(record.pid, 'SIGKILL');
    } catch {
      // As above.
    }
    stopped = (await waitFor(gone, 2000)) === true;
  }
  if (stopped) {
    clearServerRecord(record.pid);
  }
  return stopped;
}

/** "3h 12m", "4m", "12s": how long a server has been up. */
export function formatUptime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}
