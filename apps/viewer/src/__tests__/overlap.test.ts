import { Pt, rectTouchesPolygon } from '../overlap';
import { officeOutline } from '../room';

const diamond: Pt[] = [
  [50, 0],
  [100, 50],
  [50, 100],
  [0, 50],
];

describe('rectTouchesPolygon', () => {
  it.each([
    ['a rect inside the polygon', { x: 40, y: 40, w: 10, h: 10 }, true],
    ['a rect holding the whole polygon', { x: -10, y: -10, w: 200, h: 200 }, true],
    ['a rect over one corner', { x: 90, y: 40, w: 30, h: 20 }, true],
    ['a rect crossing an edge with no corner inside', { x: 20, y: 10, w: 60, h: 4 }, true],
    ['a rect in the empty corner of the bounding box', { x: 0, y: 0, w: 15, h: 15 }, false],
    ['a rect clear of the polygon', { x: 200, y: 200, w: 10, h: 10 }, false],
  ])('%s', (_, rect, touches) => {
    expect(rectTouchesPolygon(rect, diamond)).toBe(touches);
  });
});

describe('officeOutline', () => {
  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI])(
    'is a polygon round the office at yaw %f',
    (yaw) => {
      const outline = officeOutline(yaw);
      expect(outline.length).toBeGreaterThanOrEqual(4);
      // The title's corner of the sheet is paper at the home view.
      if (yaw === 0) {
        expect(rectTouchesPolygon({ x: 0, y: 0, w: 60, h: 60 }, outline)).toBe(false);
      }
    }
  );
});
