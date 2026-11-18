import {
  CLAUDE_WINDOW,
  CLAUDE_WINDOW_1M,
  apportion,
  claudeCodeContext,
  claudeContextWindow,
  contextFill,
} from '../context';

let n = 0;
const ts = (): string => new Date(Date.UTC(2026, 10, 17, 12, 0, n)).toISOString();
const line = (record: Record<string, unknown>): string =>
  JSON.stringify({ uuid: `u${++n}`, sessionId: 's1', timestamp: ts(), ...record });

const shape = (system: string, tools: Array<{ name: string; size: number }>): string =>
  line({
    type: 'api-request-shape',
    shape: {
      system: [{ type: 'text', text: system }],
      tools: tools.map((t) => ({ name: t.name, description: 'x'.repeat(t.size) })),
    },
  });

const prompt = (text: string, extra: Record<string, unknown> = {}): string =>
  line({ type: 'user', message: { role: 'user', content: text }, ...extra });

const toolResult = (text: string): string =>
  line({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: text }] },
  });

const attachment = (type: string, text: string): string =>
  line({ type: 'attachment', attachment: { type }, rendered: [{ content: text }] });

const reply = (
  id: string,
  usage: { prompt: number; output: number },
  content: unknown[] = [{ type: 'text', text: 'ok' }],
  model = 'claude-opus-5-5'
): string =>
  line({
    type: 'assistant',
    message: {
      id,
      model,
      role: 'assistant',
      content,
      usage: {
        input_tokens: 2,
        cache_read_input_tokens: usage.prompt - 2,
        cache_creation_input_tokens: 0,
        output_tokens: usage.output,
      },
    },
  });

const fold = (lines: string[]) => {
  const f = claudeCodeContext.fold('s1');
  for (const l of lines) {
    f.take(l);
  }
  return f;
};

const total = (slices: Array<{ tokens: number }>): number =>
  slices.reduce((acc, s) => acc + s.tokens, 0);

describe('claude context fold', () => {
  it('reports nothing before the first response', () => {
    expect(fold([prompt('hi')]).report()).toBeNull();
  });

  it('measures the latest prompt plus its reply, and splits it to the token', () => {
    const report = fold([
      shape('s'.repeat(3000), [
        { name: 'Bash', size: 2000 },
        { name: 'mcp__docs__read', size: 1000 },
      ]),
      attachment('instructions', 'm'.repeat(1000)),
      prompt('p'.repeat(1000)),
      reply('r1', { prompt: 3000, output: 200 }),
      toolResult('t'.repeat(4000)),
      reply('r2', { prompt: 5000, output: 300 }),
    ]).report();

    expect(report).toMatchObject({ used: 5300, estimated: false, turns: 1, window: CLAUDE_WINDOW });
    expect(total(report?.slices ?? [])).toBe(5300);
    const tokens = Object.fromEntries((report?.slices ?? []).map((s) => [s.part, s.tokens]));
    // About 8000 characters of set-up and opening came to 3000 tokens.
    expect(tokens.system).toBeGreaterThan(1090);
    expect(tokens.system).toBeLessThan(1130);
    expect(tokens.tools).toBeGreaterThan(tokens.mcp);
    expect(tokens.replies).toBe(500);
    expect(tokens.results).toBeGreaterThan(tokens.prompts);
    expect(tokens.memory).toBe(tokens.prompts);
  });

  it('counts a response written once per content block once', () => {
    const report = fold([
      shape('s'.repeat(100), []),
      prompt('go'),
      reply('r1', { prompt: 1000, output: 50 }, [{ type: 'text', text: 'looking' }]),
      reply('r1', { prompt: 1000, output: 50 }, [
        { type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } },
      ]),
    ]).report();
    const parts = (report?.slices ?? []).map((s) => s.part);
    expect(report?.used).toBe(1050);
    expect(parts).toEqual(expect.arrayContaining(['replies', 'calls']));
    expect(total(report?.slices ?? [])).toBe(1050);
  });

  it('guesses the set-up as one part when the transcript does not say', () => {
    const report = fold([
      prompt('p'.repeat(300)),
      reply('r1', { prompt: 20_000, output: 10 }),
    ]).report();
    expect(report?.estimated).toBe(true);
    expect(report?.slices[0]).toMatchObject({ part: 'system', label: 'System prompt & tools' });
    expect(report?.slices[0].tokens).toBe(19_900);
  });

  it('starts the conversation again after a compaction, keeping the set-up', () => {
    const report = fold([
      shape('s'.repeat(1000), []),
      prompt('p'.repeat(1000)),
      reply('r1', { prompt: 2000, output: 100 }),
      toolResult('t'.repeat(90_000)),
      reply('r2', { prompt: 40_000, output: 100 }),
      line({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto' } }),
      prompt('summary '.repeat(200), { isCompactSummary: true }),
      reply('r3', { prompt: 3000, output: 100 }),
    ]).report();
    const parts = (report?.slices ?? []).map((s) => s.part);
    expect(report).toMatchObject({ used: 3100, compactions: 1, peak: 40_100, turns: 0 });
    expect(parts).toContain('summary');
    expect(parts).not.toContain('results');
    expect(total(report?.slices ?? [])).toBe(3100);
  });

  it('skips sidechain, synthetic and unreadable lines without throwing', () => {
    const f = fold([
      'not json',
      '{"type":"assistant"}',
      line({
        type: 'assistant',
        isSidechain: true,
        message: { id: 'x', usage: { input_tokens: 9 } },
      }),
      reply('syn', { prompt: 50, output: 0 }, [], '<synthetic>'),
    ]);
    expect(f.report()).toBeNull();
  });
});

describe('claudeContextWindow', () => {
  it.each([
    ['a 1m id', 'claude-opus-5-5[1m]', 1000, undefined, CLAUDE_WINDOW_1M],
    ['the standard window', 'claude-opus-5-5', 1000, undefined, CLAUDE_WINDOW],
    ['a session past 200k', 'claude-opus-5-5', 250_000, undefined, CLAUDE_WINDOW_1M],
    ['a configured hint', 'claude-opus-5-5', 1000, CLAUDE_WINDOW_1M, CLAUDE_WINDOW_1M],
  ])('reads %s', (_name, model, peak, hint, expected) => {
    expect(claudeContextWindow(model, peak, hint)).toBe(expected);
  });
});

describe('apportion', () => {
  it.each([
    [
      10,
      [
        ['a', 1],
        ['b', 1],
        ['c', 1],
      ] as const,
    ],
    [
      7,
      [
        ['a', 3],
        ['b', 0],
        ['c', 5],
      ] as const,
    ],
    [
      1_000_003,
      [
        ['a', 0.1],
        ['b', 0.2],
      ] as const,
    ],
  ])('splits %d into whole tokens that add up', (whole, weights) => {
    const out = apportion(whole, weights);
    expect([...out.values()].reduce((a, b) => a + b, 0)).toBe(whole);
    for (const [key, weight] of weights) {
      expect(out.has(key)).toBe(weight > 0);
    }
  });

  it('gives nothing when nothing weighs anything', () => {
    expect(apportion(10, [['a', 0]]).size).toBe(0);
  });
});

describe('contextFill', () => {
  it.each([
    [{ used: 50, window: 100 }, 0.5],
    [{ used: 500, window: 100 }, 1],
    [{ used: 5, window: 0 }, 0],
  ])('reads %o as %d', (glance, fill) => {
    expect(contextFill(glance)).toBe(fill);
  });
});
