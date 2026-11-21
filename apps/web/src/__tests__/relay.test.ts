import { GET, POST } from '@/app/api/relay/[channel]/route';
import {
  RELAY_MAX_BATCH,
  RELAY_MAX_ITEMS,
  configuredStore,
  isBatch,
  isChannel,
  memoryExec,
  parseAfter,
  redisStore,
  upstashExec,
} from '@/relay';

const CHANNEL = '0123456789abcdef0123456789abcdef';

describe('redisStore', () => {
  it('hands batches back in order, after a seq', async () => {
    const store = redisStore(memoryExec());
    expect(await store.append(CHANNEL, 'aaa')).toBe(1);
    expect(await store.append(CHANNEL, 'aaa')).toBe(2);
    expect(await store.append(CHANNEL, 'bbb')).toBe(3);
    expect(await store.since(CHANNEL, 1)).toEqual({
      items: [
        { seq: 2, b: 'aaa' },
        { seq: 3, b: 'bbb' },
      ],
      last: 3,
    });
  });

  it('knows nothing of a channel nobody wrote', async () => {
    expect(await redisStore(memoryExec()).since(CHANNEL, 0)).toEqual({ items: [], last: 0 });
  });

  it('keeps only the newest batches of a channel', async () => {
    const store = redisStore(memoryExec());
    for (let i = 0; i < RELAY_MAX_ITEMS + 5; i++) {
      await store.append(CHANNEL, `b${i}`);
    }
    const { items, last } = await store.since(CHANNEL, 0);
    expect(last).toBe(RELAY_MAX_ITEMS + 5);
    expect(items[0].seq).toBe(6);
  });
});

describe('upstashExec', () => {
  it('posts one pipeline and returns each result', async () => {
    const fetchImpl = jest.fn(async () =>
      Response.json([{ result: 4 }, { result: 'OK' }])
    ) as unknown as typeof fetch;
    const exec = upstashExec('https://kv.example/', 'secret', fetchImpl);
    expect(
      await exec([
        ['INCR', 'k'],
        ['GET', 'k'],
      ])
    ).toEqual([4, 'OK']);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://kv.example/pipeline',
      expect.objectContaining({ body: '[["INCR","k"],["GET","k"]]' })
    );
  });

  it.each([
    ['a failed request', Response.json({}, { status: 500 })],
    ['a failed command', Response.json([{ error: 'WRONGTYPE' }])],
  ])('throws on %s', async (_, response) => {
    const exec = upstashExec('https://kv.example', 's', (async () => response) as typeof fetch);
    await expect(exec([['GET', 'k']])).rejects.toThrow();
  });
});

describe('configuredStore', () => {
  it.each([
    ['the Vercel integration', { KV_REST_API_URL: 'https://a', KV_REST_API_TOKEN: 't' }, true],
    ['Upstash', { UPSTASH_REDIS_REST_URL: 'https://a', UPSTASH_REDIS_REST_TOKEN: 't' }, true],
    ['no token', { KV_REST_API_URL: 'https://a' }, false],
    ['nothing', {}, false],
  ])('in production, with %s: %s', (_, env, configured) => {
    expect(configuredStore({ ...env, NODE_ENV: 'production' }) !== null).toBe(configured);
  });

  it('keeps batches in memory outside production', () => {
    expect(configuredStore({ NODE_ENV: 'development' })).not.toBeNull();
  });
});

describe('validation', () => {
  it.each([
    [CHANNEL, true],
    [CHANNEL.toUpperCase(), false],
    [`${CHANNEL}0`, false],
    ['../etc', false],
  ])('isChannel(%s) is %s', (value, ok) => {
    expect(isChannel(value)).toBe(ok);
  });

  it.each([
    ['base64url', 'abc-_09', true],
    ['empty', '', false],
    ['padding', 'abc=', false],
    ['too long', 'a'.repeat(RELAY_MAX_BATCH + 1), false],
    ['not a string', 5, false],
  ])('isBatch takes %s: %s', (_, value, ok) => {
    expect(isBatch(value)).toBe(ok);
  });

  it.each([
    ['12', 12],
    [null, 0],
    ['-3', 0],
    ['1.5', 0],
    ['x', 0],
  ])('parseAfter(%s) is %s', (value, after) => {
    expect(parseAfter(value)).toBe(after);
  });
});

describe('/api/relay/<channel>', () => {
  const at = (channel: string, query = '') => ({
    url: `https://agentopia.town/api/relay/${channel}${query}`,
    params: Promise.resolve({ channel }),
  });
  const post = (channel: string, body: unknown) => {
    const { url, params } = at(channel);
    return POST(new Request(url, { method: 'POST', body: JSON.stringify(body) }), { params });
  };
  const get = (channel: string, query: string) => {
    const { url, params } = at(channel, query);
    return GET(new Request(url), { params });
  };
  const channel = 'fedcba9876543210fedcba9876543210';

  it('keeps sealed batches and hands back the ones after a seq', async () => {
    expect(await (await post(channel, { b: 'first' })).json()).toEqual({ seq: 1 });
    await post(channel, { b: 'second' });
    const res = await get(channel, '?after=1');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ items: [{ seq: 2, b: 'second' }], last: 2 });
  });

  it.each([
    ['no batch', {}],
    ['a batch that is not base64url', { b: 'not sealed!' }],
  ])('refuses %s', async (_, body) => {
    expect((await post(channel, body)).status).toBe(400);
  });

  it('knows no channel that is not one', async () => {
    expect((await get('not-a-channel', '')).status).toBe(404);
  });
});
