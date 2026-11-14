import { Box3, Facing, Iso, SHADOW_DIR, V2, V3 } from '../kit/iso';
import { ObjectPart, OfficeObject, PieceState } from './types';

/** Where an object stands: its anchor in world tiles, and which way it faces. */
export interface Placement {
  at: V3;
  facing?: Facing;
}

/** A screen rectangle. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The world box of a local box, once placed. */
export function worldBox(k: Iso, box: Box3): Box3 {
  const a = k.world(box[0]);
  const b = k.world(box[1]);
  return [
    [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  ];
}

/**
 * The screen rectangle an object covers when drawn with this pen: its bounds,
 * and — with `withShadow` — the shadow it throws.
 */
export function measure(
  k: Iso,
  obj: OfficeObject,
  place: Placement,
  withShadow: boolean,
  pad = 4
): Rect {
  k.place(place.at, place.facing);
  const pts: V2[] = [];
  for (const c of Iso.corners(obj.bounds[0], obj.bounds[1])) {
    pts.push(k.P(c));
    if (withShadow) {
      const w = k.world(c);
      pts.push(k.screenOfWorld([w[0] + w[2] * SHADOW_DIR[0], w[1] + w[2] * SHADOW_DIR[1], 0]));
    }
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.floor(Math.min(...xs) - pad);
  const y = Math.floor(Math.min(...ys) - pad);
  return { x, y, w: Math.ceil(Math.max(...xs) + pad) - x, h: Math.ceil(Math.max(...ys) + pad) - y };
}

/** A box's centre is inside another box. */
function holds(box: Box3, p: V3): boolean {
  return [0, 1, 2].every((i) => p[i] >= box[0][i] - 1e-9 && p[i] <= box[1][i] + 1e-9);
}

const volume = (b: Box3): number => (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]) * (b[1][2] - b[0][2]);

/**
 * The part of an object a piece of its drawing (by its local box) belongs to:
 * the smallest whose footprint holds the box's centre, else the first.
 */
export function partOf(parts: readonly ObjectPart[], box: Box3): ObjectPart {
  const c: V3 = [0, 1, 2].map((i) => (box[0][i] + box[1][i]) / 2) as unknown as V3;
  let best = parts[0];
  let bestVolume = Infinity;
  for (const part of parts) {
    const v = volume(part.footprint);
    if (holds(part.footprint, c) && v < bestVolume) {
      best = part;
      bestVolume = v;
    }
  }
  return best;
}

/** Draw an object's body (and optionally its shadow first) with a pen. */
export function drawObject(
  k: Iso,
  obj: OfficeObject,
  place: Placement,
  withShadow: boolean,
  state?: PieceState,
  part?: string
): void {
  k.place(place.at, place.facing);
  if (withShadow) {
    obj.shadow(k, state);
  }
  const parts = obj.parts;
  k.only = parts && part !== undefined ? (box) => partOf(parts, box).name === part : null;
  try {
    obj.draw(k, state);
  } finally {
    k.only = null;
  }
}

/** A canvas, sized in CSS pixels at a device resolution. */
export function makeCanvas(w: number, h: number, resolution: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * resolution));
  canvas.height = Math.max(1, Math.ceil(h * resolution));
  return canvas;
}
