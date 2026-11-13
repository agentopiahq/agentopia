import {
  ActorSnapshot,
  ActorState,
  AnimationContext,
  ChoreographyRegistry,
  EventChoreography,
  PerformState,
  Segment,
  SegmentRelease,
  defaultChoreography,
} from './choreography';
import { Clock, Rng } from './clock';
import { AgentopiaEvent, LEAD_WORKER } from './events';
import { SequencedEvent } from './reader';
import {
  OfficeState,
  SessionPhase,
  SessionState,
  emptySession,
  reduce,
  subagentCount,
} from './state';
import {
  DESKS,
  HELPERS_PER_DESK,
  Point,
  STATIONS,
  StationId,
  WALK_TILES_PER_SEC,
  cabinetsFor,
  deskFor,
  helperSpot,
} from './stations';

/**
 * The director: office state + clock -> who is where, doing what.
 *
 * This is the animation brain — the sequencer. It owns the desks (one per
 * live session), per-worker beat queues, walking, dwell minimums, coalescing,
 * the lag + hurry behaviour, and idle life. *What* is performed for each
 * event comes from an injected `ChoreographyRegistry` (per harness; see
 * `choreography/`); *how* and *when* it plays out is decided here. It is
 * deliberately deterministic — all time comes from the injected Clock, all
 * chance from the injected Rng — which is what makes replay reproducible and
 * golden-frame tests possible.
 *
 * Nothing is ever cut short. A new event queues behind whatever its worker is
 * performing; the cost of a burst is a backlog, and the backlog is shown (the
 * worker sweats) rather than skipped. The one instant signal is the desk
 * badge, which reads phase straight from reduced state.
 *
 * It knows nothing about pixels. Output is an OfficeFrame in tile space; the
 * renderer is a skin over it.
 */

/** The bus a consumer that only ever reads one bus gets — a replay, a story. */
export const DEFAULT_BUS = 'default';

/** Actor ids are unique across the office: bus plus worker. */
export function actorId(bus: string, worker: string): string {
  return `${bus}/${worker}`;
}

export interface Actor {
  id: string;
  bus: string;
  /** The worker id within its session — `lead`, or a subagent id. */
  worker: string;
  role: 'lead' | 'helper';
  /** Lead / subagent type, for the nameplate and persistent prop. */
  label: string;
  pos: Point;
  state: ActorState;
  /** Which station the current beat is at (or heading to). */
  station?: StationId;
  /** Short text for a speech bubble, already clipped by the emitter. */
  bubble?: string;
  /** 0..1 progress through the current beat, for renderer bob/cycle phase. */
  progress: number;
  facing: 1 | -1;
  /** 0..1 backlog pressure on this worker's session: how much it is sweating. */
  stress: number;
}

/** One occupied desk, as the renderer needs it. */
export interface DeskView {
  slot: number;
  bus: string;
  /** The harness's own session name, when it has arrived. */
  name?: string;
  /** Straight from reduced state — instant, however far behind the animation is. */
  phase: SessionPhase;
  /** Every subagent the session has running, drawn or not. */
  subagents: number;
  stress: number;
  /** How far this session's animation runs behind its newest event. */
  lagMs: number;
  /** What the monitor shows, and since when (for the scroll). */
  screen?: string;
  screenSince: number;
}

export interface OfficeFrame {
  /** Director clock time, ms. */
  at: number;
  actors: Actor[];
  /** Occupied desks only. Empty desks are furniture. */
  desks: DeskView[];
  /** Live sessions without a desk. */
  waiting: number;
  /** The speaker on the wall is playing: a prompt just landed. */
  speaking: boolean;
  /** Worst backlog across sessions, ms. */
  lagMs: number;
}

