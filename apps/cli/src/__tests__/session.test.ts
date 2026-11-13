import { AGENTOPIA_HEADER_EV } from '@agentopia/core';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { busPath } from '../paths';
import {
  busEnded,
  createSession,
  latestSessionId,
  listSessions,
  liveSessions,
  readSessionSummary,
  readSummaryFromBus,
  resolveSessionId,
} from '../session';

/** Pretend the bus was last written `agoMs` ago. */
function age(id: string, agoMs: number): void {
  const when = (Date.now() - agoMs) / 1000;
  utimesSync(busPath(id), when, when);
}

/** Append a hook record for a given harness session id. */
function record(id: string, sid: string, ev = 'SessionStart'): void {
  appendFileSync(busPath(id), `${JSON.stringify({ ts: Date.now(), ev, sid })}\n`);
}

describe('sessions', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentopia-session-'));
    process.env.AGENTOPIA_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENTOPIA_HOME;
  });

  it('mints a readable, sortable id', () => {
    expect(createSession('claude', []).id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
  });

  it('writes the header as the first bus line instead of a sidecar file', () => {
    const { id, header } = createSession('claude', ['--effort', 'high']);

    expect(header.ev).toBe(AGENTOPIA_HEADER_EV);
    expect(readSessionSummary(id)).toMatchObject({
      id,
      harness: 'claude',
      argv: ['--effort', 'high'],
      cwd: process.cwd(),
    });
  });

  it('reports the harness session id once the agent has started', () => {
    const { id } = createSession('claude', []);
    expect(readSessionSummary(id)?.harnessSession).toBeUndefined();

    record(id, 'sid-abc');
    expect(readSessionSummary(id)?.harnessSession).toBe('sid-abc');
  });

  it('clips an enormous argv entry so the header stays a header', () => {
    const prompt = 'x'.repeat(50000);
    const { id } = createSession('claude', ['-p', prompt]);

    const summary = readSessionSummary(id);
    expect(summary?.argv[0]).toBe('-p');
    expect(summary?.argv[1]?.length).toBe(2000);
  });

  it('reads a summary even when later records dwarf the head buffer', () => {
    const { id } = createSession('claude', []);
    // A single huge record after the header must not break header parsing.
    appendFileSync(
      busPath(id),
      `${JSON.stringify({ ts: 2, ev: 'SessionStart', sid: 'big', msg: 'y'.repeat(100000) })}\n`
    );

    expect(readSessionSummary(id)?.harnessSession).toBe('big');
  });

  it('lists newest first', () => {
    const older = createSession('claude', []).id;
    const newer = createSession('claude', []).id;

    const ids = listSessions().map((summary) => summary.id);
    expect(ids).toContain(older);
    expect(ids).toContain(newer);
    expect(latestSessionId()).not.toBeNull();
  });

  it('calls the most recently written session the latest, not the most recently started', () => {
    const older = createSession('claude', []).id;
    const newer = createSession('claude', []).id;
    // The older session is still going; the newer one stopped a minute ago.
    record(older, 'sid-older', 'PreToolUse');
    age(newer, 60_000);

    expect(latestSessionId()).toBe(older);
  });

  it('knows when a session has ended from its last record alone', () => {
    const { id } = createSession('claude', []);
    record(id, 'sid', 'SessionStart');
    expect(readSessionSummary(id)?.ended).toBe(false);
    expect(busEnded(busPath(id))).toBe(false);

    record(id, 'sid', 'SessionEnd');
    expect(readSessionSummary(id)?.ended).toBe(true);
    expect(busEnded(busPath(id))).toBe(true);

    // A resume appends after the goodbye, and the session is live again.
    record(id, 'sid', 'SessionStart');
    expect(busEnded(busPath(id))).toBe(false);
  });

  it('lists live sessions freshest first, skipping ended and stale ones', () => {
    const stale = createSession('claude', []).id;
    record(stale, 'sid-stale');
    age(stale, 7 * 60 * 60 * 1000);
    const ended = createSession('claude', []).id;
    record(ended, 'sid-ended');
    record(ended, 'sid-ended', 'SessionEnd');
    const old = createSession('claude', []).id;
    record(old, 'sid-old');
    age(old, 60_000);
    const fresh = createSession('claude', []).id;
    record(fresh, 'sid-fresh');

    expect(liveSessions().map((s) => s.id)).toEqual([fresh, old]);
    expect(readSessionSummary(fresh)?.updatedAt).toBeGreaterThan(
      readSessionSummary(old)?.updatedAt ?? 0
    );
  });

  it.each([
    ['a bus file that was never written', 'nope'],
    ['an empty bus file', 'empty'],
  ])('returns null for %s', (_label, id) => {
    if (id === 'empty') {
      const real = createSession('claude', []).id;
      writeFileSync(busPath(real), '');
      expect(readSessionSummary(real)).toBeNull();
      return;
    }
    expect(readSessionSummary(id)).toBeNull();
  });

  it('synthesizes a summary for a wrapper-less (headerless) recording', () => {
    // The desktop-app path: hooks installed via settings write straight to an
    // auto- bus with no agentopia.session header line.
    const dir = join(process.env.AGENTOPIA_HOME!, 'sessions', 'auto-xyz');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'bus.jsonl'),
      '{"ts":123,"ev":"SessionStart","sid":"xyz-sid"}\n{"ts":124,"ev":"Stop","sid":"xyz-sid"}\n'
    );

    const summary = readSessionSummary('auto-xyz');
    expect(summary).toMatchObject({ id: 'auto-xyz', harness: 'claude', ts: 123 });
    expect(summary?.harnessSession).toBe('xyz-sid');
    expect(listSessions().map((s) => s.id)).toContain('auto-xyz');
  });

  it('summarizes a standalone bus file outside the sessions directory', () => {
    // The `watch --bus` path: the file never enters ~/.agentopia/sessions.
    const file = join(home, 'standalone.jsonl');
    writeFileSync(
      file,
      `${JSON.stringify({ ts: 7, ev: AGENTOPIA_HEADER_EV, harness: 'claude', cwd: '/x', argv: [], version: '0' })}\n` +
        '{"ts":8,"ev":"SessionStart","sid":"loose-sid"}\n'
    );

    const summary = readSummaryFromBus(file, 'standalone');
    expect(summary).toMatchObject({ id: 'standalone', harness: 'claude', ts: 7 });
    expect(summary?.harnessSession).toBe('loose-sid');
    // It is not a session, so listing must not pick it up.
    expect(listSessions().map((s) => s.id)).not.toContain('standalone');
  });

  it('reports no sessions in a fresh home', () => {
    rmSync(home, { recursive: true, force: true });
    expect(listSessions()).toEqual([]);
    expect(latestSessionId()).toBeNull();
  });
});

describe('resolveSessionId', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentopia-resolve-'));
    process.env.AGENTOPIA_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENTOPIA_HOME;
  });

  it('accepts an agentopia session id', () => {
    const { id } = createSession('claude', []);
    expect(resolveSessionId(id)).toBe(id);
  });

  it('accepts a harness session id', () => {
    const { id } = createSession('claude', []);
    record(id, 'harness-uuid');

    expect(resolveSessionId('harness-uuid')).toBe(id);
  });

  it('picks the newest run when resume reused one harness session', () => {
    const first = createSession('claude', []).id;
    record(first, 'shared-uuid');
    const second = createSession('claude', []).id;
    record(second, 'shared-uuid');

    expect(resolveSessionId('shared-uuid')).toBe([first, second].sort().pop());
  });

  it('finds a harness session that only started after a clear', () => {
    const { id } = createSession('claude', []);
    record(id, 'first-uuid');
    record(id, 'second-uuid');

    expect(resolveSessionId('second-uuid')).toBe(id);
  });

  it('returns null for an unknown id', () => {
    expect(resolveSessionId('missing')).toBeNull();
  });
});
