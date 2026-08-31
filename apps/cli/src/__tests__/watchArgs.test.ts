import { busSessionLabel, parseWatchArgs } from '../commands/watch';

describe('parseWatchArgs', () => {
  it.each([
    ['a session id alone', ['abc-123'], { session: 'abc-123', open: true }],
    ['a port flag alone', ['--port', '7788'], { port: 7788, open: true }],
    // Regression: the port value used to be scooped up as the session name.
    ['port before session', ['--port', '7788', 'abc'], { port: 7788, session: 'abc', open: true }],
    ['session before port', ['abc', '--port', '7788'], { session: 'abc', port: 7788, open: true }],
    ['no-open', ['--no-open'], { open: false }],
    ['everything', ['s1', '--port', '9', '--no-open'], { session: 's1', port: 9, open: false }],
    ['a port flag missing its value', ['--port'], { open: true }],
    ['a non-numeric port', ['--port', 'abc'], { open: true }],
    ['bare replay', ['--replay'], { open: true, replay: 1 }],
    ['replay at speed', ['--replay', '4'], { open: true, replay: 4 }],
    ['replay then session', ['--replay', 'abc-1'], { open: true, replay: 1, session: 'abc-1' }],
    ['a bus file', ['--bus', 'f.jsonl'], { bus: 'f.jsonl', open: true }],
    // A bus value is a flag value, never the session positional.
    [
      'bus with replay speed',
      ['--bus', 'f.jsonl', '--replay', '2'],
      { bus: 'f.jsonl', replay: 2, open: true },
    ],
    [
      'bare replay then bus',
      ['--replay', '--bus', 'f.jsonl'],
      { replay: 1, bus: 'f.jsonl', open: true },
    ],
  ])('parses %s', (_label, args, expected) => {
    expect(parseWatchArgs(args)).toEqual(expected);
  });
});

describe('busSessionLabel', () => {
  it.each([
    ['strips the extension and directory', '/tmp/rec/02-subagent.jsonl', '02-subagent'],
    ['sanitizes characters the URL would mangle', '/tmp/my run (1).jsonl', 'my-run--1-'],
    ['falls back when nothing survives', '/tmp/.jsonl', 'bus'],
  ])('%s', (_label, path, expected) => {
    expect(busSessionLabel(path)).toBe(expected);
  });
});
