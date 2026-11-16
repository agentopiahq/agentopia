/**
 * A storm's lightning and tornados, as the renderer draws them on the window
 * glass. Pure: a function of the time, so a replay or a frozen story storms
 * the same way.
 */

/** A deterministic hash in [0, 1). */
function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 13.3) * 43758.5453;
  return s - Math.floor(s);
}

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** How long one of the storm's lightning cycles lasts, in seconds: at most a strike each. */
const STRIKE_S = 1.8;
/** How long a strike's flare takes to fade, in seconds. */
const STRIKE_FADE_S = 0.3;

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
 * Lightning `t` seconds in, in a storm `storm` strong: nearly every couple of
 * seconds a strike, at a moment of its own, flickering twice and fading. The
 * bolt runs from `top` down to about `bottom`, in tiles up the glass.
 */
export function lightning(t: number, storm: number, top: number, bottom: number): Strike {
  const at = Math.floor(t / STRIKE_S);
  const into = t - at * STRIKE_S - hash(at + 0.7) * (STRIKE_S - 0.24 - STRIKE_FADE_S);
  const strikes = hash(at * 3.1 + 0.2) < 0.9 * storm;
  let glow = 0;
  if (strikes && into >= 0) {
    if (into < 0.06) {
      glow = 1;
    } else if (into < 0.13) {
      glow = 0.25;
    } else if (into < 0.21) {
      glow = 0.85;
    } else {
      glow = Math.max(0, 0.85 * (1 - (into - 0.21) / STRIKE_FADE_S));
    }
  }
  const bolt: Array<[number, number]> = [];
  let du = 0.2 + hash(at + 0.4) * 0.6;
  for (let z = top, n = 0; z > bottom && n < 16; n++) {
    bolt.push([du, z]);
    du = Math.max(0.05, Math.min(0.95, du + (hash(at * 1.7 + n) - 0.5) * 0.12));
    z -= 0.1 + hash(at + n * 0.37) * 0.08;
  }
  return { glow: glow * storm, at, bolt };
}

/** How long one of the storm's tornado cycles lasts, in seconds: at most a tornado each. */
export const TORNADO_CYCLE_S = 75;
/** How long a tornado stays on the horizon, in seconds. */
export const TORNADO_LIFE_S = 24;
/** How long a tornado takes to drop out of the cloud, and to lift back into it. */
const TORNADO_FADE_S = 3;

/** A tornado on the horizon at a moment. */
export interface Tornado {
  /** How strong it shows now, 0 to 1: it drops out of the cloud and lifts back into it. */
  strength: number;
  /** Which tornado this is, for picking the light it crosses. */
  at: number;
  /** Where it stands across the light, 0 to 1: it travels slowly over its life. */
  across: number;
  /** Which way its top leans as it goes, -1 or 1. */
  lean: number;
}

/**
 * The tornado `t` seconds in, in a storm `storm` strong, or null: now and
 * then, far rarer than the lightning, a funnel drops out of the cloud, crawls
 * across one light for a while and lifts away.
 */
export function tornado(t: number, storm: number): Tornado | null {
  const at = Math.floor(t / TORNADO_CYCLE_S);
  if (hash(at * 5.3 + 0.9) >= 0.45 * storm) {
    return null;
  }
  const into = t - at * TORNADO_CYCLE_S - hash(at + 0.15) * (TORNADO_CYCLE_S - TORNADO_LIFE_S);
  if (into < 0 || into > TORNADO_LIFE_S) {
    return null;
  }
  const life = into / TORNADO_LIFE_S;
  const lean = hash(at + 0.55) < 0.5 ? -1 : 1;
  const strength =
    smooth(into / TORNADO_FADE_S) * smooth((TORNADO_LIFE_S - into) / TORNADO_FADE_S) * storm;
  return { strength, at, across: 0.5 + lean * (life - 0.5) * 0.6, lean };
}
