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
import { cycleMsFor, loopEnd } from './cycles';
import { AgentopiaEvent, LEAD_WORKER } from './events';
import {
  IDLE_ACTIVITIES,
  IdleAct,
  IdleActivity,
  IdlePlanContext,
  IdleProp,
  IdleStep,
  LOITER_SPOTS,
  WindowSpot,
  between,
  chatter,
} from './idle';
import { PetLife, PetView } from './petLife';
import { PetKind } from './pets';
import { SequencedEvent } from './reader';
import { isWalkable, route } from './route';
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
  GAIT,
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

/** What an idle avatar is up to, for the renderer to pose (see `idle.ts`). */
export interface ActivityView {
  /** Which of `IDLE_ACTIVITIES`. */
  id: string;
  /** The step it is on, or walking to. */
  act: IdleAct;
  /** What it has in hand, carried there or used there. */
  prop?: IdleProp;
  /** Once there: what it faces. */
  faceTo?: Point;
  /** Once there: sat down on a sofa, a chair, or at a desk. */
  seated?: boolean;
  /** Once there: the window whose blind it is pulling. */
  blind?: WindowSpot;
  /** Unique to this step of this run, for effects that fire once (a blind pulled). */
  key: string;
}

export interface Actor {
  id: string;
  /**
   * The figure's own identity, which outlives its role: a resident who takes
   * a new session's desk, and a lead who stays on as a resident when its
   * session ends, keep theirs. Renderers key their sprites by it.
   */
  avatar?: string;
  bus: string;
  /** The worker id within its session — `lead`, or a subagent id. */
  worker: string;
  /** A resident belongs to no session: it keeps the office lived in. */
  role: 'lead' | 'helper' | 'resident';
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
  /**
   * Milliseconds of animation played in the current state, at `tempo`. Skins
   * drive a state's loop from this rather than the wall clock, so the loop the
   * director waits on (`CYCLE_MS`) is the loop that is drawn. Absent from
   * hand-made frames, which animate on the frame clock instead.
   */
  phase?: number;
  /** How fast this worker's animation plays: 1, and faster while beats pile up behind it. */
  tempo?: number;
  /** What it is doing with itself, when it is idle and has picked something. */
  activity?: ActivityView;
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
  /** The office pets, when there are any (`DirectorOptions.idleLife.pets`). */
  pets: PetView[];
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
  /** The bubble has gone up: it goes up once, when the beat starts being performed. */
  said?: boolean;
  screen?: string;
  /** Coalesced repeat count — one longer beat instead of N. */
  reps: number;
}

/** Everything a worker will still perform: the current beat, then the queue. */
function pending(worker: WorkerAgent): Beat[] {
  return worker.current ? [worker.current, ...worker.queue] : worker.queue;
}

/** How fast a worker's animation plays: faster the more beats wait behind it. */
function tempoFor(worker: WorkerAgent): number {
  return Math.min(TEMPO_MAX, 1 + TEMPO_PER_BEAT * worker.queue.length);
}

/**
 * Count animation time in the worker's state, starting over when the state
 * changes; and the current beat's, while it is being performed.
 */
function advancePhase(worker: WorkerAgent, ms: number): void {
  if (worker.state !== worker.phaseState) {
    worker.phaseState = worker.state;
    worker.phaseMs = 0;
    worker.stopAt = null;
    return;
  }
  worker.phaseMs += ms;
  if (worker.current && PERFORMING.has(worker.state)) {
    worker.beatPlayedMs += ms;
  }
}

/** Two avatars talking: they hold the chat together, from when both have sat down. */
interface ChatPair {
  arrived: Set<string>;
  /** When the chat ends, once both are there. */
  until: number | null;
  /** Turns are counted from here, so the two always alternate. */
  epoch: number;
  /** One of them was called away: the other wraps up. */
  cancelled: boolean;
}

/** An idle avatar's plan: the activity it is on, its steps, and when to pick the next. */
interface IdleMind {
  activity: string | null;
  steps: IdleStep[];
  index: number;
  /** When it arrived at the current step and began holding it; null on the way. */
  heldSince: number | null;
  /** Past the current step's `via` point, if it has one. */
  viaDone: boolean;
  restUntil: number;
  /** The activity before, so nobody does the same thing twice running. */
  last: string | null;
  pair: ChatPair | null;
  /** Which turn of a chat it last spoke on, for a bubble per turn. */
  lastTurn: number;
  /** Counts activities, for each step's unique key. */
  seq: number;
}

