import { Actor, DESKS, HUMAN_SPOTS, STATIONS, askSpotFor } from '@agentopia/core';

import { headingOf, headingView, nextHeading, restingHeading } from '../heading';

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
    [
      'a lead typing in its seat faces its monitor',
      { pos: { ...seat }, state: 'working', station: 'own_desk' },
      '-y',
    ],
    ['a lead slumped in its seat faces its monitor', { pos: { ...seat }, state: 'slump' }, '-y'],
    ['a lead idling in its seat swivels away from it', { pos: { ...seat } }, '+x'],
    [
      'a lead thinking in its seat swivels away from it',
      { pos: { ...seat }, state: 'thinking' },
      '+x',
    ],
    [
      'a lead napping in its seat swivels away from it',
      { pos: { ...seat }, state: 'napping' },
      '+x',
    ],
    [
      'a helper behind the lead on its left faces the desk',
      { role: 'helper', pos: DESKS[0].helpers[0], station: 'own_desk' },
      '-y',
    ],
    [
      'a helper behind the lead on its right faces the desk',
      { role: 'helper', pos: DESKS[0].helpers[1], station: 'own_desk' },
      '-y',
    ],
    [
      'a lead at the printers faces the wall',
      { pos: STATIONS.printers.spot, station: 'printers' },
      '-y',
    ],
  ])('%s', (_name, over, expected) => {
    expect(restingHeading(actor(over), [])).toBe(expected);
  });

  it.each(HUMAN_SPOTS.map((spot, i): [number, (typeof HUMAN_SPOTS)[number]] => [i, spot]))(
    'turns a lead asking the human at spot %d toward them',
    (_i, spot) => {
      const ask = askSpotFor(spot);
      const lead = actor({ pos: ask, station: 'human', state: 'talking' });
      const human = actor({ id: 'human', role: 'human', bus: '', pos: spot.spot });
      const want = headingOf(spot.spot.x - ask.x, spot.spot.y - ask.y);
      expect(restingHeading(lead, [human])).toBe(want);
    }
  );

  it('turns a talking lead toward the helper it is briefing', () => {
    const lead = actor({ pos: { ...seat }, state: 'talking' });
    const helper = actor({ id: 'h', role: 'helper', pos: DESKS[0].helpers[1], state: 'talking' });
    // The helper stands behind the lead, so the lead turns round to it.
    expect(restingHeading(lead, [lead, helper])).toBe('+y');
  });

  it('keeps its last heading when nothing says otherwise', () => {
    const loose = actor({ pos: { x: 12.7, y: 6.6 } });
    expect(nextHeading(loose, { x: 12.7, y: 6.6 }, '-x', [])).toBe('-x');
  });

  it.each<[string, number, { facing: 1 | -1; back: boolean }]>([
    ['+x', 0, { facing: 1, back: false }],
    ['+y', 0, { facing: -1, back: false }],
    ['-x', 0, { facing: -1, back: true }],
    ['-y', 0, { facing: 1, back: true }],
    ['-y', Math.PI, { facing: -1, back: false }],
  ])('shows heading %s from yaw %d', (heading, yaw, expected) => {
    expect(headingView(heading as Parameters<typeof headingView>[0], yaw)).toEqual(expected);
  });
});
