/**
 * Whether a screen rectangle and a polygon overlap: for the page mode's
 * pinned title, which turns see-through wherever the office runs under it.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Pt = readonly [number, number];

/** Whether `p` lies inside the polygon (even-odd rule; any winding). */
export function insidePolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const cross = (o: Pt, a: Pt, b: Pt): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Whether segments ab and cd properly cross. */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function rectTouchesPolygon(rect: Rect, poly: readonly Pt[]): boolean {
  if (poly.length < 3 || rect.w <= 0 || rect.h <= 0) {
    return false;
  }
  const corners: Pt[] = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ];
  if (corners.some((c) => insidePolygon(c, poly))) {
    return true;
  }
  const inRect = ([x, y]: Pt): boolean =>
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  if (poly.some(inRect)) {
    return true;
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (let k = 0; k < 4; k++) {
      if (segmentsCross(a, b, corners[k], corners[(k + 1) % 4])) {
        return true;
      }
    }
  }
  return false;
}
