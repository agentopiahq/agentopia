import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseStartArgs } from '../commands/background';
import { RunningServer, startOfficeServer } from '../server';
import {
  ServerRecord,
  clearServerRecord,
  formatUptime,
  isAlive,
  probeServer,
  readServerRecord,
  runningServer,
  serverRecordPath,
  writeServerRecord,
} from '../serverRecord';
import { VERSION } from '../version';

process.env.AGENTOPIA_NO_AUTORUN = '1';

const { main } = require('../index') as typeof import('../index');

/** A pid that was real a moment ago and is gone now. */
function deadPid(): number {
  return spawnSync(process.execPath, ['-e', '']).pid;
}

function recordFor(port: number, overrides: Partial<ServerRecord> = {}): ServerRecord {
  return {
    pid: process.pid,
    port,
    url: `http://localhost:${port}`,
    version: VERSION,
    startedAt: Date.now() - 65_000,
    detached: false,
    ...overrides,
  };
}

function captureStdout(): { text: () => string; restore: () => void } {
  let out = '';
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  return { text: () => out, restore: () => spy.mockRestore() };
}

describe('the server record', () => {
  let home: string;
  let running: RunningServer | null = null;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentopia-record-'));
    process.env.AGENTOPIA_HOME = home;
  });

  afterEach(() => {
    running?.close();
    running = null;
    delete process.env.AGENTOPIA_HOME;
    rmSync(home, { recursive: true, force: true });
  });

  async function serve(): Promise<RunningServer> {
    running = await startOfficeServer({ viewerDist: home, port: 0, usage: null, context: null });
    return running;
  }

  it('reads back what was written', () => {
    const record = recordFor(7777, { detached: true });
    writeServerRecord(record);

    expect(readServerRecord()).toEqual(record);
  });

  it.each([
    ['is missing', null],
    ['is not JSON', 'nope'],
    ['lacks a pid', JSON.stringify({ port: 1, url: 'x', version: '1', startedAt: 1 })],
  ])('reads as nothing when the file %s', (_label, body) => {
    if (body !== null) {
      writeFileSync(serverRecordPath(), body);
    }

    expect(readServerRecord()).toBeNull();
  });

  it("is cleared only by its own server's pid", () => {
    writeServerRecord(recordFor(7777, { pid: 123 }));

    clearServerRecord(456);
    expect(readServerRecord()?.pid).toBe(123);

    clearServerRecord(123);
    expect(existsSync(serverRecordPath())).toBe(false);
  });

  it('tells a live pid from a gone one', () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(deadPid())).toBe(false);
  });

  it('answers who is on the port', async () => {
    const { port } = await serve();

    expect(await probeServer(port)).toEqual({ pid: process.pid, version: VERSION });
  });

  it('finds the server the record names', async () => {
    const { port } = await serve();
    writeServerRecord(recordFor(port));

    expect((await runningServer())?.port).toBe(port);
  });

  it.each([
    ['its process is gone', async (port: number) => recordFor(port, { pid: deadPid() })],
    [
      'its port answers as another pid',
      // The parent is alive, but it is not the server on the port.
      async (port: number) => recordFor(port, { pid: process.ppid }),
    ],
    [
      'nothing listens on its port',
      async () => {
        const closed = await startOfficeServer({
          viewerDist: home,
          port: 0,
          usage: null,
          context: null,
        });
        closed.close();
        return recordFor(closed.port);
      },
    ],
  ])('drops a stale record when %s', async (_label, make) => {
    const { port } = await serve();
    writeServerRecord(await make(port));

    expect(await runningServer()).toBeNull();
    expect(existsSync(serverRecordPath())).toBe(false);
  });

  it('takes a live pid whose port is slow to answer as busy, not stale', async () => {
    // Accepts the connection and never answers.
    const hung = createServer(() => undefined);
    await new Promise<void>((resolve) => hung.listen(0, '127.0.0.1', resolve));
    const { port } = hung.address() as AddressInfo;
    try {
      expect(await probeServer(port, 100)).toBe('busy');
    } finally {
      hung.closeAllConnections();
      hung.close();
    }
  });

  it('reports a running office in status', async () => {
    const { port } = await serve();
    writeServerRecord(recordFor(port));
    const stdout = captureStdout();
    try {
      expect(await main(['status'])).toBe(0);
    } finally {
      stdout.restore();
    }

    expect(stdout.text()).toContain(`running at http://localhost:${port}/`);
    expect(stdout.text()).toContain(`pid ${process.pid}, up 1m, agentopia ${VERSION}`);
    expect(stdout.text()).toContain('in the foreground');
  });

  it.each([
    ['status', 1, 'not running. agentopia start'],
    ['stop', 0, 'not running.'],
  ])('says the office is not running from %s', async (command, code, text) => {
    const stdout = captureStdout();
    try {
      expect(await main([command])).toBe(code);
    } finally {
      stdout.restore();
    }

    expect(stdout.text()).toContain(text);
  });
});

describe('parseStartArgs', () => {
  it.each([
    ['nothing', [], { open: true, yes: false }],
    ['a port', ['--port', '7788'], { port: 7788, open: true, yes: false }],
    ['no-open', ['--no-open'], { open: false, yes: false }],
    ['yes', ['--yes'], { open: true, yes: true }],
    ['y with a port', ['-y', '--port', '9'], { port: 9, open: true, yes: true }],
  ])('parses %s', (_label, args, expected) => {
    expect(parseStartArgs(args)).toEqual(expected);
  });

  it.each([
    ['a session', ['abc']],
    ['a bus', ['--bus', 'f.jsonl']],
    ['replay', ['--replay']],
  ])('refuses %s: the background office is the floor only', (_label, args) => {
    expect(typeof parseStartArgs(args)).toBe('string');
  });
});

describe('formatUptime', () => {
  it.each([
    [12_000, '12s'],
    [4 * 60_000 + 5_000, '4m'],
    [3 * 3_600_000 + 12 * 60_000, '3h 12m'],
    [2 * 86_400_000 + 5 * 3_600_000, '2d 5h'],
    [-5, '0s'],
  ])('formats %d ms as %s', (ms, expected) => {
    expect(formatUptime(ms)).toBe(expected);
  });
});
