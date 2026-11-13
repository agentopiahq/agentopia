import { Actor, DESKS, STATIONS } from '@agentopia/core';

import { headingOf, nextHeading, restingHeading } from '../heading';

const actor = (over: Partial<Actor>): Actor => ({
  id: 'a',
  bus: 'b',
  worker: 'lead',
  role: 'lead',
  label: 'lead',
  pos: { x: 0, y: 0 },
  state: 'idle',
  progress: 0,
  facing: 1,
  stress: 0,
  ...over,
});

const seat = DESKS[0].seat;

describe('headings', () => {
  it.each<[number, number, string]>([
    [1, 0.2, '+x'],
    [-1, 0.2, '-x'],
    [0.2, 1, '+y'],
    [0.2, -1, '-y'],
  ])('reads a move of (%d, %d) as %s', (dx, dy, expected) => {
    expect(headingOf(dx, dy)).toBe(expected);
  });

  it('faces the way it walks', () => {
    const walker = actor({ pos: { x: 5, y: 5.1 }, state: 'walking' });
    expect(nextHeading(walker, { x: 5, y: 5 }, '+x', [])).toBe('+y');
  });

  it.each<[string, Partial<Actor>, string]>([
    ['a lead in its seat faces its monitor', { pos: { ...seat }, station: 'own_desk' }, '-y'],
    ['a lead idling in its seat faces its monitor', { pos: { ...seat } }, '-y'],
    [
      'a helper left of the desk faces the desk',
      { role: 'helper', pos: DESKS[0].helpers[0], station: 'own_desk' },
      '+x',
    ],
    [
      'a helper right of the desk faces the desk',
      { role: 'helper', pos: DESKS[0].helpers[1], station: 'own_desk' },
      '-x',
    ],
    [
      'a lead at the speaker faces the wall',
      { pos: STATIONS.speaker.spot, station: 'speaker' },
      '-y',
    ],
  ])('%s', (_name, over, expected) => {
    expect(restingHeading(actor(over), [])).toBe(expected);
  });

  it('turns a talking lead toward the helper it is briefing', () => {
    const lead = actor({ pos: { ...seat }, state: 'talking' });
    const helper = actor({ id: 'h', role: 'helper', pos: DESKS[0].helpers[1], state: 'talking' });
    expect(restingHeading(lead, [lead, helper])).toBe('+x');
  });

  it('keeps its last heading when nothing says otherwise', () => {
    const loose = actor({ pos: { x: 8.2, y: 12 } });
    expect(nextHeading(loose, { x: 8.2, y: 12 }, '-x', [])).toBe('-x');
  });
});
