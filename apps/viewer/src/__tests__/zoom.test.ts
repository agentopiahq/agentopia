import {
  PAN_STEP,
  TAP_SLOP,
  ZOOM_MAX,
  ZOOM_MIN,
  centreOn,
  isDrag,
  panBy,
  stepZoom,
  turnsOffice,
  typing,
  wheelZoom,
  zoomAbout,
} from '../zoom';

describe('panBy', () => {
  const view = { w: 1000, h: 500 };
  it.each([
    ['right', 1, 0, { x: 100 + (1000 * PAN_STEP) / 2, y: 100 }],
    ['left', -1, 0, { x: 100 - (1000 * PAN_STEP) / 2, y: 100 }],
    ['down', 0, 1, { x: 100, y: 100 + (500 * PAN_STEP) / 2 }],
    ['up', 0, -1, { x: 100, y: 100 - (500 * PAN_STEP) / 2 }],
  ])('moves the view %s by a share of its size, in sheet units', (_name, dx, dy, expected) => {
    expect(panBy({ x: 100, y: 100 }, dx, dy, view, 2)).toEqual(expected);
  });
});

describe('wheel zoom', () => {
  it.each<[string, number, number, (z: number) => boolean]>([
    ['scrolling up zooms in', 1, -100, (z) => z > 1],
    ['scrolling down zooms out', 1, 100, (z) => z < 1],
    ['stops at the top', ZOOM_MAX, -1000, (z) => z === ZOOM_MAX],
    ['stops at the bottom', ZOOM_MIN, 1000, (z) => z === ZOOM_MIN],
  ])('%s', (_name, zoom, deltaY, ok) => {
    expect(ok(wheelZoom(zoom, deltaY))).toBe(true);
  });

  it('keeps the point under the cursor still', () => {
    const centre = { x: 500, y: 400 };
    const offset = { x: 120, y: -60 };
    const [scale, next] = [1, 2];
    const under = { x: centre.x + offset.x / scale, y: centre.y + offset.y / scale };
    const moved = zoomAbout(centre, offset, scale, next);
    expect(moved.x + offset.x / next).toBeCloseTo(under.x);
    expect(moved.y + offset.y / next).toBeCloseTo(under.y);
  });
});

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

describe('taps and drags', () => {
  it.each<[string, { x: number; y: number }, boolean]>([
    ['keeps a press that stays put a tap', { x: 100, y: 100 }, false],
    ['keeps a press that wobbles a little a tap', { x: 103, y: 102 }, false],
    ['makes a press that wanders a drag', { x: 100 + TAP_SLOP + 1, y: 100 }, true],
  ])('%s', (_name, to, expected) => {
    expect(isDrag({ x: 100, y: 100 }, to)).toBe(expected);
  });

  it.each<[string, EventTarget | null, boolean]>([
    ['nothing', null, false],
    ['a text field', { tagName: 'INPUT' } as unknown as EventTarget, true],
    [
      'an editable note',
      { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget,
      true,
    ],
    [
      'the office',
      { tagName: 'CANVAS', isContentEditable: false } as unknown as EventTarget,
      false,
    ],
  ])('tells whether a key press in %s is typing', (_name, target, expected) => {
    expect(typing(target)).toBe(expected);
  });
});

describe('turnsOffice', () => {
  it.each([
    ['a plain left drag pans', 0, false, false],
    ['a right drag turns', 2, false, true],
    ['a middle drag turns', 1, false, true],
    ['a shift drag turns, for a trackpad', 0, true, true],
  ])('%s', (_name, button, shiftKey, turns) => {
    expect(turnsOffice({ button, shiftKey })).toBe(turns);
  });
});
