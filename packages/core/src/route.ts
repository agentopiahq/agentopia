/**
 * Walking routes round the furniture.
 *
 * A walk is never a straight line through a desk: `route` finds the way
 * between two floor points on a fine grid over the floor plan, going round
 * every obstacle with a little clearance for the avatar's feet, and then pulls
 * the path taut so it reads as someone heading somewhere, not a robot on
 * rails. It is pure and deterministic — the same two points always give the
 * same route — and total: a spot inside an obstacle (a seat tucked under its
 * desk, a fidget step against a chair) is still reached, by the shortest way
 * through it.
 */
import { INSIDE, OBSTACLES, Point, Rect } from './stations';

/** Grid cells per tile. */
const RES = 4;
const CELL = 1 / RES;
/** How far a walker keeps off anything, in tiles: about its feet's reach. */
export const CLEARANCE = 0.3;
/** What a step through an obstacle costs, against one over clear floor. */
const THROUGH_COST = 1000;

const COLS = Math.ceil(INSIDE.x1 * RES);
const ROWS = Math.ceil(INSIDE.y1 * RES);

const inside = (r: Rect, x: number, y: number, pad: number): boolean =>
  x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad;

/** Can someone stand here: inside the walls and clear of every obstacle? */
export function isWalkable(p: Point): boolean {
  const { x, y } = p;
  if (
    x < INSIDE.x0 + CLEARANCE ||
    y < INSIDE.y0 + CLEARANCE ||
    x > INSIDE.x1 - CLEARANCE ||
    y > INSIDE.y1 - CLEARANCE
  ) {
    return false;
  }
  return !OBSTACLES.some((r) => inside(r, x, y, CLEARANCE));
}

/** The walkability grid, built once: 1 for clear floor, 0 for blocked. */
const GRID_FREE: Uint8Array = (() => {
  const free = new Uint8Array(COLS * ROWS);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      free[j * COLS + i] = isWalkable({ x: (i + 0.5) * CELL, y: (j + 0.5) * CELL }) ? 1 : 0;
    }
  }
  return free;
})();

const clampCol = (x: number): number => Math.min(COLS - 1, Math.max(0, Math.floor(x * RES)));
const clampRow = (y: number): number => Math.min(ROWS - 1, Math.max(0, Math.floor(y * RES)));
const freeAt = (x: number, y: number): boolean => GRID_FREE[clampRow(y) * COLS + clampCol(x)] === 1;

/**
 * How much of the straight line from a to b runs through blocked floor, in
 * tiles. Past `limit` it stops counting and returns what it has so far, which
 * is already more than `limit`: the sum only grows, so the answer to "is it
 * within the limit?" is the same either way.
 */
function blockedAlong(a: Point, b: Point, limit = Infinity): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / (CELL / 2)));
  let blocked = 0;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    if (!freeAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) {
      blocked += d / n;
      if (blocked > limit) {
        return blocked;
      }
    }
  }
  return blocked;
}

/**
 * A binary min-heap of grid cells keyed by f, ties broken by insertion order.
 * Kept in parallel arrays rather than one tuple per entry: a search pushes
 * thousands of entries, and the tuples were most of its garbage.
 */
class Heap {
  private f: number[] = [];
  private seq: number[] = [];
  private cell: number[] = [];
  private n = 0;
  get size(): number {
    return this.cell.length;
  }
  private less(i: number, j: number): boolean {
    return this.f[i] < this.f[j] || (this.f[i] === this.f[j] && this.seq[i] < this.seq[j]);
  }
  private swap(i: number, j: number): void {
    const { f, seq, cell } = this;
    [f[i], f[j]] = [f[j], f[i]];
    [seq[i], seq[j]] = [seq[j], seq[i]];
    [cell[i], cell[j]] = [cell[j], cell[i]];
  }
  push(c: number, f: number): void {
    this.f.push(f);
    this.seq.push(this.n++);
    this.cell.push(c);
    let i = this.cell.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) {
        break;
      }
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.cell[0];
    const last = this.cell.length - 1;
    if (last > 0) {
      this.f[0] = this.f[last];
      this.seq[0] = this.seq[last];
      this.cell[0] = this.cell[last];
    }
    this.f.pop();
    this.seq.pop();
    this.cell.pop();
    const len = this.cell.length;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < len && this.less(l, m)) {
        m = l;
      }
      if (r < len && this.less(r, m)) {
        m = r;
      }
      if (m === i) {
        break;
      }
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

