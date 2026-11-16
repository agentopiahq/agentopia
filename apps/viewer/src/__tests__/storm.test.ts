import { TORNADO_CYCLE_S, TORNADO_LIFE_S, lightning, tornado } from '../storm';

const glows = (storm: number, seconds = 150): number[] =>
  Array.from({ length: seconds * 20 }, (_, i) => lightning(i * 0.05, storm, 2.1, 0.95).glow);

/** How many separate strikes flare in a run of glows. */
const strikes = (all: number[]): number =>
  all.filter((g, i) => g > 0.5 && !(all[i - 1] > 0.5)).length;

describe('lightning', () => {
  it('strikes every couple of seconds in a storm, and is dark in between', () => {
    const all = glows(1, 60);
    expect(strikes(all)).toBeGreaterThanOrEqual(25);
    expect(all.filter((g) => g === 0).length / all.length).toBeGreaterThan(0.6);
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

describe('tornado', () => {
  const hour = Array.from({ length: 3600 }, (_, i) => tornado(i, 1));

  it('comes now and then in a storm, far rarer than the lightning', () => {
    const shown = hour.filter((t) => t !== null).length / hour.length;
    expect(shown).toBeGreaterThan(0.03);
    expect(shown).toBeLessThan(0.3);
  });

  it('never comes without a storm', () => {
    expect(Array.from({ length: 3600 }, (_, i) => tornado(i, 0)).every((t) => t === null)).toBe(
      true
    );
  });

  it('drops in, crawls across the light and lifts away', () => {
    const start = hour.findIndex((t) => t !== null);
    const first = tornado(start, 1)!;
    const middle = tornado(start + TORNADO_LIFE_S / 2, 1)!;
    expect(first.strength).toBeLessThan(0.2);
    expect(middle.strength).toBeCloseTo(1);
    expect(Math.sign(middle.across - first.across)).toBe(first.lean);
    for (let s = 0; s < TORNADO_LIFE_S; s++) {
      const t = tornado(start + s, 1);
      expect(t?.at).toBe(first.at);
      expect(t!.across).toBeGreaterThanOrEqual(0.2);
      expect(t!.across).toBeLessThanOrEqual(0.8);
    }
    expect(TORNADO_CYCLE_S).toBeGreaterThan(TORNADO_LIFE_S);
  });
});
