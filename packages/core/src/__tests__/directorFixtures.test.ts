import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeClaudeCode } from '../adapters/claudeCode';
import { manualClock, seededRng } from '../clock';
import { Director } from '../director';
import { LEAD_WORKER } from '../events';
import { BusReader } from '../reader';
import { STATIONS } from '../stations';

const FIXTURES = join(__dirname, '..', '..', 'fixtures');

function loadEvents(name: string) {
  const lines = readFileSync(join(FIXTURES, name), 'utf8').trim().split('\n');
  return new BusReader(normalizeClaudeCode).pushAll(lines);
}

/**
 * Replay a fixture as it would arrive live: events land when the (manual)
 * clock passes their timestamp, frames tick at 50ms like a slow rAF.
 */
function replay(name: string, onFrame?: (frame: ReturnType<Director['frame']>) => void) {
  const events = loadEvents(name);
  const start = events[0].event.ts;
  const end = events[events.length - 1].event.ts;
  const clock = manualClock(start);
  const director = new Director({ clock, rng: seededRng(42) });

  let next = 0;
  for (let t = start; t <= end + 12000; t += 50) {
    clock.set(t);
    while (next < events.length && events[next].event.ts <= t) {
      director.ingest(events[next++]);
    }
    const frame = director.frame();
    onFrame?.(frame);
  }
  return director.frame();
}

describe('fixtures through the director', () => {
  it('02-subagent: the Explore worker types at its own desk and leaves', () => {
    const stationsSeen = new Set<string>();
    let explorePresent = false;

    replay('02-subagent.jsonl', (frame) => {
      const explore = frame.actors.find((a) => a.id === 'a910ed00a5b8e705c');
      if (explore) {
        explorePresent = true;
        if (explore.station) {
          stationsSeen.add(explore.station);
        }
      }
    });

    expect(explorePresent).toBe(true);
    expect(stationsSeen).toContain('own_desk');
  });

  it('02-subagent: ends with only the lead on the floor', () => {
    const last = replay('02-subagent.jsonl');
    expect(last.actors.map((a) => a.id)).toEqual([LEAD_WORKER]);
  });

  it('03-parallel-reads: one trip to the archive covers the whole batch', () => {
    let walksToArchive = 0;
    let previous: string | undefined;

    replay('03-parallel-reads.jsonl', (frame) => {
      const lead = frame.actors.find((a) => a.id === LEAD_WORKER);
      const at =
        lead &&
        Math.hypot(lead.pos.x - STATIONS.archive.spot.x, lead.pos.y - STATIONS.archive.spot.y) < 0.1
          ? 'archive'
          : 'away';
      if (at === 'archive' && previous === 'away') {
        walksToArchive++;
      }
      previous = at;
    });

    expect(walksToArchive).toBe(1);
  });

  it('05-approval-and-failure: the worker stands at your desk, then slumps later', () => {
    const states: string[] = [];
    let stoodAtHumanDesk = false;

    replay('05-approval-and-failure.jsonl', (frame) => {
      const lead = frame.actors.find((a) => a.id === LEAD_WORKER);
      if (lead) {
        states.push(lead.state);
        if (lead.station === 'human_desk' && lead.state === 'working') {
          stoodAtHumanDesk = true;
        }
      }
    });

    expect(stoodAtHumanDesk).toBe(true);
    expect(states).toContain('slump');
  });

  it('golden frames: 02-subagent sampled once a second is stable', () => {
    const samples: unknown[] = [];
    let lastSecond = -1;

    replay('02-subagent.jsonl', (frame) => {
      const second = Math.floor(frame.at / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        samples.push({
          t: second,
          phase: frame.phase,
          actors: frame.actors.map((a) => ({
            id: a.id,
            state: a.state,
            station: a.station ?? null,
            x: Math.round(a.pos.x * 10) / 10,
            y: Math.round(a.pos.y * 10) / 10,
          })),
        });
      }
    });

    expect(samples).toMatchSnapshot();
  });
});
