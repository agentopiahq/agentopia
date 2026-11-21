import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { Server, createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { mergeHooks } from '../commands/relay';
import { REPO_PLUGIN_DIR, cloudHooks, pluginEvents } from '../relay/cloudHooks';
import { readCursor, writeCursor } from '../relay/config';
import { asBatch, newToken, open, relayKeys, seal } from '../relay/envelope';
import { RelayPuller } from '../relay/pull';

const REPO = resolve(__dirname, '../../../..');
const PLUGIN = join(REPO, 'plugins/claude');
const FORWARDER = join(PLUGIN, 'hooks/relay.mjs');

/** A relay like agentopia.town's, in memory: seq-numbered batches per channel. */
function startRelay(): Promise<{ url: string; server: Server; items: Map<string, string[]> }> {
  const items = new Map<string, string[]>();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const channel = url.pathname.split('/').pop() ?? '';
    const list = items.get(channel) ?? [];
    items.set(channel, list);
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        list.push((JSON.parse(body) as { b: string }).b);
        res.end(JSON.stringify({ seq: list.length }));
      });
      return;
    }
    const after = Number(url.searchParams.get('after') ?? 0);
    res.end(
      JSON.stringify({
        items: list.map((b, i) => ({ seq: i + 1, b })).filter((item) => item.seq > after),
        last: list.length,
      })
    );
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      ok({ url: `http://127.0.0.1:${port}/api/relay`, server, items });
    })
  );
}

/** This process's environment, without anything that would pair or place a run. */
function cleanEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  for (const key of [
    'CLAUDE_CODE_REMOTE',
    'AGENTOPIA_RELAY',
    'AGENTOPIA_RELAY_URL',
    'AGENTOPIA_BUS',
    'AGENTOPIA_HOME',
  ]) {
    delete env[key];
  }
  return env;
}

let cloud: string;
let office: string;
const savedHome = process.env.AGENTOPIA_HOME;

beforeEach(() => {
  cloud = mkdtempSync(join(tmpdir(), 'agentopia-cloud-'));
  office = mkdtempSync(join(tmpdir(), 'agentopia-office-'));
  process.env.AGENTOPIA_HOME = office;
});

afterEach(() => {
  rmSync(cloud, { recursive: true, force: true });
  rmSync(office, { recursive: true, force: true });
  if (savedHome === undefined) {
    delete process.env.AGENTOPIA_HOME;
  } else {
    process.env.AGENTOPIA_HOME = savedHome;
  }
});

function cloudBus(name: string): string {
  const path = join(cloud, '.agentopia/sessions', name, 'bus.jsonl');
  mkdirSync(join(path, '..'), { recursive: true });
  return path;
}

function record(ev: string): string {
  return JSON.stringify({ ts: 1, rid: ev, ev, h: 'claude', sid: 'abc' });
}

/**
 * Run the forwarder as a hook would, in the cloud container's home. Async,
 * so the relay in this process can answer it.
 */
function forwarder(mode: string, env: Record<string, string>): Promise<void> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [FORWARDER, mode], {
      env: { ...cleanEnv(), HOME: cloud, ...env },
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    child.stdin.end('{}');
    child.on('exit', () => done());
  });
}

describe('envelope', () => {
  const { key } = relayKeys(newToken());

  it('opens what it seals', () => {
    expect(open(key, seal(key, { v: 1, bus: 'b', lines: ['x'] }))).toEqual({
      v: 1,
      bus: 'b',
      lines: ['x'],
    });
  });

  it.each([
    ['another key', seal(relayKeys(newToken()).key, { a: 1 })],
    ['garbage', 'bm90IGEgYmF0Y2g'],
    ['nothing', ''],
  ])('opens nothing sealed with %s', (_, sealed) => {
    expect(open(key, sealed)).toBeNull();
  });

  it('derives one channel and key per token, and different ones per token', () => {
    const token = newToken();
    expect(relayKeys(token)).toEqual(relayKeys(token));
    expect(relayKeys(token).channel).toMatch(/^[0-9a-f]{32}$/);
    expect(relayKeys(newToken()).channel).not.toBe(relayKeys(token).channel);
  });

  it.each([
    ['a parent directory', { v: 1, bus: '..', lines: [] }],
    ['a path', { v: 1, bus: 'a/b', lines: [] }],
    ['a hidden name', { v: 1, bus: '.x', lines: [] }],
    ['another version', { v: 2, bus: 'a', lines: [] }],
    ['lines that are not strings', { v: 1, bus: 'a', lines: [1] }],
  ])('refuses a batch naming %s', (_, value) => {
    expect(asBatch(value)).toBeNull();
  });
});

