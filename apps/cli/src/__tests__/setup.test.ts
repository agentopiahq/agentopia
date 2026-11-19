import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SetupAction, isDeclined, setDeclined, setupAction } from '../commands/install';

const base = { ready: false, agentOnPath: true, yes: false, declined: false, interactive: true };

describe('setupAction', () => {
  it.each<[string, Partial<typeof base>, SetupAction]>([
    ['an install that is in and on', { ready: true }, 'ready'],
    ['no agent to install into', { agentOnPath: false }, 'no-agent'],
    ['a missing plugin at a terminal', {}, 'ask'],
    ['a missing plugin with --yes', { yes: true }, 'install'],
    ['--yes, even after a no', { yes: true, declined: true }, 'install'],
    ['a missing plugin after a no', { declined: true }, 'note'],
    ['no one to ask', { interactive: false }, 'note'],
  ])('%s', (_label, facts, expected) => {
    expect(setupAction({ ...base, ...facts })).toBe(expected);
  });
});

describe('a remembered no', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentopia-setup-'));
    process.env.AGENTOPIA_HOME = home;
  });

  afterEach(() => {
    delete process.env.AGENTOPIA_HOME;
    rmSync(home, { recursive: true, force: true });
  });

  it('is kept per harness until an install clears it', () => {
    expect(isDeclined('claude')).toBe(false);

    setDeclined('claude', true);
    expect(isDeclined('claude')).toBe(true);
    expect(isDeclined('codex')).toBe(false);

    setDeclined('claude', false);
    expect(isDeclined('claude')).toBe(false);
  });
});
