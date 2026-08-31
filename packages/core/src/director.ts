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
import { OfficeState, emptyOffice, reduce } from './state';
import { DESKS, Point, STATIONS, StationId, WALK_TILES_PER_SEC, deskFor } from './stations';

/** Where a beat physically happens for this worker. */
function spotFor(station: StationId, deskSlot: number): Point {
  return station === 'own_desk' ? deskFor(deskSlot) : STATIONS[station].spot;
}

/**
 * The director: state + clock -> who is where, doing what.
 *
 * This is the animation brain — the sequencer. It owns per-worker beat
 * queues, walking, dwell minimums, coalescing, the adaptive lag + sprint
 * behaviour, and idle life. *What* is performed for each event comes from an
 * injected `ChoreographyRegistry` (per harness; see `choreography/`); *how*
 * and *when* it plays out is decided here. It is deliberately deterministic —
 * all time comes from the injected Clock, all chance from the injected Rng —
 * which is what makes replay reproducible and golden-frame tests possible.
 *
 * It knows nothing about pixels. Output is an OfficeFrame in tile space; the
 * renderer is a skin over it.
 */

export interface Actor {
  id: string;
  role: 'worker' | 'human';
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
}

export interface OfficeFrame {
  /** Director clock time, ms. */
  at: number;
  phase: OfficeState['phase'];
  /** How far the animation runs behind the newest ingested event. */
  lagMs: number;
  actors: Actor[];
  /** Session-long tallies, for set dressing. */
  counters: OfficeState['counters'];
  tasks: OfficeState['tasks'];
}

interface Beat {
  station: StationId;
  /** Animation state while performing it. */
  state: PerformState;
  minMs: number;
  /** Wall-clock ts of the event that opened the beat (drives lag). */
  eventTs: number;
  /** Open-ended until the matching tool.end arrives. */
  openSlot?: string;
  bubble?: string;
  /** Coalesced repeat count — one longer beat instead of N walks. */
  reps: number;
}

interface WorkerAgent {
  id: string;
  label: string;
  deskSlot: number;
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
  /** Where the worker is headed (desk or station spot). */
  target: Point;
  idlePhase: number;
  departed: boolean;
  /** The last event this worker performed; context for the next one. */
  lastEvent?: AgentopiaEvent;
}

