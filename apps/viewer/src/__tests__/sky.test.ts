import {
  LUNAR_DAYS,
  SKY_DAY_MS,
  SUNRISE,
  SUNSET,
  WEATHERS,
  WEATHER_MS,
  WeatherKind,
  moonPhaseAt,
  realMoonPhaseAt,
  skyAt,
  skyMinutes,
  weatherOf,
} from '../sky';

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

describe('skyMinutes', () => {
  it.each([
    ['on the hour', 14 * 60, 0],
    ['at a quarter past', 14 * 60 + 15, SUNRISE],
    ['at half past', 9 * 60 + 30, 12 * 60],
    ['at a quarter to', 23 * 60 + 45, SUNSET],
    ['half a minute past the hour', 7 * 60 + 0.5, 12],
  ])('runs a day an hour: %s', (_, local, sky) => {
    expect(skyMinutes(local)).toBeCloseTo(sky);
  });
});

describe('the moon', () => {
  it.each([
    ['new', 0, SUNRISE],
    ['at first quarter', 0.25, 12 * 60],
    ['full', 0.5, SUNSET],
    ['at last quarter', 0.75, 0],
  ])('rises %s at its hour', (_, phase, rise) => {
    expect(skyAt(at, rise, phase).moonArc).toBeCloseTo(0);
    expect(Math.abs(skyAt(at, rise, phase).moon)).toBeLessThan(0.01);
    expect(skyAt(at, rise + 6 * 60, phase).moon).toBeCloseTo(1);
  });

  it('is down at noon when full', () => {
    expect(skyAt(at, 12 * 60, 0.5).moon).toBeLessThan(0);
  });

  it('goes round its phases every few of the sky days', () => {
    expect(moonPhaseAt(0)).toBe(0);
    expect(moonPhaseAt((LUNAR_DAYS / 2) * SKY_DAY_MS)).toBeCloseTo(0.5);
    expect(moonPhaseAt(LUNAR_DAYS * SKY_DAY_MS)).toBeCloseTo(0);
    expect(skyAt(SKY_DAY_MS * 3, 600).phase).toBeCloseTo(3 / LUNAR_DAYS);
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

describe('realMoonPhaseAt', () => {
  it.each([
    // Full moons and new moons, as the almanacs give them (UTC).
    ['full on 2024-04-23', Date.UTC(2024, 3, 23, 23, 49), 0.5],
    ['new on 2024-04-08', Date.UTC(2024, 3, 8, 18, 21), 0],
    ['full on 2026-11-24', Date.UTC(2026, 10, 24, 14, 53), 0.5],
  ])('puts the moon %s within a day of its phase', (_, at, phase) => {
    const off = Math.abs(((realMoonPhaseAt(at) - phase + 1.5) % 1) - 0.5);
    expect(off).toBeLessThan(1 / 29.5);
  });
});
