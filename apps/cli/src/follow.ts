import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';

import { LineBuffer } from './lines';

export interface FollowOptions {
  path: string;
  /** Poll interval while the file is growing. */
  intervalMs?: number;
  /** Poll interval once it has been quiet for `idleAfterMs`. */
  idleIntervalMs?: number;
  /** How long without growth before backing off to the idle interval. */
  idleAfterMs?: number;
}

export type StopFollowing = () => void;

const DEFAULTS = { intervalMs: 120, idleIntervalMs: 3000, idleAfterMs: 5000 };

/**
 * How long to wait before the next poll, given how long the file has been
 * quiet. A bus that is being written to is polled fast enough that the
 * animation never waits on it; one that has gone quiet — most recordings,
 * most of the time — costs one stat every few seconds. Pure, so the policy
 * is testable without a clock.
 */
export function nextDelay(quietMs: number, options: FollowOptions): number {
  const idleAfter = options.idleAfterMs ?? DEFAULTS.idleAfterMs;
  return quietMs >= idleAfter
    ? (options.idleIntervalMs ?? DEFAULTS.idleIntervalMs)
    : (options.intervalMs ?? DEFAULTS.intervalMs);
}

/**
 * Tail a JSONL file, emitting complete lines as they land.
 *
 * Always reads from byte 0 — seq is derived from line position, so a reader
 * that starts mid-file would number everything wrong. Joining late is instead
 * expressed by `live`: false for lines that existed before the first drain
 * finished, true for lines that arrived after. A caller that wants "only new
 * events" filters on it; a caller rebuilding office state folds the catch-up
 * lines without animating them and animates the live ones. That is the
 * reconstruct/animate split, decided here once so every consumer inherits it.
 *
 * Polls rather than using fs.watch: watch semantics differ across platforms and
 * miss appends on some filesystems, and at a 120ms poll the animation is
 * already smoother than the events arriving. The poll backs off once the file
 * stops growing, so following every recording on disk at once stays cheap.
 */
export function followFile(
  options: FollowOptions,
  onLine: (line: string, live: boolean) => void
): StopFollowing {
  const { path } = options;
  const buffer = new LineBuffer();
  let offset = 0;
  let caughtUp = false;
  let lastGrowthAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const drain = (): void => {
    if (!existsSync(path)) {
      return;
    }
    const size = statSync(path).size;
    if (size < offset) {
      // File was truncated or replaced. The append-only invariant says this
      // should never happen; if it does, every derived seq is void, so start
      // over rather than emit garbage.
      offset = 0;
    }
    if (size === offset) {
      return;
    }
    lastGrowthAt = Date.now();

    const fd = openSync(path, 'r');
    try {
      const length = size - offset;
      const chunk = Buffer.alloc(length);
      const read = readSync(fd, chunk, 0, length, offset);
      offset += read;
      for (const line of buffer.push(chunk.subarray(0, read).toString('utf8'))) {
        onLine(line, caughtUp);
      }
    } finally {
      closeSync(fd);
    }
  };

  const schedule = (): void => {
    if (stopped) {
      return;
    }
    timer = setTimeout(
      () => {
        drain();
        schedule();
      },
      nextDelay(Date.now() - lastGrowthAt, options)
    );
    timer.unref?.();
  };

  drain();
  caughtUp = true;
  schedule();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
    drain();
  };
}
