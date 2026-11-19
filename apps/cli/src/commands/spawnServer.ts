import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync } from 'node:fs';

import { agentopiaHome } from '../paths';
import {
  ServerRecord,
  isAlive,
  probeServer,
  readServerRecord,
  serverLogPath,
  waitFor,
} from '../serverRecord';

/** How long to wait for a spawned server to say it is up. */
export const START_TIMEOUT_MS = 15000;

/** Past this, the log moves to `server.log.1` (replacing the one before) when a server starts. */
const LOG_ROTATE_BYTES = 1024 * 1024;

function rotateLog(): void {
  try {
    if (statSync(serverLogPath()).size > LOG_ROTATE_BYTES) {
      renameSync(serverLogPath(), `${serverLogPath()}.1`);
    }
  } catch {
    // No log yet.
  }
}

/** The log's last lines, for saying why a server did not come up. */
export function logTail(lines = 12): string {
  try {
    return readFileSync(serverLogPath(), 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

export interface SpawnedServer {
  pid: number | undefined;
  /** The server's record once it is listening, `'exited'` if it died first, null if it timed out. */
  ready: Promise<ServerRecord | 'exited' | null>;
  /** Stop it, for one that came up wrong. */
  kill(): void;
}

/**
 * Start `agentopia watch --no-open` from `entry` (a CLI bundle) detached from
 * this process, its output going to the log. It writes the server record once
 * it is listening, which is what `ready` waits for.
 */
export function spawnServer(
  entry: string,
  port: number | undefined,
  timeoutMs = START_TIMEOUT_MS
): SpawnedServer {
  mkdirSync(agentopiaHome(), { recursive: true });
  rotateLog();
  const log = openSync(serverLogPath(), 'a');
  const args = [...process.execArgv, entry, 'watch', '--no-open'];
  if (port !== undefined) {
    args.push('--port', String(port));
  }
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, AGENTOPIA_DETACHED: '1' },
    windowsHide: true,
  });
  closeSync(log);

  let exited = false;
  child.on('exit', () => {
    exited = true;
  });
  child.on('error', () => {
    exited = true;
  });
  const pid = child.pid;
  const ready = waitFor<ServerRecord | 'exited'>(async () => {
    if (exited || pid === undefined) {
      return 'exited';
    }
    const r = readServerRecord();
    if (r?.pid !== pid) {
      return null;
    }
    const hello = await probeServer(r.port);
    return hello !== 'busy' && hello?.pid === pid ? r : null;
  }, timeoutMs).finally(() => child.unref());

  return {
    pid,
    ready,
    kill: () => {
      if (pid !== undefined && isAlive(pid)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Gone already.
        }
      }
    },
  };
}
