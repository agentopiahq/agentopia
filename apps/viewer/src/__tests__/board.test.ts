import {
  DEFAULT_BOARD,
  addNote,
  editNote,
  moveNote,
  normalizeBoard,
  removeNote,
  shownNotes,
  wipeBoard,
} from '../board';

const texts = (board: typeof DEFAULT_BOARD): string[][] =>
  board.columns.map((col) => col.map((n) => n.text));

describe('board', () => {
  it('adds a note at the foot of a column, leaving the rest alone', () => {
    const next = addNote(DEFAULT_BOARD, 1, 'Ship it');
    expect(texts(next)[1]).toEqual([...texts(DEFAULT_BOARD)[1], 'Ship it']);
    expect(texts(next)[0]).toEqual(texts(DEFAULT_BOARD)[0]);
    expect(DEFAULT_BOARD.columns[1]).toHaveLength(3);
  });

  it('edits and removes a note in place', () => {
    const edited = editNote(DEFAULT_BOARD, 0, 1, 'Faster search, really');
    expect(texts(edited)[0][1]).toBe('Faster search, really');
    const removed = removeNote(edited, 0, 0);
    expect(texts(removed)[0][0]).toBe('Faster search, really');
    expect(removed.columns[0]).toHaveLength(DEFAULT_BOARD.columns[0].length - 1);
  });

  it.each<
    [string, { column: number; index: number }, { column: number; index: number }, string[][]]
  >([
    [
      'moves a note to another column',
      { column: 0, index: 0 },
      { column: 3, index: 0 },
      [['b'], [], [], ['a', 'c']],
    ],
    [
      'appends when dropped past the end',
      { column: 0, index: 0 },
      { column: 3, index: 9 },
      [['b'], [], [], ['c', 'a']],
    ],
    [
      'reorders within a column',
      { column: 0, index: 0 },
      { column: 0, index: 2 },
      [['b', 'a'], [], [], ['c']],
    ],
    [
      'ignores a note that is not there',
      { column: 2, index: 0 },
      { column: 0, index: 0 },
      [['a', 'b'], [], [], ['c']],
    ],
  ])('%s', (_name, from, to, expected) => {
    const board = normalizeBoard({
      title: 't',
      columns: [[{ text: 'a' }, { text: 'b' }], [], [], [{ text: 'c' }]],
    });
    expect(texts(moveNote(board, from, to))).toEqual(expected);
  });

  it('wipes everything off', () => {
    const wiped = wipeBoard();
    expect(wiped).toMatchObject({ title: '', tag: '', chart: false, ink: null });
    expect(wiped.columns.every((col) => col.length === 0)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['nothing', null],
    ['a string', 'board'],
  ])('reads %s as the default board', (_name, raw) => {
    expect(normalizeBoard(raw)).toBe(DEFAULT_BOARD);
  });

  it('repairs a damaged stored board without throwing', () => {
    const board = normalizeBoard({
      title: 42,
      columns: [[{ text: 'ok', color: 'red' }, null, 'junk'], 'nope'],
      chart: 'yes',
      ink: 'javascript:alert(1)',
    });
    expect(board.title).toBe('');
    expect(board.columns).toHaveLength(4);
    expect(board.columns[0]).toEqual([{ text: 'ok', color: expect.stringMatching(/^#/) }]);
    expect(board.chart).toBe(true);
    expect(board.ink).toBeNull();
  });

  it('shows no more notes than the drawn board has room for', () => {
    let board = DEFAULT_BOARD;
    for (let i = 0; i < 10; i++) {
      board = addNote(board, 2, `n${i}`);
    }
    expect(shownNotes(board, 2)).toBe(4);
    expect(shownNotes({ ...board, chart: false }, 2)).toBe(6);
    expect(shownNotes(board, 1)).toBe(3);
  });
});
