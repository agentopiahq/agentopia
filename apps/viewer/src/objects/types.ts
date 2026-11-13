import { Box3, Iso, V3 } from '../kit/iso';

/**
 * One office object: how to draw it, and how big it is.
 *
 * Every object is authored in its own local frame, in tiles, with its anchor
 * at the origin on the floor and its front facing local +y. Placing it (where,
 * and which way it faces) is the pen's job (`Iso.place`), so the same drawing
 * stands against any wall.
 *
 * The body and its cast shadow are separate on purpose. Shadows lie on the
 * floor under everything, so the office paints all of them into the floor
 * before anything stands up; the body is then sorted among the cast.
 */
export interface OfficeObject {
  /** What the stories call it. */
  name: string;
  /** One line on what it is for. */
  blurb: string;
  /** Everything the drawing touches, local: for sizing its canvas. */
  bounds: Box3;
  /**
   * The footprint it is sorted by against the cast, local. Usually its base;
   * smaller than `bounds` where a part (a chair back, a door leaf) must not
   * swallow whoever stands beside it.
   */
  footprint: Box3;
  /** The body, back to front. */
  draw(k: Iso): void;
  /** The flat blue shadow it casts on the floor. */
  shadow(k: Iso): void;
}

/** A box as `[lo, hi]`. */
export const box3 = (lo: V3, hi: V3): Box3 => [lo, hi];
