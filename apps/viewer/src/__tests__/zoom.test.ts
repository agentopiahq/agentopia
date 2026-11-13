import { ZOOM_MAX, ZOOM_MIN, centreOn, stepZoom } from '../zoom';

describe('zoom', () => {
  it.each<[string, number, 1 | -1, number]>([
    ['steps in', 1, 1, 1.25],
    ['steps out', 1, -1, 0.8],
    ['snaps back to 1 on the way through', 1.25, -1, 1],
    ['stops at the top', ZOOM_MAX, 1, ZOOM_MAX],
    ['stops at the bottom', ZOOM_MIN, -1, ZOOM_MIN],
  ])('%s', (_name, zoom, direction, expected) => {
    expect(stepZoom(zoom, direction)).toBeCloseTo(expected);
  });

  it.each<[string, number, number]>([
    ['centres a sheet that fits, wherever you aim', 900, 500],
    ['follows the aim while it stays clear of the edges', 600, 600],
    ['stops at the left edge', 50, 250],
    ['stops at the right edge', 990, 750],
  ])('%s', (name, want, expected) => {
    // A 1000-wide sheet at scale 1: a 1200-wide view holds all of it, a
    // 500-wide one sees half, so its centre stays 250 clear of either edge.
    const view = name.startsWith('centres') ? 1200 : 500;
    expect(centreOn(want, 1000, view, 1)).toBeCloseTo(expected);
  });
});
