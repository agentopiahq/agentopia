import { PRICE_PROVIDERS, cliAgent, trimPrices } from '@/prices';

describe('PRICE_PROVIDERS', () => {
  it('names the provider every priced harness reads', () => {
    expect(PRICE_PROVIDERS).toContain('anthropic');
    expect(new Set(PRICE_PROVIDERS).size).toBe(PRICE_PROVIDERS.length);
  });
});

describe('trimPrices', () => {
  const api = {
    anthropic: { models: { 'claude-opus-5-5': { cost: { input: 3 } } } },
    openai: { models: {} },
    broken: 'not an object',
  };

  it('keeps only the providers asked for, as models.dev gave them', () => {
    expect(trimPrices(api, ['anthropic', 'missing'])).toEqual({ anthropic: api.anthropic });
  });

  it('keeps the harnesses’ providers by default', () => {
    expect(Object.keys(trimPrices(api) ?? {})).toEqual(['anthropic']);
  });

  it.each([
    ['no wanted provider', { openai: {} }],
    ['a provider that is not an object', { anthropic: 'x' }],
    ['an array', []],
    ['null', null],
    ['a string', 'api'],
  ])('is null for %s', (_, input) => {
    expect(trimPrices(input, ['anthropic'])).toBeNull();
  });
});

describe('cliAgent', () => {
  it.each([
    ['agentopia/0.3.0 (darwin; arm64)', 'agentopia/0.3.0 (darwin; arm64)'],
    ['agentopia/1.2.3-beta.1 (linux; x64)', 'agentopia/1.2.3-beta.1 (linux; x64)'],
    ['agentopia/0.3.0 (darwin; arm64) 203.0.113.7', 'other'],
    ['Mozilla/5.0', 'other'],
    ['', 'other'],
    [null, 'other'],
  ])('reads %p as %p', (ua, expected) => {
    expect(cliAgent(ua)).toBe(expected);
  });
});