interface Beat {
  station: StationId;
  /** Animation state while performing it. */
  state: PerformState;
  minMs: number;
  /** Wall-clock ts of the newest event folded into the beat (drives lag). */
  eventTs: number;
  /**
   * Tool calls still running inside this beat. A coalesced burst holds
   * several; the beat stays open until every one has reported back.
   */
  openSlots: Set<string>;
  bubble?: string;
  screen?: string;
  /** Coalesced repeat count — one longer beat instead of N. */
  reps: number;
}

/** Everything a worker will still perform: the current beat, then the queue. */
function pending(worker: WorkerAgent): Beat[] {
  return worker.current ? [worker.current, ...worker.queue] : worker.queue;
}

interface WorkerAgent {
  id: string;
  label: string;
  /** Helper spot around the desk; null for the lead, who has the seat. */
  helper: number | null;
  pos: Point;
  facing: 1 | -1;
  state: ActorState;
  station?: StationId;
  bubble?: string;
  bubbleUntil: number;
  queue: Beat[];
  /** When the queue drained, for the linger-then-walk-home grace. */
  emptySince: number | null;
  /** Next time this worker shifts their weight while thinking. */
  fidgetAt: number;
  /** The beat being performed, once arrived. */
  current?: Beat;
  beatStartedAt: number;
  /** Where the worker is headed (home or a station spot). */
  target: Point;
  /** Heading for the door once the queue drains. */
  departing: boolean;
  /** Departing because the session closed, not on its own worker.stop. */
  sentOff: boolean;
  /** Reached the door; removed on the next frame. */
  departed: boolean;
  /** The last event this worker performed; context for the next one. */
  lastEvent?: AgentopiaEvent;
}

/** One live session: its reduced state, its desk, and its workers. */
interface SessionRun {
  bus: string;
  state: SessionState;
  /** Desk slot, or null while waiting for one (or gone). */
  desk: number | null;
  /** The desk it last had, to come back to if still free. */
  lastDesk: number | null;
  workers: Map<string, WorkerAgent>;
  helperSlots: Array<string | null>;
  /** Dedup: an SSE reconnect replays the whole bus as catch-up again. */
  lastSeq: number;
  latestEventTs: number;
  playedEventTs: number;
  /** Director clock time of the last event, for the idle timers. */
  lastEventAt: number;
  /** Has any event arrived live (not as catch-up)? */
  live: boolean;
  /** Ended or idle: everyone leaves once their queues drain, then the desk frees. */
  closing: boolean;
  /** Off the floor. Wakes on the next event. */
  gone: boolean;
  screen?: { text: string; since: number };
}

const LINGER_MS = 2500;
const FIDGET_EVERY_MS = 5000;
const BUBBLE_MS = 3500;
/** How long the speaker crackles after a prompt lands. */
const SPEAKER_MS = 2500;
const LAG_HURRY_MS = 2000;
const LAG_SPRINT_MS = 6000;
/**
 * Behind by more than this when a beat ends, and the middle of the queue is
 * not worth playing: the worker jumps to its newest beat. The beat that was
 * playing is never cut — only what had not started yet is skipped.
 */
export const LAG_SKIP_MS = 8000;
/** Backlog at which a worker is sweating as hard as it can. */
const STRESS_FULL_MS = 20000;
/** No events for this long: the lead naps at its desk. */
export const IDLE_REST_MS = 45_000;
/** No events for this long: the session leaves and its desk is freed. */
export const IDLE_LEAVE_MS = 300_000;

const PERFORMING = new Set<ActorState>(['working', 'slump', 'talking']);

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function stepToward(from: Point, to: Point, tiles: number): Point {
  const d = dist(from, to);
  if (d <= tiles) {
    return { ...to };
  }
  const f = tiles / d;
  return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
}

export interface DirectorOptions {
  clock: Clock;
  rng: Rng;
  /** Per-harness staging. Defaults to the shared base registry. */
  choreography?: ChoreographyRegistry;
}

