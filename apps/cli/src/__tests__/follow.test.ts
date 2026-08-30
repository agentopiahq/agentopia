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

  it('skips existing content when asked to start from now', async () => {
    writeFileSync(path, 'old\n');
    const seen: string[] = [];

    const stop = followFile({ path, fromStart: false, intervalMs: 20 }, (line) => seen.push(line));
    appendFileSync(path, 'new\n');
    await tick();
    stop();

    expect(seen).toEqual(['new']);
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
