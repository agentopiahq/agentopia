import { lightning } from '../lightning';

const glows = (storm: number): number[] =>
  Array.from({ length: 3000 }, (_, i) => lightning(i * 0.05, storm, 2.1, 0.95).glow);

describe('lightning', () => {
  it('strikes now and then in a storm, and is dark in between', () => {
    const all = glows(1);
    const lit = all.filter((g) => g > 0.5).length;
    expect(lit).toBeGreaterThan(0);
    expect(lit / all.length).toBeLessThan(0.1);
  });

  it('never strikes without a storm', () => {
    expect(glows(0).every((g) => g === 0)).toBe(true);
  });

  it('strikes the same way at the same moment', () => {
    expect(lightning(123.4, 1, 2.1, 0.95)).toEqual(lightning(123.4, 1, 2.1, 0.95));
  });

  it('draws a bolt down the glass from the top, across the light', () => {
    const { bolt } = lightning(42, 1, 2.1, 0.95);
    expect(bolt[0][1]).toBe(2.1);
    for (let i = 1; i < bolt.length; i++) {
      expect(bolt[i][1]).toBeLessThan(bolt[i - 1][1]);
      expect(bolt[i][0]).toBeGreaterThanOrEqual(0);
      expect(bolt[i][0]).toBeLessThanOrEqual(1);
    }
  });
});
