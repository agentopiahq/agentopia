/**
 * @jest-environment jsdom
 */
import { Floored, mountFloors } from '../floorKeys';
import { FloorState, FloorStore } from '../floors';

const THREE = [
  { id: 'office', label: 'the office' },
  { id: 'servers', label: 'the server floor' },
  { id: 'vault', label: 'the vault' },
];

/** An office with just a corner to stack the floor key in, counting its trips. */
function office(at = 'office'): Floored & { corner: HTMLElement; trips: string[] } {
  const store: FloorStore = { getItem: () => at, setItem: () => {} };
  const floors = new FloorState(THREE, store);
  const corner = document.createElement('div');
  document.body.append(corner);
  const trips: string[] = [];
  floors.onChange((floor) => trips.push(floor.id));
  return {
    corner,
    trips,
    floors,
    addUnderCamera: (row) => corner.append(row),
    goFloor: (way) => floors.go(way),
    goToFloor: (id) => floors.goTo(id),
  };
}

const key = (corner: HTMLElement): HTMLButtonElement =>
  corner.querySelector<HTMLButtonElement>('.agentopia-floors > .agentopia-control')!;
const picks = (corner: HTMLElement): HTMLButtonElement[] => [
  ...corner.querySelectorAll<HTMLButtonElement>('.agentopia-floors-pick'),
];
const isOpen = (corner: HTMLElement): boolean =>
  corner.querySelector('.agentopia-floors')!.classList.contains('open');

describe('the floor key', () => {
  let unmount: (() => void) | null = null;
  afterEach(() => {
    unmount?.();
    document.body.replaceChildren();
  });

  it('is one key, closed until pressed', () => {
    const o = office();
    unmount = mountFloors(o);
    expect(o.corner.querySelectorAll('.agentopia-control')).toHaveLength(1);
    expect(isOpen(o.corner)).toBe(false);
    key(o.corner).click();
    expect(isOpen(o.corner)).toBe(true);
    expect(key(o.corner).getAttribute('aria-expanded')).toBe('true');
  });

  it('lists every floor top to bottom, the one the view is on marked', () => {
    const o = office('servers');
    unmount = mountFloors(o);
    key(o.corner).click();
    expect(
      picks(o.corner).map((p) => [p.dataset.floor, p.textContent, p.getAttribute('aria-checked')])
    ).toEqual([
      ['office', '1office', 'false'],
      ['servers', '2server floor', 'true'],
      ['vault', '3vault', 'false'],
    ]);
  });

  it('travels to the floor picked, however far, and closes', () => {
    const o = office();
    unmount = mountFloors(o);
    key(o.corner).click();
    picks(o.corner)[2].click();
    expect(o.trips).toEqual(['vault']);
    expect(o.floors.floor.id).toBe('vault');
    expect(isOpen(o.corner)).toBe(false);
    expect(picks(o.corner).map((p) => p.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
    ]);
  });

  it('only closes when the floor the view is on is picked', () => {
    const o = office();
    unmount = mountFloors(o);
    key(o.corner).click();
    picks(o.corner)[0].click();
    expect(o.trips).toEqual([]);
    expect(isOpen(o.corner)).toBe(false);
  });

  it.each([
    [
      'a press off the card',
      () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })),
    ],
    ['Escape', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))],
  ])('closes on %s', (_name, act) => {
    const o = office();
    unmount = mountFloors(o);
    key(o.corner).click();
    act();
    expect(isOpen(o.corner)).toBe(false);
    expect(o.trips).toEqual([]);
  });

  it.each([
    ['PageDown', 'office', 'servers'],
    ['PageUp', 'servers', 'office'],
  ])('%s goes a floor that way, from %s to %s', (name, from, to) => {
    const o = office(from);
    unmount = mountFloors(o);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: name }));
    expect(o.floors.floor.id).toBe(to);
  });
});
