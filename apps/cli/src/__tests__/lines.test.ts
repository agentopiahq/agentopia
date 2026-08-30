import { LineBuffer, splitLines } from '../lines';

describe('splitLines', () => {
  it.each([
    ['a complete line', 'one\n', ['one'], ''],
    ['two complete lines', 'one\ntwo\n', ['one', 'two'], ''],
    ['a torn tail', 'one\ntw', ['one'], 'tw'],
    ['nothing but a partial', 'par', [], 'par'],
    ['empty input', '', [], ''],
  ])('handles %s', (_label, input, lines, rest) => {
    expect(splitLines(input)).toEqual({ lines, rest });
  });
});

describe('LineBuffer', () => {
  it('stitches a record split across two reads', () => {
    const buffer = new LineBuffer();

    expect(buffer.push('{"ts":1,"ev":"Se')).toEqual([]);
    expect(buffer.push('ssionStart"}\n')).toEqual(['{"ts":1,"ev":"SessionStart"}']);
    expect(buffer.remainder()).toBe('');
  });

  it('emits each complete line exactly once', () => {
    const buffer = new LineBuffer();

    expect(buffer.push('a\nb\nc')).toEqual(['a', 'b']);
    expect(buffer.push('\n')).toEqual(['c']);
  });
});