export class Director {
  private readonly clock: Clock;
  private readonly rng: Rng;
  private readonly choreography: ChoreographyRegistry;
  private runs = new Map<string, SessionRun>();
  /** Which bus holds each desk. */
  private desks: Array<string | null> = DESKS.map(() => null);
  /** Newest event ts across every session; stale recordings are judged against it. */
  private newestTs = 0;
  private lastFrameAt: number | null = null;
  private speakingUntil = 0;

  constructor(options: DirectorOptions) {
    this.clock = options.clock;
    this.rng = options.rng;
    this.choreography = options.choreography ?? defaultChoreography;
  }

  /** Every session's reduced state, keyed by bus. */
  office(): OfficeState {
    const sessions: Record<string, SessionState> = {};
    for (const [bus, run] of this.runs) {
      sessions[bus] = run.state;
    }
    return { sessions };
  }

  /** Fold an event without animating it. For catch-up on late join. */
  reconstruct(sequenced: SequencedEvent): void {
    const run = this.runFor(sequenced);
    if (!run) {
      return;
    }
    this.fold(run, sequenced.event, false);
    run.playedEventTs = run.latestEventTs;

    if (run.desk === null) {
      // A recording that went quiet long before the newest one we know of is
      // not a live session; leave it off the floor until it says otherwise.
      if (this.newestTs - run.latestEventTs > IDLE_LEAVE_MS) {
        run.gone = true;
        return;
      }
      run.gone = false;
      this.seat(run);
    }
    this.syncWorkersFromState(run, true);
  }

  ingest(sequenced: SequencedEvent): void {
    const run = this.runFor(sequenced);
    if (!run) {
      return;
    }
    const event = sequenced.event;
    this.fold(run, event, true);

    // Sequencer machinery, not staging: the speaker, seating, and resumption.
    if (event.kind === 'turn.user') {
      this.speakingUntil = this.clock.now() + SPEAKER_MS;
    }
    if (run.desk === null) {
      run.gone = false;
      if (!this.seat(run)) {
        // No desk free: the session keeps its state and waits its turn.
        return;
      }
    }
    // Anyone on their way out because the session looked finished turns around.
    for (const worker of run.workers.values()) {
      if (worker.sentOff && !worker.departed) {
        worker.departing = false;
        worker.sentOff = false;
      }
    }
    // A session that just opened, or just came back, walks its cast in.
    if (event.kind === 'session.start' || run.workers.size === 0) {
      this.syncWorkersFromState(run, false);
    }

    const choreography = this.choreography[event.kind];
    if (!choreography) {
      return;
    }
    for (const id of this.targetsFor(run, choreography, event)) {
      this.perform(run, choreography, event, id);
    }
    if (choreography.lead) {
      const lead = this.ensureWorker(run, LEAD_WORKER, undefined, false);
      if (lead) {
        const ctx = this.contextFor(run, event, lead);
        for (const segment of choreography.lead(ctx)) {
          this.enqueue(lead, segment, event.ts);
        }
      }
    }
  }

  /** The session for a sequenced event, or null when the event is a repeat. */
  private runFor(sequenced: SequencedEvent): SessionRun | null {
    const bus = sequenced.bus ?? DEFAULT_BUS;
    let run = this.runs.get(bus);
    if (!run) {
      run = {
        bus,
        state: emptySession(),
        desk: null,
        lastDesk: null,
        workers: new Map(),
        helperSlots: Array.from({ length: HELPERS_PER_DESK }, () => null),
        lastSeq: -1,
        latestEventTs: 0,
        playedEventTs: 0,
        lastEventAt: this.clock.now(),
        live: false,
        closing: false,
        gone: false,
      };
      this.runs.set(bus, run);
    }
    if (sequenced.seq <= run.lastSeq) {
      return null;
    }
    run.lastSeq = sequenced.seq;
    return run;
  }

