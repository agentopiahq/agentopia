import { SUNRISE, SUNSET, WEATHERS, WEATHER_MS, WeatherKind, skyAt, weatherOf } from '../sky';

const at = 1_763_000_000_000;

describe('skyAt', () => {
  it.each([
    ['noon', 12 * 60, 1],
    ['midnight', 0, 0],
    ['three in the morning', 3 * 60, 0],
  ])('has the daylight of %s', (_, minutes, day) => {
    expect(skyAt(at, minutes).day).toBeCloseTo(day, 2);
  });

  it.each([
    ['sunrise', SUNRISE],
    ['sunset', SUNSET],
  ])('glows at %s', (_, minutes) => {
    const sky = skyAt(at, minutes);
    expect(sky.dusk).toBeGreaterThan(0.8);
    expect(Math.abs(sky.sun)).toBeLessThan(0.01);
  });

  it('crosses the sky from sunrise to sunset', () => {
    expect(skyAt(at, SUNRISE).arc).toBeCloseTo(0);
    expect(skyAt(at, 12 * 60).arc).toBeCloseTo(0.5);
    expect(skyAt(at, SUNSET).arc).toBeCloseTo(1);
  });

  it('gives the same sky for the same moment', () => {
    expect(skyAt(at, 600)).toEqual(skyAt(at, 600));
  });

  it('keeps every weather value in range', () => {
    for (let i = 0; i < 200; i++) {
      const sky = skyAt(at + i * 37 * 60 * 1000, (i * 53) % 1440);
      for (const v of [sky.cloud, sky.fog, sky.rain, sky.day, sky.dusk]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('eases from one spell of weather into the next without a jump', () => {
    for (let block = 1000; block < 1050; block++) {
      const edge = block * WEATHER_MS;
      const before = skyAt(edge - 1, 600);
      const after = skyAt(edge + 1, 600);
      expect(Math.abs(before.cloud - after.cloud)).toBeLessThan(0.01);
      expect(Math.abs(before.fog - after.fog)).toBeLessThan(0.01);
      expect(Math.abs(before.rain - after.rain)).toBeLessThan(0.01);
    }
  });

  it('holds a spell at its own weather in the middle of it', () => {
    const block = 4321;
    const sky = skyAt((block + 0.4) * WEATHER_MS, 600);
    expect(sky.kind).toBe(weatherOf(block));
    expect(sky.cloud).toBeCloseTo(WEATHERS[weatherOf(block)].cloud);
  });
});

describe('weatherOf', () => {
  it('comes round to every kind of weather', () => {
    const seen = new Set<WeatherKind>();
    for (let block = 0; block < 500; block++) {
      seen.add(weatherOf(block));
    }
    expect([...seen].sort()).toEqual(Object.keys(WEATHERS).sort());
  });
});