const NEIGHBOURS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Scratch for `search`, reset at the start of each one: it never holds state between routes. */
const G = new Float64Array(COLS * ROWS);
const CAME = new Int32Array(COLS * ROWS);
const CLOSED = new Uint8Array(COLS * ROWS);

/**
 * Searches already done, by start and goal cell. The grid never changes, so
 * the same two cells always give the same cells back, and walkers keep going
 * between the same spots: most routes after the first minute are a lookup.
 * Bounded, dropping the oldest first; it only ever saves time, never changes a
 * route.
 */
const SEARCHES = new Map<number, readonly number[]>();
const SEARCHES_MAX = 4096;

/** The cells of the cheapest way from one cell to another, remembered. */
function searchCached(start: number, goal: number): readonly number[] {
  const key = start * COLS * ROWS + goal;
  const hit = SEARCHES.get(key);
  if (hit) {
    return hit;
  }
  const cells = search(start, goal);
  if (SEARCHES.size >= SEARCHES_MAX) {
    SEARCHES.delete(SEARCHES.keys().next().value as number);
  }
  SEARCHES.set(key, cells);
  return cells;
}

/** The cells of the cheapest way from one cell to another (A*, octile). */
function search(start: number, goal: number): number[] {
  const g = G.fill(Infinity);
  const came = CAME.fill(-1);
  const closed = CLOSED.fill(0);
  const gx = goal % COLS;
  const gy = Math.floor(goal / COLS);
  const h = (cx: number, cy: number): number => {
    const dx = Math.abs(cx - gx);
    const dy = Math.abs(cy - gy);
    return dx > dy ? dx + (Math.SQRT2 - 1) * dy : dy + (Math.SQRT2 - 1) * dx;
  };
  const open = new Heap();
  g[start] = 0;
  open.push(start, h(start % COLS, Math.floor(start / COLS)));
  while (open.size > 0) {
    const c = open.pop();
    if (c === goal) {
      break;
    }
    if (closed[c]) {
      continue;
    }
    closed[c] = 1;
    const cx = c % COLS;
    const cy = Math.floor(c / COLS);
    for (const [dx, dy, len] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
        continue;
      }
      const n = ny * COLS + nx;
      if (closed[n]) {
        continue;
      }
      const cost = len * (GRID_FREE[n] ? 1 : THROUGH_COST);
      if (g[c] + cost < g[n]) {
        g[n] = g[c] + cost;
        came[n] = c;
        open.push(n, g[n] + h(nx, ny));
      }
    }
  }
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = came[c]) {
    cells.push(c);
    if (c === start) {
      break;
    }
  }
  return cells.reverse();
}

/**
 * The way from one floor point to another, as the waypoints after `from`,
 * ending exactly at `to`. A clear straight line is a single waypoint.
 */
export function route(from: Point, to: Point): Point[] {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-9) {
    return [];
  }
  if (blockedAlong(from, to) === 0) {
    return [{ ...to }];
  }
  const start = clampRow(from.y) * COLS + clampCol(from.x);
  const goal = clampRow(to.y) * COLS + clampCol(to.x);
  const cells = searchCached(start, goal);
  const path: Point[] = [
    { ...from },
    ...cells.slice(1, -1).map((c) => ({
      x: ((c % COLS) + 0.5) * CELL,
      y: (Math.floor(c / COLS) + 0.5) * CELL,
    })),
    { ...to },
  ];
  // Pull it taut: from each waypoint, head straight for the furthest one
  // further on that a straight line reaches without crossing more blocked
  // floor than the grid path did.
  const through: number[] = [0];
  for (let k = 1; k < path.length; k++) {
    through.push(through[k - 1] + blockedAlong(path[k - 1], path[k]));
  }
  const out: Point[] = [];
  let i = 0;
  while (i < path.length - 1) {
    let next = i + 1;
    for (let j = path.length - 1; j > i + 1; j--) {
      const limit = through[j] - through[i] + 1e-9;
      if (blockedAlong(path[i], path[j], limit) <= limit) {
        next = j;
        break;
      }
    }
    out.push(path[next]);
    i = next;
  }
  return out;
}
