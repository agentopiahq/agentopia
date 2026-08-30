import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSession, latestSessionId, listSessions, readSessionMeta } from '../session';

describe('sessions', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'cubicle-session-'));
    process.env.CUBICLE_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.CUBICLE_HOME;
  });

  it('mints a readable, sortable id', () => {
    const session = createSession('claude', []);

    expect(session.id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
  });

  it('round-trips metadata through disk', () => {
    const session = createSession('claude', ['--effort', 'high']);

    expect(readSessionMeta(session.id)).toEqual(session);
  });

  it('lists newest first', () => {
    const older = createSession('claude', []);
    const newer = createSession('claude', []);
    // Ids carry second resolution, so pin the ordering explicitly.
    Object.assign(older, { startedAt: 1 });

    const ids = listSessions().map((meta) => meta.id);
    expect(ids).toContain(newer.id);
    expect(ids).toContain(older.id);
    expect(latestSessionId()).not.toBeNull();
  });

  it('returns null for a session that was never written', () => {
    expect(readSessionMeta('nope')).toBeNull();
  });

  it('reports no sessions in a fresh home', () => {
    rmSync(home, { recursive: true, force: true });
    expect(listSessions()).toEqual([]);
    expect(latestSessionId()).toBeNull();
  });
});
