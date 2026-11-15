import { BILLBOARDS, BILLBOARD_SLOTS } from '../objects/skyline';

describe('billboards', () => {
  it.each(BILLBOARDS.map((b) => [b.words, b] as const))('%s stands on a slot', (_, b) => {
    expect(BILLBOARD_SLOTS.map((s) => s.u)).toContain(b.slot);
  });

  it('never share a slot', () => {
    const slots = BILLBOARDS.map((b) => b.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it.each(BILLBOARDS.map((b) => [b.words, b] as const))('%s fits inside one light', (_, b) => {
    expect(b.width).toBeLessThan(0.9);
    expect(Number.isInteger(b.slot)).toBe(true);
  });
});
