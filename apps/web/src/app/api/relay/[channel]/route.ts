import { RelayStore, configuredStore, isBatch, isChannel, parseAfter } from '@/relay';

/**
 * `POST /api/relay/<channel>` keeps one sealed batch from a forwarder;
 * `GET /api/relay/<channel>?after=<seq>` hands an office the batches after
 * the last one it read. See `src/relay.ts`: nothing here can open a batch,
 * and nothing about a request is logged but that it happened.
 */

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function answer(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

async function withStore(
  params: Promise<{ channel: string }>,
  run: (store: RelayStore, channel: string) => Promise<Response>
): Promise<Response> {
  const { channel } = await params;
  if (!isChannel(channel)) {
    return answer({ error: 'not a channel' }, 404);
  }
  const store = configuredStore();
  if (!store) {
    return answer({ error: 'relay not configured' }, 503);
  }
  try {
    return await run(store, channel);
  } catch {
    return answer({ error: 'relay unavailable' }, 502);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channel: string }> }
): Promise<Response> {
  return withStore(params, async (store, channel) => {
    const body = (await request.json().catch(() => null)) as { b?: unknown } | null;
    if (!body || !isBatch(body.b)) {
      return answer({ error: 'not a sealed batch' }, 400);
    }
    const seq = await store.append(channel, body.b);
    console.log('relay post');
    return answer({ seq });
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ channel: string }> }
): Promise<Response> {
  return withStore(params, async (store, channel) => {
    const after = parseAfter(new URL(request.url).searchParams.get('after'));
    return answer(await store.since(channel, after));
  });
}
