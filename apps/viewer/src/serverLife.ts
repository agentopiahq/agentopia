import { Actor, DeskView, SequencedEvent, SessionPhase } from '@agentopia/core';

import { Heading } from './heading';
import { isRack } from './interact';
import { V2, V3 } from './kit/iso';
import { RACK } from './objects/serverRack';
import { CROSS_AISLE_X, FloorPiece, RACK_ROWS, SERVER_PIECES, rackX } from './serverRoom';
import { Sky } from './sky';

/**
 * What the server floor knows of the office upstairs, worked out from what
 * the office already has: its frames (the desks, their phases, their
 * helpers) and the events the page feeds its director. Pure: time in, the
 * floor's mood out, so the same session plays the same downstairs.
 *
 * - The racks' lights and fans run faster the busier the office is
 *   (`floorTempo`), and calm right down when it is quiet.
 * - Every live session has a rack of its own (`SESSION_RACKS`, by desk),
 *   lettered with its name and lit by how it is doing; when it ends, its
 *   rack spins down (`SPIN_DOWN_MS`) before it goes back to the pool.
 * - Each helper a session has running is a blade slotted into its rack's
 *   roof (`bladesFor`).
 * - Tool calls per minute go up on the status board by the stairs, and a
 *   failed call flashes a rack red (`FloorMeter`).
 */

/** How long a rack takes to spin down once its session has gone, ms. */
export const SPIN_DOWN_MS = 6000;
/** How long a failed call can keep its rack flashing red and smoking, ms, if no one comes to fix it. */
export const FAULT_MS = 30000;
/** How many minutes the status board shows. */
export const BOARD_MINUTES = 24;
/** The most blades a rack's roof holds. */
export const MAX_BLADES = 3;

/**
 * The racks the sessions get, by desk slot: spread over the rows whose fronts
 * face the home view, a run apart, so no two sessions' tags crowd each other.
 */
export const SESSION_RACKS: readonly FloorPiece[] = (
  [
    [2, 0, 3],
    [2, 1, 3],
    [4, 0, 3],
    [4, 1, 3],
    [0, 0, 3],
    [0, 1, 3],
    [4, 0, 0],
    [4, 1, 6],
  ] as const
).map(([row, side, i]) => {
  const rack = SERVER_PIECES.find(
    (piece) =>
      isRack(piece.name) &&
      piece.place.at[1] === RACK_ROWS[row].y &&
      Math.abs(piece.place.at[0] - rackX(side, i)) < 1e-6
  );
  if (!rack) {
    throw new Error(`no rack at row ${row}, run ${side}, place ${i}`);
  }
  return rack;
});

/**
 * How fast the floor's lights and fans run, for how busy the office is: a
 * slow idle blink with nobody at work, up to well over twice as fast with
 * several sessions working at once.
 */
export function floorTempo(desks: readonly Pick<DeskView, 'phase'>[]): number {
  const busy = desks.filter((desk) => desk.phase === 'working' || desk.phase === 'compacting');
  return Math.min(2.4, 0.45 + 0.65 * busy.length);
}

/** How many blades a session's rack holds: one per helper it has running. */
export const bladesFor = (desk: Pick<DeskView, 'subagents'> | undefined): number =>
  Math.max(0, Math.min(MAX_BLADES, desk?.subagents ?? 0));

/** The colour a session's rack is lit, by how it is doing. */
export function phaseLight(phase: SessionPhase): string {
  switch (phase) {
    case 'working':
      return '#5fd38a';
    case 'waiting_on_user':
      return '#f2b44a';
    case 'awaiting_approval':
      return '#ef6f5c';
    case 'compacting':
      return '#6fb6ef';
    default:
      return '#b7b0a2';
  }
}

/** What a session's rack is called on its tag: its name, else its desk's number. */
export function rackTag(desk: Pick<DeskView, 'name' | 'slot'>): string {
  const name = desk.name?.trim();
  if (!name) {
    return `desk ${desk.slot + 1}`;
  }
  return name.length > 22 ? `${name.slice(0, 21).trimEnd()}…` : name;
}

