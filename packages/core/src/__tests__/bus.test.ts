import { parseRecord, parseRecords } from '../bus';

describe('parseRecord', () => {
  it('parses a well-formed record', () => {
    expect(parseRecord('{"ts":1,"ev":"Stop"}')).toEqual({ ts: 1, ev: 'Stop' });
  });

  it.each([
    ['empty line', ''],
    ['whitespace', '   '],
    ['a half-written line', '{"ts":1,"ev":"St'],
    ['valid JSON that is not a record', '{"hello":"world"}'],
    ['a JSON array', '[1,2,3]'],
    ['a bare string', '"nope"'],
  ])('returns null for %s', (_label, line) => {
    expect(parseRecord(line)).toBeNull();
  });
});

describe('parseRecords', () => {
  it('keeps good lines and skips the torn tail of a file being appended to', () => {
    const text = '{"ts":1,"ev":"SessionStart"}\n{"ts":2,"ev":"Stop"}\n{"ts":3,"ev":"Pre';

    expect(parseRecords(text)).toEqual([
      { ts: 1, ev: 'SessionStart' },
      { ts: 2, ev: 'Stop' },
    ]);
  });
});