  /** Reduce, and keep the session's clocks. */
  private fold(run: SessionRun, event: AgentopiaEvent, live: boolean): void {
    run.state = reduce(run.state, event);
    // Anchor the played cursor to the first event, or the initial frame
    // measures lag against the epoch and spuriously starts in a hurry.
    if (run.playedEventTs === 0) {
      run.playedEventTs = event.ts;
    }
    run.latestEventTs = Math.max(run.latestEventTs, event.ts);
    this.newestTs = Math.max(this.newestTs, event.ts);
    run.lastEventAt = this.clock.now();
    run.live = run.live || live;
    // An end closes the session; any later event (a resume) reopens it.
    if (event.kind === 'session.end') {
      this.close(run);
    } else {
      run.closing = false;
    }
  }

  /** Which workers a choreography addresses. */
  private targetsFor(
    run: SessionRun,
    choreography: EventChoreography,
    event: AgentopiaEvent
  ): string[] {
    if (choreography.scope === 'session') {
      return [...run.workers.values()].filter((worker) => !worker.departing).map((w) => w.id);
    }
    if (choreography.scope === 'lead') {
      return [LEAD_WORKER];
    }
    return [event.worker];
  }

  private contextFor(
    run: SessionRun,
    event: AgentopiaEvent,
    existing: WorkerAgent | undefined
  ): AnimationContext {
    return {
      event,
      prevEvent: existing?.lastEvent,
      actor: existing ? this.snapshot(existing) : undefined,
      session: run.state,
    };
  }

  /** Stage one event on one worker, per its choreography. */
  private perform(
    run: SessionRun,
    choreography: EventChoreography,
    event: AgentopiaEvent,
    id: string
  ): void {
    const existing = run.workers.get(id);
    const ctx = this.contextFor(run, event, existing);
    const segments = [
      ...(choreography.pre?.(ctx) ?? []),
      ...(choreography.main?.(ctx) ?? []),
      ...(choreography.post?.(ctx) ?? []),
    ];
    const release = choreography.release?.(ctx);
    const bubble = choreography.bubble?.(ctx);
    const acts =
      choreography.enters ||
      choreography.departs ||
      segments.length > 0 ||
      release !== undefined ||
      bubble !== undefined;
    if (!acts) {
      return;
    }
    const worker =
      choreography.ensure === false
        ? existing
        : this.ensureWorker(run, id, event.workerType, false);
    if (!worker) {
      return;
    }
    if (release) {
      this.releaseSlot(worker, release, event.ts);
    }
    for (const segment of segments) {
      this.enqueue(worker, segment, event.ts);
    }
    if (bubble) {
      worker.bubble = bubble;
      worker.bubbleUntil = this.clock.now() + BUBBLE_MS;
    }
    if (choreography.departs && worker.id !== LEAD_WORKER) {
      worker.departing = true;
    }
    worker.lastEvent = event;
  }

  /**
   * Queue a segment, coalescing repeat work into one longer beat.
   *
   * A burst of tool calls at the desk becomes one continuous session at the
   * monitor rather than a flicker of short ones: the segment merges into the
   * last beat still to come (or the one being performed) when that beat is
   * the same work at the same spot, open or not. The merged beat shows the
   * newest command and stays open until every call in it has reported back.
   */
  private enqueue(worker: WorkerAgent, segment: Segment, eventTs: number): void {
    const last = worker.queue[worker.queue.length - 1] ?? worker.current;
    if (
      segment.coalesce &&
      last &&
      last.station === segment.station &&
      last.state === 'working' &&
      segment.state === 'working'
    ) {
      last.reps += 1;
      last.eventTs = eventTs;
      if (segment.openSlot) {
        last.openSlots.add(segment.openSlot);
      }
      last.bubble = segment.bubble ?? last.bubble;
      last.screen = segment.screen ?? last.screen;
      return;
    }
    worker.queue.push(this.beatFor(segment, eventTs));
  }

