import { ActorState } from './choreography/types';
import { StationId } from './stations';

/**
 * How long one loop of each state's animation runs, in milliseconds of
 * animation time — the contract between the director, which only changes a
 * worker's state at the end of a loop, and every skin, which has to draw each
 * loop so it starts and ends on the same resting pose.
 *
 * That is what lets an action finish before the next one starts: a beat whose
 * dwell is up still plays out the tap, the gesture or the sway it is in the
 * middle of, and a worker thinking at its desk finishes its swivel before it
 * turns to the keys. A state with no loop (0) is held still, or loops on
 * something nobody would wait for (a breath), and changes at once.
 *
 * Animation time runs at the worker's `tempo`, so a backlog plays the same
 * loops faster rather than cutting them.
 */
export const CYCLE_MS = {
  /** Two taps at the keys, one per hand. */
  typing: 480,
  /** Busy standing up: a pass of tapping at a tablet, or filing one sheet away. */
  station: 1920,
  /** One open-and-close of the mouth, one wave of the hand. */
  talking: 900,
  /**
   * A quarter of a slow swivel or sway, so it stops at the centre or at the
   * end of a turn, never on its way through one.
   */
  thinking: 1200,
} as const;

/** The loop a worker in `state` at `station` plays, or 0 when it has none to finish. */
export function cycleMsFor(
  state: ActorState,
  station: StationId | undefined,
  role: 'lead' | 'helper'
): number {
  switch (state) {
    case 'working':
      return station === 'own_desk' && role === 'lead' ? CYCLE_MS.typing : CYCLE_MS.station;
    case 'talking':
      return CYCLE_MS.talking;
    case 'thinking':
      return CYCLE_MS.thinking;
    default:
      return 0;
  }
}

/**
 * The next loop boundary at or after `phaseMs`: where an action that has been
 * asked to stop actually stops.
 */
export function loopEnd(phaseMs: number, cycleMs: number): number {
  if (cycleMs <= 0) {
    return phaseMs;
  }
  return Math.ceil(phaseMs / cycleMs - 1e-9) * cycleMs;
}
