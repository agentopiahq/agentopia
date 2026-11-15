import {
  CLAUDE_PRICES,
  LEAD_AGENT,
  PriceTable,
  TokenCounts,
  UsageEntry,
  UsageLineContext,
  buildUsageReport,
  claudeAgentTypeFromMeta,
  claudeCodeUsage,
  costIn,
  fromModelsDev,
  overlay,
  priceIn,
  usageAdapterFor,
} from '../usage';

const ZERO: TokenCounts = { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
const priceFor = (model: string) => priceIn(CLAUDE_PRICES, model);
const costOf = (model: string, tokens: TokenCounts, fast = false) =>
  costIn(CLAUDE_PRICES, model, tokens, fast);
const usageFromLine = (line: string, context?: UsageLineContext): UsageEntry | null => {
  const fact = claudeCodeUsage.read(line, context);
  return fact?.kind === 'usage' ? fact.entry : null;
};

/** An assistant line shaped the way Claude Code writes one. */
function line(over: {
  id?: string;
  req?: string;
  ts?: string;
  model?: string;
  sid?: string;
  sidechain?: boolean;
  attribution?: string;
  usage?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    parentUuid: 'p',
    isSidechain: over.sidechain ?? false,
    ...(over.attribution ? { attributionAgent: over.attribution } : {}),
    message: {
      model: over.model ?? 'claude-opus-5-5',
      id: over.id ?? 'msg_1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'hi' }],
      usage: over.usage ?? {
        input_tokens: 10,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 20000,
        output_tokens: 500,
        cache_creation: { ephemeral_1h_input_tokens: 1000, ephemeral_5m_input_tokens: 0 },
        speed: 'standard',
      },
    },
    requestId: over.req ?? 'req_1',
    type: 'assistant',
    uuid: 'u1',
    timestamp: over.ts ?? '2026-11-14T12:00:00.000Z',
    cwd: '/Users/me/git/demo',
    sessionId: over.sid ?? 'sess-a',
  });
}

describe('priceFor', () => {
  it.each([
    ['claude-opus-5-5', 4],
    ['claude-opus-5', 5],
    ['claude-fable-5-1', 10],
    ['claude-haiku-4-5-20251001', 1],
    ['claude-sonnet-4-5-20250929', 3],
    ['claude-3-5-haiku-20241022', 0.8],
    ['claude-opus-4-20250514', 15],
  ])('prices %s at $%d per million input tokens', (model, input) => {
    expect(priceFor(model)?.input).toBe(input);
  });

  it.each([['haiku'], ['gpt-5'], ['claude-opus-45']])('leaves %s unpriced', (model) => {
    expect(priceFor(model)).toBeNull();
  });
});

describe('costOf', () => {
  const tokens = { input: 1e6, output: 1e6, cacheWrite5m: 1e6, cacheWrite1h: 1e6, cacheRead: 1e6 };

  it('adds every kind of token at its own rate', () => {
    // Opus 5.5: 4 in, 20 out, 5 for a 5m write, 8 for a 1h write, 0.2 read.
    expect(costOf('claude-opus-5-5', tokens)).toBeCloseTo(37.2);
  });

  it('doubles for fast mode where the model has it', () => {
    expect(costOf('claude-opus-5-5', tokens, true)).toBeCloseTo(74.4);
    expect(costOf('claude-sonnet-5-5', tokens, true)).toBe(costOf('claude-sonnet-5-5', tokens));
  });

  it('bills a long Haiku 5.5 prompt at the long rate', () => {
    const short = { input: 50_000, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
    const long = { ...short, input: 200_000 };
    expect(costOf('claude-haiku-5-5', short)).toBeCloseTo(0.005);
    expect(costOf('claude-haiku-5-5', long)).toBeCloseTo(0.1);
  });
});

describe('usageFromLine', () => {
  it('reads the tokens, the cost and who did the work', () => {
    const entry = usageFromLine(line({}));
    expect(entry).toMatchObject({
      harness: 'claude',
      key: 'msg_1:req_1',
      session: 'sess-a',
      agent: LEAD_AGENT,
      model: 'claude-opus-5-5',
      tokens: { input: 10, output: 500, cacheWrite5m: 0, cacheWrite1h: 1000, cacheRead: 20000 },
      cwd: '/Users/me/git/demo',
    });
    expect(entry?.fast).toBeUndefined();
  });

  it('marks a fast-mode response', () => {
    const fast = { input_tokens: 1, output_tokens: 1, speed: 'fast' };
    expect(usageFromLine(line({ usage: fast }))?.fast).toBe(true);
  });

  it('counts an unsplit cache write as 5-minute', () => {
    const entry = usageFromLine(
      line({ usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 300 } })
    );
    expect(entry?.tokens).toMatchObject({ cacheWrite5m: 300, cacheWrite1h: 0, cacheRead: 0 });
  });

  it.each([
    ['the file says', { sidechain: true, attribution: 'Plan' }, { agent: 'Explore' }, 'Explore'],
    ['the line says', { sidechain: true, attribution: 'Plan' }, {}, 'Plan'],
    ['nobody says', { sidechain: true }, {}, 'subagent'],
  ])('names a subagent as %s', (_, over, context, agent) => {
    expect(usageFromLine(line(over), context)?.agent).toBe(agent);
  });

  it('keeps an unknown model, to be reported as unpriced', () => {
    expect(usageFromLine(line({ model: 'haiku' }))?.model).toBe('haiku');
  });

  it.each([
    ['a user turn', JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } })],
    ['a torn line', line({}).slice(0, 120)],
    ['a synthetic message', line({ model: '<synthetic>' })],
    ['no timestamp', line({ ts: 'never' })],
    ['an empty line', ''],
  ])('ignores %s', (_, text) => {
    expect(usageFromLine(text)).toBeNull();
  });
});

