import { CUBICLE_HEADER_EV } from '@agentopia/core';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { busPath } from '../paths';
import {
  createSession,
  latestSessionId,
  listSessions,
  readSessionSummary,
  resolveSessionId,
} from '../session';

/** Append a hook record for a given harness session id. */
function record(id: string, sid: string, ev = 'SessionStart'): void {
  appendFileSync(busPath(id), `${JSON.stringify({ ts: Date.now(), ev, sid })}\n`);
}

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
    expect(createSession('claude', []).id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
  });

  it('writes the header as the first bus line instead of a sidecar file', () => {
    const { id, header } = createSession('claude', ['--effort', 'high']);

    expect(header.ev).toBe(CUBICLE_HEADER_EV);
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
    // auto- bus with no cubicle.session header line.
    const dir = join(process.env.CUBICLE_HOME!, 'sessions', 'auto-xyz');
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

  it('reports no sessions in a fresh home', () => {
    rmSync(home, { recursive: true, force: true });
    expect(listSessions()).toEqual([]);
    expect(latestSessionId()).toBeNull();
  });
});

describe('resolveSessionId', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'cubicle-resolve-'));
    process.env.CUBICLE_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.CUBICLE_HOME;
  });

  it('accepts a cubicle session id', () => {
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
