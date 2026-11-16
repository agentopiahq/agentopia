import { moonLights, moonLit } from '../objects/skyline';

/** The lit part's area, by the shoelace formula, as a share of the whole disc. */
function litShare(phase: number): number {
  const pts = moonLit(phase, 0, 0, 1);
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [a, b] = pts[i];
    const [c, d] = pts[(i + 1) % pts.length];
    twice += a * d - c * b;
  }
  return Math.abs(twice) / 2 / Math.PI;
}

describe('moonLit', () => {
  it.each([
    ['new', 0, 0],
    ['a waxing crescent', 0.125, 0.15],
    ['at first quarter', 0.25, 0.5],
    ['full', 0.5, 1],
    ['at last quarter', 0.75, 0.5],
  ])('lights the right share of the disc %s', (_, phase, share) => {
    expect(litShare(phase)).toBeCloseTo(share, 1);
  });

  it.each([
    ['waxing, on the right', 0.2, 1],
    ['waning, on the left', 0.8, -1],
  ])('lights the side facing the sun: %s', (_, phase, side) => {
    const us = moonLit(phase, 0, 0, 1).map(([u]) => u * side);
    expect(Math.max(...us)).toBeCloseTo(1);
  });
});

describe('moonLit, with the sun travelling the other way', () => {
  it('lights a waxing moon on the side the sun has gone', () => {
    const us = moonLit(0.2, 0, 0, 1, -1).map(([u]) => u);
    expect(Math.min(...us)).toBeCloseTo(-1);
    expect(moonLights(0.2, -0.95, 0, 1, -1)).toBe(true);
    expect(moonLights(0.2, 0.95, 0, 1, -1)).toBe(false);
  });
});

describe('moonLights', () => {
  it.each([
    ['the right limb of a waxing crescent', 0.1, 0.95, 0, true],
    ['the left limb of a waxing crescent', 0.1, -0.95, 0, false],
    ['the middle when full', 0.5, 0, 0, true],
    ['the middle when new', 0, 0, 0, false],
    ['the left limb of a waning crescent', 0.9, -0.95, 0, true],
  ])('tells whether light falls on %s', (_, phase, du, dz, lit) => {
    expect(moonLights(phase, du, dz, 1)).toBe(lit);
  });
});
