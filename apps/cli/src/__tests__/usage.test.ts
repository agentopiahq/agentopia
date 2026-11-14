import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { harnessFor, usageReaders } from '../harness';
import { RunningServer, startOfficeServer } from '../server';
import { ClaudeCodeUsage, OfficeUsage, UsageReader, claudeProjectRoots } from '../usage';

/** An assistant line shaped the way Claude Code writes one. */
function assistant(id: string, sid: string, extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    sessionId: sid,
    cwd: '/Users/me/git/demo',
    timestamp: new Date().toISOString(),
    requestId: `req_${id}`,
    message: {
      id: `msg_${id}`,
      model: 'claude-opus-5-5',
      role: 'assistant',
      content: [{ type: 'text', text: 'ça marche' }],
      usage: { input_tokens: 1000, output_tokens: 1000 },
    },
    ...extra,
  })}\n`;
}

describe('claudeProjectRoots', () => {
  it('reads CLAUDE_CONFIG_DIR as a comma-separated list', () => {
    expect(claudeProjectRoots({ CLAUDE_CONFIG_DIR: '/a, /b' })).toEqual([
      '/a/projects',
      '/b/projects',
    ]);
  });
});

describe('Claude Code usage', () => {
  let root: string;
  let project: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agentopia-usage-'));
    project = join(root, '-Users-me-git-demo');
    mkdirSync(project, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const office = (
    names: (sid: string) => Promise<string | undefined> = async () => undefined,
    refreshMs = 0
  ) => {
    const reader = new ClaudeCodeUsage([root], names);
    return { reader, usage: new OfficeUsage([reader], refreshMs) };
  };

  const today = async (usage: OfficeUsage, now = Date.now()) => {
    const report = await usage.report(now);
    return report.days[report.days.length - 1];
  };

  it('counts each response once, names subagents and sessions, and follows appends', async () => {
    const main = join(project, 'sid-1.jsonl');
    // The same response written twice (one line per content block), and a title.
    writeFileSync(
      main,
      assistant('a', 'sid-1') +
        assistant('a', 'sid-1') +
        `${JSON.stringify({ type: 'custom-title', customTitle: 'Fix the build', sessionId: 'sid-1' })}\n`
    );
    const subagents = join(project, 'sid-1', 'subagents');
    mkdirSync(subagents, { recursive: true });
    writeFileSync(join(subagents, 'agent-x.meta.json'), '{"agentType":"Explore"}');
    writeFileSync(
      join(subagents, 'agent-x.jsonl'),
      assistant('b', 'sid-1', { isSidechain: true, agentId: 'x' })
    );
    // A workflow's agents are a folder further down.
    const workflow = join(subagents, 'workflows', 'wf_1');
    mkdirSync(workflow, { recursive: true });
    writeFileSync(join(workflow, 'agent-y.meta.json'), '{"agentType":"Reviewer"}');
    writeFileSync(
      join(workflow, 'agent-y.jsonl'),
      assistant('w', 'sid-1', { isSidechain: true, agentId: 'y' })
    );

    const { reader, usage } = office();
    let day = await today(usage);
    expect(reader.size).toBe(3);
    expect(day.requests).toBe(3);
    // 1000 in at $4 and 1000 out at $20, per million, three times.
    expect(day.cost).toBeCloseTo(0.072);
    expect(day.agents.map((r) => r.label).sort()).toEqual(['Explore', 'Lead', 'Reviewer']);
    expect(day.sessions).toMatchObject([
      { id: 'claude:sid-1', harness: 'claude', label: 'Fix the build', detail: 'demo' },
    ]);

    // A line written in two halves, split inside a multi-byte character.
    const next = Buffer.from(assistant('c', 'sid-1'));
    const cut = next.indexOf(Buffer.from('ç')) + 1;
    appendFileSync(main, next.subarray(0, cut));
    day = await today(usage);
    expect(day.requests).toBe(3);
    appendFileSync(main, next.subarray(cut));
    day = await today(usage);
    expect(day.requests).toBe(4);
  });

  it("names an untitled session from the office's recording, else its project", async () => {
    writeFileSync(join(project, 'sid-2.jsonl'), assistant('d', 'sid-2') + assistant('e', 'sid-3'));
    const { usage } = office(async (sid) => (sid === 'sid-2' ? 'Desktop title' : undefined));
    const day = await today(usage);
    expect(day.sessions.map((r) => r.label).sort()).toEqual(['Desktop title', 'demo']);
  });

  it('reuses a recent read', async () => {
    const { usage } = office(undefined, 60_000);
    const now = Date.now();
    expect((await today(usage, now)).requests).toBe(0);
    writeFileSync(join(project, 'sid-4.jsonl'), assistant('f', 'sid-4'));
    expect((await today(usage, now + 1000)).requests).toBe(0);
    expect((await today(usage, now + 61_000)).requests).toBe(1);
  });

  it('reads nothing, without failing, when there are no transcripts', async () => {
    const usage = new OfficeUsage([new ClaudeCodeUsage([join(root, 'missing')])], 0);
    expect((await usage.report(Date.now())).allTime.requests).toBe(0);
  });

  it("adds another harness's reader into the same report, kept apart", async () => {
    writeFileSync(join(project, 'sid-5.jsonl'), assistant('h', 'sid-5'));
    const other: UsageReader = {
      harness: 'other',
      refresh: async () => undefined,
      entries: () => [
        {
          harness: 'other',
          key: 'o1',
          ts: Date.now(),
          session: 'o-session',
          agent: 'lead',
          model: 'some-model',
          tokens: { input: 1, output: 1, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 },
          cost: 0,
          priced: false,
        },
      ],
      sessionLabel: () => ({ label: 'Other session' }),
    };
    const usage = new OfficeUsage([new ClaudeCodeUsage([root], async () => undefined), other], 0);
    const report = await usage.report(Date.now());
    const day = report.days[report.days.length - 1];
    expect(report.harnesses.map((h) => h.label)).toEqual(['Claude Code', 'other']);
    expect(day.sessions.map((r) => r.label).sort()).toEqual(['Other session', 'demo']);
    expect(day.agents.map((r) => r.id).sort()).toEqual(['claude:lead', 'other:lead']);
    expect(report.unpriced).toEqual(['some-model']);
  });

  it('is the usage reader the claude harness brings', () => {
    expect(harnessFor('claude')?.usage?.()).toBeInstanceOf(ClaudeCodeUsage);
    expect(usageReaders().map((r) => r.harness)).toEqual(['claude']);
  });
});

describe('/api/usage', () => {
  let running: RunningServer | null = null;

  afterEach(() => {
    running?.close();
    running = null;
  });

  const status = (url: string): Promise<{ code: number; body: string }> =>
    new Promise((resolve, reject) => {
      get(url, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => resolve({ code: res.statusCode ?? 0, body }));
      }).on('error', reject);
    });

  it('serves the report from its usage source', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agentopia-usage-'));
    mkdirSync(join(root, 'p'));
    writeFileSync(join(root, 'p', 's.jsonl'), assistant('g', 's'));
    running = await startOfficeServer({
      viewerDist: root,
      port: 0,
      usage: new OfficeUsage([new ClaudeCodeUsage([root], async () => undefined)], 0),
    });
    const { code, body } = await status(`${running.url}/api/usage`);
    expect(code).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ allTime: { requests: 1 } });
    rmSync(root, { recursive: true, force: true });
  });

  it('is not found with no usage source', async () => {
    running = await startOfficeServer({ viewerDist: tmpdir(), port: 0, usage: null });
    expect((await status(`${running.url}/api/usage`)).code).toBe(404);
  });
});