  private beatFor(segment: Segment, eventTs: number): Beat {
    return {
      station: segment.station,
      state: segment.state,
      minMs: segment.minMs,
      eventTs,
      openSlots: new Set(segment.openSlot ? [segment.openSlot] : []),
      bubble: segment.bubble,
      screen: segment.screen,
      reps: 1,
    };
  }

  /**
   * Close the matching open slot wherever its beat is; the dwell minimum
   * still applies, so fast tools do not flicker. A failure's slump goes
   * *after* the work rather than replacing it: the typing plays out, then the
   * slump plays in full.
   */
  private releaseSlot(worker: WorkerAgent, release: SegmentRelease, eventTs: number): void {
    const beats = pending(worker);
    const index = beats.findIndex((beat) => beat.openSlots.has(release.slot));
    if (index === -1) {
      if (release.into) {
        this.enqueue(worker, release.into, eventTs);
      }
      return;
    }
    const open = beats[index];
    open.openSlots.delete(release.slot);
    if (release.into) {
      // Right behind the beat it belongs to: index 0 is the current beat,
      // whose successor is the head of the queue.
      const at = worker.current ? index : index + 1;
      worker.queue.splice(at, 0, this.beatFor(release.into, eventTs));
    }
  }

  private snapshot(worker: WorkerAgent): ActorSnapshot {
    return {
      id: worker.id,
      label: worker.label,
      pos: { ...worker.pos },
      state: worker.state,
      station: worker.station,
      facing: worker.facing,
    };
  }

  frame(): OfficeFrame {
    const now = this.clock.now();
    const dtMs = this.lastFrameAt === null ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;

    let worstLag = 0;
    const actors: Actor[] = [];
    const desks: DeskView[] = [];

    for (const run of this.runs.values()) {
      if (run.gone) {
        continue;
      }
      // A session that never got a desk and then went quiet stops waiting.
      if (run.desk === null) {
        if (now - run.lastEventAt > IDLE_LEAVE_MS) {
          run.gone = true;
        }
        continue;
      }

      const lagMs = Math.max(0, run.latestEventTs - run.playedEventTs);
      worstLag = Math.max(worstLag, lagMs);
      const speed = this.speedFor(lagMs);
      const stress = Math.min(1, Math.max(0, (lagMs - LAG_HURRY_MS) / STRESS_FULL_MS));
      // Idle is measured on the director's clock, and for a session that has
      // only ever been caught up on, also against the newest event anywhere —
      // a recording that stopped an hour before the others is not live.
      const idleMs = run.live
        ? now - run.lastEventAt
        : Math.max(now - run.lastEventAt, this.newestTs - run.latestEventTs);
      if (!run.closing && idleMs > IDLE_LEAVE_MS) {
        this.close(run);
      }

      for (const worker of run.workers.values()) {
        this.tickWorker(run, worker, now, dtMs, speed, idleMs);
      }
      for (const [id, worker] of [...run.workers]) {
        if (worker.departed) {
          run.workers.delete(id);
        }
      }
      if (run.closing && run.workers.size === 0) {
        this.releaseDesk(run);
        continue;
      }

      this.updateScreen(run, now);
      for (const worker of run.workers.values()) {
        actors.push({
          id: actorId(run.bus, worker.id),
          bus: run.bus,
          worker: worker.id,
          role: worker.helper === null ? 'lead' : 'helper',
          label: worker.label,
          pos: { ...worker.pos },
          state: worker.state,
          station: worker.station,
          bubble: worker.bubbleUntil > now ? worker.bubble : undefined,
          progress: this.beatProgress(worker, now),
          facing: worker.facing,
          stress,
        });
      }
      desks.push({
        slot: run.desk,
        bus: run.bus,
        name: run.state.name,
        phase: run.state.phase,
        subagents: subagentCount(run.state),
        stress,
        lagMs,
        screen: run.screen?.text,
        screenSince: run.screen?.since ?? 0,
      });
    }

    this.seatWaiting();

    let waiting = 0;
    for (const run of this.runs.values()) {
      if (!run.gone && run.desk === null) {
        waiting += 1;
      }
    }

    return {
      at: now,
      actors,
      desks: desks.sort((a, b) => a.slot - b.slot),
      waiting,
      speaking: now < this.speakingUntil,
      lagMs: worstLag,
    };
  }

