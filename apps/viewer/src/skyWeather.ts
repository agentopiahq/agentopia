import { WEATHERS, Weather, WeatherKind, WeatherNow, blendWeather, smooth, weatherAt } from './sky';

/** How long a change of weather by hand takes to roll in, in milliseconds. */
export const WEATHER_TURN_MS = 1800;

/**
 * The weather outside, kept apart from the ten-minute spells so it can be
 * picked by hand. Left alone it is the clock's (`weatherAt`); picked, it
 * holds that weather, through every spell, until it is told to follow the
 * clock again, just as the daylight bar holds a time until its reset. Either
 * change eases across from whatever was showing, so a front rolls in over a
 * couple of seconds rather than the sky snapping.
 *
 * Pure: the time comes in; nothing here reads a clock.
 */
export class SkyWeather {
  /** The weather picked by hand, or null while the clock brings it. */
  private held: WeatherKind | null = null;
  /** What was showing when the weather last changed by hand, and when. */
  private from: Weather = WEATHERS.clear;
  private since = -Infinity;
  /** Goes up on every change by hand, so a renderer knows to redraw the sky now. */
  version = 0;

  /** The weather at `now`. */
  at(now: number): WeatherNow {
    const target: WeatherNow =
      this.held === null ? weatherAt(now) : { ...WEATHERS[this.held], kind: this.held };
    const t = smooth((now - this.since) / WEATHER_TURN_MS);
    return t >= 1 ? target : { ...blendWeather(this.from, target, t), kind: target.kind };
  }

  /** Hold `kind` from `now` on, rolling in from whatever is showing. */
  pick(kind: WeatherKind, now: number): void {
    if (kind === this.held) {
      return;
    }
    this.from = this.at(now);
    this.held = kind;
    this.since = now;
    this.version++;
  }

  /** Go back to the clock's weather, rolling across to it. */
  follow(now: number): void {
    if (this.held === null) {
      return;
    }
    this.from = this.at(now);
    this.held = null;
    this.since = now;
    this.version++;
  }

  /** The weather picked by hand, or null while the clock brings it. */
  get picked(): WeatherKind | null {
    return this.held;
  }

  /** Whether a change by hand is still rolling in at `now`. */
  turning(now: number): boolean {
    return now - this.since < WEATHER_TURN_MS;
  }
}
