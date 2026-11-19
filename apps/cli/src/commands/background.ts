import { paint } from '../format';
import { formatUptime, runningServer, serverLogPath, stopServer } from '../serverRecord';
import { isNewer } from '../update/semver';
import { VersionStore } from '../update/store';
import { VERSION } from '../version';
import { setUpInstalls } from './install';
import { logTail, spawnServer } from './spawnServer';
import {
  announceRunning,
  floorToReuse,
  openBrowser,
  parseWatchArgs,
  requireViewerDist,
} from './watch';

export interface StartOptions {
  port?: number;
  open: boolean;
  /** Install the plugin where it is missing without asking. */
  yes: boolean;
}

/** `start` takes `watch`'s flags, but only the floor's: no session, bus or replay. */
export function parseStartArgs(args: string[]): StartOptions | string {
  const yes = args.includes('--yes') || args.includes('-y');
  const parsed = parseWatchArgs(args.filter((arg) => arg !== '--yes' && arg !== '-y'));
  if (parsed.session !== undefined || parsed.bus !== undefined || parsed.replay) {
    return 'agentopia start serves the floor only; use agentopia watch for one session or bus.';
  }
  const options: StartOptions = { open: parsed.open, yes };
  if (parsed.port !== undefined) {
    options.port = parsed.port;
  }
  return options;
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
  // Before the server, so a question about the plugin gets this terminal.
  await setUpInstalls({ yes: options.yes });
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
  const record = await spawnServer(entry, options.port).ready;

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
  const ready = new VersionStore().current();
  if (ready && isNewer(ready, record.version)) {
    process.stdout.write(
      record.detached
        ? `  agentopia ${ready} is downloaded; the office switches to it once no session is working\n`
        : `  agentopia ${ready} is downloaded; it takes over the next time the office starts\n`
    );
  }
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
