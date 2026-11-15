import {
  AGENTOPIA_HEADER_EV,
  BusRecord,
  LEGACY_HARNESS,
  busHarness,
  harnessSessionIds,
  isSessionHeader,
  parseRecord,
  parseRecords,
} from '../bus';

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

describe('session header', () => {
  const header = {
    ts: 1,
    ev: AGENTOPIA_HEADER_EV,
    harness: 'claude',
    cwd: '/repo',
    argv: [],
    version: '0.1.0',
  };

  it('round-trips and is recognizable', () => {
    const parsed = parseRecord(JSON.stringify(header));

    expect(parsed).toEqual(header);
    expect(parsed && isSessionHeader(parsed)).toBe(true);
  });

  it('rejects a header missing its harness', () => {
    expect(parseRecord(`{"ts":1,"ev":"${AGENTOPIA_HEADER_EV}"}`)).toBeNull();
  });

  it('does not mistake a hook record for a header', () => {
    const parsed = parseRecord('{"ts":1,"ev":"SessionStart","sid":"a"}');
    expect(parsed && isSessionHeader(parsed)).toBe(false);
  });
});

describe('harnessSessionIds', () => {
  it('lists distinct harness sessions in first-appearance order, skipping the header', () => {
    const records = parseRecords(
      [
        JSON.stringify({ ts: 1, ev: AGENTOPIA_HEADER_EV, harness: 'claude', cwd: '/', argv: [] }),
        '{"ts":2,"ev":"SessionStart","sid":"a"}',
        '{"ts":3,"ev":"PreToolUse","sid":"a"}',
        '{"ts":4,"ev":"SessionStart","sid":"b"}',
      ].join('\n')
    );

    expect(harnessSessionIds(records)).toEqual(['a', 'b']);
  });

  it('is empty before the agent has emitted anything', () => {
    expect(harnessSessionIds([])).toEqual([]);
  });
});

describe('busHarness', () => {
  const header = (harness: string): BusRecord => ({
    ts: 1,
    ev: AGENTOPIA_HEADER_EV,
    harness,
    cwd: '/',
    argv: [],
    version: '0',
  });

  it.each<[string, BusRecord[], string | null]>([
    ['the header names it', [header('codex'), { ts: 2, ev: 'Stop', h: 'claude' }], 'codex'],
    ['the first stamped record names it', [{ ts: 1, ev: 'SessionStart', h: 'codex' }], 'codex'],
    [
      'an unstamped record precedes the stamp',
      [
        { ts: 1, ev: 'A' },
        { ts: 2, ev: 'B', h: 'codex' },
      ],
      'codex',
    ],
    [
      'nothing is stamped (a recording older than the stamp)',
      [{ ts: 1, ev: 'Stop' }],
      LEGACY_HARNESS,
    ],
    ['the bus is empty', [], null],
  ])('reads the harness when %s', (_label, records, expected) => {
    expect(busHarness(records)).toBe(expected);
  });
});