const LINGER_MS = 2500;
const FIDGET_EVERY_MS = 5000;
const BUBBLE_MS = 3500;
const LAG_HURRY_MS = 2000;
const LAG_SPRINT_MS = 6000;
const LAG_TELEPORT_MS = 15000;
/** How long the human waits before the lead drifts to coffee, then a nap. */
const IDLE_COFFEE_MS = 20000;
const IDLE_NAP_MS = 90000;

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
  private state: OfficeState = emptyOffice();
  private workers = new Map<string, WorkerAgent>();
  private nextDesk = 0;
  private latestEventTs = 0;
  private playedEventTs = 0;
  private lastFrameAt: number | null = null;
  private waitingSince: number | null = null;

  constructor(options: DirectorOptions) {
    this.clock = options.clock;
    this.rng = options.rng;
    this.choreography = options.choreography ?? defaultChoreography;
  }

  /** Fold an event without animating it. For catch-up on late join. */
  reconstruct(event: SequencedEvent): void {
    this.state = reduce(this.state, event.event);
    this.latestEventTs = Math.max(this.latestEventTs, event.event.ts);
    this.playedEventTs = this.latestEventTs;
    this.syncWorkersFromState(true);
  }

  ingest(sequenced: SequencedEvent): void {
    const event = sequenced.event;
    this.state = reduce(this.state, event);
    // Anchor the played cursor to the first event, or the initial frame
    // measures lag against the epoch and spuriously starts in teleport mode.
    if (this.playedEventTs === 0) {
      this.playedEventTs = event.ts;
    }
    this.latestEventTs = Math.max(this.latestEventTs, event.ts);

    // Sequencer machinery, not staging: catch-up seating and the idle timer.
    if (event.kind === 'session.start') {
      this.syncWorkersFromState(true);
    }
    if (event.kind === 'turn.user') {
      this.waitingSince = null;
    }
    if (event.kind === 'turn.stop') {
      this.waitingSince = this.clock.now();
    }

    const choreography = this.choreography[event.kind];
    if (!choreography) {
      return;
    }
    for (const id of this.targetsFor(choreography, event)) {
      this.perform(choreography, event, id);
    }
  }

  /** Which workers a choreography addresses. */
  private targetsFor(choreography: EventChoreography, event: AgentopiaEvent): string[] {
    if (choreography.scope === 'office') {
      return [...this.workers.values()].filter((worker) => !worker.departed).map((w) => w.id);
    }
    if (choreography.scope === 'lead') {
      return [LEAD_WORKER];
    }
    return [event.worker];
  }

  /** Stage one event on one worker, per its choreography. */
  private perform(choreography: EventChoreography, event: AgentopiaEvent, id: string): void {
    const existing = this.workers.get(id);
    const ctx: AnimationContext = {
      event,
      prevEvent: existing?.lastEvent,
      actor: existing ? this.snapshot(existing) : undefined,
      office: this.state,
    };
    const segments = [
      ...(choreography.pre?.(ctx) ?? []),
      ...(choreography.main?.(ctx) ?? []),
      ...(choreography.post?.(ctx) ?? []),
    ];
    const release = choreography.release?.(ctx);
    const bubble = choreography.bubble?.(ctx);
    const acts =
      choreography.enters ||
      choreography.interrupt ||
      choreography.departs ||
      segments.length > 0 ||
      release !== undefined ||
      bubble !== undefined;
    if (!acts) {
      return;
    }
    const worker =
      choreography.ensure === false ? existing : this.ensureWorker(id, event.workerType, event.ts);
    if (!worker) {
      return;
    }
    if (choreography.interrupt) {
      this.recall(worker, event.ts);
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
      worker.departed = true;
      worker.queue = [];
      worker.current = undefined;
      worker.target = STATIONS.door.spot;
      worker.state = 'walking';
    }
    worker.lastEvent = event;
  }

  /** Queue a segment, coalescing repeat visits into one longer beat. */
  private enqueue(worker: WorkerAgent, segment: Segment, eventTs: number): void {
    const last = worker.queue[worker.queue.length - 1];
    // Coalesce: N consecutive beats at one station become one longer beat.
    if (
      segment.coalesce &&
      last &&
      last.station === segment.station &&
      last.state === 'working' &&
      !last.openSlot
    ) {
      last.reps += 1;
      last.eventTs = eventTs;
      return;
    }
    worker.queue.push({
      station: segment.station,
      state: segment.state,
      minMs: segment.minMs,
      eventTs,
      openSlot: segment.openSlot,
      bubble: segment.bubble,
      reps: 1,
    });
  }

  /**
   * Close the matching open beat wherever it is; the dwell minimum still
   * applies, so fast tools do not flicker.
   */
  private releaseSlot(worker: WorkerAgent, release: SegmentRelease, eventTs: number): void {
    const open =
      worker.current && worker.current.openSlot === release.slot
        ? worker.current
        : worker.queue.find((beat) => beat.openSlot === release.slot);
    if (open) {
      open.openSlot = undefined;
      if (release.into) {
        open.state = release.into.state;
        open.minMs = release.into.minMs;
        // The morphed beat (the slump) should be visible in full even if the
        // work beat had already been held a while.
        if (open === worker.current) {
          worker.beatStartedAt = this.clock.now();
        }
      }
    } else if (release.into) {
      this.enqueue(worker, release.into, eventTs);
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

    const lagMs = Math.max(0, this.latestEventTs - this.playedEventTs);
    const speed = this.speedFor(lagMs);

    for (const worker of this.workers.values()) {
      this.tickWorker(worker, now, dtMs, speed, lagMs);
    }
    // Departed workers vanish once they reach the door.
    for (const [id, worker] of [...this.workers]) {
      if (worker.departed && dist(worker.pos, STATIONS.door.spot) < 0.1) {
        this.workers.delete(id);
      }
    }

    const actors: Actor[] = [...this.workers.values()].map((worker) => ({
      id: worker.id,
      role: 'worker' as const,
      label: worker.label,
      pos: { ...worker.pos },
      state: worker.state,
      station: worker.station,
      bubble: worker.bubbleUntil > now ? worker.bubble : undefined,
      progress: this.beatProgress(worker, now),
      facing: worker.facing,
    }));

    return {
      at: now,
      phase: this.state.phase,
      lagMs,
      actors,
      counters: this.state.counters,
      tasks: this.state.tasks,
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

  private tickWorker(
    worker: WorkerAgent,
    now: number,
    dtMs: number,
    speed: number,
    lagMs: number
  ): void {
    // Way behind: drop the backlog and teleport to the newest beat.
    if (lagMs > LAG_TELEPORT_MS && worker.queue.length > 1) {
      const last = worker.queue[worker.queue.length - 1];
      worker.queue = [last];
      worker.current = undefined;
      worker.pos = { ...spotFor(last.station, worker.deskSlot) };
    }

    // Advance the queue when the current beat is done. Only once actually at
    // the station — a beat that closed while its worker was still walking must
    // not complete mid-walk, or fast tools make workers turn around in the
    // corridor and the dwell minimum never applies.
    if (worker.current && (worker.state === 'working' || worker.state === 'slump')) {
      const held = now - worker.beatStartedAt;
      const minMs = (worker.current.minMs * (1 + 0.35 * (worker.current.reps - 1))) / speed;
      if (!worker.current.openSlot && held >= minMs) {
        this.playedEventTs = Math.max(this.playedEventTs, worker.current.eventTs);
        worker.current = undefined;
      }
    }

    if (!worker.current && worker.queue.length > 0) {
      worker.emptySince = null;
      worker.current = worker.queue.shift();
      worker.target = { ...spotFor(worker.current!.station, worker.deskSlot) };
      if (worker.current!.bubble) {
        worker.bubble = worker.current!.bubble;
        worker.bubbleUntil = now + BUBBLE_MS;
      }
    }

    // A long-running open beat keeps its bubble up for the duration — the
    // difference between "compiling for 90 seconds" and "looks stuck".
    if (worker.current?.openSlot && worker.current.bubble) {
      worker.bubbleUntil = now + 1000;
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

    if (worker.current) {
      if (worker.state !== 'working' && worker.state !== 'slump') {
        worker.beatStartedAt = now;
      }
      worker.state = worker.current.state;
      worker.station = worker.current.station;
      return;
    }

    if (worker.departed) {
      worker.state = 'walking';
      return;
    }

    // Nothing queued. Linger a moment at the station — tool calls come in
    // bursts, and instantly rushing home between them would ping-pong — then
    // walk back to the desk. A desk-bound worker while the office is working
    // is the model generating, which gets its own state.
    worker.station = undefined;
    worker.emptySince ??= now;
    const desk = deskFor(worker.deskSlot);
    const atDesk = dist(worker.pos, desk) < 0.1;
    if (!atDesk && now - worker.emptySince > LINGER_MS) {
      worker.target = { ...desk };
    }
    if (this.state.phase === 'waiting_on_user' && worker.id === LEAD_WORKER) {
      worker.state = this.leadIdleState(worker, now);
    } else if (this.state.phase === 'working') {
      worker.state = 'thinking';
      // Long thinking gets restless: every few seconds, shift a step around
      // the desk. Motion is the signal that the office is alive, not stuck.
      if (atDesk && worker.fidgetAt === 0) {
        worker.fidgetAt = now + FIDGET_EVERY_MS + this.rng() * 2000;
      } else if (atDesk && now >= worker.fidgetAt) {
        const dx = this.rng() > 0.5 ? 1 : -1;
        worker.target = { x: desk.x + dx, y: desk.y + (this.rng() > 0.5 ? 0.5 : -0.5) };
        worker.fidgetAt = now + FIDGET_EVERY_MS + this.rng() * 2000;
      } else if (!atDesk && now - worker.emptySince > LINGER_MS) {
        // Wander back once the fidget step lands.
        worker.target = { ...desk };
      }
    } else {
      worker.state = 'idle';
    }
  }

  /** The longer you take, the more elaborate the lead's waiting gets. */
  private leadIdleState(worker: WorkerAgent, now: number): ActorState {
    const waited = this.waitingSince === null ? 0 : now - this.waitingSince;
    if (waited > IDLE_NAP_MS) {
      return 'napping';
    }
    if (waited > IDLE_COFFEE_MS) {
      // Wander between coffee and pacing, seeded so replays match.
      if (worker.idlePhase === 0) {
        worker.idlePhase = this.rng() > 0.5 ? 1 : 2;
      }
      if (worker.idlePhase === 1) {
        worker.target = { ...STATIONS.coffee.spot };
        return dist(worker.pos, worker.target) < 0.05 ? 'coffee' : 'walking';
      }
      return 'pacing';
    }
    worker.idlePhase = 0;
    return 'waiting';
  }

  private beatProgress(worker: WorkerAgent, now: number): number {
    if (!worker.current) {
      return ((now / 1000) % 2) / 2;
    }
    const held = now - worker.beatStartedAt;
    return Math.min(1, held / Math.max(1, worker.current.minMs));
  }

  private ensureWorker(id: string, label: string | undefined, eventTs?: number): WorkerAgent {
    let worker = this.workers.get(id);
    if (worker) {
      if (label && worker.label === 'worker') {
        worker.label = label;
      }
      return worker;
    }
    const deskSlot = id === LEAD_WORKER ? 0 : 1 + (this.nextDesk++ % (DESKS.length - 1));
    worker = {
      id,
      label: id === LEAD_WORKER ? 'lead' : (label ?? 'worker'),
      deskSlot,
      // Everyone enters through the door except the lead, who was always here.
      pos: id === LEAD_WORKER ? { ...deskFor(0) } : { ...STATIONS.door.spot },
      facing: 1,
      state: 'idle',
      bubbleUntil: 0,
      queue: [],
      emptySince: null,
      fidgetAt: 0,
      beatStartedAt: this.clock.now(),
      target: { ...deskFor(deskSlot) },
      idlePhase: 0,
      departed: false,
    };
    if (eventTs !== undefined) {
      this.playedEventTs = Math.max(this.playedEventTs, 0);
    }
    this.workers.set(id, worker);
    return worker;
  }

  /** Send a worker back to their desk. */
  private recall(worker: WorkerAgent, eventTs: number): void {
    worker.queue = [];
    if (worker.current && !worker.current.openSlot) {
      this.playedEventTs = Math.max(this.playedEventTs, worker.current.eventTs);
    }
    worker.current = undefined;
    worker.target = { ...deskFor(worker.deskSlot) };
    this.playedEventTs = Math.max(this.playedEventTs, eventTs);
  }

  /** Rebuild seated workers straight from reduced state (catch-up path). */
  private syncWorkersFromState(instant: boolean): void {
    for (const id of Object.keys(this.state.workers)) {
      const worker = this.ensureWorker(id, this.state.workers[id].type);
      if (instant) {
        worker.pos = { ...deskFor(worker.deskSlot) };
        worker.target = { ...worker.pos };
      }
    }
    for (const [id, worker] of [...this.workers]) {
      if (!(id in this.state.workers) && id !== LEAD_WORKER && !worker.departed) {
        this.workers.delete(id);
      }
    }
  }
}
