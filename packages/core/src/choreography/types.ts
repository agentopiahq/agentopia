import { AgentopiaEvent, EventKind } from '../events';
import { SessionState } from '../state';
import { Point, StationId } from '../stations';

/**
 * The choreography seam: how one event becomes animation.
 *
 * Every event kind maps to an `EventChoreography` — a small declarative recipe
 * with three phases (pre / main / post) plus a handful of lifecycle flags. The
 * director stays the sequencer: it owns walking between spots, dwell timing,
 * coalescing, lag + hurry, seating, and idle life. A choreography only says
 * *what is performed where*; it never touches positions, clocks, or pixels.
 *
 * Registries are per harness. The same normalized event may deserve different
 * staging on different agents (a Codex `execute` burst is that harness's whole
 * show), so each harness ships its own registry implementing this one
 * interface, usually by extending `defaultChoreography`.
 */

/** The semantic animation vocabulary. Renderers are skins over these. */
export type ActorState =
  | 'idle' // at the desk, nothing happening
  | 'thinking' // the model is generating — dots over the head
  | 'walking'
  | 'sprinting'
  | 'working' // typing at the monitor, or busy at a spot
  | 'talking' // briefing a helper, asking the speaker, signing off
  | 'slump' // a tool call just failed
  | 'waiting' // your turn; standing by
  | 'pacing'
  | 'napping'; // the session has gone quiet

/** States a queued segment may perform in. The rest are sequencer-owned. */
export type PerformState = Extract<ActorState, 'working' | 'slump' | 'talking'>;

/**
 * One stationary performance unit. Segments never describe movement — the
 * director inserts the walk whenever the actor is not already at the
 * segment's station, which is what keeps every choreography harness- and
 * position-independent.
 */
export interface Segment {
  /** Where it happens. `own_desk` resolves to the acting worker's own spot. */
  station: StationId;
  state: PerformState;
  /** Dwell minimum, so instantaneous events still read on screen. */
  minMs: number;
  /** Short speech-bubble text, already clipped by the emitter. */
  bubble?: string;
  /** Text the desk's monitor shows while this segment plays (the command being run). */
  screen?: string;
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
  /** The event's session, with this event already folded in. */
  session: SessionState;
}

/**
 * How one event kind is staged. All fields are optional: an empty
 * choreography is a state-only event — the reducer notes it, nobody moves.
 *
 * Nothing here can cut a beat short. Segments queue behind whatever the worker
 * is already performing, and a departure waits for the queue to drain.
 */
export interface EventChoreography {
  /**
   * Who performs it. `worker` (default) is the event's own worker; `lead`
   * always the session's lead, whatever the event says; `session` every
   * worker of the event's session.
   */
  scope?: 'worker' | 'lead' | 'session';
  /**
   * Create the worker if unseen (default true). Set false for events that
   * should only ever address a worker who already exists (`turn.stop`).
   */
  ensure?: boolean;
  /** This event walks its worker in through the door (`worker.start`). */
  enters?: boolean;
  /** This event walks its worker out the door for good, once its queue drains. Never the lead. */
  departs?: boolean;
  /**
   * Segments performed on the way in, before `main` — the walk itself is
   * implicit, so `pre` is for staging on top of it. Most choreographies leave
   * it undefined.
   */
  pre?(ctx: AnimationContext): Segment[];
  /** The performance. Omit for events with no animation of their own. */
  main?(ctx: AnimationContext): Segment[];
  /**
   * Segments performed after `main` completes or is released. The linger and
   * the walk home are implicit sequencer behaviour, so like `pre` this is for
   * extra staging, not for movement.
   */
  post?(ctx: AnimationContext): Segment[];
  /**
   * Segments the session's lead performs alongside — the briefing when a
   * helper arrives. Queued on the lead whatever `scope` says.
   */
  lead?(ctx: AnimationContext): Segment[];
  /** Close an earlier open segment (`tool.end` resolving its `tool.start`). */
  release?(ctx: AnimationContext): SegmentRelease | undefined;
  /** A transient speech bubble with no beat. */
  bubble?(ctx: AnimationContext): string | undefined;
}

/** One harness's complete staging: an `EventChoreography` per event kind. */
export type ChoreographyRegistry = Partial<Record<EventKind, EventChoreography>>;
