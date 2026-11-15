import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeClaudeCode } from '../adapters/claude';
import { harnessSessionIds, isSessionHeader, parseRecord, parseRecords } from '../bus';
import { LEAD_WORKER } from '../events';
import { BusReader, SequencedEvent } from '../reader';
import { SessionState, emptySession, inFlight, reduce } from '../state';

const FIXTURES = join(__dirname, '..', '..', 'fixtures');

function load(name: string): string[] {
  return readFileSync(join(FIXTURES, name), 'utf8').trim().split('\n');
}

function replay(name: string): { events: SequencedEvent[]; state: SessionState } {
  const events = new BusReader(normalizeClaudeCode).pushAll(load(name));
  const state = events.reduce((acc, { event }) => reduce(acc, event), emptySession());
  return { events, state };
}

describe('fixtures stay valid', () => {
  const names = readdirSync(FIXTURES).filter((name) => name.endsWith('.jsonl'));

  it('covers every fixture in this directory', () => {
    expect(names).toHaveLength(5);
  });

  it.each(names.map((name) => [name]))('%s parses fully and starts with a header', (name) => {
    const lines = load(name);
    const records = lines.map((line) => parseRecord(line));

    // Every line parses — an example with a broken line teaches the wrong thing.
    expect(records.every((record) => record !== null)).toBe(true);
    expect(records[0] && isSessionHeader(records[0])).toBe(true);
    expect(records.slice(1).some((record) => record && isSessionHeader(record))).toBe(false);
  });
});

describe('01-simple-session', () => {
  it('walks the office through its phases and back to waiting', () => {
    const { events, state } = replay('01-simple-session.jsonl');

    expect(events.map(({ event }) => event.kind)).toEqual([
      'session.start',
      'turn.user',
      'tool.start',
      'tool.end',
      'turn.stop',
      'session.end',
    ]);
    expect(state.phase).toBe('closed');
    expect(state.counters.byKind.read).toBe(1);
  });
});

describe('02-subagent', () => {
  it('keeps the delegation on the lead desk and the work on the subagent desk', () => {
    const { events } = replay('02-subagent.jsonl');

    const agentCall = events.find(({ event }) => event.tool?.name === 'Agent');
    expect(agentCall?.event.worker).toBe(LEAD_WORKER);
    expect(agentCall?.event.meta?.spawns).toBe('Explore');

    const bash = events.find(({ event }) => event.tool?.name === 'Bash');
    expect(bash?.event.worker).toBe('a910ed00a5b8e705c');
    expect(bash?.event.workerType).toBe('Explore');
  });

  it('seats the worker for the middle of the story and releases the desk after', () => {
    const lines = load('02-subagent.jsonl');
    const reader = new BusReader(normalizeClaudeCode);
    let state = emptySession();
    const seated: boolean[] = [];
    for (const line of lines) {
      const sequenced = reader.push(line);
      if (sequenced) {
        state = reduce(state, sequenced.event);
        seated.push('a910ed00a5b8e705c' in state.workers);
      }
    }

    expect(seated).toContain(true);
    expect('a910ed00a5b8e705c' in state.workers).toBe(false);
  });
});

describe('03-parallel-reads', () => {
  it('demonstrates why ts cannot order or identify records', () => {
    const records = parseRecords(load('03-parallel-reads.jsonl').join('\n'));
    const timestamps = records.filter((r) => !isSessionHeader(r)).map((r) => r.ts);

    expect(new Set(timestamps).size).toBeLessThan(timestamps.length);
  });

  it('holds two reads in flight at once, paired by tool id', () => {
    const lines = load('03-parallel-reads.jsonl');
    const reader = new BusReader(normalizeClaudeCode);
    let state = emptySession();
    let peak = 0;
    for (const line of lines) {
      const sequenced = reader.push(line);
      if (sequenced) {
        state = reduce(state, sequenced.event);
        const lead = state.workers[LEAD_WORKER];
        peak = Math.max(peak, lead ? inFlight(lead).length : 0);
      }
    }

    expect(peak).toBe(2);
    expect(inFlight(state.workers[LEAD_WORKER])).toEqual([]);
    expect(state.counters.byKind.read).toBe(3);
  });
});

describe('04-clear-then-new-harness-session', () => {
  it('carries two harness sessions in one bus, in order', () => {
    const records = parseRecords(load('04-clear-then-new-harness-session.jsonl').join('\n'));

    expect(harnessSessionIds(records)).toEqual([
      '11111111-aaaa-bbbb-cccc-dddddddddddd',
      '22222222-eeee-ffff-0000-999999999999',
    ]);
  });

  it('resets the office on clear: counters start over', () => {
    const { state } = replay('04-clear-then-new-harness-session.jsonl');

    // Turn one happened before the clear; only the post-clear turn survives.
    expect(state.counters.turns).toBe(1);
    expect(state.phase).toBe('waiting_on_user');
  });
});

describe('05-approval-and-failure', () => {
  it('surfaces the two beats a transcript never shows', () => {
    const { events, state } = replay('05-approval-and-failure.jsonl');
    const kinds = events.map(({ event }) => event.kind);

    expect(kinds).toContain('approval.request');
    expect(state.counters.approvals).toBe(1);
    expect(state.counters.failures).toBe(1);
    expect(state.workers[LEAD_WORKER].failures).toBe(1);
  });
});
