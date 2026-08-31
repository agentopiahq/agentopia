import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SessionNameSources, claudeSessionName } from '../sessionName';

describe('claudeSessionName', () => {
  let root: string;
  let sources: SessionNameSources;

  let storeSeq = 0;

  /**
   * A desktop-store file: store/<account>/<org>/local_<store id>.json. Named
   * by the store's own id on purpose — the lookup must match `cliSessionId`
   * inside the file, never the file name.
   */
  function storeEntry(body: unknown): void {
    const dir = join(root, 'store', 'account-1', 'org-1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `local_store-${storeSeq++}.json`), JSON.stringify(body));
  }

  /** A live-registry file, named by pid, matched by the sessionId inside. */
  function registryEntry(pid: number, body: unknown): void {
    mkdirSync(join(root, 'registry'), { recursive: true });
    writeFileSync(join(root, 'registry', `${pid}.json`), JSON.stringify(body));
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agentopia-name-'));
    sources = { storeRoots: [join(root, 'store')], registryDir: join(root, 'registry') };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns the desktop store title matched on cliSessionId', () => {
    storeEntry({ cliSessionId: 'other-cli-session', title: 'Someone else' });
    storeEntry({ cliSessionId: 'sid-1', title: 'Rename the project' });
    expect(claudeSessionName('sid-1', sources)).toBe('Rename the project');
  });

  it('falls back to the live-registry name', () => {
    registryEntry(1234, { sessionId: 'sid-2', name: 'agentopia-a9' });
    expect(claudeSessionName('sid-2', sources)).toBe('agentopia-a9');
  });

  it('prefers the title the user sees over the derived registry name', () => {
    storeEntry({ cliSessionId: 'sid-3', title: 'Fix the flaky tests' });
    registryEntry(99, { sessionId: 'sid-3', name: 'agentopia-b1' });
    expect(claudeSessionName('sid-3', sources)).toBe('Fix the flaky tests');
  });

  it('matches the registry on sessionId, not on file name', () => {
    registryEntry(42, { sessionId: 'other-session', name: 'wrong' });
    registryEntry(43, { sessionId: 'sid-4', name: 'right' });
    expect(claudeSessionName('sid-4', sources)).toBe('right');
  });

  it.each([
    ['a blank title', { cliSessionId: 'sid-5', title: '   ' }],
    ['a missing title', { cliSessionId: 'sid-5' }],
    ['a non-string title', { cliSessionId: 'sid-5', title: 7 }],
  ])('skips a store file with %s', (_label, body) => {
    storeEntry(body);
    registryEntry(7, { sessionId: 'sid-5', name: 'fallback' });
    expect(claudeSessionName('sid-5', sources)).toBe('fallback');
  });

  it.each([
    ['nothing on disk', (): void => {}],
    [
      'malformed json in both sources',
      (): void => {
        const dir = join(root, 'store', 'a', 'b');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'local_sid-6.json'), 'not json');
        mkdirSync(join(root, 'registry'), { recursive: true });
        writeFileSync(join(root, 'registry', '1.json'), '{{');
      },
    ],
    ['a registry entry without a name', (): void => registryEntry(2, { sessionId: 'sid-6' })],
  ])('returns null with %s', (_label, setup) => {
    setup();
    expect(claudeSessionName('sid-6', sources)).toBeNull();
  });
});
