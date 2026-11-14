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
  /**
   * How wide its torso is at the hips, in tiles: what a seat it sits in has
   * to be wider than, between the armrests.
   */
  hips: 0.42,
  /** Where its hands rest, standing: desk and worktop height. */
  hand: 0.8,
  /** The highest it can comfortably reach to press a button, standing. */
  reach: 1.25,
} as const;

/**
 * The office pets' size, in tiles: chibi, like the avatar, so bigger against
 * it than a real cat or dog would be. The dog's head comes up to about the
 * avatar's hand, where a hand would pat it. Read from the rigs in `pet.ts`
 * (`petHeight`); the scale test keeps the two together.
 */
export const PETS = {
  cat: {
    /** Paws to ear tips, standing. */
    height: 0.67,
    /** Nose to rump. */
    length: 0.6,
    /** Half the floor it is sorted by, across. */
    half: 0.16,
    /** How far in front of its feet its nose comes, head down at a bowl. */
    reach: 0.47,
  },
  dog: {
    height: 0.79,
    length: 0.75,
    half: 0.2,
    reach: 0.64,
  },
} as const;
