import { Director, SequencedEvent } from '@agentopia/core';

/** Cap long quiet gaps so any recording stays watchable. */
const MAX_GAP_MS = 4000;

export interface ReplayProgress {
  /** Position and total length of the compressed replay timeline, ms. */
  cursor: number;
  duration: number;
}

interface Entry {
  sequenced: SequencedEvent;
  /** Position on the compressed timeline: original inter-event gaps, capped. */
  offset: number;
}

/**
 * Drives a replay: owns the compressed timeline and a play cursor, and feeds
 * a Director as the cursor crosses events. Seeking swaps in a fresh Director
 * and folds every event up to the target through `reconstruct` — the reducer
 * is pure, so a scrub is a cheap re-reduce, the same way a late join catches
 * up to the current scene.
 *
 * All time arrives through `tick(now)`; the controller never reads the clock.
 */
export class ReplayController {
  private readonly entries: Entry[] = [];
  private lastTs: number | null = null;
  private lastSeq = 0;
  private duration = 0;
  private cursor = 0;
  private nextIndex = 0;
  private playing = false;
  private lastTickAt: number | null = null;
  private director: Director;

  constructor(
    private readonly speed: number,
    private readonly makeDirector: () => Director,
    private readonly onSwap: (director: Director) => void
  ) {
    this.director = makeDirector();
    onSwap(this.director);
  }

  /**
   * Append an event to the timeline. Idempotent per seq: an SSE reconnect
   * replays the whole file as catch-up again, and those must not double the
   * recording.
   */
  add(sequenced: SequencedEvent): void {
    if (sequenced.seq <= this.lastSeq) {
      return;
    }
    this.lastSeq = sequenced.seq;
    const ts = sequenced.event.ts;
    const gap = this.lastTs === null ? 0 : Math.min(MAX_GAP_MS, Math.max(0, ts - this.lastTs));
    this.lastTs = ts;
    this.duration += gap;
    this.entries.push({ sequenced, offset: this.duration });
  }

  start(): void {
    this.playing = true;
    this.lastTickAt = null;
  }

  progress(): ReplayProgress {
    return { cursor: this.cursor, duration: this.duration };
  }

  /** Advance the cursor and ingest whatever it crossed. Call once per frame. */
  tick(now: number): void {
    if (!this.playing) {
      this.lastTickAt = now;
      return;
    }
    const dt = this.lastTickAt === null ? 0 : Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;
    this.cursor = Math.min(this.duration, this.cursor + dt * this.speed);
    while (
      this.nextIndex < this.entries.length &&
      this.entries[this.nextIndex].offset <= this.cursor
    ) {
      const { sequenced } = this.entries[this.nextIndex];
      this.nextIndex += 1;
      // Re-stamp to "now": the director measures lag against its own clock,
      // and a replayed event must never register as a backlog to sprint over.
      this.director.ingest({ ...sequenced, event: { ...sequenced.event, ts: now } });
    }
  }

  /** Freeze playback while the user holds the scrubber. */
  beginScrub(): void {
    this.playing = false;
  }

  /** Jump to a fraction of the timeline, rebuilding the scene from event zero. */
  scrubTo(fraction: number): void {
    const clamped = Math.min(1, Math.max(0, fraction));
    this.cursor = this.duration * clamped;
    const director = this.makeDirector();
    let index = 0;
    while (index < this.entries.length && this.entries[index].offset <= this.cursor) {
      director.reconstruct(this.entries[index].sequenced);
      index += 1;
    }
    this.nextIndex = index;
    this.director = director;
    this.onSwap(director);
  }

  /** Resume playing from wherever the scrub landed. */
  endScrub(): void {
    this.playing = true;
    this.lastTickAt = null;
  }
}