describe('claudeCodeUsage', () => {
  it('is the usage adapter for the claude harness', () => {
    expect(usageAdapterFor('claude')).toBe(claudeCodeUsage);
    expect(usageAdapterFor('codex')).toBeNull();
    expect(claudeCodeUsage.modelLabel?.('claude-opus-5-5')).toBe('opus-5-5');
  });

  it('reads a session title', () => {
    const text = JSON.stringify({ type: 'custom-title', customTitle: 'Fix it ', sessionId: 's' });
    expect(claudeCodeUsage.read(text)).toEqual({ kind: 'title', session: 's', title: 'Fix it' });
  });

  it('reads a subagent type', () => {
    expect(claudeAgentTypeFromMeta('{"agentType":"Explore","description":"x"}')).toBe('Explore');
    expect(claudeAgentTypeFromMeta('nope')).toBeUndefined();
  });
});

describe('buildUsageReport', () => {
  // Every model here bills a dollar an output token and nothing else, so an
  // entry costs what it says.
  const flat = { input: 0, output: 1e6, write5m: 0, write1h: 0, read: 0 };
  const TABLE: PriceTable = {
    prefix: 'claude-',
    models: { 'opus-5-5': flat, 'fable-5-1': flat, 'gpt-x': flat },
  };
  const pricesFor = (): PriceTable => TABLE;
  const at = (
    iso: string,
    { cost = 1, ...over }: Partial<UsageEntry> & { cost?: number } = {}
  ): UsageEntry => ({
    harness: 'claude',
    key: iso,
    ts: Date.parse(iso),
    session: 'a',
    agent: LEAD_AGENT,
    model: 'claude-opus-5-5',
    tokens: { input: 1, output: cost, cacheWrite5m: 3, cacheWrite1h: 4, cacheRead: 10 },
    ...over,
  });
  // Saturday 14 November 2026, midday UTC.
  const now = Date.parse('2026-11-14T12:00:00Z');

  it('adds each entry into its day, week and month, newest period last', () => {
    const report = buildUsageReport(
      [
        at('2026-11-14T08:00:00Z'),
        at('2026-11-14T09:00:00Z', { agent: 'Explore', cost: 2, session: 'b' }),
        at('2026-11-09T09:00:00Z', { model: 'claude-fable-5-1', cost: 4 }),
        at('2026-10-31T09:00:00Z', { cost: 8 }),
      ],
      { now, days: 7, weeks: 3, months: 2, pricesFor }
    );
    expect(report.days.map((d) => d.key)).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
    const today = report.days[6];
    expect(today).toMatchObject({ label: 'Nov 14', cost: 3, requests: 2, tokens: 39 });
    expect(today.agents.map((r) => [r.label, r.cost])).toEqual([
      ['Explore', 2],
      ['Lead', 1],
    ]);
    // Weeks start on Monday: the 9th opens this week, the 2nd the one before.
    expect(report.weeks.map((w) => [w.key, w.cost])).toEqual([
      ['2026-10-26', 8],
      ['2026-11-02', 0],
      ['2026-11-09', 7],
    ]);
    expect(report.months.map((m) => [m.key, m.label, m.cost])).toEqual([
      ['2026-10', 'Oct', 8],
      ['2026-11', 'Nov', 7],
    ]);
    expect(report.months[1].models.map((r) => r.label)).toEqual(['fable-5-1', 'opus-5-5']);
    expect(report.allTime.cost).toBe(15);
  });

  it('buckets by the local calendar, not UTC', () => {
    // 02:00 UTC on the 14th is still the evening of the 13th in New York.
    const report = buildUsageReport([at('2026-11-14T02:00:00Z')], {
      now,
      days: 2,
      offsetOf: () => -5 * 60,
      pricesFor,
    });
    expect(report.days.map((d) => [d.key, d.cost])).toEqual([
      ['2026-11-13', 1],
      ['2026-11-14', 0],
    ]);
  });

  it('lists the top sessions with their names, and counts the rest', () => {
    const entries = ['a', 'b', 'c'].map((s, i) =>
      at(`2026-11-14T0${i}:00:00Z`, { session: s, cost: i + 1, key: s })
    );
    const report = buildUsageReport(entries, {
      now,
      days: 1,
      topSessions: 2,
      pricesFor,
      sessionLabel: (_, id) => ({ label: `Session ${id}`, detail: 'demo' }),
    });
    const [today] = report.days;
    expect(today.sessions.map((r) => r.label)).toEqual(['Session c', 'Session b']);
    expect(today.sessions[0].detail).toBe('demo');
    expect(today.moreSessions).toBe(1);
  });

  it('keeps each harness apart, and names the harness of each agent once there are two', () => {
    const report = buildUsageReport(
      [
        at('2026-11-14T08:00:00Z', { cost: 3 }),
        at('2026-11-14T09:00:00Z', { harness: 'codex', model: 'gpt-x', cost: 1, key: 'c' }),
      ],
      {
        now,
        days: 1,
        pricesFor,
        harnessLabel: (h) => (h === 'codex' ? 'Codex' : 'Claude Code'),
      }
    );
    const [today] = report.days;
    expect(today.harnesses.map((r) => [r.label, r.cost])).toEqual([
      ['Claude Code', 3],
      ['Codex', 1],
    ]);
    expect(today.agents.map((r) => [r.id, r.label, r.detail])).toEqual([
      ['claude:lead', 'Lead', 'Claude Code'],
      ['codex:lead', 'Lead', 'Codex'],
    ]);
    expect(report.harnesses.map((h) => h.id)).toEqual(['claude', 'codex']);
  });

  it('labels a single harness by its adapter, with no second line on agents', () => {
    const report = buildUsageReport([at('2026-11-14T08:00:00Z')], { now, days: 1 });
    expect(report.harnesses).toEqual([{ id: 'claude', label: 'Claude Code' }]);
    expect(report.days[0].agents[0].detail).toBeUndefined();
    expect(report.days[0].models[0].label).toBe('opus-5-5');
  });

  it('names the models it could not price, at no cost', () => {
    const report = buildUsageReport([at('2026-11-14T08:00:00Z', { model: 'x' })], {
      now,
      pricesFor,
    });
    expect(report.unpriced).toEqual(['x']);
    expect(report.allTime.cost).toBe(0);
  });

  it("prices with the harness's own bundled table unless told otherwise", () => {
    const report = buildUsageReport(
      [at('2026-11-14T08:00:00Z', { tokens: { ...ZERO, output: 1e6 } })],
      { now }
    );
    // Opus 5.5's $20 per million output tokens, from CLAUDE_PRICES.
    expect(report.allTime.cost).toBeCloseTo(20);
  });
});

