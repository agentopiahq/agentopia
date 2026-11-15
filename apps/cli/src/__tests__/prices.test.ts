import { priceIn } from '@agentopia/core';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MODELS_DEV_RETRY_MS, MODELS_DEV_TTL_MS, ModelsDevPrices } from '../usage';

const API = {
  anthropic: {
    models: { 'claude-opus-5-5': { cost: { input: 3, output: 15, cache_read: 0.3 } } },
  },
  openai: { models: { 'gpt-x': { cost: { input: 1, output: 2 } } } },
};

describe('ModelsDevPrices', () => {
  let dir: string;
  let calls: number;
  const ok = async () => {
    calls++;
    return { ok: true, json: async () => API };
  };
  const down = async () => {
    calls++;
    throw new Error('offline');
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentopia-prices-'));
    calls = 0;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const prices = (fetch = ok) =>
    new ModelsDevPrices(['claude'], { cachePath: join(dir, 'models.dev.json'), fetch });

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
    expect(calls).toBe(1);
    await p.refresh(1000 + MODELS_DEV_TTL_MS);
    expect(calls).toBe(2);
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
    await p.refresh(MODELS_DEV_RETRY_MS - 1);
    expect(calls).toBe(1);
    await p.refresh(MODELS_DEV_RETRY_MS);
    expect(calls).toBe(2);
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
