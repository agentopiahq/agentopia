import { CARTOON } from './active';
import {
  BLUEPRINT,
  CHALKBOARD,
  CHARCOAL,
  COMIC,
  FLAT,
  GRAPHITE_SKETCH,
  LINOCUT,
  NEON,
  PIXEL,
} from './looks/drawn';
import { INK_WASH, OIL, OIL_PASTEL, UKIYO_E, WATERCOLOUR } from './looks/painted';
import { RenderStyle } from './types';

/** Every style the office can be drawn in, in the order the settings offer them. */
export const STYLES: readonly RenderStyle[] = [
  CARTOON,
  GRAPHITE_SKETCH,
  CHARCOAL,
  INK_WASH,
  WATERCOLOUR,
  OIL,
  OIL_PASTEL,
  UKIYO_E,
  LINOCUT,
  COMIC,
  FLAT,
  BLUEPRINT,
  CHALKBOARD,
  NEON,
  PIXEL,
];

/** A style by id; the house style for anything unknown. */
export function styleById(id: string | null | undefined): RenderStyle {
  return STYLES.find((s) => s.id === id) ?? CARTOON;
}