/** What every figure on the floor has: where it is, where it is going, and what it shows. */
interface Body {
  avatar: string;
  pos: Point;
  facing: 1 | -1;
  state: ActorState;
  bubble?: string;
  bubbleUntil: number;
  /** Where it is headed. */
  target: Point;
  /** The waypoints still to walk to reach `target`, round the furniture. */
  path: Point[];
  /** The target `path` was planned for; a new target plans a new route. */
  pathFor: Point | null;
  /** Its idle plan, while it has one. */
  mind?: IdleMind;
}

/** An avatar that belongs to no session. */
interface Resident extends Body {
  id: string;
  mind: IdleMind;
  /** Surplus to the headcount: walking out of the door. */
  leaving: boolean;
}

interface WorkerAgent extends Body {
  id: string;
  label: string;
  /** Helper spot around the desk; null for the lead, who has the seat. */
  helper: number | null;
  station?: StationId;
  queue: Beat[];
  /** When the queue drained, for the linger-then-walk-home grace. */
  emptySince: number | null;
  /** Next time a thinking lead gets up to pace beside its desk. */
  fidgetAt: number;
  /** Pacing back and forth while it thinks, when it is. */
  pace: Pace | null;
  /** Animation played in the current state, at tempo; see `Actor.phase`. */
  phaseMs: number;
  /** The state `phaseMs` is counting. */
  phaseState: ActorState;
  /**
   * Where the current loop ends, once something is waiting for it to: the
   * state changes there and not before.
   */
  stopAt: number | null;
  /** Animation played of the current beat, at tempo: what its dwell minimum is measured in. */
  beatPlayedMs: number;
  /** The beat being performed, once arrived. */
  current?: Beat;
  beatStartedAt: number;
  /** Heading for the door once the queue drains. */
  departing: boolean;
  /** Departing because the session closed, not on its own worker.stop. */
  sentOff: boolean;
  /** Reached the door; removed on the next frame. */
  departed: boolean;
  /** The last event this worker performed; context for the next one. */
  lastEvent?: AgentopiaEvent;
}

/**
 * Pacing while thinking: back and forth between two spots, a pause at each
 * end. A leg is never abandoned halfway; new work waits for it to land.
 */
interface Pace {
  spots: [Point, Point];
  /** Which spot the current leg heads for. */
  to: 0 | 1;
  /** Legs left to walk; the last one ends back home. */
  legs: number;
  /** When the pause at the current end is over, once arrived. */
  pauseUntil: number | null;
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
/**
 * How often a long-thinking lead gets up from its chair to pace beside the
 * desk. Seated, it already swivels as it thinks, so getting up is the
 * occasional stretch of the legs rather than a constant shuffle.
 */
const FIDGET_EVERY_MS = 14_000;
/** A lead's pace behind its chair: to one end, across, and back, before it sits again. */
const LEAD_PACE_LEGS = 3;
/** Half the length of that line, in tiles: a few slow steps each way. */
const LEAD_PACE_HALF = 0.6;
/** How far behind the seat that line runs, in tiles: clear of the chair's back. */
const LEAD_PACE_BEHIND = 1;
/** A helper, standing anyway, paces once it has been thinking this long. */
const HELPER_PACE_AFTER_MS = 1500;
/** How far a helper paces either side of its spot, in tiles; their spots are close together. */
const HELPER_PACE_TILES = 0.35;
/** Pacing is a slow, thoughtful walk. */
const PACE_SPEED = 0.3;
/** The pause at each end of a pace, hand under the chin, before turning back. */
const PACE_PAUSE_MS = 1200;
/**
 * Beats waiting behind a worker play faster: each one queued adds this much
 * tempo, up to `TEMPO_MAX`. The same animation plays in full, only quicker,
 * and so do the dwell minimums and the walks.
 */
export const TEMPO_PER_BEAT = 0.35;
export const TEMPO_MAX = 2;
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
/** With idle life on, a lead quiet this long between turns gets up to do something. */
export const LEAD_IDLE_AFTER_MS = 20_000;
/** How long each speaker holds the floor in a chat. */
export const CHAT_TURN_MS = 2600;
/** Idle avatars stroll; pacing is slower still. */
const STROLL = 0.75;
const PACE = 0.45;

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
  /**
   * Keep the office lived in. Residents top the leads up to `residents`
   * avatars on the floor at all times, and every idle avatar — residents,
   * and leads between turns — picks activities from `IDLE_ACTIVITIES`. A new
   * session's lead is a resident who walks over to the desk; a lead whose
   * session ends stays on as a resident while the office is short. Off by
   * default, which keeps single-session replays and stories to the session.
   * `pets` are the office pets who live on the floor (see `pets.ts`).
   */
  idleLife?: { residents: number; pets?: readonly PetKind[] };
}

