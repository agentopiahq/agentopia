import { CLAUDE_CODE, harnessFor, harnessIds } from '../harness';

describe('harness registry', () => {
  it('resolves claude', () => {
    expect(harnessFor('claude')).toBe(CLAUDE_CODE);
  });

  it.each([['codex'], ['gemini'], ['']])('returns null for the unsupported agent %s', (id) => {
    expect(harnessFor(id)).toBeNull();
  });

  it('lists the agents it can launch', () => {
    expect(harnessIds()).toEqual(['claude']);
  });
});

describe('claude launch args', () => {
  it('injects the plugin for this session only and passes the rest through', () => {
    expect(CLAUDE_CODE.launchArgs('/p/claude', ['--effort', 'high'])).toEqual([
      '--plugin-dir',
      '/p/claude',
      '--effort',
      'high',
    ]);
  });

  it('works with no user arguments', () => {
    expect(CLAUDE_CODE.launchArgs('/p/claude', [])).toEqual(['--plugin-dir', '/p/claude']);
  });
});
