import { floorChoices } from '../floorKeys';
import { FLOORS, FLOOR_KEY, FloorState, FloorStore, travel } from '../floors';

/** A store in memory, like the browser's. */
function memory(
  initial: Record<string, string> = {}
): FloorStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const THREE = [
  { id: 'office', label: 'the office' },
  { id: 'servers', label: 'the server floor' },
  { id: 'vault', label: 'the vault' },
];

describe('the floors', () => {
  it('start at the office, the top floor', () => {
    expect(FLOORS[0].id).toBe('office');
    expect(new FloorState().floor.id).toBe('office');
  });

  it.each([
    ['the office', 0, false, true],
    ['the server floor', 1, true, false],
  ])('on %s, up is %s and down is %s', (_label, level, up, down) => {
    const floors = new FloorState(FLOORS, memory({ [FLOOR_KEY]: FLOORS[level].id }));
    expect(floors.level).toBe(level);
    expect(floors.can('up')).toBe(up);
    expect(floors.can('down')).toBe(down);
  });

  it.each([
    [0, false, true],
    [1, true, true],
    [2, true, false],
  ])('in a taller building, level %s can go up %s and down %s', (level, up, down) => {
    const floors = new FloorState(THREE, memory({ [FLOOR_KEY]: THREE[level].id }));
    expect([floors.can('up'), floors.can('down')]).toEqual([up, down]);
  });

  it('goes down and back up, telling each move, and keeps where it is', () => {
    const store = memory();
    const floors = new FloorState(FLOORS, store);
    const heard: string[] = [];
    floors.onChange((floor, way) => heard.push(`${way}:${floor.id}`));
    expect(floors.go('down')).toBe(true);
    expect(store.data[FLOOR_KEY]).toBe('servers');
    expect(floors.go('down')).toBe(false);
    expect(floors.go('up')).toBe(true);
    expect(floors.go('up')).toBe(false);
    expect(heard).toEqual(['down:servers', 'up:office']);
    expect(store.data[FLOOR_KEY]).toBe('office');
  });

  it('comes back on the floor it was left on', () => {
    const store = memory();
    new FloorState(FLOORS, store).go('down');
    expect(new FloorState(FLOORS, store).floor.id).toBe('servers');
  });

  it.each([['nowhere'], ['']])('falls back to the top floor for a kept floor of %p', (kept) => {
    expect(new FloorState(FLOORS, memory({ [FLOOR_KEY]: kept })).level).toBe(0);
  });

  it('keeps its floor for the visit when the store will not', () => {
    const broken: FloorStore = {
      getItem: () => {
        throw new Error('no storage');
      },
      setItem: () => {
        throw new Error('no storage');
      },
    };
    const floors = new FloorState(FLOORS, broken);
    expect(floors.go('down')).toBe(true);
    expect(floors.floor.id).toBe('servers');
  });

  it('goes straight to a floor several floors away, telling the way and where it came from', () => {
    const store = memory();
    const floors = new FloorState(THREE, store);
    const heard: string[] = [];
    floors.onChange((floor, way, from) => heard.push(`${from}-${way}->${floor.id}`));
    expect(floors.goTo('vault')).toBe(true);
    expect(floors.level).toBe(2);
    expect(store.data[FLOOR_KEY]).toBe('vault');
    expect(floors.goTo('office')).toBe(true);
    expect(heard).toEqual(['0-down->vault', '2-up->office']);
  });

  it.each([['office'], ['nowhere']])('stays put going to %p from the office', (id) => {
    const floors = new FloorState(THREE);
    const heard: string[] = [];
    floors.onChange((floor) => heard.push(floor.id));
    expect(floors.goTo(id)).toBe(false);
    expect(floors.level).toBe(0);
    expect(heard).toEqual([]);
  });

  it('lists every floor for the picker, top to bottom, marking the one the view is on', () => {
    const floors = new FloorState(THREE);
    floors.goTo('servers');
    expect(floorChoices(floors)).toEqual([
      { id: 'office', label: 'office', current: false },
      { id: 'servers', label: 'server floor', current: true },
      { id: 'vault', label: 'vault', current: false },
    ]);
  });
});

describe('a trip between floors', () => {
  it.each([
    ['down', -1],
    ['up', 1],
  ] as const)('going %s, the floor left slides away %s', (way, sign) => {
    const start = travel(0, way, 100);
    const half = travel(0.5, way, 100);
    const end = travel(1, way, 100);
    expect(start.from.y).toBeCloseTo(0);
    expect(start.from.alpha).toBe(1);
    expect(start.to.alpha).toBe(0);
    expect(Math.sign(start.to.y)).toBe(-sign);
    expect(Math.sign(half.from.y)).toBe(sign);
    expect(half.from.alpha).toBeCloseTo(0.5);
    expect(end.from.alpha).toBe(0);
    expect(end.to.y).toBeCloseTo(0);
    expect(end.to.alpha).toBe(1);
  });

  it('holds still past either end', () => {
    expect(travel(-1, 'down', 100)).toEqual(travel(0, 'down', 100));
    expect(travel(2, 'down', 100)).toEqual(travel(1, 'down', 100));
  });
});
