import {
  TURN,
  WEATHERS,
  WEATHER_MS,
  Weather,
  WeatherKind,
  WeatherNow,
  blendWeather,
  smooth,
  weatherAt,
  weatherOf,
} from './sky';

/** How long a change of weather by hand takes to roll in, in milliseconds. */
export const WEATHER_TURN_MS = 1800;
/** The least time a pick gets to ease out into the next spell, in milliseconds. */
const LAST_OUT_MS = 1000;

/**
 * The weather outside, kept apart from the ten-minute spells so it can be
 * picked by hand. Left alone it is the clock's (`weatherAt`); picked, it holds
 * that weather for the rest of the spell it was picked in, then eases into the
 * next spell's weather just as the clock's own spells ease into each other,
 * and the clock has the weather again. The reset key hands it back sooner.
 * Either change by hand eases across from whatever was showing, so a front
 * rolls in over a couple of seconds rather than the sky snapping.
 *
 * Pure: the time comes in; nothing here reads a clock.
 */
export class SkyWeather {
  /** The weather picked by hand, or null while the clock brings it. */
  private held: WeatherKind | null = null;
  /** The spell it was picked in: it lasts until that spell is over. */
  private block = 0;
  /** What was showing when the weather last changed by hand, and when. */
  private from: Weather = WEATHERS.clear;
  private since = -Infinity;
  /** Goes up on every change by hand, so a renderer knows to redraw the sky now. */
  version = 0;

  /** The weather picked by hand and still holding at `now`, or null while the clock brings it. */
  pickedAt(now: number): WeatherKind | null {
    return this.held !== null && Math.floor(now / WEATHER_MS) === this.block ? this.held : null;
  }

  /** How long the pick holding at `now` has left, in milliseconds, or null with none. */
  leftAt(now: number): number | null {
    return this.pickedAt(now) === null ? null : (this.block + 1) * WEATHER_MS - now;
  }

  /** The weather at `now`. */
  at(now: number): WeatherNow {
    const held = this.pickedAt(now);
    const target = held === null ? weatherAt(now) : this.holding(held, now);
    const t = smooth((now - this.since) / WEATHER_TURN_MS);
    return t >= 1 ? target : { ...blendWeather(this.from, target, t), kind: target.kind };
  }

  /** Hold `kind` for the rest of this spell, rolling in from whatever is showing. */
  pick(kind: WeatherKind, now: number): void {
    if (kind === this.pickedAt(now)) {
      return;
    }
    this.from = this.at(now);
    this.held = kind;
    this.block = Math.floor(now / WEATHER_MS);
    this.since = now;
    this.version++;
  }

  /** Go back to the clock's weather now, rolling across to it. */
  follow(now: number): void {
    if (this.pickedAt(now) === null) {
      this.held = null;
      return;
    }
    this.from = this.at(now);
    this.held = null;
    this.since = now;
    this.version++;
  }

  /**
   * Whether the weather is changing fast at `now`: a change by hand rolling
   * in, or a pick made late in its spell easing out in a hurry.
   */
  turning(now: number): boolean {
    if (now - this.since < WEATHER_TURN_MS) {
      return true;
    }
    if (this.pickedAt(now) === null) {
      return false;
    }
    const [start, end] = this.easeOut();
    return end - start < 20_000 && now >= start;
  }

  /** The picked weather at `now`, easing into the next spell's near the end of its own. */
  private holding(kind: WeatherKind, now: number): WeatherNow {
    const [start, end] = this.easeOut();
    const t = smooth((now - start) / (end - start));
    const next = WEATHERS[weatherOf(this.block + 1)];
    return { ...blendWeather(WEATHERS[kind], next, t), kind };
  }

  /**
   * When the pick eases out into the next spell: over the spell's last
   * quarter, as the clock's spells do, but never before it has rolled in.
   */
  private easeOut(): [number, number] {
    const end = (this.block + 1) * WEATHER_MS;
    const start = Math.max(end - TURN * WEATHER_MS, this.since + WEATHER_TURN_MS);
    return [Math.min(start, end - LAST_OUT_MS), end];
  }
}
