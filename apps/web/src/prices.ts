import { USAGE_ADAPTERS } from '@agentopia/core';

/**
 * The prices pass-through behind `GET /api/prices`: models.dev's price list,
 * cut down to the providers the harnesses price from, in models.dev's own
 * shape. The CLI asks here before models.dev, so the source can change in
 * this file without a CLI release.
 */

export const MODELS_DEV_URL = 'https://models.dev/api.json';

/** How long a fetched copy is served before models.dev is asked again. */
export const PRICES_REVALIDATE_S = 24 * 60 * 60;

/** Every models.dev provider a harness's usage adapter prices from. */
export const PRICE_PROVIDERS: readonly string[] = [
  ...new Set(
    Object.values(USAGE_ADAPTERS).flatMap((adapter) =>
      adapter.modelsDev ? [adapter.modelsDev.provider] : []
    )
  ),
];

/**
 * Keep only `providers` out of models.dev's file (every provider, several
 * megabytes), or null when none of them is there.
 */
export function trimPrices(
  api: unknown,
  providers: readonly string[] = PRICE_PROVIDERS
): Record<string, unknown> | null {
  if (!api || typeof api !== 'object' || Array.isArray(api)) {
    return null;
  }
  const all = api as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const provider of providers) {
    if (all[provider] && typeof all[provider] === 'object') {
      kept[provider] = all[provider];
    }
  }
  return Object.keys(kept).length > 0 ? kept : null;
}

const CLI_AGENT = /^agentopia\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) \(([a-z0-9]+); ([a-z0-9]+)\)$/;

/**
 * What a request's `User-Agent` says about the CLI that sent it — its
 * version, OS and architecture, as `agentopia/<version> (<os>; <arch>)` —
 * or `other` for anything else, so nothing a caller makes up reaches the
 * logs.
 */
export function cliAgent(userAgent: string | null): string {
  const match = CLI_AGENT.exec(userAgent ?? '');
  return match ? `agentopia/${match[1]} (${match[2]}; ${match[3]})` : 'other';
}
