import { skyMinutes } from '../sky';
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
