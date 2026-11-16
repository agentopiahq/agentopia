/**
 * The sky outside the office: where the sun and the moon are, how light it
 * is, and the weather. Pure: a function of the time, so the weather and the
 * moon are the same for everyone at the same moment (no ambient randomness).
 *
 * The sky runs on a time-lapse: a whole day every real hour, midnight on the
 * hour and noon at half past, keyed to the wall clock's local minutes (the
 * clock itself keeps real time). The moon goes round its phases every
 * `LUNAR_DAYS` of those days, rising later each day the way the real one
 * does: new with the sun, full at sunset.
 *
 * The weather changes every ten minutes, drawn from a hash of the time block,
 * and eases across into the next block's so a front rolls in rather than
 * snapping. San Francisco gets its share of fog.
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
  /** Minutes past the sky's own midnight (see `skyMinutes`). */
  minutes: number;
  /** The sun's height: 1 at noon, 0 at the horizon, -1 at midnight. */
  sun: number;
  /** How far across the day the sun is, 0 at sunrise to 1 at sunset (outside that at night). */
  arc: number;
  /** Daylight, 0 at night to 1 in full day. */
  day: number;
  /** The warm glow of dawn and dusk, 0 to 1, strongest with the sun on the horizon. */
  dusk: number;
  /** The moon's height, like `sun`: positive while it is up. */
  moon: number;
  /** How far across the sky the moon is, 0 at moonrise to 1 at moonset (outside that while it is down). */
  moonArc: number;
  /** The moon's phase: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  phase: number;
  /** How far the clouds have drifted, in tiles: they move on with the time. */
  drift: number;
  /** The weather this block, by name: what the stories and tests talk about. */
  kind: WeatherKind;
}

export const SUNRISE = 6 * 60;
export const SUNSET = 18 * 60;
/** How long one of the sky's days lasts, in real time. */
export const SKY_DAY_MS = 60 * 60 * 1000;
/** How long one spell of weather lasts. */
export const WEATHER_MS = 10 * 60 * 1000;
/** How many of the sky's days the moon takes to go round its phases. */
export const LUNAR_DAYS = 8;
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

const wrap = (n: number, by: number): number => ((n % by) + by) % by;

/**
 * The sky's time of day when the wall clock shows `local` minutes past local
 * midnight: a whole day every hour, so midnight on the hour, sunrise at a
 * quarter past, noon at half past and sunset at a quarter to.
 */
export function skyMinutes(local: number): number {
  return wrap(local, 60) * (1440 / 60);
}

/** The moon's phase at a moment, 0 new to 0.5 full and round again. */
export function moonPhaseAt(at: number): number {
  return wrap(at / SKY_DAY_MS / LUNAR_DAYS, 1);
}

/**
 * The sky at a moment: `at` is the absolute time (for the weather and the
 * moon's phase), and `minutes` the sky's time of day (for the sun and where
 * the moon stands); `phase` is the moon's, worked out from `at` unless given.
 */
export function skyAt(at: number, minutes: number, phase = moonPhaseAt(at)): Sky {
  const m = wrap(minutes, 1440);
  const span = SUNSET - SUNRISE;
  const arc = (m - SUNRISE) / span;
  // A twelve-hour day makes this one sine wave round the clock.
  const sun = Math.sin(Math.PI * arc);
  // The moon keeps the sun's path, a phase of a day behind it: new, it rises
  // with the sun; at first quarter, at noon; full, at sunset.
  const moonArc = wrap(m - SUNRISE - phase * 1440, 1440) / span;
  const moon = Math.sin(Math.PI * moonArc);
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
    moon,
    moonArc,
    phase,
    // A tile every twenty of the sky's minutes, winding back now and then so it stays small.
    drift: (at / ((20 * SKY_DAY_MS) / 1440)) % 10000,
    kind,
  };
}

/** A clear noon, the moon down: the sky drawn when no time is given, as in the object stories. */
export const NOON: Sky = {
  ...skyAt(WEATHER_MS * 0.5, 12 * 60, 0.5),
  ...WEATHERS.clear,
  kind: 'clear',
  drift: 0,
};

/** A sky at a time of day, in a given weather, under a given moon (full unless said): for the stories. */
export function skyFor(minutes: number, kind: WeatherKind, drift = 0, phase = 0.5): Sky {
  return { ...skyAt(0, minutes, phase), ...WEATHERS[kind], kind, drift };
}
