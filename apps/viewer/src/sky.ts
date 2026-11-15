/**
 * The sky outside the office: where the sun is, how light it is, and the
 * weather. Pure: a function of the time the wall clock shows, so the view
 * keeps the same hours as the clock on the wall, and the weather is the
 * same for everyone at the same moment (no ambient randomness).
 *
 * The weather changes every couple of hours, drawn from a hash of the time
 * block, and eases across into the next block's so a front rolls in rather
 * than snapping. San Francisco gets its share of fog.
 */

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'overcast' | 'rain';

export interface Weather {
  /** How much of the sky is cloud, 0 to 1. */
  cloud: number;
  /** How thick the fog is over the bay, 0 to 1. */
  fog: number;
  /** How hard it is raining, 0 to 1. */
  rain: number;
}

export interface Sky extends Weather {
  /** Minutes past local midnight. */
  minutes: number;
  /** The sun's height: 1 at noon, 0 at the horizon, -1 at midnight. */
  sun: number;
  /** How far across the day the sun is, 0 at sunrise to 1 at sunset (outside that at night). */
  arc: number;
  /** Daylight, 0 at night to 1 in full day. */
  day: number;
  /** The warm glow of dawn and dusk, 0 to 1, strongest with the sun on the horizon. */
  dusk: number;
  /** How far the clouds have drifted, in tiles: they move on with the time. */
  drift: number;
  /** The weather this block, by name: what the stories and tests talk about. */
  kind: WeatherKind;
}

export const SUNRISE = 6 * 60;
export const SUNSET = 18 * 60;
/** How long one spell of weather lasts. */
export const WEATHER_MS = 2 * 60 * 60 * 1000;
/** The last part of a spell, eased into the next one. */
const TURN = 0.25;

export const WEATHERS: Record<WeatherKind, Weather> = {
  clear: { cloud: 0.12, fog: 0, rain: 0 },
  cloudy: { cloud: 0.5, fog: 0, rain: 0 },
  fog: { cloud: 0.25, fog: 0.9, rain: 0 },
  overcast: { cloud: 0.9, fog: 0.15, rain: 0 },
  rain: { cloud: 1, fog: 0.1, rain: 1 },
};

/** How often each kind comes up, as cumulative odds. */
const ODDS: Array<[WeatherKind, number]> = [
  ['clear', 0.36],
  ['cloudy', 0.6],
  ['fog', 0.8],
  ['overcast', 0.9],
  ['rain', 1],
];

/** A deterministic hash in [0, 1). */
function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** The weather in a numbered block of time. */
export function weatherOf(block: number): WeatherKind {
  const r = hash(block);
  return (ODDS.find(([, p]) => r < p) ?? ODDS[0])[0];
}

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/**
 * The sky at a moment: `at` is the absolute time (for the weather), and
 * `minutes` the local time of day the wall clock shows (for the sun).
 */
export function skyAt(at: number, minutes: number): Sky {
  const m = ((minutes % 1440) + 1440) % 1440;
  const span = SUNSET - SUNRISE;
  const arc = (m - SUNRISE) / span;
  // A twelve-hour day makes this one sine wave round the clock.
  const sun = Math.sin(Math.PI * arc);
  const day = smooth((sun + 0.12) / 0.3);
  const dusk = Math.max(0, 1 - Math.abs(sun - 0.02) / 0.2);

  const block = Math.floor(at / WEATHER_MS);
  const into = at / WEATHER_MS - block;
  const kind = weatherOf(block);
  const now = WEATHERS[kind];
  const next = WEATHERS[weatherOf(block + 1)];
  const t = smooth((into - (1 - TURN)) / TURN);
  const blend = (key: keyof Weather): number => now[key] + (next[key] - now[key]) * t;

  return {
    minutes: m,
    sun,
    arc,
    day,
    dusk,
    cloud: blend('cloud'),
    fog: blend('fog'),
    rain: blend('rain'),
    // A tile every twenty minutes, winding back every few days so it stays small.
    drift: (at / (20 * 60 * 1000)) % 500,
    kind,
  };
}

/** A clear noon: the sky drawn when no time is given, as in the object stories. */
export const NOON: Sky = {
  ...skyAt(WEATHER_MS * 0.5, 12 * 60),
  ...WEATHERS.clear,
  kind: 'clear',
  drift: 0,
};

/** A sky at a time of day, in a given weather: for the stories. */
export function skyFor(minutes: number, kind: WeatherKind, drift = 0): Sky {
  return { ...skyAt(0, minutes), ...WEATHERS[kind], kind, drift };
}
