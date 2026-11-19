import {
  INTERACTIONS,
  PieceStore,
  StateStorage,
  annotationOf,
  deskControls,
  interactionOf,
  isOn,
  linked,
  pieceKey,
  toggled,
} from '../interact';
import { POPUP_GAP, POPUP_PAD, PopupSide, popupSpot } from '../popover';
import { DESK_PIECES, MOUNTED_PIECES, ROOM_PIECES, RoomPiece } from '../room';

const ALL = [...ROOM_PIECES, ...DESK_PIECES, ...MOUNTED_PIECES];
const first = (name: string): RoomPiece => {
  const piece = ALL.find((p) => p.name === name);
  if (!piece) {
    throw new Error(`no ${name}`);
  }
  return piece;
};

const memory = (): StateStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
};

describe('interactions', () => {
  it.each<[string, string, 'toggle' | 'menu' | 'board']>([
    ['the front door', 'door', 'toggle'],
    ['a meeting room door', 'glassDoorLeft', 'toggle'],
    ['a phone booth', 'booth', 'toggle'],
    ['the fridge', 'drinksFridge', 'toggle'],
    ['a filing cabinet', 'cabinet', 'menu'],
    ['a blind', 'windowBlind2', 'menu'],
    ['the projection screen', 'projectionScreen', 'menu'],
    ['the sprint board', 'mobileBoard', 'board'],
  ])('makes %s clickable', (_name, name, kind) => {
    expect(interactionOf(first(name))?.kind).toBe(kind);
  });

  it('leaves scenery alone', () => {
    expect(interactionOf(first('plant'))).toBeUndefined();
    expect(INTERACTIONS.sofa).toBeUndefined();
  });

  it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    ['shuts the front door, which starts open', {}, { open: 0 }],
    ['opens it again', { open: 0 }, { open: 1 }],
    ['reads a half-swung door as open', { open: 0.6 }, { open: 0 }],
  ])('%s', (_name, state, expected) => {
    const door = INTERACTIONS.door;
    if (door?.kind !== 'toggle') {
      throw new Error('the door is a toggle');
    }
    expect(toggled(state, door)).toEqual(expected);
  });

  it('flips a flag toggle', () => {
    const screen = INTERACTIONS.screen;
    if (screen?.kind !== 'toggle') {
      throw new Error('the screen is a toggle');
    }
    expect(isOn({}, screen)).toBe(true);
    expect(toggled({}, screen)).toEqual({ on: false });
    expect(screen.hint(true)).toMatch(/off/);
  });

  it('swings both leaves of the meeting room door together', () => {
    const left = first('glassDoorLeft');
    const pair = linked(left, ALL);
    expect(pair.map((p) => p.name).sort()).toEqual(['glassDoorLeft', 'glassDoorRight']);
  });

  it('reaches every blind on the wall, and only that wall, for a wall-wide control', () => {
    const blind = ALL.find((p) => p.name.startsWith('windowBlind') && p.wall === '-x') as RoomPiece;
    const wall = linked(blind, ALL, 'wall');
    expect(wall.length).toBeGreaterThan(5);
    expect(wall.every((p) => p.wall === '-x' && p.name.startsWith('windowBlind'))).toBe(true);
    expect(linked(blind, ALL)).toEqual([blind]);
  });

  it.each<[string, string, string]>([
    ['a filing cabinet', 'cabinet', 'CABINETS'],
    ['a desk', 'desk', 'DESKS'],
    ['the meeting room glass', 'glassPanel', 'MEETING ROOM'],
    ['a blind', 'windowBlind', 'WINDOWS'],
    ['a plant, which no label names', 'plant', 'PLANT'],
  ])('heads the popover for %s with its label', (_name, name, title) => {
    const label = annotationOf(first(name));
    expect(label.title).toBe(title);
    expect(label.note.length).toBeGreaterThan(0);
  });

  it.each([
    ['an occupied desk offers to clear it', 'bus-1', 1],
    ['an empty desk offers nothing', null, 0],
  ])('%s', (_, bus, count) => {
    const controls = deskControls(bus);
    expect(controls).toHaveLength(count);
    expect(controls.every((c) => c.dismiss === bus)).toBe(true);
  });

  it('keys every placed piece uniquely', () => {
    const keys = ALL.map(pieceKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('piece store', () => {
  it('eases a number toward where it was set, from its default', () => {
    const store = new PieceStore();
    store.set('d', { open: 1 });
    expect(store.step(100, new Map(), () => 0)).toEqual(['d']);
    const part = store.get('d').open as number;
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(1);
    store.step(1000);
    expect(store.get('d').open).toBe(1);
    expect(store.step(16)).toEqual([]);
  });

  it('lands anything but a number at once', () => {
    const store = new PieceStore();
    store.set('s', { muted: true });
    expect(store.get('s').muted).toBe(true);
  });

  it('holds a door open while someone walks through, then lets it go back', () => {
    const store = new PieceStore();
    const holds = new Map([['d', { open: 1 }]]);
    store.step(1000, holds);
    expect(store.get('d').open).toBe(1);
    store.step(1000);
    expect(store.get('d').open).toBe(0);
    // Nothing set, so nothing of the hold is kept.
    expect(store.wanted('d')).toEqual({});
  });

  it('remembers what was set across visits', () => {
    const storage = memory();
    new PieceStore(storage).set('d', { open: 1, muted: true });
    const again = new PieceStore(storage);
    expect(again.wanted('d')).toEqual({ open: 1, muted: true });
    expect(again.get('d').open).toBe(1);
  });

  it('starts from the room as authored when the stored copy is damaged', () => {
    const storage = memory();
    storage.data.set('agentopia.office.pieces.v1', '{not json');
    expect(new PieceStore(storage).get('d')).toEqual({});
  });
});

describe('the popup beside a part', () => {
  const view = { w: 1000, h: 700 };
  const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

  it.each<[string, ReturnType<typeof box>, PopupSide]>([
    ['in the middle of the view', box(400, 300, 480, 380), 'right'],
    ['against the right edge', box(850, 300, 930, 380), 'left'],
    ['across the whole width', box(20, 100, 980, 160), 'below'],
    ['across the width, low down', box(20, 520, 980, 600), 'above'],
  ])('stands beside a part %s', (_name, anchor, side) => {
    const spot = popupSpot(anchor, 240, 110, view);
    expect(spot?.side).toBe(side);
  });

  it('stands just off the part and points its notch at the middle', () => {
    const spot = popupSpot(box(400, 300, 480, 380), 240, 110, view);
    expect(spot).toMatchObject({ left: 480 + POPUP_GAP, top: 340 - 55, tip: 55 });
  });

  it.each<[string, ReturnType<typeof box>]>([
    ['the top', box(400, -40, 480, 20)],
    ['the bottom', box(400, 680, 480, 760)],
    ['the bottom right corner', box(900, 650, 990, 699)],
  ])('stays in the view for a part at %s of it', (_name, anchor) => {
    const spot = popupSpot(anchor, 240, 110, view);
    expect(spot).not.toBeNull();
    const { left, top } = spot as NonNullable<typeof spot>;
    expect(left).toBeGreaterThanOrEqual(POPUP_PAD);
    expect(top).toBeGreaterThanOrEqual(POPUP_PAD);
    expect(left + 240).toBeLessThanOrEqual(view.w - POPUP_PAD);
    expect(top + 110).toBeLessThanOrEqual(view.h - POPUP_PAD);
  });

  it('keeps to the side it stood on while that still fits', () => {
    const anchor = box(400, 300, 480, 380);
    expect(popupSpot(anchor, 240, 110, view, 'left')?.side).toBe('left');
    expect(popupSpot(box(40, 300, 120, 380), 240, 110, view, 'left')?.side).toBe('right');
  });

  it('waits while the part is out of the view', () => {
    expect(popupSpot(box(-200, 300, -120, 380), 240, 110, view)).toBeNull();
    expect(popupSpot(box(400, 720, 480, 800), 240, 110, view)).toBeNull();
  });

  it('stands over a part that fills the view, inside it', () => {
    const spot = popupSpot(box(-100, -100, 1100, 800), 240, 110, view);
    expect(spot).not.toBeNull();
    expect(spot?.left).toBeLessThanOrEqual(view.w - POPUP_PAD - 240);
  });
});
