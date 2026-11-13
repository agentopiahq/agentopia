import { cabinet } from './cabinet';
import { copier } from './copier';
import { desk } from './desk';
import { door } from './door';
import { plant } from './plant';
import { printer } from './printer';
import { OfficeObject } from './types';
import { clock, shutter, speaker, whiteboard, windowPane } from './wall';

export { DESK_SEAT_GAP, KEYBOARD, MONITOR_SCREEN } from './desk';
export { SPEAKER_Z } from './wall';
export type { OfficeObject } from './types';

/** Every office object, by the name the stories and the room use. */
export const OBJECTS = {
  desk,
  printer,
  copier,
  cabinet,
  door,
  plant,
  speaker,
  shutter,
  whiteboard,
  clock,
  window: windowPane,
} satisfies Record<string, OfficeObject>;

export type ObjectName = keyof typeof OBJECTS;
