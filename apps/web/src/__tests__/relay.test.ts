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
  ])('with %s: %s', (_, env, configured) => {
    expect(configuredStore(env) !== null).toBe(configured);
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
