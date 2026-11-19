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
import { USER_AGENT } from '../version';

/**
 * Model prices for the usage board, fresh from models.dev
 * (https://github.com/anomalyco/models.dev), laid over each harness's
 * bundled table.
 *
 * models.dev's API is one public JSON file of every provider's models and
 * prices. The office server asks for it at most once a day — first from
 * agentopia.town's pass-through (`PRICES_URL`, the same shape cut down to
 * the providers the harnesses use), then from models.dev itself — sending
 * nothing about you but the CLI's version, OS and architecture (a plain GET,
 * no query). It keeps the providers it needs in
 * `~/.agentopia/cache/models.dev.json` and reprices every usage entry from
 * them. Offline or blocked, it uses the last copy it kept, or the bundled
 * tables: usage is never held up by it.
 */

/** agentopia.town's pass-through in front of models.dev (`apps/web`'s `/api/prices`). */
export const PRICES_URL = 'https://www.agentopia.town/api/prices';
export const MODELS_DEV_URL = 'https://models.dev/api.json';
/** How long fetched prices are good for. */
export const MODELS_DEV_TTL_MS = 24 * 60 * 60 * 1000;
/** After a failed fetch, how long before trying again. */
export const MODELS_DEV_RETRY_MS = 60 * 60 * 1000;
/** A fetch that takes longer than this is given up on. */
const FETCH_TIMEOUT_MS = 10_000;

type Env = Record<string, string | undefined>;

/**
 * Where to ask for prices, in order: agentopia.town's pass-through (or
 * `AGENTOPIA_PRICES_URL`, a mirror or a test's), then models.dev directly.
 */
export function priceUrls(env: Env = process.env): string[] {
  return [env.AGENTOPIA_PRICES_URL || PRICES_URL, MODELS_DEV_URL];
}

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
    init: { signal: AbortSignal; headers: Record<string, string> }
  ) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  /** Where to ask, in order (`priceUrls()` by default). */
  urls?: string[];
}

export class ModelsDevPrices implements PriceSource {
  private tables = new Map<string, PriceTable>();
  private fetchedAt: number | null = null;
  private triedAt = -Infinity;
  private loaded = false;
  private readonly cachePath: string;
  private readonly fetch: NonNullable<ModelsDevOptions['fetch']>;
  private readonly urls: string[];

  /** @param harnesses the harnesses to price, each by its usage adapter */
  constructor(
    private readonly harnesses: string[],
    options: ModelsDevOptions = {}
  ) {
    this.cachePath = options.cachePath ?? join(agentopiaHome(), 'cache', 'models.dev.json');
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.urls = options.urls ?? priceUrls();
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
    const wanted = this.providers();
    const providers: Record<string, unknown> = {};
    // Ask each source in turn for whatever the ones before it lacked.
    for (const url of this.urls) {
      if (wanted.every((p) => p in providers)) {
        break;
      }
      Object.assign(providers, await this.fetchProviders(url, wanted));
    }
    if (Object.keys(providers).length === 0) {
      return;
    }
    const kept: Kept = { fetchedAt: now, providers };
    this.apply(kept);
    try {
      await mkdir(dirname(this.cachePath), { recursive: true });
      await writeFile(this.cachePath, JSON.stringify(kept));
    } catch {
      // The prices still apply this run; next run fetches again.
    }
  }

  /** The `wanted` providers one source lists, or none when it fails. Never throws. */
  private async fetchProviders(url: string, wanted: string[]): Promise<Record<string, unknown>> {
    const providers: Record<string, unknown> = {};
    try {
      const res = await this.fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!res.ok) {
        return providers;
      }
      const api = (await res.json()) as Record<string, unknown> | null;
      for (const provider of wanted) {
        if (api && typeof api === 'object' && api[provider] && typeof api[provider] === 'object') {
          providers[provider] = api[provider];
        }
      }
    } catch {
      // Offline, blocked or malformed: the next source, or what there is.
    }
    return providers;
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
