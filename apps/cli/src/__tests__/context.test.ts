import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ClaudeCodeContext, OfficeContext } from '../context';
import { busPath } from '../paths';
import { RunningServer, startOfficeServer } from '../server';
import { createSession, latestHarnessSession } from '../session';

let n = 0;
const line = (record: Record<string, unknown>): string =>
  `${JSON.stringify({ uuid: `u${++n}`, timestamp: new Date().toISOString(), ...record })}\n`;

const prompt = (text: string): string =>
  line({ type: 'user', message: { role: 'user', content: text } });

const reply = (id: string, prompt: number, output = 100): string =>
  line({
    type: 'assistant',
    message: {
      id,
      model: 'claude-opus-5-5',
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: prompt, output_tokens: output },
    },
  });

const status = (url: string): Promise<{ code: number; body: string }> =>
  new Promise((resolve, reject) => {
    get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ code: res.statusCode ?? 0, body }));
    }).on('error', reject);
  });

describe('Claude Code context', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agentopia-context-'));
    mkdirSync(join(root, 'projects', '-Users-me-git-demo'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const transcript = (sid: string): string =>
    join(root, 'projects', '-Users-me-git-demo', `${sid}.jsonl`);

  it('finds a session by id, and reads only what is appended after', async () => {
    writeFileSync(transcript('abcd-1'), prompt('hello') + reply('r1', 20_000));
    const reader = new ClaudeCodeContext([join(root, 'projects')]);
    expect(await reader.report('abcd-1')).toMatchObject({ used: 20_100, window: 200_000 });
    appendFileSync(transcript('abcd-1'), reply('r2', 50_000, 200));
    expect(await reader.report('abcd-1')).toMatchObject({ used: 50_200, peak: 50_200 });
  });

  it.each([
    ['an unknown session', 'ffff-0'],
    ['an id that is not one', '../etc'],
  ])('has nothing for %s', async (_name, sid) => {
    const reader = new ClaudeCodeContext([join(root, 'projects')]);
    expect(await reader.report(sid)).toBeNull();
  });

  it('takes a million-token window from a model configured for one', async () => {
    writeFileSync(join(root, 'settings.json'), JSON.stringify({ model: 'opus[1m]' }));
    writeFileSync(transcript('abcd-2'), prompt('hello') + reply('r1', 1000));
    const reader = new ClaudeCodeContext([join(root, 'projects')]);
    expect((await reader.report('abcd-2'))?.window).toBe(1_000_000);
  });

  it('reads each bus on the session it is on now, and glances only at those that have one', async () => {
    writeFileSync(transcript('abcd-3'), prompt('hello') + reply('r1', 1000));
    const office = new OfficeContext([new ClaudeCodeContext([join(root, 'projects')])], (bus) =>
      bus === 'desk' ? { harness: 'claude', session: 'abcd-3' } : null
    );
    expect(await office.glances(['desk', 'other'])).toEqual({
      desk: { used: 1100, window: 200_000 },
    });
  });
});

describe('latestHarnessSession', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentopia-latest-'));
    process.env.AGENTOPIA_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENTOPIA_HOME;
  });

  it('is the last harness session in the bus, after a /clear', () => {
    const id = createSession('claude', []).id;
    appendFileSync(busPath(id), `${JSON.stringify({ ts: 1, ev: 'SessionStart', sid: 'first' })}\n`);
    appendFileSync(
      busPath(id),
      `${JSON.stringify({ ts: 2, ev: 'SessionStart', sid: 'second' })}\n`
    );
    expect(latestHarnessSession(busPath(id))).toBe('second');
  });

  it('is undefined for a bus that is not there', () => {
    expect(latestHarnessSession(join(home, 'nope.jsonl'))).toBeUndefined();
  });
});

describe('/api/context', () => {
  let home: string;
  let running: RunningServer | null = null;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentopia-ctx-server-'));
    process.env.AGENTOPIA_HOME = home;
  });

  afterEach(() => {
    running?.close();
    running = null;
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENTOPIA_HOME;
  });

  it('serves one desk in full, and every live desk at a glance', async () => {
    const bus = createSession('claude', []).id;
    appendFileSync(busPath(bus), `${JSON.stringify({ ts: Date.now(), ev: 'SessionStart' })}\n`);
    const report = { harness: 'claude', session: 's', used: 10, window: 100, slices: [] };
    running = await startOfficeServer({
      viewerDist: home,
      port: 0,
      usage: null,
      context: {
        report: async (b) => (b === bus ? (report as never) : null),
        glances: async (buses) => Object.fromEntries(buses.map((b) => [b, { used: 1, window: 2 }])),
      },
    });
    const one = await status(`${running.url}/api/context?session=${bus}`);
    expect(one.code).toBe(200);
    expect(JSON.parse(one.body)).toMatchObject({ used: 10, window: 100 });
    expect((await status(`${running.url}/api/context?session=nope`)).code).toBe(404);
    const all = await status(`${running.url}/api/context`);
    expect(JSON.parse(all.body)).toEqual({ sessions: { [bus]: { used: 1, window: 2 } } });
  });

  it('is not found with no context source', async () => {
    running = await startOfficeServer({ viewerDist: home, port: 0, usage: null, context: null });
    expect((await status(`${running.url}/api/context`)).code).toBe(404);
  });
});
