import { MAT } from '../kit/palette';
import { cabinet } from './cabinet';
import { meetingChair, taskChair } from './chair';
import { copier } from './copier';
import { desk } from './desk';
import { door } from './door';
import { drinksFridge, kitchenCounter, snackCabinet, standingTable } from './kitchen';
import {
  armchair,
  beanBag,
  bookshelf,
  cafeTable,
  coffeeTable,
  huddleTable,
  projectionScreen,
  sideTable,
  sofa,
  sofaRust,
} from './lounge';
import {
  booth,
  glassDoorLeft,
  glassDoorRight,
  glassPanel,
  glassPanelHalf,
  meetingTable,
  screen,
  waterCooler,
} from './meeting';
import { plant } from './plant';
import { printer } from './printer';
import { OfficeObject } from './types';
import {
  clock,
  mobileBoard,
  speaker,
  whiteboard,
  window2,
  window3,
  windowBlind,
  windowBlind2,
  windowBlind3,
  windowPane,
} from './wall';

export { DESK_SEAT_GAP, KEYBOARD, MONITOR_SCREEN } from './desk';
export { SPEAKER_Z, WINDOW } from './wall';
export { GLASS_H } from './meeting';
export { SEAT_Z } from './chair';
export { WORKTOP_Z } from './kitchen';
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
  whiteboard,
  clock,
  window: windowPane,
  window2,
  window3,
  windowBlind,
  windowBlind2,
  windowBlind3,
  mobileBoard,
  /** Pushed back from its desk and swung aside: the lead works standing. */
  deskChair: taskChair(-0.55),
  meetingChair: meetingChair(0.08, MAT.teal),
  meetingChairAlt: meetingChair(-0.12, MAT.mustard),
  meetingTable,
  glassPanel,
  glassPanelHalf,
  glassDoorLeft,
  glassDoorRight,
  screen,
  booth,
  waterCooler,
  kitchenCounter,
  drinksFridge,
  snackCabinet,
  standingTable,
  sofa,
  sofaRust,
  armchair,
  beanBag,
  sideTable,
  coffeeTable,
  huddleTable,
  bookshelf,
  cafeTable,
  projectionScreen,
} satisfies Record<string, OfficeObject>;

export type ObjectName = keyof typeof OBJECTS;
