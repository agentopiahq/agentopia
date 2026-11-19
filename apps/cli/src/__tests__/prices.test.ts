import { priceIn } from '@agentopia/core';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MODELS_DEV_RETRY_MS,
  MODELS_DEV_TTL_MS,
  MODELS_DEV_URL,
  ModelsDevOptions,
  ModelsDevPrices,
  PRICES_URL,
  priceUrls,
} from '../usage';
import { USER_AGENT } from '../version';

const OURS = 'https://prices.test/api/prices';
const THEIRS = 'https://models.test/api.json';

const API = {
  anthropic: {
    models: { 'claude-opus-5-5': { cost: { input: 3, output: 15, cache_read: 0.3 } } },
  },
  openai: { models: { 'gpt-x': { cost: { input: 1, output: 2 } } } },
};

describe('ModelsDevPrices', () => {
  let dir: string;
  let calls: number;
  let asked: string[];
  const ok = async (url: string) => {
    calls++;
    asked.push(url);
    return { ok: true, json: async () => API };
  };
  const down = async (url: string) => {
    calls++;
    asked.push(url);
    throw new Error('offline');
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentopia-prices-'));
    calls = 0;
    asked = [];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const prices = (fetch: (url: string) => Promise<unknown> = ok) =>
    new ModelsDevPrices(['claude'], {
      cachePath: join(dir, 'models.dev.json'),
      fetch: fetch as NonNullable<ModelsDevOptions['fetch']>,
      urls: [OURS, THEIRS],
    });

  it('uses the bundled table until it has fetched', () => {
    const p = prices();
    expect(p.source()).toEqual({ source: 'bundled' });
    expect(priceIn(p.tableFor('claude')!, 'claude-opus-5-5')?.input).toBe(4);
  });

  it('fetches once a day, lays the prices over the bundled table, and keeps only its provider', async () => {
    const p = prices();
    await p.refresh(1000);
    expect(p.source()).toEqual({ source: 'models.dev', at: 1000 });
    const table = p.tableFor('claude')!;
    expect(priceIn(table, 'claude-opus-5-5')).toMatchObject({ input: 3, fast: 2 });
    // A model models.dev no longer lists keeps its bundled price.
    expect(priceIn(table, 'claude-3-opus')?.input).toBe(15);

    const kept = JSON.parse(readFileSync(join(dir, 'models.dev.json'), 'utf8'));
    expect(Object.keys(kept.providers)).toEqual(['anthropic']);

    await p.refresh(1000 + MODELS_DEV_TTL_MS - 1);
    expect(asked).toEqual([OURS]);
    await p.refresh(1000 + MODELS_DEV_TTL_MS);
    expect(asked).toEqual([OURS, OURS]);
  });

  it('asks agentopia.town first, and models.dev only when it fails', async () => {
    const p = prices(async (url) => {
      asked.push(url);
      if (url === OURS) {
        return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => API };
    });
    await p.refresh(1000);
    expect(asked).toEqual([OURS, THEIRS]);
    expect(p.source()).toEqual({ source: 'models.dev', at: 1000 });
    expect(priceIn(p.tableFor('claude')!, 'claude-opus-5-5')?.input).toBe(3);
  });

  it('names itself, and only itself, in the request', async () => {
    const inits: unknown[] = [];
    const p = new ModelsDevPrices(['claude'], {
      cachePath: join(dir, 'models.dev.json'),
      fetch: async (_url, init) => {
        inits.push(init.headers);
        return { ok: true, json: async () => API };
      },
      urls: [OURS],
    });
    await p.refresh(0);
    expect(inits).toEqual([{ 'User-Agent': USER_AGENT }]);
    expect(USER_AGENT).toMatch(/^agentopia\/\d+\.\d+\.\d+\S* \([a-z0-9]+; [a-z0-9]+\)$/);
  });

  it('starts from the copy it kept, even with no network', async () => {
    await prices().refresh(1000);
    const later = prices(down);
    await later.refresh(1000 + 2 * MODELS_DEV_TTL_MS);
    expect(later.source()).toEqual({ source: 'models.dev', at: 1000 });
    expect(priceIn(later.tableFor('claude')!, 'claude-opus-5-5')?.input).toBe(3);
  });

  it('waits an hour before trying again after a failed fetch', async () => {
    const p = prices(down);
    await p.refresh(0);
    expect(asked).toEqual([OURS, THEIRS]);
    await p.refresh(MODELS_DEV_RETRY_MS - 1);
    expect(calls).toBe(2);
    await p.refresh(MODELS_DEV_RETRY_MS);
    expect(calls).toBe(4);
    expect(p.source()).toEqual({ source: 'bundled' });
  });

  it.each([
    ['an error status', async () => ({ ok: false, json: async () => API })],
    ['no provider it wants', async () => ({ ok: true, json: async () => ({ openai: {} }) })],
    ['malformed JSON', async () => ({ ok: true, json: async () => JSON.parse('{') })],
  ])('keeps the bundled prices after %s', async (_, fetch) => {
    const p = prices(fetch);
    await p.refresh(0);
    expect(p.source()).toEqual({ source: 'bundled' });
  });
});

describe('priceUrls', () => {
  it.each([
    [{}, [PRICES_URL, MODELS_DEV_URL]],
    [{ AGENTOPIA_PRICES_URL: '' }, [PRICES_URL, MODELS_DEV_URL]],
    [
      { AGENTOPIA_PRICES_URL: 'http://localhost:3000/api/prices' },
      ['http://localhost:3000/api/prices', MODELS_DEV_URL],
    ],
  ])('asks %p in order %p', (env, expected) => {
    expect(priceUrls(env)).toEqual(expected);
  });

  it('asks agentopia.town on its canonical host', () => {
    expect(PRICES_URL).toBe('https://www.agentopia.town/api/prices');
  });
});
