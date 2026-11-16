/**
 * Lightning in a storm, as the renderer flashes it on the window glass. Pure:
 * a function of the time, so a replay or a frozen story strikes the same way.
 */

/** A deterministic hash in [0, 1). */
function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 13.3) * 43758.5453;
  return s - Math.floor(s);
}

/** How long one of the storm's lightning cycles lasts, in seconds: at most a strike each. */
const STRIKE_S = 5.5;

/** A strike of lightning at a moment: how bright the glass flares, and the bolt. */
export interface Strike {
  /** How bright the flare is now, 0 to 1. */
  glow: number;
  /** Which strike this is, for picking the light the bolt lands in. */
  at: number;
  /** The bolt, as points across the light (0 to 1) and up it (in tiles). */
  bolt: Array<[number, number]>;
}

/**
 * Lightning `t` seconds in, in a storm `storm` strong: most cycles bring a
 * strike, at a moment of their own, flickering twice and fading. Pure: the
 * same moment always strikes the same way. The bolt runs from `top` down to
 * about `bottom`, in tiles up the glass.
 */
export function lightning(t: number, storm: number, top: number, bottom: number): Strike {
  const at = Math.floor(t / STRIKE_S);
  const into = t - at * STRIKE_S - hash(at + 0.7) * (STRIKE_S - 1);
  const strikes = hash(at * 3.1 + 0.2) < 0.75 * storm;
  let glow = 0;
  if (strikes && into >= 0) {
    if (into < 0.07) {
      glow = 1;
    } else if (into < 0.15) {
      glow = 0.25;
    } else if (into < 0.24) {
      glow = 0.85;
    } else {
      glow = Math.max(0, 0.85 * (1 - (into - 0.24) / 0.4));
    }
  }
  const bolt: Array<[number, number]> = [];
  let du = 0.25 + hash(at + 0.4) * 0.5;
  for (let z = top, n = 0; z > bottom && n < 16; n++) {
    bolt.push([du, z]);
    du = Math.max(0.05, Math.min(0.95, du + (hash(at * 1.7 + n) - 0.5) * 0.12));
    z -= 0.1 + hash(at + n * 0.37) * 0.08;
  }
  return { glow: glow * storm, at, bolt };
}