/** A session's rack as the floor draws it: whose it is, and whether it is still up or spinning down. */
export interface SessionRack {
  rack: FloorPiece;
  bus: string;
  tag: string;
  light: string;
  blades: number;
  /** When its session went (ms, the floor's clock), while it spins down; null while it is live. */
  downSince: number | null;
}

/**
 * Who has which rack, kept from frame to frame: a live session holds its
 * desk's rack, and a session gone keeps it spinning down for
 * `SPIN_DOWN_MS` before it is free again.
 */
export class SessionRacks {
  private held = new Map<number, SessionRack>();

  update(at: number, desks: readonly DeskView[]): SessionRack[] {
    const live = new Set<number>();
    for (const desk of desks) {
      const rack = SESSION_RACKS[desk.slot];
      if (!rack) {
        continue;
      }
      live.add(desk.slot);
      this.held.set(desk.slot, {
        rack,
        bus: desk.bus,
        tag: rackTag(desk),
        light: phaseLight(desk.phase),
        blades: bladesFor(desk),
        downSince: null,
      });
    }
    for (const [slot, held] of this.held) {
      if (live.has(slot)) {
        continue;
      }
      if (held.downSince === null) {
        this.held.set(slot, { ...held, downSince: at, blades: 0, light: phaseLight('closed') });
      } else if (at - held.downSince >= SPIN_DOWN_MS) {
        this.held.delete(slot);
      }
    }
    return [...this.held.values()];
  }
}

/** A failed tool call, and the session it failed for. */
export interface Fault {
  bus: string;
  at: number;
}

/**
 * The office's tool traffic, as the events go by: when each call started,
 * and which failed. Only the last half hour is kept.
 */
export class FloorMeter {
  private starts: Array<{ at: number; bus: string }> = [];
  private faults: Fault[] = [];

  note({ event, bus }: SequencedEvent): void {
    const from = bus ?? event.session;
    if (event.kind === 'tool.start') {
      this.starts.push({ at: event.ts, bus: from });
    } else if (event.kind === 'tool.end' && event.tool?.status === 'failed') {
      this.faults.push({ bus: from, at: event.ts });
    }
    const keep = event.ts - 30 * 60_000;
    if (this.starts.length > 4000 || (this.starts[0]?.at ?? keep) < keep) {
      this.starts = this.starts.filter((t) => t.at >= keep).slice(-4000);
    }
    this.faults = this.faults.filter((f) => f.at >= event.ts - FAULT_MS * 2);
  }

  /** How many calls one session started in the last `minutes` up to `now`. */
  callsFor(bus: string, now: number, minutes = 10): number {
    return this.starts.filter((t) => t.bus === bus && t.at <= now && now - t.at < minutes * 60_000)
      .length;
  }

  /** Calls started in each of the last `minutes` whole minutes up to `now`, oldest first. */
  perMinute(now: number, minutes = BOARD_MINUTES): number[] {
    const out = new Array<number>(minutes).fill(0);
    for (const { at: t } of this.starts) {
      const ago = Math.floor((now - t) / 60_000);
      if (ago >= 0 && ago < minutes) {
        out[minutes - 1 - ago] += 1;
      }
    }
    return out;
  }

  /** The calls that failed within `FAULT_MS` of `now`. */
  faultsAt(now: number): Fault[] {
    return this.faults.filter((f) => f.at <= now && now - f.at < FAULT_MS);
  }
}

/**
 * The rack a fault shows on: its session's own rack, else one picked by its
 * session's name, so the same session always smokes the same rack.
 */
export function faultRack(bus: string, held: readonly SessionRack[]): FloorPiece {
  const own = held.find((r) => r.bus === bus && r.downSince === null);
  if (own) {
    return own.rack;
  }
  const racks = SERVER_PIECES.filter((piece) => isRack(piece.name));
  let h = 0;
  for (const c of bus) {
    h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  }
  return racks[h % racks.length];
}

