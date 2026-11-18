import { CARTOON } from './active';
import { BLUEPRINT, CHALKBOARD, CHARCOAL, COLOUR_PENCIL, FLAT, NEON, PIXEL } from './looks/drawn';
import { UKIYO_E } from './looks/painted';
import { INFRARED, NEGATIVE } from './looks/photo';
import { RenderStyle } from './types';

/** Every style the office can be drawn in, in the order the settings offer them. */
export const STYLES: readonly RenderStyle[] = [
  CARTOON,
  COLOUR_PENCIL,
  CHARCOAL,
  UKIYO_E,
  FLAT,
  BLUEPRINT,
  CHALKBOARD,
  NEON,
  PIXEL,
  INFRARED,
  NEGATIVE,
];

/** A style by id; the house style for anything unknown. */
export function styleById(id: string | null | undefined): RenderStyle {
  return STYLES.find((s) => s.id === id) ?? CARTOON;
}
