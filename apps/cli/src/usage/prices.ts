import {
  PriceTable,
  UsagePricesSource,
  fromModelsDev,
  overlay,
  usageAdapterFor,
} from '@agentopia/core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { agentopiaHome } from '../paths';

/**
 * Model prices for the usage board, fresh from models.dev
 * (https://github.com/anomalyco/models.dev), laid over each harness's
 * bundled table.
 *
 * models.dev's API is one public JSON file of every provider's models and
 * prices. The office server fetches it at most once a day, sending nothing
 * about you (a plain GET, no query), keeps the providers it needs in
 * `~/.agentopia/cache/models.dev.json`, and reprices every usage entry from
 * it. Offline or blocked, it uses the last copy it kept, or the bundled
 * tables: usage is never held up by it.
 */

export const MODELS_DEV_URL = 'https://models.dev/api.json';
/** How long fetched prices are good for. */
export const MODELS_DEV_TTL_MS = 24 * 60 * 60 * 1000;
/** After a failed fetch, how long before trying again. */
export const MODELS_DEV_RETRY_MS = 60 * 60 * 1000;
/** A fetch that takes longer than this is given up on. */
const FETCH_TIMEOUT_MS = 10_000;

/** Where a usage report's prices come from. */
export interface PriceSource {
  /** Freshen the prices if they are due. Never throws. */
  refresh(now: number): Promise<void>;
  /** A harness's prices now. */
  tableFor(harness: string): PriceTable | undefined;
  /** Where they came from, for the ledger to say. */
  source(): UsagePricesSource;
}

/** Each harness's bundled table, and nothing else: prices with no network at all. */
export const bundledPrices: PriceSource = {
  refresh: () => Promise.resolve(),
  tableFor: (harness) => usageAdapterFor(harness)?.prices,
  source: () => ({ source: 'bundled' }),
};

/** What is kept on disk: the providers wanted, as models.dev gave them, and when. */
interface Kept {
  fetchedAt: number;
  providers: Record<string, unknown>;
}

export interface ModelsDevOptions {
  /** Where the fetched prices are kept between runs. */
  cachePath?: string;
  /** The fetch to use (tests). */
  fetch?: (
    url: string,
    init: { signal: AbortSignal }
  ) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  url?: string;
}

export class ModelsDevPrices implements PriceSource {
  private tables = new Map<string, PriceTable>();
  private fetchedAt: number | null = null;
  private triedAt = -Infinity;
  private loaded = false;
  private readonly cachePath: string;
  private readonly fetch: NonNullable<ModelsDevOptions['fetch']>;
  private readonly url: string;

  /** @param harnesses the harnesses to price, each by its usage adapter */
  constructor(
    private readonly harnesses: string[],
    options: ModelsDevOptions = {}
  ) {
    this.cachePath = options.cachePath ?? join(agentopiaHome(), 'cache', 'models.dev.json');
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.url = options.url ?? MODELS_DEV_URL;
  }

  tableFor(harness: string): PriceTable | undefined {
    return this.tables.get(harness) ?? usageAdapterFor(harness)?.prices;
  }

  source(): UsagePricesSource {
    return this.fetchedAt === null
      ? { source: 'bundled' }
      : { source: 'models.dev', at: this.fetchedAt };
  }

  async refresh(now: number): Promise<void> {
    if (!this.loaded) {
      this.loaded = true;
      await this.load();
    }
    const fresh = this.fetchedAt !== null && now - this.fetchedAt < MODELS_DEV_TTL_MS;
    if (fresh || now - this.triedAt < MODELS_DEV_RETRY_MS) {
      return;
    }
    this.triedAt = now;
    try {
      const res = await this.fetch(this.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        return;
      }
      const api = (await res.json()) as Record<string, unknown> | null;
      const providers: Record<string, unknown> = {};
      for (const provider of this.providers()) {
        if (api && typeof api === 'object' && provider in api) {
          providers[provider] = api[provider];
        }
      }
      if (Object.keys(providers).length === 0) {
        return;
      }
      const kept: Kept = { fetchedAt: now, providers };
      this.apply(kept);
      await mkdir(dirname(this.cachePath), { recursive: true });
      await writeFile(this.cachePath, JSON.stringify(kept));
    } catch {
      // Offline, blocked or malformed: keep what there is, try again later.
    }
  }

  /** The models.dev providers the harnesses want. */
  private providers(): string[] {
    return [
      ...new Set(
        this.harnesses.flatMap((h) => {
          const provider = usageAdapterFor(h)?.modelsDev?.provider;
          return provider ? [provider] : [];
        })
      ),
    ];
  }

  /** The copy kept from an earlier run, however old: better than none. */
  private async load(): Promise<void> {
    try {
      const kept = JSON.parse(await readFile(this.cachePath, 'utf8')) as Kept;
      if (
        typeof kept?.fetchedAt === 'number' &&
        kept.providers &&
        typeof kept.providers === 'object'
      ) {
        this.apply(kept);
      }
    } catch {
      // Nothing kept yet.
    }
  }

  private apply(kept: Kept): void {
    for (const harness of this.harnesses) {
      const adapter = usageAdapterFor(harness);
      const provider = adapter?.modelsDev?.provider;
      if (adapter && provider && kept.providers[provider]) {
        const fresh = fromModelsDev(kept.providers, provider, adapter.prices);
        this.tables.set(harness, overlay(fresh, adapter.prices));
      }
    }
    this.fetchedAt = kept.fetchedAt;
  }
}
