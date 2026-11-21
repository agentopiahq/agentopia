import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { busPath } from '../paths';
import { RelayConfig, readCursor, writeCursor } from './config';
import { asBatch, open, relayKeys } from './envelope';

/**
 * The office's half of the relay: pulls its channel's sealed batches, opens
 * them, and appends their lines to a local bus per remote bus,
 * `cloud-<name>`. From there a cloud session is an ordinary bus: the floor
 * finds it, follows it and seats it like any other.
 *
 * A batch that does not open (not sealed with this pairing's key) or does
 * not check out is skipped, never written.
 */

const PULL_INTERVAL_MS = 2000;
const MAX_BACKOFF_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_LINE = 65536;

/** The prefix that marks a bus as relayed in, and keeps it off local names. */
export const RELAYED_PREFIX = 'cloud-';

interface PullResponse {
  items: { seq: number; b: string }[];
  /** The newest seq the channel has handed out. */
  last: number;
}

function asResponse(value: unknown): PullResponse | null {
  const v = value as Partial<PullResponse> | null;
  if (!v || typeof v !== 'object' || !Array.isArray(v.items) || typeof v.last !== 'number') {
    return null;
  }
  const items = v.items.filter(
    (item): item is { seq: number; b: string } =>
      !!item && typeof item.seq === 'number' && typeof item.b === 'string'
  );
  return { items, last: v.last };
}

/** A line worth writing: one JSON object, no longer than the emitter writes. */
function wholeRecord(line: string): boolean {
  if (line.length > MAX_LINE) {
    return false;
  }
  try {
    const value = JSON.parse(line) as unknown;
    return !!value && typeof value === 'object' && !Array.isArray(value);
  } catch {
    return false;
  }
}

export type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export class RelayPuller {
  private readonly channel: string;
  private readonly key: Buffer;

  constructor(
    private readonly config: RelayConfig,
    private readonly fetchImpl: Fetch = fetch
  ) {
    const keys = relayKeys(config.token);
    this.channel = keys.channel;
    this.key = keys.key;
  }

  /** One pull: how many lines it wrote, or null if the relay could not be read. */
  async pullOnce(): Promise<number | null> {
    let after = readCursor(this.channel);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.url}/${this.channel}?after=${after}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (!res.ok) {
      return null;
    }
    const body = asResponse(await res.json().catch(() => null));
    if (!body) {
      return null;
    }
    // The relay forgot the channel (it expired) and started counting again:
    // read it from the start rather than wait for it to pass our old cursor.
    if (body.last < after) {
      writeCursor(this.channel, 0);
      return 0;
    }
    let written = 0;
    for (const item of [...body.items].sort((a, b) => a.seq - b.seq)) {
      if (item.seq <= after) {
        continue;
      }
      const batch = asBatch(open(this.key, item.b));
      if (batch) {
        const lines = batch.lines.filter(wholeRecord);
        if (lines.length > 0) {
          const path = busPath(`${RELAYED_PREFIX}${batch.bus}`);
          mkdirSync(dirname(path), { recursive: true });
          appendFileSync(path, `${lines.join('\n')}\n`);
          written += lines.length;
        }
      }
      after = item.seq;
    }
    writeCursor(this.channel, after);
    return written;
  }
}

/**
 * The floor server's relay: pulls while this office is paired, picking a
 * pairing up (or dropping it) within a pull of `agentopia relay pair` or
 * `off`, with no restart. Backs off while the relay is unreachable.
 */
export function followRelay(
  readConfig: () => RelayConfig | null,
  intervalMs = PULL_INTERVAL_MS,
  fetchImpl?: Fetch
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wait = intervalMs;
  let puller: { token: string; url: string; puller: RelayPuller } | null = null;
  const tick = async (): Promise<void> => {
    const config = readConfig();
    if (!config) {
      puller = null;
      wait = intervalMs;
    } else {
      if (!puller || puller.token !== config.token || puller.url !== config.url) {
        puller = { ...config, puller: new RelayPuller(config, fetchImpl) };
      }
      const result = await puller.puller.pullOnce().catch(() => null);
      wait = result === null ? Math.min(wait * 2, MAX_BACKOFF_MS) : intervalMs;
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), wait);
      timer.unref?.();
    }
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}
