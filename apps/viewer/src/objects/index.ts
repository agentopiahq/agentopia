import { DESKS } from '@agentopia/core';

import { V2 } from '../kit/iso';
import { MAT } from '../kit/palette';
import { cabinet } from './cabinet';
import { catTower } from './catTower';
import { meetingChair, taskChair } from './chair';
import { copier } from './copier';
import { DESK_STANCE, desk } from './desk';
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
import { dogBed, petBowls } from './pets';
import { plant } from './plant';
import { printer } from './printer';
import { OfficeObject } from './types';
import { usageBoard } from './usageBoard';
import {
  clock,
  mobileBoard,
  whiteboard,
  window2,
  window3,
  windowBlind,
  windowBlind2,
  windowBlind3,
  windowPane,
} from './wall';

export { DESK_SEAT_GAP, DESK_STANCE, KEYBOARD, MONITOR_SCREEN } from './desk';
export { WINDOW } from './wall';
export { GLASS_H } from './meeting';
export { SEAT_TOP_Z, SEAT_Z, chairPose } from './chair';
export { WORKTOP_Z } from './kitchen';
export { BED_TOP, BOWL, BOWLS_AT } from './pets';
export type { OfficeObject } from './types';

/**
 * Where a desk chair goes when its lead sits down, in the chair's own frame:
 * from where core's floor plan stands it (`Desk.chair`) to right under the
 * lead's working spot (`DESK_STANCE`). The room stands desk chairs facing
 * `-y`, a half turn, so the world offset flips into the chair's frame.
 */
export const DESK_CHAIR_TUCK: V2 = [
  -(DESKS[0].seat.x + DESK_STANCE.x - DESKS[0].chair.x),
  -(DESKS[0].seat.y + DESK_STANCE.y - DESKS[0].chair.y),
];

/** Every office object, by the name the stories and the room use. */
export const OBJECTS = {
  desk,
  printer,
  copier,
  cabinet,
  door,
  plant,
  whiteboard,
  clock,
  window: windowPane,
  window2,
  window3,
  windowBlind,
  windowBlind2,
  windowBlind3,
  mobileBoard,
  usageBoard,
  /**
   * Pushed back from its desk and swung aside while nobody sits at it; its
   * lead pulls it in under itself to sit and work (see `DESK_CHAIR_TUCK`).
   */
  deskChair: taskChair(-0.55, MAT.charcoal, { at: DESK_CHAIR_TUCK }),
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
  petBowls,
  dogBed,
  catTower,
} satisfies Record<string, OfficeObject>;

export type ObjectName = keyof typeof OBJECTS;
