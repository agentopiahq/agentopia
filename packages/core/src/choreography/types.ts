import { AgentopiaEvent, EventKind } from '../events';
import { OfficeState } from '../state';
import { Point, StationId } from '../stations';

/**
 * The choreography seam: how one event becomes animation.
 *
 * Every event kind maps to an `EventChoreography` — a small declarative recipe
 * with three phases (pre / main / post) plus a handful of lifecycle flags. The
 * director stays the sequencer: it owns walking between spots, dwell timing,
 * coalescing, lag + sprint, and idle life. A choreography only says *what is
 * performed where*; it never touches positions, clocks, or pixels.
 *
 * Registries are per harness. The same normalized event may deserve different
 * staging on different agents (a Codex `execute` burst is that harness's whole
 * show; on Claude Code it is one station among nine), so each harness ships
 * its own registry implementing this one interface, usually by extending
 * `defaultChoreography`.
 */

/** The semantic animation vocabulary. Renderers are skins over these. */
export type ActorState =
  | 'idle' // at desk, nothing happening
  | 'thinking' // the model is generating — dots over the head
  | 'walking'
  | 'sprinting'
  | 'working' // at a station, doing the thing
  | 'slump' // a tool call just failed
  | 'waiting' // human's turn; standing by
  | 'coffee'
  | 'pacing'
  | 'napping';

/** States a queued segment may perform in. The rest are sequencer-owned. */
export type PerformState = Extract<ActorState, 'working' | 'slump'>;

/**
 * One stationary performance unit. Segments never describe movement — the
 * director inserts the walk whenever the actor is not already at the
 * segment's station, which is what keeps every choreography harness- and
 * position-independent.
 */
export interface Segment {
  /** Where it happens. `own_desk` resolves to the acting worker's desk. */
  station: StationId;
  state: PerformState;
  /** Dwell minimum, so instantaneous events still read on screen. */
  minMs: number;
  /** Short speech-bubble text, already clipped by the emitter. */
  bubble?: string;
  /**
   * Held open until a later event releases it (a `tool.end` closing its
   * `tool.start`). An open segment ignores its dwell minimum's upper side —
   * it runs until released.
   */
  openSlot?: string;
  /**
   * Consecutive equal-station segments merge into one longer beat instead of
   * N round trips. Only work loops (parallel read batches) should opt in.
   */
  coalesce?: boolean;
}

/** Closes an earlier open segment (see `Segment.openSlot`). */
export interface SegmentRelease {
  slot: string;
  /**
   * What the open segment morphs into on a bad outcome — the failure slump.
   * When no matching segment is still open, it is performed standalone.
   */
  into?: Segment;
}

/** The acting worker as the director sees it when the event arrives. */
export interface ActorSnapshot {
  id: string;
  label: string;
  pos: Point;
  state: ActorState;
  station?: StationId;
  facing: 1 | -1;
}

export interface AnimationContext {
  event: AgentopiaEvent;
  /** The last event this worker performed, when there was one. */
  prevEvent?: AgentopiaEvent;
  /**
   * The worker's current snapshot. Undefined when this event is the one that
   * first brings the worker onto the floor.
   */
  actor?: ActorSnapshot;
  /** Office state with this event already folded in. */
  office: OfficeState;
}

/**
 * How one event kind is staged. All fields are optional: an empty
 * choreography is a state-only event — the reducer notes it, nobody moves.
 */
export interface EventChoreography {
  /**
   * Who performs it. `worker` (default) is the event's own worker; `lead`
   * always the lead, whatever the event says; `office` every worker present.
   */
  scope?: 'worker' | 'lead' | 'office';
  /**
   * Create the worker if unseen (default true). Set false for events that
   * should only ever address a worker who already exists (`turn.stop`).
   */
  ensure?: boolean;
  /** This event walks its worker in through the door (`worker.start`). */
  enters?: boolean;
  /** Drop the worker's queue and send them straight home first (a recall). */
  interrupt?: boolean;
  /** This event walks its worker out the door for good. Never the lead. */
  departs?: boolean;
  /**
   * Segments performed on the way in, before `main` — the walk itself is
   * implicit, so `pre` is for staging on top of it (grabbing a folder off a
   * shelf en route). Most choreographies leave it undefined.
   */
  pre?(ctx: AnimationContext): Segment[];
  /** The performance. Omit for events with no animation of their own. */
  main?(ctx: AnimationContext): Segment[];
  /**
   * Segments performed after `main` completes or is released. The linger and
   * the walk home are implicit sequencer behaviour, so like `pre` this is for
   * extra staging (returning the folder), not for movement.
   */
  post?(ctx: AnimationContext): Segment[];
  /** Close an earlier open segment (`tool.end` resolving its `tool.start`). */
  release?(ctx: AnimationContext): SegmentRelease | undefined;
  /** A transient speech bubble with no beat (`turn.stop`'s parting line). */
  bubble?(ctx: AnimationContext): string | undefined;
}

/** One harness's complete staging: an `EventChoreography` per event kind. */
export type ChoreographyRegistry = Partial<Record<EventKind, EventChoreography>>;