  private speedFor(lagMs: number): number {
    if (lagMs > LAG_SPRINT_MS) {
      return 2.5;
    }
    if (lagMs > LAG_HURRY_MS) {
      return 1.6;
    }
    return 1;
  }

  /** The session is over or idle: nobody takes new beats, everyone leaves when done. */
  private close(run: SessionRun): void {
    run.closing = true;
    for (const worker of run.workers.values()) {
      // A tool that never reported back ends with the session.
      for (const beat of pending(worker)) {
        beat.openSlots.clear();
      }
    }
  }

  private tickWorker(
    run: SessionRun,
    worker: WorkerAgent,
    now: number,
    dtMs: number,
    speed: number,
    idleMs: number
  ): void {
    // Advance the queue when the current beat is done. Only once actually at
    // the spot — a beat that closed while its worker was still walking must
    // not complete mid-walk, or fast tools make workers turn around in the
    // corridor and the dwell minimum never applies.
    // The dwell minimum is never compressed: a backlog makes walks faster and
    // the worker sweatier, but every performance plays in full.
    if (worker.current && PERFORMING.has(worker.state)) {
      const held = now - worker.beatStartedAt;
      const minMs = worker.current.minMs * (1 + 0.35 * (worker.current.reps - 1));
      if (worker.current.openSlots.size === 0 && held >= minMs) {
        run.playedEventTs = Math.max(run.playedEventTs, worker.current.eventTs);
        worker.current = undefined;
        this.skipStaleBeats(run, worker);
      }
    }

    if (!worker.current && worker.queue.length > 0) {
      worker.emptySince = null;
      worker.current = worker.queue.shift();
      worker.beatStartedAt = now;
      worker.target = { ...this.spotFor(run, worker, worker.current!.station) };
      if (worker.current!.bubble) {
        worker.bubble = worker.current!.bubble;
        worker.bubbleUntil = now + BUBBLE_MS;
      }
    }

    // A long-running open beat keeps its bubble up for the duration — the
    // difference between "compiling for 90 seconds" and "looks stuck".
    if (worker.current?.openSlots.size && worker.current.bubble) {
      worker.bubbleUntil = now + 1000;
    }

    // Queue drained and this worker is leaving: out through the door. The
    // helper spot frees now, so the next helper can head for it.
    if (!worker.current && worker.queue.length === 0 && (run.closing || worker.departing)) {
      if (!worker.departing) {
        worker.departing = true;
        worker.sentOff = true;
      }
      if (worker.helper !== null && run.helperSlots[worker.helper] === worker.id) {
        run.helperSlots[worker.helper] = null;
      }
      worker.target = { ...STATIONS.door.spot };
    }

    const atTarget = dist(worker.pos, worker.target) < 0.05;
    if (!atTarget) {
      const tiles = (WALK_TILES_PER_SEC * speed * dtMs) / 1000;
      const next = stepToward(worker.pos, worker.target, tiles);
      worker.facing = next.x >= worker.pos.x ? 1 : -1;
      worker.pos = next;
      worker.state = speed > 1.6 ? 'sprinting' : 'walking';
      worker.station = worker.current?.station;
      return;
    }
    // Land exactly: the threshold is for the walk, not the pose.
    worker.pos = { ...worker.target };

    // Through the door and gone — but only once the last beat is done.
    if (worker.departing && !worker.current) {
      worker.departed = true;
      worker.state = 'walking';
      return;
    }

    if (worker.current) {
      if (!PERFORMING.has(worker.state)) {
        worker.beatStartedAt = now;
      }
      worker.state = worker.current.state;
      worker.station = worker.current.station;
      return;
    }

    // Nothing queued. Linger a moment where the last beat was — tool calls
    // come in bursts, and instantly rushing home between them would ping-pong
    // — then head home. Home is the seat for the lead, the helper spot for a
    // helper.
    worker.station = undefined;
    worker.emptySince ??= now;
    const home = this.homeOf(run, worker);
    const atHome = dist(worker.pos, home) < 0.1;
    if (!atHome && now - worker.emptySince > LINGER_MS) {
      worker.target = { ...home };
    }
    if (idleMs > IDLE_REST_MS) {
      // Quiet for a while: a nap at the desk, until something happens.
      worker.state = 'napping';
      return;
    }
    if (run.state.phase === 'waiting_on_user' && worker.helper === null) {
      worker.state = 'waiting';
    } else if (run.state.phase === 'working') {
      worker.state = 'thinking';
      // Long thinking gets restless: every few seconds the lead shifts a step
      // around the desk. Motion is the signal that the office is alive, not
      // stuck. Helpers stay put — their spots are close together.
      if (worker.helper !== null) {
        return;
      }
      if (atHome && worker.fidgetAt === 0) {
        worker.fidgetAt = now + FIDGET_EVERY_MS + this.rng() * 2000;
      } else if (atHome && now >= worker.fidgetAt) {
        const dx = this.rng() > 0.5 ? 1 : -1;
        worker.target = { x: home.x + dx, y: home.y + (this.rng() > 0.5 ? 0.5 : -0.5) };
        worker.fidgetAt = now + FIDGET_EVERY_MS + this.rng() * 2000;
      } else if (!atHome && now - worker.emptySince > LINGER_MS) {
        // Wander back once the fidget step lands.
        worker.target = { ...home };
      }
    } else {
      worker.state = 'idle';
    }
  }

