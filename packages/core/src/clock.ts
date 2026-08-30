/**
 * Determinism primitives.
 *
 * The director must never read `Date.now()` or bare `Math.random()` directly.
 * Everything time- or chance-dependent takes a Clock and an Rng, which is what
 * makes replay reproducible and golden-frame snapshot tests possible.
 */

export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export interface ManualClock extends Clock {
  advance(ms: number): void;
  set(ms: number): void;
}

/** A clock you drive by hand. Used by tests and by replay. */
export function manualClock(start = 0): ManualClock {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
    set: (ms: number) => {
      current = ms;
    },
  };
}

/** Returns a float in [0, 1), like Math.random. */
export type Rng = () => number;

/** mulberry32 — small, fast, and good enough for picking idle animations. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
