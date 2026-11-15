import { BILLBOARDS, BILLBOARD_SLOTS } from '../objects/skyline';
import { WINDOW_SPAN } from '../objects/wall';

/** The long wall's mullions in panorama u (u = -y): its band runs from y 3.5, three tiles a light. */
const mullionGap = (u: number): number => {
  const t = (-u - 0.5) / WINDOW_SPAN;
  return Math.abs(t - Math.round(t)) * WINDOW_SPAN;
};

describe('billboards', () => {
  it.each(BILLBOARDS.map((b) => [b.words, b] as const))('%s stands on a slot', (_, b) => {
    expect(BILLBOARD_SLOTS.map((s) => s.u)).toContain(b.slot);
  });

  it('never share a slot', () => {
    const slots = BILLBOARDS.map((b) => b.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it.each(BILLBOARDS.map((b) => [b.words, b] as const))('%s is clear of the mullions', (_, b) => {
    expect(b.width).toBeLessThan(0.9);
    expect(Number.isInteger(b.slot)).toBe(true);
  });
});