describe('forwarder to office', () => {
  it('carries each bus line to a cloud- bus in the office, once', async () => {
    const relay = await startRelay();
    try {
      const token = newToken();
      const env = { AGENTOPIA_RELAY: token, AGENTOPIA_RELAY_URL: relay.url };
      const bus = cloudBus('auto-abc');
      writeFileSync(bus, `${record('SessionStart')}\n\n${record('UserPromptSubmit')}\n`);
      await forwarder('once', env);
      appendFileSync(bus, `${record('Stop')}\n{"torn":`);
      await forwarder('once', env);
      await forwarder('once', env);

      const puller = new RelayPuller({ token, url: relay.url });
      expect(await puller.pullOnce()).toBe(3);
      expect(await puller.pullOnce()).toBe(0);
      const local = readFileSync(join(office, 'sessions/cloud-auto-abc/bus.jsonl'), 'utf8');
      expect(local.trim().split('\n')).toEqual([
        record('SessionStart'),
        record('UserPromptSubmit'),
        record('Stop'),
      ]);
      expect(relay.items.get(relayKeys(token).channel)).toHaveLength(2);
    } finally {
      relay.server.close();
    }
  });

  it('sends nothing without a token', async () => {
    const relay = await startRelay();
    try {
      writeFileSync(cloudBus('auto-abc'), `${record('SessionStart')}\n`);
      await forwarder('once', { AGENTOPIA_RELAY_URL: relay.url });
      expect(relay.items.size).toBe(0);
    } finally {
      relay.server.close();
    }
  });

  it('starts one forwarder from ensure, and leaves it be the second time', async () => {
    const relay = await startRelay();
    const lock = join(cloud, '.agentopia/relay/forwarder.lock');
    try {
      const env = { AGENTOPIA_RELAY: newToken(), AGENTOPIA_RELAY_URL: relay.url };
      await forwarder('ensure', env);
      const pid = Number(readFileSync(lock, 'utf8'));
      expect(() => process.kill(pid, 0)).not.toThrow();
      await forwarder('ensure', env);
      expect(Number(readFileSync(lock, 'utf8'))).toBe(pid);
      process.kill(pid);
    } finally {
      relay.server.close();
    }
  });

  it('skips a batch sealed with another pairing', async () => {
    const relay = await startRelay();
    try {
      const token = newToken();
      const { channel } = relayKeys(token);
      relay.items.set(channel, [
        seal(relayKeys(newToken()).key, { v: 1, bus: 'auto-x', lines: [record('Stop')] }),
      ]);
      expect(await new RelayPuller({ token, url: relay.url }).pullOnce()).toBe(0);
      expect(existsSync(join(office, 'sessions/cloud-auto-x'))).toBe(false);
      expect(readCursor(channel)).toBe(1);
    } finally {
      relay.server.close();
    }
  });

  it('reads a channel from the start again once the relay has forgotten it', async () => {
    const relay = await startRelay();
    try {
      const token = newToken();
      const { channel } = relayKeys(token);
      writeCursor(channel, 40);
      expect(await new RelayPuller({ token, url: relay.url }).pullOnce()).toBe(0);
      expect(readCursor(channel)).toBe(0);
    } finally {
      relay.server.close();
    }
  });
});

describe('cloud hooks', () => {
  const hooks = cloudHooks(pluginEvents(PLUGIN), REPO_PLUGIN_DIR);

  it('match what this repository commits in .claude/settings.json', () => {
    const committed = JSON.parse(readFileSync(join(REPO, '.claude/settings.json'), 'utf8')) as {
      hooks: unknown;
    };
    expect(committed.hooks).toEqual(hooks.hooks);
  });

  it('wire every event the plugin wires', () => {
    expect(Object.keys(hooks.hooks)).toEqual(pluginEvents(PLUGIN));
  });

  it.each([
    ['in the cloud, paired', { CLAUDE_CODE_REMOTE: 'true', AGENTOPIA_RELAY: 'ar1_x' }, true],
    ['on your own machine', { AGENTOPIA_RELAY: 'ar1_x' }, false],
    ['in the cloud, unpaired', { CLAUDE_CODE_REMOTE: 'true' }, false],
  ])('records %s: %s', (_, env, records) => {
    const [emit] = hooks.hooks.Stop[0].hooks;
    const result = spawnSync('sh', ['-c', emit.command], {
      input: JSON.stringify({ hook_event_name: 'Stop', session_id: 'abcd-1234' }),
      env: { ...cleanEnv(), HOME: cloud, CLAUDE_PROJECT_DIR: REPO, ...env },
    });
    expect(result.status).toBe(0);
    expect(existsSync(join(cloud, '.agentopia/sessions/auto-abcd-1234/bus.jsonl'))).toBe(records);
  });

  it('merges into managed settings, keeping others and replacing an old copy', () => {
    const theirs = { hooks: [{ type: 'command', command: 'echo hi' }] };
    const merged = mergeHooks(
      { model: 'x', hooks: { Stop: [theirs, ...hooks.hooks.Stop] } },
      hooks
    ) as { model: string; hooks: Record<string, unknown[]> };
    expect(merged.model).toBe('x');
    expect(merged.hooks.Stop).toEqual([theirs, ...hooks.hooks.Stop]);
  });
});