// ---- the thermometer -------------------------------------------------------------

/**
 * The floor's temperature for the sky outside: held near eighteen, a little
 * warmer through the afternoon and cooler in the small hours and the rain.
 * To a tenth of a degree, so the dial only moves when it reads differently.
 */
export function floorCelsius(sky: Pick<Sky, 'sun' | 'rain' | 'day'>): number {
  const c = 18 + 1.6 * Math.max(-1, Math.min(1, sky.sun)) + 0.6 * sky.day - 0.7 * sky.rain;
  return Math.round(c * 10) / 10;
}

// ---- walking about ----------------------------------------------------------------

/** Where a walk along a path is after `d` tiles, and which way along the floor it is headed. */
export function along(path: readonly V2[], d: number): { at: V2; heading: Heading; done: boolean } {
  let left = Math.max(0, d);
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (left <= len || i === path.length - 1) {
      const t = len === 0 ? 1 : Math.min(1, left / len);
      return {
        at: [ax + (bx - ax) * t, ay + (by - ay) * t],
        heading: headingOf(bx - ax, by - ay),
        done: i === path.length - 1 && left >= len,
      };
    }
    left -= len;
  }
  const end = path[path.length - 1] ?? [0, 0];
  return { at: [end[0], end[1]], heading: '+y', done: true };
}

/** The length of a path, in tiles. */
export const pathLength = (path: readonly V2[]): number =>
  path.reduce(
    (sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1])),
    0
  );

function headingOf(dx: number, dy: number): Heading {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? '+x' : '-x';
  }
  return dy >= 0 ? '+y' : '-y';
}

/** Where someone stands to work at a rack: in its cold aisle, off its front door. */
export function frontOf(rack: FloorPiece, gap = 0.6): V2 {
  const s = rack.place.facing === '-y' ? -1 : 1;
  return [rack.place.at[0], rack.place.at[1] + s * (RACK.d / 2 + gap)];
}

/** Which way someone at a rack's front faces: at the rack. */
export const facingRack = (rack: FloorPiece): Heading => (rack.place.facing === '-y' ? '+y' : '-y');

/** From one aisle spot to another by way of the cross aisle (or straight along, in the same aisle). */
export function aislePath(from: V2, to: V2): V2[] {
  if (Math.abs(from[1] - to[1]) < 1e-6) {
    return [from, to];
  }
  return [from, [CROSS_AISLE_X, from[1]], [CROSS_AISLE_X, to[1]], to];
}

// ---- the cat's warm spots ------------------------------------------------------------

/**
 * Where the cat naps down here (`PetAway.spot`, one of `SERVER_CAT_SPOTS`):
 * up on two racks' warm roofs, behind their fans, and on the floor by an air
 * handler's warm side. Each is where it lies and how high.
 */
export const CAT_SPOTS: readonly V3[] = [
  [rackX(0, 1), RACK_ROWS[0].y + 0.3, RACK.h],
  [rackX(1, 3), RACK_ROWS[2].y + 0.3, RACK.h],
  [6.6, 2.75, 0],
  [rackX(1, 2), RACK_ROWS[4].y + 0.3, RACK.h],
];

// ---- the maintenance robot --------------------------------------------------------------

/** The racks the robot does its rounds of, in order: one at each end of every cold aisle. */
const ROUNDS: readonly FloorPiece[] = (() => {
  const racks = SERVER_PIECES.filter((piece) => isRack(piece.name));
  const at = (row: number, side: 0 | 1, i: number): FloorPiece | undefined =>
    racks.find(
      (r) => Math.abs(r.place.at[0] - rackX(side, i)) < 1e-6 && r.place.at[1] === RACK_ROWS[row].y
    );
  return [
    at(0, 0, 2),
    at(2, 1, 4),
    at(4, 0, 4),
    at(1, 1, 1),
    at(2, 0, 5),
    at(4, 1, 2),
    at(3, 0, 1),
  ].filter((r): r is FloorPiece => r !== undefined);
})();

