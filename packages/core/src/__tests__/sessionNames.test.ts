import { AgentopiaEvent, EventKind, LEAD_WORKER } from '../events';
import { isPlaceholderName, promptName } from '../sessionNames';
import { deskName, reduceAll } from '../state';

function event(kind: EventKind, meta: AgentopiaEvent['meta'] = {}): AgentopiaEvent {
  return { ts: 1000, kind, session: 's1', worker: LEAD_WORKER, meta };
}

describe('isPlaceholderName', () => {
  it.each([
    'Local session (from a project)',
    'Local session',
    'Remote session (from a project)',
    'New session',
    'Untitled',
    'agentopia-a9',
    'agentopia-04',
    'my.repo-1e',
    '  ',
  ])('%j names no session', (name) => {
    expect(isPlaceholderName(name)).toBe(true);
  });

  it.each(['Fix Safari export button', 'Local session names', 'Kiro Crew', 'agentopia', 'pr-5810'])(
    '%j is a real name',
    (name) => {
      expect(isPlaceholderName(name)).toBe(false);
    }
  );
});

describe('promptName', () => {
  it.each<[string, string]>([
    ['Fix the flaky test', 'Fix the flaky test'],
    ['Please clean up all local branches and worktrees.', 'Please clean up all…'],
    ['Run entirely on the Mac, never in the cloud.', 'Run entirely on the Mac…'],
    ['Brainstorm 20 interesting newsletter ideas', 'Brainstorm 20…'],
    ['/code-review PR 793', '/code-review PR 793'],
    ['Supercalifragilisticexpialidocious-ness', 'Supercalifragilisticexp…'],
    ['Can you pull the companies working on…', 'Can you pull the…'],
  ])('%j -> %j', (prompt, name) => {
    expect(promptName(prompt)).toBe(name);
  });

  it.each([undefined, '', '   ', '<relay from="coordinator" session="s" current-ti…'])(
    'names nothing from %j',
    (prompt) => {
      expect(promptName(prompt)).toBeUndefined();
    }
  );
});

describe('desk name', () => {
  it('is the first prompt until the harness names the session', () => {
    const state = reduceAll([
      event('session.start', { sessionName: 'Local session (from a project)' }),
      event('turn.user', { text: 'Fix the flaky test' }),
      event('turn.stop'),
      event('turn.user', { text: 'Now ship it' }),
    ]);
    expect(state.name).toBeUndefined();
    expect(deskName(state)).toBe('Fix the flaky test');
  });

  it('takes the next prompt when the first names nothing', () => {
    const state = reduceAll([
      event('session.start'),
      event('turn.user', { text: '<relay from="coordinator" session="s" current-ti…' }),
      event('turn.user', { text: 'Fix the flaky test' }),
    ]);
    expect(deskName(state)).toBe('Fix the flaky test');
  });

  it('is the harness name once there is one', () => {
    const state = reduceAll([
      event('session.start', { sessionName: 'agentopia-a9' }),
      event('turn.user', { text: 'Fix the flaky test' }),
      event('turn.stop', { sessionName: 'Stabilize the test suite' }),
      event('turn.user', { text: 'more', sessionName: 'Local session (from a project)' }),
    ]);
    expect(deskName(state)).toBe('Stabilize the test suite');
  });

  it('starts over on a fresh session', () => {
    const state = reduceAll([
      event('session.start'),
      event('turn.user', { text: 'Fix the flaky test' }),
      event('session.start', { source: 'clear' }),
      event('turn.user', { text: 'Write the release notes' }),
    ]);
    expect(deskName(state)).toBe('Write the release notes');
  });
});
