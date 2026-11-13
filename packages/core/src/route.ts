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

/** How much of the straight line from a to b runs through blocked floor, in tiles. */
function blockedAlong(a: Point, b: Point): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / (CELL / 2)));
  let blocked = 0;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    if (!freeAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) {
      blocked += d / n;
    }
  }
  return blocked;
}

/** A small binary min-heap of grid cells, ties broken by insertion order. */
class Heap {
  private items: Array<[number, number, number]> = [];
  private n = 0;
  get size(): number {
    return this.items.length;
  }
  push(cell: number, f: number): void {
    const item: [number, number, number] = [f, this.n++, cell];
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(a[i], a[p])) {
        break;
      }
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l], a[m])) {
          m = l;
        }
        if (r < a.length && less(a[r], a[m])) {
          m = r;
        }
        if (m === i) {
          break;
        }
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top[2];
  }
}

const less = (a: [number, number, number], b: [number, number, number]): boolean =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

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

/** The cells of the cheapest way from one cell to another (A*, octile). */
function search(start: number, goal: number): number[] {
  const g = new Float64Array(COLS * ROWS).fill(Infinity);
  const came = new Int32Array(COLS * ROWS).fill(-1);
  const closed = new Uint8Array(COLS * ROWS);
  const gx = goal % COLS;
  const gy = Math.floor(goal / COLS);
  const h = (c: number): number => {
    const dx = Math.abs((c % COLS) - gx);
    const dy = Math.abs(Math.floor(c / COLS) - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const open = new Heap();
  g[start] = 0;
  open.push(start, h(start));
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
        open.push(n, g[n] + h(n));
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
  const cells = search(start, goal);
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
      if (blockedAlong(path[i], path[j]) <= through[j] - through[i] + 1e-9) {
        next = j;
        break;
      }
    }
    out.push(path[next]);
    i = next;
  }
  return out;
}