/** The robot's pace on its rounds, and hurrying to a smoking rack, tiles a second. */
const BOT_SPEED = { round: 0.9, rush: 2.2 } as const;
/** How long it spends swapping a drive, and fixing a fault once it gets there, ms. */
export const SWAP_MS = 6000;
export const FIX_MS = 4000;

export interface RobotView {
  at: V2;
  heading: Heading;
  /** How far its arm is out, 0 to 1: in at a rack, swapping or fixing. */
  reach: number;
  mode: 'rounds' | 'swap' | 'rush' | 'fix';
  /** The rack it is fixing, while it is. */
  fixing: FloorPiece | null;
}

/**
 * The maintenance robot: on its rounds it rolls to the next rack on its list
 * and swaps a drive there; when a rack faults it drops what it is doing,
 * rushes over and fixes it. Stepped by the floor's clock, so it plays the
 * same for the same faults.
 */
export class Robot {
  private at: V2;
  private path: V2[] = [];
  private walked = 0;
  private mode: RobotView['mode'] = 'rounds';
  private next = 0;
  private since = 0;
  private heading: Heading = '-x';
  private target: FloorPiece | null = null;
  private readonly fixed = new Set<string>();

  constructor() {
    this.at = frontOf(ROUNDS[0], 0.55);
    this.mode = 'swap';
  }

  /** A fault the robot has seen to, by its session and when it happened. */
  isFixed(fault: { bus: string; at: number }): boolean {
    return this.fixed.has(`${fault.bus}@${fault.at}`);
  }

  step(
    at: number,
    dt: number,
    faults: ReadonlyArray<{ bus: string; at: number; rack: FloorPiece }>
  ): RobotView {
    const open = faults.find((f) => !this.isFixed(f));
    if (open && this.mode !== 'rush' && this.mode !== 'fix') {
      this.goTo(open.rack, 'rush', at);
    }
    if (this.mode === 'rounds' || this.mode === 'rush') {
      this.walked += (dt / 1000) * BOT_SPEED[this.mode === 'rush' ? 'rush' : 'round'];
      const where = along(this.path, this.walked);
      this.at = where.at;
      this.heading = where.heading;
      if (where.done) {
        this.mode = this.mode === 'rush' ? 'fix' : 'swap';
        this.since = at;
        if (this.target) {
          this.heading = facingRack(this.target);
        }
      }
    } else {
      const hold = this.mode === 'fix' ? FIX_MS : SWAP_MS;
      if (at - this.since >= hold) {
        if (this.mode === 'fix' && open) {
          this.fixed.add(`${open.bus}@${open.at}`);
        }
        this.next = (this.next + 1) % ROUNDS.length;
        this.goTo(ROUNDS[this.next], 'rounds', at);
      }
    }
    const held = this.mode === 'swap' || this.mode === 'fix';
    const t = held ? (at - this.since) / (this.mode === 'fix' ? FIX_MS : SWAP_MS) : 0;
    return {
      at: [this.at[0], this.at[1]],
      heading: this.heading,
      reach: held ? Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) : 0,
      mode: this.mode,
      fixing: this.mode === 'fix' ? this.target : null,
    };
  }

  private goTo(rack: FloorPiece, mode: 'rounds' | 'rush', at: number): void {
    this.target = rack;
    this.path = aislePath(this.at, frontOf(rack, 0.55));
    this.walked = 0;
    this.mode = mode;
    this.since = at;
  }
}

// ---- the racks' cards -------------------------------------------------------------------

/** A rack's number on the floor, B1-01 on, in the order they stand. */
export function rackNumber(rack: FloorPiece): string {
  const racks = SERVER_PIECES.filter((piece) => isRack(piece.name));
  const n = racks.indexOf(rack) + 1;
  return `B1-${String(n).padStart(2, '0')}`;
}
