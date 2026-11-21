/**
 * The relay behind `/api/relay/<channel>`: it holds sealed batches from a
 * session running somewhere else (a Claude Code cloud session) until the
 * office paired with it pulls them (see the CLI's `src/relay/`).
 *
 * It is a mailbox, not a reader. A channel is a hash the pairing token
 * derives, and every batch is AES-GCM ciphertext sealed with a key the same
 * token derives, so nothing here can open a batch, and nobody without the
 * token can find a channel. Batches expire an hour after a channel was last
 * written, and a channel keeps only its newest `RELAY_MAX_ITEMS`.
 *
 * Storage is Upstash Redis over its REST API (what Vercel's Upstash
 * integration provisions), so the site takes no new dependency.
 */

export const RELAY_TTL_S = 60 * 60;
export const RELAY_MAX_ITEMS = 2000;
/** Items one pull returns at most; the office pulls again for the rest. */
export const RELAY_PAGE = 500;
/** A sealed batch, base64url: the forwarder seals at most 128 KB of lines. */
export const RELAY_MAX_BATCH = 192 * 1024;

export interface RelayItem {
  seq: number;
  b: string;
}

export interface RelayStore {
  /** Keep a batch; returns its seq. */
  append(channel: string, batch: string): Promise<number>;
  /** Batches after `after`, oldest first, and the newest seq handed out. */
  since(channel: string, after: number): Promise<{ items: RelayItem[]; last: number }>;
}

export function isChannel(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}

export function isBatch(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= RELAY_MAX_BATCH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/** `?after=` as a seq: a whole number, 0 when missing or nonsense. */
export function parseAfter(value: string | null): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

/** A stored member is `<seq>:<batch>`, so equal batches never collide. */
function member(seq: number, batch: string): string {
  return `${seq}:${batch}`;
}

function fromMember(value: string): RelayItem | null {
  const at = value.indexOf(':');
  const seq = Number(value.slice(0, at));
  return at > 0 && Number.isSafeInteger(seq) ? { seq, b: value.slice(at + 1) } : null;
}

type Command = (string | number)[];
type Exec = (commands: Command[]) => Promise<unknown[]>;

function keys(channel: string): { items: string; seq: string } {
  return { items: `relay:${channel}`, seq: `relay:${channel}:seq` };
}

/** A store over any Redis that runs pipelined commands. */
export function redisStore(exec: Exec): RelayStore {
  return {
    async append(channel, batch) {
      const k = keys(channel);
      const [seq] = (await exec([['INCR', k.seq]])) as [number];
      await exec([
        ['ZADD', k.items, seq, member(seq, batch)],
        ['ZREMRANGEBYRANK', k.items, 0, -(RELAY_MAX_ITEMS + 1)],
        ['EXPIRE', k.items, RELAY_TTL_S],
        ['EXPIRE', k.seq, RELAY_TTL_S],
      ]);
      return seq;
    },
    async since(channel, after) {
      const k = keys(channel);
      const [members, last] = (await exec([
        ['ZRANGEBYSCORE', k.items, `(${after}`, '+inf', 'LIMIT', 0, RELAY_PAGE],
        ['GET', k.seq],
      ])) as [string[] | null, string | null];
      const items = (members ?? [])
        .map(fromMember)
        .filter((item): item is RelayItem => item !== null);
      return { items, last: Number(last ?? 0) || 0 };
    },
  };
}

/** Upstash's REST pipeline: one POST, one result per command. */
export function upstashExec(url: string, token: string, fetchImpl: typeof fetch = fetch): Exec {
  return async (commands) => {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`relay store answered ${res.status}`);
    }
    const results = (await res.json()) as { result?: unknown; error?: string }[];
    return results.map((r) => {
      if (r.error) {
        throw new Error(r.error);
      }
      return r.result;
    });
  };
}

/** The store this deployment is configured with, or null if it has none. */
export function configuredStore(
  env: Record<string, string | undefined> = process.env
): RelayStore | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisStore(upstashExec(url, token)) : null;
}

/** An in-memory Redis for the commands above, for tests. */
export function memoryExec(): Exec {
  const strings = new Map<string, number>();
  const sets = new Map<string, { score: number; member: string }[]>();
  return async (commands) =>
    commands.map(([name, key, ...args]) => {
      const k = String(key);
      switch (name) {
        case 'INCR': {
          const next = (strings.get(k) ?? 0) + 1;
          strings.set(k, next);
          return next;
        }
        case 'GET':
          return strings.has(k) ? String(strings.get(k)) : null;
        case 'ZADD': {
          const set = sets.get(k) ?? [];
          set.push({ score: Number(args[0]), member: String(args[1]) });
          set.sort((a, b) => a.score - b.score);
          sets.set(k, set);
          return 1;
        }
        case 'ZREMRANGEBYRANK': {
          const set = sets.get(k) ?? [];
          const keep = -Number(args[1]) - 1;
          sets.set(k, set.slice(Math.max(0, set.length - keep)));
          return 0;
        }
        case 'ZRANGEBYSCORE': {
          const min = Number(String(args[0]).replace('(', ''));
          const limit = Number(args[4]);
          return (sets.get(k) ?? [])
            .filter((entry) => entry.score > min)
            .slice(0, limit)
            .map((entry) => entry.member);
        }
        case 'EXPIRE':
          return 1;
        default:
          throw new Error(`unknown command ${String(name)}`);
      }
    });
}
