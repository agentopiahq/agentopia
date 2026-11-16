import { driftAt } from '../sky';
import { SNOW_GUST, STORM_GUST, Wind, gust } from '../wind';

const at = 1_763_000_000_000;

/** How far a wind carries the clouds over `seconds`, stepped a frame at a time. */
const calm = { storm: 0, snow: 0 };
const blow = (
  wind: Wind,
  from: number,
  seconds: number,
  weather: { storm: number; snow: number }
): number => {
  const start = wind.at(from, weather);
  let end = start;
  for (let ms = 16; ms <= seconds * 1000; ms += 16) {
    end = wind.at(from + ms, weather);
  }
  return end - start;
};

describe('Wind', () => {
  it('starts where the sky’s own drift is', () => {
    expect(new Wind().at(at, calm)).toBeCloseTo(driftAt(at) % 10000);
  });

  it.each([
    ['a still day', calm, 1],
    ['a snowfall', { storm: 0, snow: 1 }, SNOW_GUST],
    ['a full storm', { storm: 1, snow: 0 }, STORM_GUST],
  ])('drifts the clouds at the right pace in %s', (_, weather, times) => {
    const still = driftAt(10_000) - driftAt(0);
    expect(blow(new Wind(), at, 10, weather)).toBeCloseTo(still * times, 2);
  });

  it('carries the clouds faster in a storm than in a snowfall, and a snowfall faster than a still day', () => {
    expect(gust({ storm: 1, snow: 0 })).toBeGreaterThan(gust({ storm: 0, snow: 1 }));
    expect(gust({ storm: 0, snow: 1 })).toBeGreaterThan(gust(calm));
  });

  it('never jumps when a storm blows up', () => {
    const wind = new Wind();
    let last = wind.at(at, calm);
    for (let i = 1; i < 300; i++) {
      const now = wind.at(at + i * 16, { storm: Math.min(1, i / 100), snow: 0 });
      expect(now - last).toBeLessThan((driftAt(16) - driftAt(0)) * STORM_GUST + 1e-9);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it('takes no more than a second’s step after a long pause', () => {
    const wind = new Wind();
    const storm = { storm: 1, snow: 0 };
    const before = wind.at(at, storm);
    const after = wind.at(at + 60_000, storm);
    expect(after - before).toBeCloseTo((driftAt(1000) - driftAt(0)) * STORM_GUST);
  });
});
