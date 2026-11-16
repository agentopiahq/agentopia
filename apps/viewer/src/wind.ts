import { Weather, driftAt } from './sky';

/** How much faster the clouds go in rain than on a still day. */
export const RAIN_GUST = 4;
/** How much faster they go in a full storm (whose rain is part of it). */
export const STORM_GUST = 8;
/** How much faster they go while it snows: a steady breeze. */
export const SNOW_GUST = 1.6;
/** The longest step the wind takes in one go, in milliseconds: a tab left hidden does not fling the clouds. */
const MAX_STEP_MS = 1000;

/**
 * The wind that drives the clouds across the windows. On a still day they
 * drift at the sky's own pace (`driftAt`: a tile every twenty of its
 * minutes); while it snows a steady breeze carries them a little faster
 * (`SNOW_GUST`), in rain they hurry (`RAIN_GUST`), and in a storm they race,
 * `STORM_GUST` times as fast.
 * Speed is not distance, so the wind adds its way along frame by frame, and
 * weather blowing up or dying down speeds the clouds up or slows them
 * without a jump.
 *
 * Pure: the time and the storm come in; nothing here reads a clock.
 */
export class Wind {
  private drift = NaN;
  private last = 0;

  /** How far the clouds have drifted by `now`, in tiles, in the weather since the last step. */
  at(now: number, weather: Pick<Weather, 'rain' | 'storm' | 'snow'>): number {
    if (Number.isNaN(this.drift)) {
      this.drift = driftAt(now);
    } else {
      const dt = Math.max(0, Math.min(MAX_STEP_MS, now - this.last));
      this.drift += (driftAt(dt) - driftAt(0)) * gust(weather);
    }
    this.last = now;
    // Wound back now and then, as the sky's own drift is, so it stays small.
    this.drift %= 10000;
    return this.drift;
  }
}

/** How many times the still day's pace the clouds go in a weather. */
export function gust({ rain, storm, snow }: Pick<Weather, 'rain' | 'storm' | 'snow'>): number {
  // A storm's rain already brings the rain's gust; the storm adds the rest.
  return 1 + rain * (RAIN_GUST - 1) + storm * (STORM_GUST - RAIN_GUST) + snow * (SNOW_GUST - 1);
}
