import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { followFile } from '../follow';

/** The follower polls, so tests need a beat between writes. */
function tick(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('followFile', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cubicle-follow-'));
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
