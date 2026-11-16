import { driftAt } from '../sky';
import { STORM_GUST, Wind } from '../wind';

const at = 1_763_000_000_000;

/** How far a wind carries the clouds over `seconds`, stepped a frame at a time. */
const blow = (wind: Wind, from: number, seconds: number, storm: number): number => {
  const start = wind.at(from, storm);
  let end = start;
  for (let ms = 16; ms <= seconds * 1000; ms += 16) {
    end = wind.at(from + ms, storm);
  }
  return end - start;
};

describe('Wind', () => {
  it('starts where the sky’s own drift is', () => {
    expect(new Wind().at(at, 0)).toBeCloseTo(driftAt(at) % 10000);
  });

  it.each([
    ['a still day', 0, 1],
    ['a full storm', 1, STORM_GUST],
  ])('drifts the clouds at the right pace on %s', (_, storm, times) => {
    const still = driftAt(10_000) - driftAt(0);
    expect(blow(new Wind(), at, 10, storm)).toBeCloseTo(still * times, 2);
  });

  it('never jumps when a storm blows up', () => {
    const wind = new Wind();
    let last = wind.at(at, 0);
    for (let i = 1; i < 300; i++) {
      const now = wind.at(at + i * 16, Math.min(1, i / 100));
      expect(now - last).toBeLessThan((driftAt(16) - driftAt(0)) * STORM_GUST + 1e-9);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it('takes no more than a second’s step after a long pause', () => {
    const wind = new Wind();
    const before = wind.at(at, 1);
    const after = wind.at(at + 60_000, 1);
    expect(after - before).toBeCloseTo((driftAt(1000) - driftAt(0)) * STORM_GUST);
  });
});
