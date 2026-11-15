import { skyMinutes } from './sky';

const DAY = 1440;

const wrap = (n: number): number => ((n % DAY) + DAY) % DAY;

/**
 * The sky's own clock: the time of day outside the windows, kept apart from
 * the wall clock so it can be set by hand. Left alone it follows the wall
 * clock's time-lapse (`skyMinutes`: a day every hour); set to a time, it
 * holds that time's distance from the time-lapse and runs on from there at
 * the same pace, until it is told to follow the wall clock again.
 *
 * Pure: the wall clock's local minutes come in; nothing here reads a clock.
 */
export class SkyClock {
  /** Sky minutes added to the time-lapse: 0 while following the wall clock. */
  private offset = 0;
  /** Goes up on every change by hand, so a renderer knows to redraw the sky now. */
  version = 0;

  /** The sky's time of day, in minutes past its midnight, when the wall clock shows `local`. */
  minutesAt(local: number): number {
    return wrap(skyMinutes(local) + this.offset);
  }

  /** Set the sky to `want` minutes past its midnight, the wall clock showing `local`. */
  set(want: number, local: number): void {
    this.offset = wrap(want - skyMinutes(local));
    if (this.offset > DAY - 1e-6) {
      this.offset = 0;
    }
    this.version++;
  }

  /** Go back to the wall clock's time-lapse. */
  follow(): void {
    this.offset = 0;
    this.version++;
  }

  /** Whether the sky keeps the wall clock's time-lapse. */
  get following(): boolean {
    return this.offset === 0;
  }
}

/** The sky time a point `x` along a day's bar `width` wide stands for, clamped to the bar. */
export function minutesAlong(x: number, width: number): number {
  if (width <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, x / width)) * DAY;
}

/** A time of day as the bar letters it: `06:30`. */
export function clockFace(minutes: number): string {
  const m = Math.floor(wrap(minutes));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