  /**
   * A large backlog, measured from the worker's next beat to the session's
   * newest event, collapses the queue to its last beat. The skipped beats'
   * events count as played, so the lag (and the sweat) drops with them.
   */
  private skipStaleBeats(run: SessionRun, worker: WorkerAgent): void {
    if (worker.queue.length < 2) {
      return;
    }
    if (run.latestEventTs - worker.queue[0].eventTs <= LAG_SKIP_MS) {
      return;
    }
    const last = worker.queue[worker.queue.length - 1];
    for (const beat of worker.queue) {
      if (beat !== last) {
        run.playedEventTs = Math.max(run.playedEventTs, beat.eventTs);
      }
    }
    worker.queue = [last];
  }

  /** The monitor shows whatever the session is running right now, lead first. */
  private updateScreen(run: SessionRun, now: number): void {
    let text: string | undefined;
    const lead = run.workers.get(LEAD_WORKER);
    if (lead?.current?.screen && PERFORMING.has(lead.state)) {
      text = lead.current.screen;
    } else {
      for (const worker of run.workers.values()) {
        if (worker.current?.screen && PERFORMING.has(worker.state)) {
          text = worker.current.screen;
          break;
        }
      }
    }
    if (text === undefined) {
      run.screen = undefined;
    } else if (run.screen?.text !== text) {
      run.screen = { text, since: now };
    }
  }

  private beatProgress(worker: WorkerAgent, now: number): number {
    if (!worker.current) {
      return ((now / 1000) % 2) / 2;
    }
    const held = now - worker.beatStartedAt;
    return Math.min(1, held / Math.max(1, worker.current.minMs));
  }

  private homeOf(run: SessionRun, worker: WorkerAgent): Point {
    const slot = run.desk ?? run.lastDesk ?? 0;
    return worker.helper === null ? deskFor(slot) : helperSpot(slot, worker.helper);
  }

  /** Where a beat physically happens for this worker. */
  private spotFor(run: SessionRun, worker: WorkerAgent, station: StationId): Point {
    if (station === 'own_desk') {
      return this.homeOf(run, worker);
    }
    if (station === 'cabinets') {
      return cabinetsFor(run.desk ?? run.lastDesk ?? 0);
    }
    return STATIONS[station].spot;
  }

