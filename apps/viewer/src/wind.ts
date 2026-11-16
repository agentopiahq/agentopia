import { driftAt } from './sky';

/** How much faster the clouds race in a full storm than on a still day. */
export const STORM_GUST = 9;
/** The longest step the wind takes in one go, in milliseconds: a tab left hidden does not fling the clouds. */
const MAX_STEP_MS = 1000;

/**
 * The wind that drives the clouds across the windows. On a still day they
 * drift at the sky's own pace (`driftAt`: a tile every twenty of its
 * minutes); in a storm they race, up to `STORM_GUST` times as fast. Speed is
 * not distance, so the wind adds its way along frame by frame, and a storm
 * blowing up or dying down speeds the clouds up or slows them without a jump.
 *
 * Pure: the time and the storm come in; nothing here reads a clock.
 */
export class Wind {
  private drift = NaN;
  private last = 0;

  /** How far the clouds have drifted by `now`, in tiles, with the storm `storm` strong since the last step. */
  at(now: number, storm: number): number {
    if (Number.isNaN(this.drift)) {
      this.drift = driftAt(now);
    } else {
      const dt = Math.max(0, Math.min(MAX_STEP_MS, now - this.last));
      this.drift += (driftAt(dt) - driftAt(0)) * (1 + storm * (STORM_GUST - 1));
    }
    this.last = now;
    // Wound back now and then, as the sky's own drift is, so it stays small.
    this.drift %= 10000;
    return this.drift;
  }
}
