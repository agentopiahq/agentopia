import { parseWatchArgs } from '../commands/watch';

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
  ])('parses %s', (_label, args, expected) => {
    expect(parseWatchArgs(args)).toEqual(expected);
  });
});
