import { normalizeClaudeCode } from '../adapters/claude';
import { AGENTOPIA_HEADER_EV } from '../bus';
import { BusReader } from '../reader';

const HEADER = JSON.stringify({
  ts: 1,
  ev: AGENTOPIA_HEADER_EV,
  harness: 'claude',
  cwd: '/repo',
  argv: [],
  version: '0.1.0',
});

function reader(): BusReader {
  return new BusReader(normalizeClaudeCode);
}

describe('BusReader', () => {
  it('derives seq from line position, counting discarded lines', () => {
    const events = reader().pushAll([
      HEADER, // seq 0, discarded
      '{"ts":2,"ev":"SessionStart","sid":"a"}', // seq 1
      'not json at all', // seq 2, discarded
      '{"ts":3,"ev":"Stop","sid":"a"}', // seq 3
    ]);

    expect(events.map((e) => [e.seq, e.event.kind])).toEqual([
      [1, 'session.start'],
      [3, 'turn.stop'],
    ]);
  });

  it('numbers identically across two reads of the same lines', () => {
    const lines = [HEADER, '{"ts":2,"ev":"SessionStart","sid":"a"}'];

    const first = reader().pushAll(lines);
    const second = reader().pushAll(lines);

    expect(first).toEqual(second);
  });

  it('gives records with identical timestamps distinct seqs', () => {
    // The real failure mode: a parallel batch stamped in the same millisecond.
    const events = reader().pushAll([
      '{"ts":100,"ev":"PreToolUse","sid":"a","tool":"Read","tuid":"t1"}',
      '{"ts":100,"ev":"PreToolUse","sid":"a","tool":"Read","tuid":"t2"}',
    ]);

    expect(events.map((e) => e.seq)).toEqual([0, 1]);
    expect(events.map((e) => e.event.tool?.id)).toEqual(['t1', 't2']);
  });

  it('reports its position so a late joiner can set a watermark', () => {
    const r = reader();
    expect(r.position).toBe(0);

    r.pushAll([HEADER, '{"ts":2,"ev":"SessionStart","sid":"a"}']);
    expect(r.position).toBe(2);
  });
});
