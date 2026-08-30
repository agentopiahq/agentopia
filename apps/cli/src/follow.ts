import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';

import { LineBuffer } from './lines';

export interface FollowOptions {
  path: string;
  intervalMs?: number;
}

export type StopFollowing = () => void;

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
 * already smoother than the events arriving.
 */
export function followFile(
  options: FollowOptions,
  onLine: (line: string, live: boolean) => void
): StopFollowing {
  const { path, intervalMs = 120 } = options;
  const buffer = new LineBuffer();
  let offset = 0;
  let caughtUp = false;

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

  drain();
  caughtUp = true;

  const timer = setInterval(drain, intervalMs);
  timer.unref?.();

  return () => {
    clearInterval(timer);
    drain();
  };
}
