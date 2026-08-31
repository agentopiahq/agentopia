import { Director, SequencedEvent } from '@agentopia/core';

/** Cap long quiet gaps so any recording stays watchable. */
const MAX_GAP_MS = 4000;

/** Step clicks this close together chain: each walks one stop further. */
const STEP_CHAIN_MS = 2000;

export interface ReplayProgress {
  /** Position and total length of the compressed replay timeline, ms. */
  cursor: number;
  duration: number;
}

export interface TimelineEntry {
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
 * With `live: true` the same timeline gains a live edge. While following it,
 * arriving events bypass the cursor entirely — catch-up reconstructs, live
 * ingests — so the office animates with no artificial delay. Scrubbing back
 * detaches from the edge (a DVR pause); playing forward re-reduces at 1x and
 * snaps back onto the edge the moment the cursor catches up.
 *
 * All time arrives through `tick(now)`; the controller never reads the clock.
 */
export class ReplayController {
  private readonly entries: TimelineEntry[] = [];
  private lastTs: number | null = null;
  private lastSeq = 0;
  private duration = 0;
  private cursor = 0;
  private nextIndex = 0;
  private started = false;
  private userPaused = false;
  private scrubbing = false;
  private lastTickAt: number | null = null;
  /** Offset of the stop the last step landed on, and when (wall clock). */
  private stepAnchor: number | null = null;
  private lastStepAt: number | null = null;
  /** True while glued to the live edge, applying events as they arrive. */
  private followLive: boolean;
  private currentSpeed: number;
  private director: Director;

  constructor(
    speed: number,
    private readonly makeDirector: () => Director,
    private readonly onSwap: (director: Director) => void,
    private readonly live = false
  ) {
    this.currentSpeed = speed;
    this.followLive = live;
    this.director = makeDirector();
    onSwap(this.director);
  }

  speed(): number {
    return this.currentSpeed;
  }

