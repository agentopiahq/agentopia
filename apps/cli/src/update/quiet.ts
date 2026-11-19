import { BusReader, SessionPhase, reduceAll } from '@agentopia/core';
import { closeSync, openSync, readSync, statSync } from 'node:fs';

import { harnessFor } from '../harness';
import { busPath } from '../paths';
import { FLOOR_WINDOW_MS } from '../server';
import { SessionSummary, liveSessions } from '../session';

/**
 * Whether the office is quiet enough to switch the server to a new version:
 * no session on the floor is in the middle of something. Restarting drops
 * every tab's stream for a moment and replays the floor; between turns that
 * costs nothing, while a turn is running it would cut its animation short.
 */

/** Phases where a session is busy: its agent is working, compacting, or asking you. */
const BUSY: ReadonlySet<SessionPhase> = new Set(['working', 'compacting', 'awaiting_approval']);

/** How much of a bus's end is read: plenty for its latest turn. */
const TAIL_BYTES = 256 * 1024;

/** A bus's last lines, the first (likely cut) one dropped when the read starts mid-file. */
function tailLines(path: string, bytes = TAIL_BYTES): string[] {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return [];
  }
  try {
    const size = statSync(path).size;
    const span = Math.min(size, bytes);
    const buf = Buffer.alloc(span);
    readSync(fd, buf, 0, span, size - span);
    const lines = buf.toString('utf8').split('\n');
    return (span < size ? lines.slice(1) : lines).filter((line) => line.trim() !== '');
  } catch {
    return [];
  } finally {
    closeSync(fd);
  }
}

/** The phase a session's bus leaves it in, reduced from the bus's tail. */
export function busPhase(
  summary: SessionSummary,
  path: string = busPath(summary.id)
): SessionPhase {
  const harness = harnessFor(summary.harness);
  if (!harness) {
    return 'empty';
  }
  const reader = new BusReader((record) => harness.normalize(record));
  return reduceAll(reader.pushAll(tailLines(path)).map((s) => s.event)).phase;
}

/** Is no session on the floor in the middle of a turn? */
export function officeQuiet(now: number = Date.now()): boolean {
  return liveSessions(now, FLOOR_WINDOW_MS).every((summary) => !BUSY.has(busPhase(summary)));
}
