import { BusReader, SessionState, inFlight, reduceAll } from '@agentopia/core';
import { closeSync, openSync, readSync, statSync } from 'node:fs';

import { harnessFor } from '../harness';
import { busPath } from '../paths';
import { SessionSummary, liveSessions } from '../session';

/**
 * Whether the office is quiet enough to switch the server to a new version:
 * no session on the floor is in the middle of something. Restarting drops
 * every tab's stream for a moment and replays the floor; between turns that
 * costs nothing, while a turn is running it would cut its animation short.
 */

/**
 * A session written to longer ago than this is not holding anything up,
 * whatever its last word was: its agent has most likely gone (an archived
 * thread says no goodbye), and a turn that really is still running past it
 * is rare enough to be cut. The day's cap in `autoUpdate.ts` covers the rest.
 */
export const BUSY_WITHIN_MS = 60 * 60 * 1000;

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

/** Where a session's bus leaves it: the reduced state, and whether a prompt is still being answered. */
export interface BusLeaves {
  state: SessionState;
  turnOpen: boolean;
}

/** Read a session's bus tail into where it leaves the session. */
export function busLeaves(
  summary: SessionSummary,
  path: string = busPath(summary.id)
): BusLeaves | null {
  const harness = harnessFor(summary.harness);
  if (!harness) {
    return null;
  }
  const reader = new BusReader((record) => harness.normalize(record));
  const events = reader.pushAll(tailLines(path)).map((s) => s.event);
  let turnOpen = false;
  for (const event of events) {
    if (event.kind === 'turn.user') {
      turnOpen = true;
    } else if (
      event.kind === 'turn.stop' ||
      event.kind === 'session.end' ||
      (event.kind === 'session.start' && event.meta?.source !== 'compact')
    ) {
      turnOpen = false;
    }
  }
  return { state: reduceAll(events), turnOpen };
}

/**
 * Is the session in the middle of something: answering a prompt, running a
 * tool, compacting, or asking you to approve a call? A session that has only
 * been opened (no prompt yet) is idle, though its phase reads as working.
 */
export function isBusy({ state, turnOpen }: BusLeaves): boolean {
  if (state.phase === 'compacting' || state.phase === 'awaiting_approval') {
    return true;
  }
  if (state.phase === 'closed' || state.phase === 'waiting_on_user') {
    return false;
  }
  return turnOpen || Object.values(state.workers).some((worker) => inFlight(worker).length > 0);
}

/** Is no session in the middle of a turn? */
export function officeQuiet(now: number = Date.now()): boolean {
  return liveSessions(now, BUSY_WITHIN_MS).every((summary) => {
    const leaves = busLeaves(summary);
    return !leaves || !isBusy(leaves);
  });
}
