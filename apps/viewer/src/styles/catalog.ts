import { CARTOON } from './active';
import { BLUEPRINT, CHALKBOARD, COLOUR_PENCIL, NEON } from './looks/drawn';
import { INK_WASH, UKIYO_E } from './looks/painted';
import { RenderStyle } from './types';

/** Every style the office can be drawn in, in the order the settings offer them. */
export const STYLES: readonly RenderStyle[] = [
  CARTOON,
  COLOUR_PENCIL,
  UKIYO_E,
  INK_WASH,
  BLUEPRINT,
  CHALKBOARD,
  NEON,
];

/** A style by id; the house style for anything unknown. */
export function styleById(id: string | null | undefined): RenderStyle {
  return STYLES.find((s) => s.id === id) ?? CARTOON;
}
