import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { followFile, nextDelay } from '../follow';

/** The follower polls, so tests need a beat between writes. */
function tick(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('followFile', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentopia-follow-'));
    path = join(dir, 'bus.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('replays existing lines then follows appends', async () => {
    writeFileSync(path, 'one\ntwo\n');
    const seen: string[] = [];

    const stop = followFile({ path, intervalMs: 20 }, (line) => seen.push(line));
    expect(seen).toEqual(['one', 'two']);

    appendFileSync(path, 'three\n');
    await tick();
    stop();

    expect(seen).toEqual(['one', 'two', 'three']);
  });

  it('marks catch-up lines and live lines so seq can stay absolute', async () => {
    // Late join: the file already has history. Everything is still *read* (a
    // reader that skipped it would derive wrong seqs), but the caller can tell
    // history from new arrivals and reconstruct state without animating it.
    writeFileSync(path, 'old\n');
    const seen: Array<[string, boolean]> = [];

    const stop = followFile({ path, intervalMs: 20 }, (line, live) => seen.push([line, live]));
    appendFileSync(path, 'new\n');
    await tick();
    stop();

    expect(seen).toEqual([
      ['old', false],
      ['new', true],
    ]);
  });

  it('waits for a line to be finished before emitting it', async () => {
    writeFileSync(path, '');
    const seen: string[] = [];

    const stop = followFile({ path, intervalMs: 20 }, (line) => seen.push(line));

    appendFileSync(path, '{"ts":1,"ev":"Ses');
    await tick();
    expect(seen).toEqual([]);

    appendFileSync(path, 'sionStart"}\n');
    await tick();
    stop();

    expect(seen).toEqual(['{"ts":1,"ev":"SessionStart"}']);
  });

  it('keeps seeing appends after backing off to the idle interval', async () => {
    writeFileSync(path, 'a\n');
    const seen: string[] = [];

    const stop = followFile({ path, intervalMs: 10, idleAfterMs: 30, idleIntervalMs: 60 }, (line) =>
      seen.push(line)
    );
    // Long enough that the follower has gone quiet and backed off.
    await tick(120);
    appendFileSync(path, 'b\n');
    await tick(150);
    stop();

    expect(seen).toEqual(['a', 'b']);
  });

  it('starts over rather than emitting garbage when the file is truncated', async () => {
    writeFileSync(path, 'a\nb\n');
    const seen: string[] = [];

    const stop = followFile({ path, intervalMs: 20 }, (line) => seen.push(line));
    writeFileSync(path, 'c\n');
    await tick();
    stop();

    expect(seen).toEqual(['a', 'b', 'c']);
  });
});

describe('nextDelay', () => {
  it.each([
    [0, 120],
    [4999, 120],
    [5000, 3000],
    [60_000, 3000],
  ])('quiet for %dms polls again in %dms', (quietMs, delay) => {
    expect(nextDelay(quietMs, { path: 'bus.jsonl' })).toBe(delay);
  });

  it('honours configured intervals', () => {
    const options = { path: 'x', intervalMs: 5, idleAfterMs: 50, idleIntervalMs: 500 };
    expect(nextDelay(49, options)).toBe(5);
    expect(nextDelay(50, options)).toBe(500);
  });
});
