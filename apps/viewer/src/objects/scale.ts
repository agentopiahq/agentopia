/**
 * The avatar's size, in tiles: what every piece of the office is built
 * around, so that walking in, sitting down and using things can be animated
 * later without resizing the furniture.
 *
 * Read from the rig in `character.ts` (as reworked on the avatar branch): the
 * head's centre stands about 1.1 tiles up with rays reaching about half a
 * tile further, the hips sit only about 0.3 tiles off the floor, and across
 * its rayed head it covers about 1.3 tiles of floor. If the rig changes size,
 * change these, and the scale test says what no longer fits.
 */
export const AVATAR = {
  /** Feet to the tip of the top ray. */
  height: 1.9,
  /** The floor it covers, across its head's rays. */
  width: 1.3,
  /** Hip height: where a seat must be for it to sit. */
  hip: 0.3,
  /** Where its hands rest, standing: desk and worktop height. */
  hand: 0.8,
  /** The highest it can comfortably reach to press a button, standing. */
  reach: 1.25,
} as const;