describe('fromModelsDev and overlay', () => {
  // The shape of models.dev's api.json, cut down to one provider.
  const api = {
    anthropic: {
      id: 'anthropic',
      models: {
        'claude-opus-5-5': {
          id: 'claude-opus-5-5',
          cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
        },
        'claude-haiku-5-5': {
          cost: {
            input: 0.1,
            output: 0.5,
            tiers: [{ input: 0.5, output: 2.5, tier: { type: 'context', size: 100000 } }],
          },
        },
        'claude-new-6': { cost: { input: 9, output: 45 } },
        'claude-broken': { cost: { input: 'free' } },
      },
    },
  };

  it("reads a provider's models, keyed as the bundled table keys them", () => {
    const table = fromModelsDev(api, 'anthropic', CLAUDE_PRICES);
    expect(Object.keys(table.models).sort()).toEqual(['haiku-5-5', 'new-6', 'opus-5-5']);
    expect(table.models['opus-5-5']).toEqual({
      input: 3,
      output: 15,
      write5m: 3.75,
      // models.dev has no 1-hour rate: twice input, as billed.
      write1h: 6,
      read: 0.3,
    });
    expect(table.models['new-6']).toMatchObject({ write5m: 11.25, read: 0.9 });
    expect(table.models['haiku-5-5']).toMatchObject({ longAbove: 100000, long: { input: 0.5 } });
  });

  it.each([[null], ['nope'], [{}], [{ anthropic: { models: 7 } }]])(
    'reads nothing from %p, without throwing',
    (bad) => {
      expect(fromModelsDev(bad, 'anthropic', CLAUDE_PRICES).models).toEqual({});
    }
  );

  it('lays fresh prices over the bundled ones, keeping what only the bundled table knows', () => {
    const merged = overlay(fromModelsDev(api, 'anthropic', CLAUDE_PRICES), CLAUDE_PRICES);
    expect(priceIn(merged, 'claude-opus-5-5')).toMatchObject({ input: 3, fast: 2 });
    expect(priceIn(merged, 'claude-new-6')?.input).toBe(9);
    // Retired models models.dev no longer lists keep their bundled price.
    expect(priceIn(merged, 'claude-3-opus-20240229')?.input).toBe(15);
  });
});