  /** Change the playback rate. Takes effect from the next tick's delta on. */
  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) {
      return;
    }
    this.currentSpeed = speed;
  }

  /**
   * Append an event to the timeline. Idempotent per seq: an SSE reconnect
   * replays the whole file as catch-up again, and those must not double the
   * recording.
   *
   * On the live edge the event is also applied to the director immediately:
   * catch-up reconstructs (a late join lands on the current scene), live
   * animates. Off the edge it only extends the timeline the scrubber shows.
   */
  add(sequenced: SequencedEvent, liveEvent = false): void {
    if (sequenced.seq <= this.lastSeq) {
      return;
    }
    this.lastSeq = sequenced.seq;
    const ts = sequenced.event.ts;
    const gap = this.lastTs === null ? 0 : Math.min(MAX_GAP_MS, Math.max(0, ts - this.lastTs));
    this.lastTs = ts;
    this.duration += gap;
    this.entries.push({ sequenced, offset: this.duration });
    if (this.followLive) {
      this.cursor = this.duration;
      this.nextIndex = this.entries.length;
      if (liveEvent) {
        this.director.ingest(sequenced);
      } else {
        this.director.reconstruct(sequenced);
      }
    }
  }

  start(): void {
    this.started = true;
    this.lastTickAt = null;
  }

  /** Playing means started, not paused by the user, and not mid-scrub. */
  private playing(): boolean {
    return this.started && !this.userPaused && !this.scrubbing;
  }

  isPaused(): boolean {
    return this.userPaused;
  }

  setPaused(paused: boolean): void {
    this.userPaused = paused;
    this.lastTickAt = null;
    // A live pause freezes the scene where it is; events keep extending the
    // timeline behind it. Play then replays forward and rejoins the edge.
    if (paused) {
      this.followLive = false;
      return;
    }
    // Pressing play on a finished replay means "watch it again". Not in live
    // mode: there the end of the timeline is the live edge, not the credits.
    if (!this.live && this.duration > 0 && this.cursor >= this.duration) {
      this.cursor = 0;
      this.nextIndex = 0;
      this.stepAnchor = null;
      this.lastStepAt = null;
      this.director = this.makeDirector();
      this.onSwap(this.director);
    }
  }

  progress(): ReplayProgress {
    return { cursor: this.cursor, duration: this.duration };
  }

  /** Every event with its timeline position, for the scrubber's markers. */
  events(): readonly TimelineEntry[] {
    return this.entries;
  }

  /** True while glued to the live edge (only ever true in live mode). */
  atLiveEdge(): boolean {
    return this.followLive;
  }

  /** Jump to the latest scene and resume applying events as they arrive. */
  goLive(): void {
    if (!this.live) {
      return;
    }
    this.userPaused = false;
    this.stepAnchor = null;
    this.lastStepAt = null;
    this.lastTickAt = null;
    if (this.followLive) {
      return;
    }
    // Rebuild rather than replay: the jump should land instantly, not sprint.
    this.seekTo(this.duration);
    this.followLive = true;
  }

  /** Advance the cursor and ingest whatever it crossed. Call once per frame. */
  tick(now: number): void {
    // On the live edge the cursor is pinned; `add` applies events directly.
    if (this.followLive) {
      this.cursor = this.duration;
      this.lastTickAt = now;
      return;
    }
    if (!this.playing()) {
      this.lastTickAt = now;
      return;
    }
    const dt = this.lastTickAt === null ? 0 : Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;
    this.cursor = Math.min(this.duration, this.cursor + dt * this.currentSpeed);
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
    // A live playback that catches up rejoins the edge and stays there.
    if (this.live && this.cursor >= this.duration) {
      this.followLive = true;
    }
  }

  /** Freeze playback while the user holds the scrubber. */
  beginScrub(): void {
    this.scrubbing = true;
  }

  /** Jump to a fraction of the timeline, rebuilding the scene from event zero. */
  scrubTo(fraction: number): void {
    // An explicit reposition breaks any step chain.
    this.stepAnchor = null;
    this.lastStepAt = null;
    this.seekTo(this.duration * Math.min(1, Math.max(0, fraction)));
  }

  /**
   * Jump to the nearest event strictly after (+1) or before (-1) where we
   * are. Strict comparison makes a parallel batch — several events on one
   * offset — a single stop instead of a stall.
   *
   * Steps within STEP_CHAIN_MS of the previous step walk from the stop that
   * step landed on, not from the raw cursor: during playback the cursor
   * drifts off a just-landed event within a frame, and stepping from the
   * drifted cursor would re-land every rapid prev click on the same event.
   * Once the chain lapses (or a scrub repositions), steps are relative to
   * wherever playback actually is.
   */
  step(direction: 1 | -1, now: number): void {
    const chained =
      this.stepAnchor !== null && this.lastStepAt !== null && now - this.lastStepAt < STEP_CHAIN_MS;
    const base = chained ? (this.stepAnchor as number) : this.cursor;
    let target: number | null = null;
    if (direction > 0) {
      for (const entry of this.entries) {
        if (entry.offset > base) {
          target = entry.offset;
          break;
        }
      }
    } else {
      target = 0;
      for (const entry of this.entries) {
        if (entry.offset >= base) {
          break;
        }
        target = entry.offset;
      }
    }
    if (target !== null && target !== this.cursor) {
      this.seekTo(target);
    }
    // A no-move click still restarts the chain window (holding prev at the
    // start of the recording must not fall back to cursor-relative steps).
    this.stepAnchor = target ?? base;
    this.lastStepAt = now;
  }

  private seekTo(offsetMs: number): void {
    this.followLive = false;
    this.cursor = offsetMs;
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

  /** Release the scrub-freeze; an explicit pause stays paused. */
  endScrub(): void {
    this.scrubbing = false;
    this.lastTickAt = null;
  }
}