/**
 * The idle life every office view runs: four avatars about at all times, and
 * the office cat and dog. The floor, a session's replay, the website's hero
 * and the stories all use it, so every office looks lived in; core's own
 * tests leave it off.
 */
export const OFFICE_IDLE_LIFE: { residents: number; pets: readonly PetKind[] } = {
  residents: 4,
  pets: ['cat', 'dog'],
};

function newMind(now: number): IdleMind {
  return {
    activity: null,
    steps: [],
    index: 0,
    heldSince: null,
    viaDone: false,
    restUntil: now,
    last: null,
    pair: null,
    lastTurn: -1,
    seq: 0,
  };
}

/** The pose state an idle step is held in. */
function stateForAct(act: IdleAct): ActorState {
  return act === 'nap' ? 'napping' : act === 'chat' ? 'talking' : 'idle';
}

/** The nearest clear floor to a point, for getting up off a sofa. */
function clearNear(p: Point): Point {
  if (isWalkable(p)) {
    return p;
  }
  for (const r of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (isWalkable(q)) {
        return q;
      }
    }
  }
  return p;
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
  /** How many avatars the office keeps on the floor; 0 is no idle life. */
  private readonly headcount: number;
  private residents: Resident[] = [];
  private residentSeq = 0;
  /** The office pets, made on the first frame. */
  private petLife: PetLife | null = null;
  private readonly petKinds: readonly PetKind[];

  constructor(options: DirectorOptions) {
    this.clock = options.clock;
    this.rng = options.rng;
    this.choreography = options.choreography ?? defaultChoreography;
    this.headcount = Math.max(0, options.idleLife?.residents ?? 0);
    this.petKinds = options.idleLife?.pets ?? [];
  }

  private get idleLife(): boolean {
    return this.headcount > 0;
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
        advancePhase(worker, dtMs * tempoFor(worker));
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
          avatar: worker.avatar,
          bus: run.bus,
          worker: worker.id,
          role: worker.helper === null ? 'lead' : 'helper',
          label: worker.label,
          pos: { ...worker.pos },
          state: worker.state,
          station: worker.station,
          bubble: worker.bubbleUntil > now ? worker.bubble : undefined,
          progress: worker.mind ? this.idleProgress(worker, now) : this.beatProgress(worker, now),
          facing: worker.facing,
          stress,
          phase: worker.phaseMs,
          tempo: tempoFor(worker),
          activity: this.activityOf(worker),
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
    if (this.idleLife) {
      this.balanceResidents(now, dtMs === 0 && this.residentSeq === 0);
      for (const resident of [...this.residents]) {
        this.tickResident(resident, now, dtMs);
      }
      for (const r of this.residents) {
        actors.push({
          id: r.id,
          avatar: r.avatar,
          bus: '',
          worker: r.id,
          role: 'resident',
          label: 'resident',
          pos: { ...r.pos },
          state: r.state,
          bubble: r.bubbleUntil > now ? r.bubble : undefined,
          progress: this.idleProgress(r, now),
          facing: r.facing,
          stress: 0,
          activity: this.activityOf(r),
        });
      }
    }

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
      pets: this.petFrame(now, dtMs, actors),
    };
  }

  private speedFor(lagMs: number): number {
    if (lagMs > LAG_SPRINT_MS) {
      return 2.5;
    }
    if (lagMs > LAG_HURRY_MS) {
      // A sprint, just inside what sprinting legs can step.
      return 1.45;
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
    // A backlog plays the dwell minimum faster (animation time runs at the
    // worker's tempo) but never skips it, and the loop the worker is in
    // finishes before the beat ends: every performance plays in full.
    if (worker.current && PERFORMING.has(worker.state)) {
      const minMs = worker.current.minMs * (1 + 0.35 * (worker.current.reps - 1));
      if (
        worker.current.openSlots.size === 0 &&
        worker.beatPlayedMs >= minMs &&
        this.loopDone(worker)
      ) {
        run.playedEventTs = Math.max(run.playedEventTs, worker.current.eventTs);
        worker.current = undefined;
        this.skipStaleBeats(run, worker);
      }
    }

    // New work waits for what the worker is doing between beats to come to a
    // natural stop: a pacing leg lands, a swivel comes back round.
    if (!worker.current && worker.queue.length > 0 && this.readyForWork(worker)) {
      worker.emptySince = null;
      worker.pace = null;
      worker.current = worker.queue.shift();
      worker.beatStartedAt = now;
      worker.beatPlayedMs = 0;
      worker.stopAt = null;
      worker.target = { ...this.spotFor(run, worker, worker.current!.station) };
    }

    // A long-running open beat keeps its bubble up for the duration — the
    // difference between "compiling for 90 seconds" and "looks stuck".
    if (worker.current?.openSlots.size && worker.current.bubble) {
      worker.bubbleUntil = now + 1000;
    }

    // Queue drained and this worker is leaving: out through the door. The
    // helper spot frees now, so the next helper can head for it. A lead the
    // office is short of stays on instead, as a resident.
    if (!worker.current && worker.queue.length === 0 && (run.closing || worker.departing)) {
      if (worker.helper === null && this.idleLife && this.shortOfAvatars(run)) {
        this.becomeResident(worker, now);
        return;
      }
      if (!worker.departing) {
        worker.departing = true;
        worker.sentOff = true;
      }
      if (worker.helper !== null && run.helperSlots[worker.helper] === worker.id) {
        run.helperSlots[worker.helper] = null;
      }
      worker.pace = null;
      worker.target = { ...STATIONS.door.spot };
    }

    // Idle between turns, the lead is off doing something of its own, until
    // a beat calls it back — which it answers at once: idle life is filler,
    // never a beat, so it never holds the session up.
    if (worker.mind) {
      if (
        !worker.current &&
        worker.queue.length === 0 &&
        !worker.departing &&
        this.leadMayIdle(run, worker, idleMs)
      ) {
        this.tickIdle(worker, now, dtMs);
        return;
      }
      this.dropMind(worker);
      worker.pathFor = null;
      if (!worker.current) {
        worker.target = { ...this.homeOf(run, worker) };
      }
    }

    const atTarget = dist(worker.pos, worker.target) < 0.05;
    if (!atTarget) {
      const pacing = worker.pace !== null && !worker.current;
      // The queue as it stands now, with this tick's beat taken off it.
      const tempo = tempoFor(worker);
      const pace = pacing ? PACE_SPEED * tempo : Math.max(speed, tempo);
      const next = this.walk(worker, (WALK_TILES_PER_SEC * pace * dtMs) / 1000);
      worker.facing = next.x >= worker.pos.x ? 1 : -1;
      worker.pos = next;
      // The gait follows the speed: past what walking legs can step, a
      // sprint; past what sprinting legs can, a run.
      const tilesPerSec = WALK_TILES_PER_SEC * pace;
      worker.state = pacing
        ? 'pacing'
        : tilesPerSec > GAIT.sprinting.max + 1e-9
          ? 'running'
          : tilesPerSec > GAIT.walking.max + 1e-9
            ? 'sprinting'
            : 'walking';
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
        worker.beatPlayedMs = 0;
      }
      // Said on arrival, where the line belongs, not on the walk over.
      if (worker.current.bubble && !worker.current.said) {
        worker.current.said = true;
        worker.bubble = worker.current.bubble;
        worker.bubbleUntil = now + BUBBLE_MS;
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
    if (run.state.phase === 'working' && idleMs <= IDLE_REST_MS) {
      this.think(worker, now, home, atHome);
      return;
    }
    worker.pace = null;
    if (!atHome && now - worker.emptySince > LINGER_MS) {
      worker.target = { ...home };
    }
    if (this.leadMayIdle(run, worker, idleMs)) {
      worker.mind = newMind(now);
      return;
    }
    if (idleMs > IDLE_REST_MS) {
      // Quiet for a while: a nap at the desk, until something happens.
      worker.state = 'napping';
      return;
    }
    if (run.state.phase === 'waiting_on_user' && worker.helper === null) {
      worker.state = 'waiting';
    } else {
      worker.state = 'idle';
    }
  }

  /**
   * Thinking between beats. A lead thinks in its chair and every so often
   * gets up to pace beside the desk, out and back twice, then sits again; a
   * helper, on its feet anyway, paces a short line across its spot. Motion is
   * the signal that the office is alive, not stuck.
   */
  private think(worker: WorkerAgent, now: number, home: Point, atHome: boolean): void {
    const pace = worker.pace;
    if (pace) {
      // Arrived at an end (`tickWorker` only gets here once landed): pause,
      // hand under the chin, then turn back — or, the last leg walked, sit.
      worker.state = 'thinking';
      if (pace.pauseUntil === null) {
        pace.pauseUntil = now + PACE_PAUSE_MS;
        return;
      }
      if (now < pace.pauseUntil) {
        return;
      }
      pace.legs -= 1;
      if (pace.legs <= 0) {
        worker.pace = null;
        worker.target = { ...home };
        worker.fidgetAt = now + FIDGET_EVERY_MS + this.rng() * 2000;
        return;
      }
      pace.to = pace.to === 0 ? 1 : 0;
      pace.pauseUntil = null;
      worker.target = { ...pace.spots[pace.to] };
      return;
    }

    worker.state = 'thinking';
    if (!atHome) {
      if (now - (worker.emptySince ?? now) > LINGER_MS) {
        worker.target = { ...home };
      }
      return;
    }
    if (worker.helper !== null) {
      if (now - (worker.emptySince ?? now) < HELPER_PACE_AFTER_MS) {
        return;
      }
      const spots: [Point, Point] = [
        { x: home.x + HELPER_PACE_TILES, y: home.y },
        { x: home.x - HELPER_PACE_TILES, y: home.y },
      ];
      if (!spots.every(isWalkable)) {
        return;
      }
      // Out to one side first, then back and forth for as long as it thinks.
      worker.pace = { spots, to: 0, legs: Number.POSITIVE_INFINITY, pauseUntil: null };
      worker.target = { ...spots[0] };
      return;
    }
    if (worker.fidgetAt === 0) {
      worker.fidgetAt = now + FIDGET_EVERY_MS + this.rng() * 2000;
      return;
    }
    if (now < worker.fidgetAt) {
      return;
    }
    // Up from the chair to pace a line across the back of it, a step either
    // side — clear of the desk, its chair, and the next desk along — then
    // back to sit down.
    const dx = this.rng() > 0.5 ? LEAD_PACE_HALF : -LEAD_PACE_HALF;
    const ends: [Point, Point] = [
      { x: home.x + dx, y: home.y + LEAD_PACE_BEHIND },
      { x: home.x - dx, y: home.y + LEAD_PACE_BEHIND },
    ];
    if (!ends.every(isWalkable)) {
      worker.fidgetAt = now + FIDGET_EVERY_MS;
      return;
    }
    worker.pace = { spots: ends, to: 0, legs: LEAD_PACE_LEGS, pauseUntil: null };
    worker.target = { ...ends[0] };
  }

  /**
   * Whether the loop the worker is in has come round to its end, once asked
   * to stop: the first call marks where the loop ends, and it is done there.
   */
  private loopDone(worker: WorkerAgent): boolean {
    const cycle = cycleMsFor(
      worker.state,
      worker.station,
      worker.helper === null ? 'lead' : 'helper'
    );
    if (cycle <= 0) {
      return true;
    }
    worker.stopAt ??= loopEnd(worker.phaseMs, cycle);
    return worker.phaseMs >= worker.stopAt;
  }

  /**
   * Whether a worker between beats can take the next one now. Not halfway
   * through a pacing leg, and not halfway through a thinking swivel.
   */
  private readyForWork(worker: WorkerAgent): boolean {
    if (worker.pace) {
      // Paused at one end is a natural stop; halfway along a leg is not.
      return dist(worker.pos, worker.target) < 0.05;
    }
    return this.loopDone(worker);
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

  /**
   * Walk up to `tiles` along the worker's route to its target, planning the
   * route afresh whenever the target has moved. Returns the new position.
   */
  private walk(worker: Body, tiles: number): Point {
    if (!worker.pathFor || dist(worker.pathFor, worker.target) > 1e-9) {
      worker.path = route(worker.pos, worker.target);
      worker.pathFor = { ...worker.target };
    }
    let pos = worker.pos;
    let left = tiles;
    while (left > 0 && worker.path.length > 0) {
      const waypoint = worker.path[0];
      const d = dist(pos, waypoint);
      if (d > left) {
        return stepToward(pos, waypoint, left);
      }
      pos = { ...waypoint };
      left -= d;
      worker.path.shift();
    }
    return worker.path.length > 0 || dist(pos, worker.target) < 1e-9
      ? pos
      : stepToward(pos, worker.target, left);
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
    // A new lead is a resident the office can spare, if there is one: it
    // walks over from wherever it is rather than in through the door.
    const donor = id === LEAD_WORKER && this.idleLife ? this.spareResident(run.desk) : null;
    worker = {
      id,
      avatar: donor?.avatar ?? actorId(run.bus, id),
      label: id === LEAD_WORKER ? 'lead' : (label ?? 'worker'),
      helper,
      pos: { x: 0, y: 0 },
      facing: 1,
      state: 'idle',
      bubbleUntil: 0,
      queue: [],
      emptySince: null,
      fidgetAt: 0,
      pace: null,
      phaseMs: 0,
      phaseState: 'idle',
      stopAt: null,
      beatPlayedMs: 0,
      beatStartedAt: this.clock.now(),
      target: { x: 0, y: 0 },
      path: [],
      pathFor: null,
      departing: false,
      sentOff: false,
      departed: false,
    };
    const home = this.homeOf(run, worker);
    worker.pos = instant ? { ...home } : { ...(donor?.pos ?? STATIONS.door.spot) };
    worker.facing = donor?.facing ?? 1;
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
        worker.pathFor = null;
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

  // ---- the pets ---------------------------------------------------------------

  private petFrame(now: number, dtMs: number, actors: readonly Actor[]): PetView[] {
    if (this.petKinds.length === 0) {
      return [];
    }
    this.petLife ??= new PetLife(this.petKinds, this.rng, now);
    const avatars = actors.map((a) => ({
      avatar: a.avatar ?? a.id,
      pos: a.pos,
      idle: a.role === 'resident' || a.activity !== undefined,
    }));
    // Where every avatar is and is headed: no pet plans to go there.
    const claimed: Point[] = [
      ...actors.map((a) => a.pos),
      ...this.idlers().flatMap((body) =>
        body.mind ? body.mind.steps.slice(body.mind.index).map((step) => step.spot) : []
      ),
    ];
    return this.petLife.frame(now, dtMs, avatars, claimed);
  }

  // ---- idle life --------------------------------------------------------------

  /** Leads on the floor that are staying: seated sessions whose lead has not left. */
  private leadCount(except?: SessionRun): number {
    let n = 0;
    for (const run of this.runs.values()) {
      if (run === except || run.desk === null) {
        continue;
      }
      const lead = run.workers.get(LEAD_WORKER);
      if (lead && !lead.departed && !(lead.departing && lead.sentOff)) {
        n += 1;
      }
    }
    return n;
  }

  private stayingResidents(): Resident[] {
    return this.residents.filter((r) => !r.leaving);
  }

  /** Would the office be short of avatars without this session's lead? */
  private shortOfAvatars(run: SessionRun): boolean {
    return this.leadCount(run) + this.stayingResidents().length < this.headcount;
  }

  /**
   * A resident the office can spare for a new lead: one already at that desk,
   * else the nearest. Null when every resident is needed to make up the
   * headcount (and the lead walks in through the door).
   */
  private spareResident(desk: number | null): Resident | null {
    const staying = this.stayingResidents();
    if (staying.length === 0 || this.leadCount() + 1 + staying.length <= this.headcount) {
      return null;
    }
    const seat = deskFor(desk ?? 0);
    let best = staying[0];
    for (const r of staying) {
      if (dist(r.pos, seat) < dist(best.pos, seat)) {
        best = r;
      }
    }
    this.dropMind(best);
    this.residents = this.residents.filter((r) => r !== best);
    return best;
  }

  /** A lead whose session is over stays on as a resident, mid-activity and all. */
  private becomeResident(worker: WorkerAgent, now: number): void {
    worker.departing = true;
    worker.departed = true;
    this.residents.push({
      id: `resident/${this.residentSeq++}`,
      avatar: worker.avatar,
      pos: { ...worker.pos },
      facing: worker.facing,
      state: worker.state,
      bubble: worker.bubble,
      bubbleUntil: worker.bubbleUntil,
      target: { ...worker.target },
      path: worker.path,
      pathFor: worker.pathFor,
      mind: worker.mind ?? newMind(now),
      leaving: false,
    });
  }

  /**
   * Keep the floor at its headcount: residents walk in when it is short (or
   * are simply there, on the first frame), and walk out when more sessions
   * than that have desks.
   */
  private balanceResidents(now: number, first: boolean): void {
    const leads = this.leadCount();
    let staying = this.stayingResidents();
    const spots = [...LOITER_SPOTS];
    while (leads + staying.length < this.headcount) {
      const i = Math.floor(this.rng() * spots.length);
      const at = first && spots.length > 0 ? spots.splice(i, 1)[0] : STATIONS.door.spot;
      const n = this.residentSeq++;
      const mind = newMind(now + (first ? between(this.rng, 0, 2500) : 0));
      this.residents.push({
        id: `resident/${n}`,
        avatar: `resident/${n}`,
        pos: { ...at },
        facing: 1,
        state: 'idle',
        bubbleUntil: 0,
        target: { ...at },
        path: [],
        pathFor: null,
        mind,
        leaving: false,
      });
      staying = this.stayingResidents();
    }
    for (let extra = leads + staying.length - this.headcount; extra > 0; extra--) {
      const r = staying.pop();
      if (!r) {
        break;
      }
      this.dropMind(r);
      r.leaving = true;
      r.target = { ...STATIONS.door.spot };
    }
  }

  private tickResident(r: Resident, now: number, dtMs: number): void {
    if (!r.leaving) {
      this.tickIdle(r, now, dtMs);
      return;
    }
    if (dist(r.pos, r.target) >= 0.05) {
      this.stroll(r, dtMs, 1, 'walking');
      return;
    }
    this.residents = this.residents.filter((other) => other !== r);
  }

  /** May this lead go off and do something of its own right now? */
  private leadMayIdle(run: SessionRun, worker: WorkerAgent, idleMs: number): boolean {
    return (
      this.idleLife &&
      worker.helper === null &&
      !run.closing &&
      (run.state.phase === 'waiting_on_user' || run.state.phase === 'empty') &&
      idleMs > LEAD_IDLE_AFTER_MS
    );
  }

  /** Called away mid-activity: let go of the plan, and of whoever it was talking to. */
  private dropMind(body: Body): void {
    const mind = body.mind;
    if (!mind) {
      return;
    }
    if (mind.pair) {
      mind.pair.cancelled = true;
    }
    if ('leaving' in body) {
      // A resident keeps a mind; it only forgets what it was doing.
      Object.assign(mind, { ...newMind(this.clock.now()), last: mind.activity, seq: mind.seq });
      return;
    }
    body.mind = undefined;
  }

  /** Every avatar with an idle plan: residents, and leads idling between turns. */
  private idlers(): Body[] {
    const out: Body[] = this.stayingResidents();
    for (const run of this.runs.values()) {
      const lead = run.workers.get(LEAD_WORKER);
      if (lead?.mind) {
        out.push(lead);
      }
    }
    return out;
  }

  /** The spots other idlers are at or headed for. */
  private claimed(self: Body): Point[] {
    const spots: Point[] = [];
    for (const body of this.idlers()) {
      if (body === self || !body.mind) {
        continue;
      }
      const { steps, index } = body.mind;
      if (steps.length === 0) {
        spots.push(body.pos);
      }
      for (let i = index; i < steps.length; i++) {
        spots.push(steps[i].spot);
      }
    }
    return spots;
  }

  private planContext(body: Body): IdlePlanContext {
    const claimed = this.claimed(body);
    const taken = (spot: Point): boolean => claimed.some((c) => dist(c, spot) < 0.6);
    let desk: Point | undefined;
    for (const run of this.runs.values()) {
      if (run.workers.get(LEAD_WORKER) === body && run.desk !== null) {
        desk = deskFor(run.desk);
      }
    }
    const freeDesks = DESKS.map((d) => d.seat).filter(
      (seat, slot) => this.desks[slot] === null && !taken(seat)
    );
    return { rng: this.rng, from: body.pos, desk, freeDesks, taken };
  }

  /** Someone between activities who could stop for a chat. */
  private partnerFor(self: Body): Body | undefined {
    const free = this.idlers().filter(
      (body) => body !== self && body.mind !== undefined && body.mind.steps.length === 0
    );
    if (free.length === 0) {
      return undefined;
    }
    return free[Math.min(free.length - 1, Math.floor(this.rng() * free.length))];
  }

  /** Pick the next activity, weighted, never the last one, and plan it. */
  private choose(body: Body, now: number): void {
    const mind = body.mind;
    if (!mind) {
      return;
    }
    const ctx = this.planContext(body);
    let pool = IDLE_ACTIVITIES.filter((a) => a.id !== mind.last);
    while (pool.length > 0) {
      const total = pool.reduce((sum, a) => sum + a.weight, 0);
      let r = this.rng() * total;
      let chosen: IdleActivity = pool[pool.length - 1];
      for (const a of pool) {
        r -= a.weight;
        if (r < 0) {
          chosen = a;
          break;
        }
      }
      pool = pool.filter((a) => a !== chosen);
      const partner = chosen.people === 2 ? this.partnerFor(body) : undefined;
      if (chosen.people === 2 && !partner?.mind) {
        continue;
      }
      const plans = chosen.plan(ctx);
      if (!plans || plans.length < chosen.people) {
        continue;
      }
      this.begin(mind, chosen, plans[0]);
      if (partner?.mind) {
        this.begin(partner.mind, chosen, plans[1]);
        const pair: ChatPair = { arrived: new Set(), until: null, epoch: now, cancelled: false };
        mind.pair = pair;
        partner.mind.pair = pair;
      }
      return;
    }
    mind.restUntil = now + 2000;
  }

  private begin(mind: IdleMind, activity: IdleActivity, steps: IdleStep[]): void {
    mind.activity = activity.id;
    mind.steps = steps;
    mind.index = 0;
    mind.heldSince = null;
    mind.viaDone = false;
    mind.pair = null;
    mind.lastTurn = -1;
    mind.seq += 1;
  }

  private finish(body: Body, mind: IdleMind, now: number): void {
    const last = mind.steps[mind.steps.length - 1];
    mind.last = mind.activity;
    mind.activity = null;
    mind.steps = [];
    mind.index = 0;
    mind.heldSince = null;
    mind.pair = null;
    mind.restUntil = now + between(this.rng, 1500, 5000);
    // Up off the sofa (or out of the chair) onto clear floor before resting.
    if (last?.seated) {
      body.target = { ...(last.via ?? clearNear(body.pos)) };
    }
  }

  /** Walk toward the target at a stroll; true while still on the way. */
  private stroll(body: Body, dtMs: number, pace: number, state: ActorState): boolean {
    if (dist(body.pos, body.target) < 0.05) {
      body.pos = { ...body.target };
      return false;
    }
    const next = this.walk(body, (WALK_TILES_PER_SEC * pace * dtMs) / 1000);
    if (Math.abs(next.x - body.pos.x) > 1e-9) {
      body.facing = next.x >= body.pos.x ? 1 : -1;
    }
    body.pos = next;
    body.state = state;
    return true;
  }

  /** One frame of an idle avatar: choose, walk to the step, hold it, move on. */
  private tickIdle(body: Body, now: number, dtMs: number): void {
    const mind = body.mind;
    if (!mind) {
      return;
    }
    if (mind.steps.length === 0 && now >= mind.restUntil) {
      this.choose(body, now);
    }
    const step = mind.steps[mind.index];
    if (!step) {
      // Resting between activities, wherever it got up.
      if (!this.stroll(body, dtMs, STROLL, 'walking')) {
        body.state = 'idle';
      }
      return;
    }
    const goal = step.via && !mind.viaDone ? step.via : step.spot;
    if (dist(body.target, goal) > 1e-9) {
      body.target = { ...goal };
    }
    if (this.stroll(body, dtMs, step.pace ? PACE : STROLL, step.pace ? 'pacing' : 'walking')) {
      return;
    }
    if (goal !== step.spot) {
      mind.viaDone = true;
      return;
    }
    if (mind.heldSince === null) {
      mind.heldSince = now;
      mind.pair?.arrived.add(body.avatar);
    }
    let done: boolean;
    if (step.act === 'chat' && mind.pair) {
      const pair = mind.pair;
      if (pair.until === null && pair.arrived.size >= 2) {
        pair.until = now + step.ms;
        pair.epoch = now;
      }
      done = pair.cancelled || (pair.until !== null && now >= pair.until);
      const turn = pair.until === null ? -1 : Math.floor((now - pair.epoch) / CHAT_TURN_MS);
      const talking = turn >= 0 && turn % 2 === step.turn;
      body.state = talking ? 'talking' : 'idle';
      if (talking && turn !== mind.lastTurn) {
        mind.lastTurn = turn;
        if (this.rng() < 0.6) {
          body.bubble = chatter(this.rng);
          body.bubbleUntil = now + CHAT_TURN_MS - 300;
        }
      }
    } else {
      done = now - mind.heldSince >= step.ms;
      body.state = stateForAct(step.act);
    }
    if (done) {
      mind.index += 1;
      mind.heldSince = null;
      mind.viaDone = false;
      if (mind.index >= mind.steps.length) {
        this.finish(body, mind, now);
      }
    }
  }

  private idleProgress(body: Body, now: number): number {
    const mind = body.mind;
    const step = mind?.steps[mind.index];
    if (!mind || !step || mind.heldSince === null) {
      return ((now / 1000) % 2) / 2;
    }
    return Math.min(1, (now - mind.heldSince) / Math.max(1, step.ms));
  }

  private activityOf(body: Body): ActivityView | undefined {
    const mind = body.mind;
    const step = mind?.steps[mind.index];
    if (!mind || !step || mind.activity === null) {
      return undefined;
    }
    const there = mind.heldSince !== null;
    // On the way it carries what it fetched (the mug from the machine to the
    // table), or the tool for the job.
    const carried = mind.index > 0 || step.prop === 'can' ? step.prop : undefined;
    return {
      id: mind.activity,
      act: step.act,
      prop: there ? step.prop : carried,
      faceTo: there ? step.faceTo : undefined,
      seated: there ? step.seated : undefined,
      blind: there ? step.blind : undefined,
      key: `${body.avatar}#${mind.seq}.${mind.index}`,
    };
  }
}
