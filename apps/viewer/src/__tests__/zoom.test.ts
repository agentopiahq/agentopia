import {
  TAP_SLOP,
  ZOOM_MAX,
  ZOOM_MIN,
  centreOn,
  isDrag,
  stepZoom,
  turnsOffice,
  typing,
} from '../zoom';

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
    ['a right drag pans', 2, false, false],
    ['a middle drag turns', 1, false, true],
    ['a shift drag turns, for a trackpad', 0, true, true],
  ])('%s', (_name, button, shiftKey, turns) => {
    expect(turnsOffice({ button, shiftKey })).toBe(turns);
  });
});
