import { Mat } from '../kit/palette';

/** The body's three flat tones plus the darker shade its outline is drawn in. */
export interface Tone extends Mat {
  edge: string;
}

/**
 * How one harness's agents look: what the rig draws a lead or helper in.
 * Only colour for now; the shape is the one Claude rig for every harness.
 */
export interface Skin {
  /** The body at work. */
  body: Tone;
  /** The washed-out tint of a slump, after a failure. */
  slump: Tone;
}
