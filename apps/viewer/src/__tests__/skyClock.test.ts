import { NEW_MOON_AT, SYNODIC_MS, moonPhaseAt, skyMinutes } from '../sky';
import { SkyClock, clockFace, minutesAlong } from '../skyClock';

describe('SkyClock', () => {
  it('follows the wall clock until set', () => {
    const clock = new SkyClock();
    expect(clock.following).toBe(true);
    expect(clock.minutesAt(14 * 60 + 30)).toBeCloseTo(skyMinutes(14 * 60 + 30));
  });

  it('jumps to a time set by hand and runs on from it at the same pace', () => {
    const clock = new SkyClock();
    clock.set(18 * 60, 9 * 60 + 15);
    expect(clock.following).toBe(false);
    expect(clock.minutesAt(9 * 60 + 15)).toBeCloseTo(18 * 60);
    // Five real minutes on, the sky is two hours further on.
    expect(clock.minutesAt(9 * 60 + 20)).toBeCloseTo(20 * 60);
    // And round past its midnight.
    expect(clock.minutesAt(9 * 60 + 30)).toBeCloseTo(0);
  });

  it('goes back to the wall clock when told to follow it', () => {
    const clock = new SkyClock();
    clock.set(3 * 60, 600);
    clock.follow();
    expect(clock.following).toBe(true);
    expect(clock.minutesAt(615)).toBeCloseTo(skyMinutes(615));
  });

  it('keeps local time when told to, a day a day', () => {
    const clock = new SkyClock();
    clock.keepLocalTime(true);
    expect(clock.keepsLocalTime).toBe(true);
    expect(clock.following).toBe(true);
    expect(clock.minutesAt(14 * 60 + 30)).toBeCloseTo(14 * 60 + 30);
    expect(clock.minutesAt(23 * 60 + 59.5)).toBeCloseTo(23 * 60 + 59.5);
  });

  it('ignores a time set by hand while it keeps local time', () => {
    const clock = new SkyClock();
    clock.keepLocalTime(true);
    const version = clock.version;
    clock.set(3 * 60, 9 * 60);
    expect(clock.minutesAt(9 * 60)).toBeCloseTo(9 * 60);
    expect(clock.version).toBe(version);
  });

  it('drops a time set by hand on going to local time, and back to the time-lapse after', () => {
    const clock = new SkyClock();
    clock.set(3 * 60, 600);
    clock.keepLocalTime(true);
    expect(clock.minutesAt(600)).toBeCloseTo(600);
    clock.keepLocalTime(false);
    expect(clock.keepsLocalTime).toBe(false);
    expect(clock.following).toBe(true);
    expect(clock.minutesAt(615)).toBeCloseTo(skyMinutes(615));
  });

  it('counts a change of pace, but not a repeat of it', () => {
    const clock = new SkyClock();
    clock.keepLocalTime(true);
    clock.keepLocalTime(true);
    expect(clock.version).toBe(1);
    clock.keepLocalTime(false);
    expect(clock.version).toBe(2);
  });

  it.each([
    ['new', 0],
    ['at first quarter', 0.25],
    ['full', 0.5],
    ['at last quarter', 0.75],
  ])('shows the real moon %s in local time, the time-lapse moon otherwise', (_, phase) => {
    const at = NEW_MOON_AT + 300 * SYNODIC_MS + phase * SYNODIC_MS;
    const clock = new SkyClock();
    expect(clock.phaseAt(at)).toBeCloseTo(moonPhaseAt(at));
    clock.keepLocalTime(true);
    // Round the cycle, so a hair short of 1 counts as new.
    const off = Math.abs(((clock.phaseAt(at) - phase + 1.5) % 1) - 0.5);
    expect(off).toBeLessThan(1e-6);
  });

  it('counts every change by hand', () => {
    const clock = new SkyClock();
    clock.set(100, 0);
    clock.set(200, 0);
    clock.follow();
    expect(clock.version).toBe(3);
  });
});

describe('minutesAlong', () => {
  it.each([
    [0, 0],
    [55, 360],
    [110, 720],
    [220, 1440],
    [-20, 0],
    [400, 1440],
  ])('reads a point %p along a 220-wide bar as %p minutes', (x, minutes) => {
    expect(minutesAlong(x, 220)).toBeCloseTo(minutes);
  });
});

describe('clockFace', () => {
  it.each([
    [0, '00:00'],
    [390.7, '06:30'],
    [1439.9, '23:59'],
    [1440, '00:00'],
  ])('letters %p minutes as %p', (minutes, face) => {
    expect(clockFace(minutes)).toBe(face);
  });
});
