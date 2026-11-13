import {
  INTERACTIONS,
  PieceStore,
  StateStorage,
  interactionOf,
  isOn,
  linked,
  pieceKey,
  toggled,
} from '../interact';
import { MOUNTED_PIECES, ROOM_PIECES, RoomPiece } from '../room';

const ALL = [...ROOM_PIECES, ...MOUNTED_PIECES];
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
    const speaker = INTERACTIONS.speaker;
    if (speaker?.kind !== 'toggle') {
      throw new Error('the speaker is a toggle');
    }
    expect(isOn({}, speaker)).toBe(false);
    expect(toggled({}, speaker)).toEqual({ muted: true });
    expect(speaker.hint(true)).toMatch(/unmute/);
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
