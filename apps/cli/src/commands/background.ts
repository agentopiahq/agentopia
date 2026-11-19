import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';

import { paint } from '../format';
import { agentopiaHome } from '../paths';
import {
  ServerRecord,
  formatUptime,
  probeServer,
  readServerRecord,
  runningServer,
  serverLogPath,
  stopServer,
  waitFor,
} from '../serverRecord';
import { VERSION } from '../version';
import { noteInstalls } from './install';
import {
  announceRunning,
  floorToReuse,
  openBrowser,
  parseWatchArgs,
  requireViewerDist,
} from './watch';

/** How long `start` waits for the server it spawned to say it is up. */
const START_TIMEOUT_MS = 15000;

export interface StartOptions {
  port?: number;
  open: boolean;
}

/** `start` takes `watch`'s flags, but only the floor's: no session, bus or replay. */
export function parseStartArgs(args: string[]): StartOptions | string {
  const parsed = parseWatchArgs(args);
  if (parsed.session !== undefined || parsed.bus !== undefined || parsed.replay) {
    return 'agentopia start serves the floor only; use agentopia watch for one session or bus.';
  }
  return parsed.port === undefined
    ? { open: parsed.open }
    : { port: parsed.port, open: parsed.open };
}

function logTail(lines = 12): string {
  try {
    return readFileSync(serverLogPath(), 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

/**
 * `agentopia start`: serve the floor in the background, detached from this
 * terminal, so closing it leaves the office open. The server is an ordinary
 * `agentopia watch --no-open` whose output goes to the log; it writes the
 * server record once it is listening, which is what this waits for.
 */
export async function startBackground(options: StartOptions): Promise<number> {
  if (!requireViewerDist()) {
    return 1;
  }
  const existing = await floorToReuse();
  if (existing) {
    announceRunning(existing, options.open);
    return 0;
  }

  const entry = process.argv[1];
  if (!entry) {
    process.stderr.write('agentopia: cannot tell which agentopia to run in the background.\n');
    return 1;
  }
  mkdirSync(agentopiaHome(), { recursive: true });
  const log = openSync(serverLogPath(), 'a');
  const args = [...process.execArgv, entry, 'watch', '--no-open'];
  if (options.port !== undefined) {
    args.push('--port', String(options.port));
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
  const record = await waitFor<ServerRecord | 'exited'>(async () => {
    if (exited || pid === undefined) {
      return 'exited';
    }
    const r = readServerRecord();
    if (r?.pid !== pid) {
      return null;
    }
    const hello = await probeServer(r.port);
    return hello !== 'busy' && hello?.pid === pid ? r : null;
  }, START_TIMEOUT_MS);
  child.unref();

  if (!record || record === 'exited') {
    process.stderr.write(
      `agentopia: the office server ${record === 'exited' ? 'exited' : 'did not come up'}. ` +
        `Its log is ${serverLogPath()}${logTail() ? ':' : '.'}\n`
    );
    const tail = logTail();
    if (tail) {
      process.stderr.write(`${paint.dim(tail)}\n`);
    }
    return 1;
  }

  const url = `${record.url}/`;
  process.stdout.write(`${paint.bold('agentopia office:')} ${url}\n`);
  process.stdout.write(
    paint.dim(
      `Running in the background (pid ${record.pid}); agentopia stop stops it. ` +
        `Its log is ${serverLogPath()}.\n`
    )
  );
  if (options.open) {
    openBrowser(url);
  }
  noteInstalls();
  return 0;
}

/** `agentopia status`: whether the office is running, and where. Exit 1 when it isn't. */
export async function showStatus(now: number = Date.now()): Promise<number> {
  const record = await runningServer();
  if (!record) {
    process.stdout.write(
      `${paint.bold('agentopia office:')} not running. ` +
        'agentopia start serves it in the background.\n'
    );
    return 1;
  }
  const version =
    record.version === VERSION
      ? `agentopia ${record.version}`
      : paint.amber(
          `agentopia ${record.version} (this is ${VERSION}; agentopia start restarts it)`
        );
  process.stdout.write(`${paint.bold('agentopia office:')} running at ${record.url}/\n`);
  process.stdout.write(
    `  pid ${record.pid}, up ${formatUptime(now - record.startedAt)}, ${version}\n`
  );
  process.stdout.write(
    record.detached
      ? `  in the background; log at ${serverLogPath()}\n`
      : '  in the foreground, from agentopia watch\n'
  );
  return 0;
}

/** `agentopia stop`: stop the office, however it was started. */
export async function stopBackground(): Promise<number> {
  const record = await runningServer();
  if (!record) {
    process.stdout.write(`${paint.bold('agentopia office:')} not running.\n`);
    return 0;
  }
  if (!(await stopServer(record))) {
    process.stderr.write(`agentopia: the office at pid ${record.pid} would not stop.\n`);
    return 1;
  }
  process.stdout.write(
    `${paint.bold('agentopia office:')} stopped (was ${record.url}/, pid ${record.pid}).\n`
  );
  return 0;
}
