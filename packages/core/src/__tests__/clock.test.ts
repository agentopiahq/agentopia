import { manualClock, seededRng } from '../clock';

describe('manualClock', () => {
  it('only moves when told to', () => {
    const clock = manualClock(100);
    expect(clock.now()).toBe(100);

    clock.advance(50);
    expect(clock.now()).toBe(150);

    clock.set(0);
    expect(clock.now()).toBe(0);
  });
});

describe('seededRng', () => {
  it('replays the same sequence for the same seed', () => {
    const draw = (seed: number): number[] => {
      const rng = seededRng(seed);
      return [rng(), rng(), rng()];
    };

    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });

  it.each([[1], [42], [99999]])('stays within [0, 1) for seed %i', (seed) => {
    const rng = seededRng(seed);
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
