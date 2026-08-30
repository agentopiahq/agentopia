import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';

import { LineBuffer } from './lines';

export interface FollowOptions {
  path: string;
  /** Replay existing content before following. Defaults to true. */
  fromStart?: boolean;
  intervalMs?: number;
}

export type StopFollowing = () => void;

/**
 * Tail a JSONL file, emitting complete lines as they land.
 *
 * Polls rather than using fs.watch: watch semantics differ across platforms and
 * miss appends on some filesystems, and at a 120ms poll the animation is already
 * smoother than the events arriving.
 */
export function followFile(options: FollowOptions, onLine: (line: string) => void): StopFollowing {
  const { path, fromStart = true, intervalMs = 120 } = options;
  const buffer = new LineBuffer();
  let offset = 0;

  if (!fromStart && existsSync(path)) {
    offset = statSync(path).size;
  }

  const drain = (): void => {
    if (!existsSync(path)) {
      return;
    }
    const size = statSync(path).size;
    if (size < offset) {
      // File was truncated or replaced; start over rather than emit garbage.
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
        onLine(line);
      }
    } finally {
      closeSync(fd);
    }
  };

  drain();
  const timer = setInterval(drain, intervalMs);
  timer.unref?.();

  return () => {
    clearInterval(timer);
    drain();
  };
}
