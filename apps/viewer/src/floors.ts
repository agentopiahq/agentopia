/**
 * The building's floors, top to bottom, and which one the view is on.
 *
 * The office is the top floor; under it is the server floor. More can be
 * added to `FLOORS` in order. The floor the view is on is kept per viewer, in
 * the browser, like the drawing style.
 */

export interface Floor {
  id: string;
  /** What the floor keys call it. */
  label: string;
}

/** Every floor, top to bottom. */
export const FLOORS: readonly Floor[] = [
  { id: 'office', label: 'the office' },
  { id: 'servers', label: 'the server floor' },
];

export type FloorId = (typeof FLOORS)[number]['id'];

/** Up or down a floor. */
export type Way = 'up' | 'down';

/** Where the floor the view is on is kept. */
export const FLOOR_KEY = 'agentopia.office.floor.v1';

/** The little of `Storage` this needs; a viewer with none keeps its floor for this visit. */
export interface FloorStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Which floor the view is on, and which ways it can go from there: no
 * further up than the top floor, nor down past the bottom one.
 */
export class FloorState {
  private at: number;
  private readonly listeners = new Set<(floor: Floor, way: Way, from: number) => void>();

  constructor(
    private readonly floors: readonly Floor[] = FLOORS,
    private readonly store: FloorStore | null = null
  ) {
    if (floors.length === 0) {
      throw new Error('a building has at least one floor');
    }
    let kept: string | null = null;
    try {
      kept = store?.getItem(FLOOR_KEY) ?? null;
    } catch {
      kept = null;
    }
    this.at = Math.max(
      0,
      floors.findIndex((floor) => floor.id === kept)
    );
  }

  /** The floor the view is on. */
  get floor(): Floor {
    return this.floors[this.at];
  }

  /** How far down the building the view is: 0 on the top floor. */
  get level(): number {
    return this.at;
  }

  /** Whether there is a floor that way. */
  can(way: Way): boolean {
    return way === 'up' ? this.at > 0 : this.at < this.floors.length - 1;
  }

  /** The floor that way, if there is one. */
  next(way: Way): Floor | null {
    if (!this.can(way)) {
      return null;
    }
    return this.floors[this.at + (way === 'up' ? -1 : 1)];
  }

  /** Every floor, top to bottom. */
  get all(): readonly Floor[] {
    return this.floors;
  }

  /** Go a floor up or down; nothing happens at the end of the building. */
  go(way: Way): boolean {
    return this.can(way) && this.goTo(this.floors[this.at + (way === 'up' ? -1 : 1)].id);
  }

  /**
   * Go straight to the floor `id`, however many floors away; nothing happens
   * for the floor the view is on already, or one the building does not have.
   */
  goTo(id: string): boolean {
    const to = this.floors.findIndex((floor) => floor.id === id);
    if (to < 0 || to === this.at) {
      return false;
    }
    const from = this.at;
    const way: Way = to < from ? 'up' : 'down';
    this.at = to;
    try {
      this.store?.setItem(FLOOR_KEY, this.floor.id);
    } catch {
      // A viewer with no storage keeps its floor for this visit only.
    }
    for (const listener of this.listeners) {
      listener(this.floor, way, from);
    }
    return true;
  }

  /** Hear every move between floors (which way, and from which level); returns a way to stop. */
  onChange(listener: (floor: Floor, way: Way, from: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** How long a trip between floors takes, in ms. */
export const TRAVEL_MS = 650;

/**
 * Where each floor is mid-trip: how far it has slid (in sheet pixels, up is
 * negative) and how much of it shows. The floor left slides away the way the
 * view travels from it, up and out going down, as the floor arrived at rises
 * (or drops) into its place. `t` runs 0 to 1 over the trip.
 */
export function travel(
  t: number,
  way: Way,
  distance: number
): { from: { y: number; alpha: number }; to: { y: number; alpha: number } } {
  const p = Math.min(1, Math.max(0, t));
  // Ease in and out, so the floors set off and arrive gently.
  const e = p * p * (3 - 2 * p);
  const dir = way === 'down' ? -1 : 1;
  return {
    from: { y: dir * distance * e, alpha: 1 - e },
    to: { y: -dir * distance * (1 - e), alpha: e },
  };
}
