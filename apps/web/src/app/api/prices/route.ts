import { unstable_cache } from 'next/cache';

import { MODELS_DEV_URL, PRICES_REVALIDATE_S, cliAgent, trimPrices } from '@/prices';

/**
 * `GET /api/prices`: the model prices the CLI's usage board reprices from
 * (`apps/cli/src/usage/prices.ts`), passed through from models.dev.
 *
 * The trimmed copy is cached in the function, not at the CDN: models.dev is
 * asked about once a day in all, while every request still runs this
 * handler and so can be counted. (models.dev's whole file is too big for
 * the fetch cache, so the fetch itself is not cached; only the trimmed
 * result is.) Nothing is stored, and the IP is never logged.
 */

export const dynamic = 'force-dynamic';

const FETCH_TIMEOUT_MS = 10_000;

const cachedPrices = unstable_cache(
  async (): Promise<Record<string, unknown>> => {
    const res = await fetch(MODELS_DEV_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`models.dev answered ${res.status}`);
    }
    const prices = trimPrices(await res.json());
    if (!prices) {
      throw new Error('models.dev listed none of the providers');
    }
    return prices;
  },
  ['models.dev-prices'],
  { revalidate: PRICES_REVALIDATE_S }
);

export async function GET(request: Request): Promise<Response> {
  // One line per request, for counting offices and their versions: the CLI's
  // version, OS and architecture, and nothing else.
  console.log(`prices ${cliAgent(request.headers.get('user-agent'))}`);
  try {
    return Response.json(await cachedPrices(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    // A failure is never cached, so the next request tries again; the CLI
    // falls back to models.dev directly.
    return Response.json(
      { error: 'prices unavailable' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