  /**
   * The worker agent for an id, creating it if the session has a desk. The
   * lead takes the seat; a helper takes the next free spot around the desk,
   * and a fourth helper is counted but not drawn (null). Newcomers walk in
   * from the door unless placed instantly (catch-up).
   */
  private ensureWorker(
    run: SessionRun,
    id: string,
    label: string | undefined,
    instant: boolean
  ): WorkerAgent | null {
    let worker = run.workers.get(id);
    if (worker) {
      if (label && worker.label === 'worker') {
        worker.label = label;
      }
      return worker;
    }
    if (run.desk === null) {
      return null;
    }
    let helper: number | null = null;
    if (id !== LEAD_WORKER) {
      helper = run.helperSlots.indexOf(null);
      if (helper === -1) {
        return null;
      }
      run.helperSlots[helper] = id;
    }
    worker = {
      id,
      label: id === LEAD_WORKER ? 'lead' : (label ?? 'worker'),
      helper,
      pos: { x: 0, y: 0 },
      facing: 1,
      state: 'idle',
      bubbleUntil: 0,
      queue: [],
      emptySince: null,
      fidgetAt: 0,
      beatStartedAt: this.clock.now(),
      target: { x: 0, y: 0 },
      departing: false,
      sentOff: false,
      departed: false,
    };
    const home = this.homeOf(run, worker);
    worker.pos = instant ? { ...home } : { ...STATIONS.door.spot };
    worker.target = { ...home };
    run.workers.set(id, worker);
    return worker;
  }

  /** Rebuild the session's workers straight from reduced state. */
  private syncWorkersFromState(run: SessionRun, instant: boolean): void {
    for (const id of Object.keys(run.state.workers)) {
      const worker = this.ensureWorker(run, id, run.state.workers[id].type, instant);
      if (worker && instant) {
        worker.pos = { ...this.homeOf(run, worker) };
        worker.target = { ...worker.pos };
      }
    }
    for (const [id, worker] of [...run.workers]) {
      if (id in run.state.workers || id === LEAD_WORKER || worker.departing) {
        continue;
      }
      if (instant) {
        if (worker.helper !== null && run.helperSlots[worker.helper] === id) {
          run.helperSlots[worker.helper] = null;
        }
        run.workers.delete(id);
      } else {
        worker.departing = true;
      }
    }
  }

  /**
   * Give a session a desk: its old one if that is still free, otherwise the
   * lowest free slot. Returns false when the floor is full.
   */
  private seat(run: SessionRun): boolean {
    if (run.desk !== null) {
      return true;
    }
    let slot = run.lastDesk !== null && this.desks[run.lastDesk] === null ? run.lastDesk : -1;
    if (slot === -1) {
      slot = this.desks.indexOf(null);
    }
    if (slot === -1) {
      return false;
    }
    this.desks[slot] = run.bus;
    run.desk = slot;
    run.closing = false;
    return true;
  }

  /** Everyone has left: free the desk, remember it, and step off the floor. */
  private releaseDesk(run: SessionRun): void {
    if (run.desk !== null) {
      this.desks[run.desk] = null;
      run.lastDesk = run.desk;
      run.desk = null;
    }
    run.workers.clear();
    run.helperSlots.fill(null);
    run.screen = undefined;
    run.gone = true;
  }

  /** Freed desks go to waiting sessions, most recently active first. */
  private seatWaiting(): void {
    const waiting = [...this.runs.values()]
      .filter((run) => !run.gone && run.desk === null)
      .sort((a, b) => b.lastEventAt - a.lastEventAt);
    for (const run of waiting) {
      if (!this.seat(run)) {
        return;
      }
      this.syncWorkersFromState(run, false);
    }
  }
}
