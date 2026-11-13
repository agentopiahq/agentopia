import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeClaudeCode } from '../adapters/claudeCode';
import { manualClock, seededRng } from '../clock';
import { Director } from '../director';
import { LEAD_WORKER } from '../events';
import { BusReader } from '../reader';
import { CLEARANCE } from '../route';
import { OBSTACLES, STATIONS } from '../stations';

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
  it.each(['01-simple-session.jsonl', '02-subagent.jsonl', '05-approval-and-failure.jsonl'])(
    '%s: nobody ever walks through a desk, a chair or a room',
    (name) => {
      const pad = CLEARANCE * 0.5;
      replay(name, (frame) => {
        for (const actor of frame.actors) {
          const { x, y } = actor.pos;
          const hit = OBSTACLES.find(
            (r) => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad
          );
          expect(hit).toBeUndefined();
        }
      });
    }
  );

  it('02-subagent: the Explore helper works beside the lead and leaves', () => {
    const stationsSeen = new Set<string>();
    let explorePresent = false;

    replay('02-subagent.jsonl', (frame) => {
      const explore = frame.actors.find((a) => a.worker === 'a910ed00a5b8e705c');
      if (explore) {
        explorePresent = true;
        expect(explore.role).toBe('helper');
        if (explore.station) {
          stationsSeen.add(explore.station);
        }
      }
    });

    expect(explorePresent).toBe(true);
    expect(stationsSeen).toContain('own_desk');
  });

  it('02-subagent: the helper leaves first, and the session end empties the desk', () => {
    let leadAloneAfterHelper = false;
    let sawHelper = false;
    const last = replay('02-subagent.jsonl', (frame) => {
      const workers = frame.actors.map((a) => a.worker);
      if (workers.includes('a910ed00a5b8e705c')) {
        sawHelper = true;
      } else if (sawHelper && workers.length === 1 && workers[0] === LEAD_WORKER) {
        leadAloneAfterHelper = true;
      }
    });

    expect(leadAloneAfterHelper).toBe(true);
    expect(last.actors).toEqual([]);
    expect(last.desks).toEqual([]);
  });

  it('03-parallel-reads: the whole batch is one stretch at the desk', () => {
    let workStretches = 0;
    let previous: string | undefined;

    replay('03-parallel-reads.jsonl', (frame) => {
      const lead = frame.actors.find((a) => a.worker === LEAD_WORKER);
      const state = lead?.state;
      if (state === 'working' && previous !== 'working') {
        workStretches++;
      }
      previous = state;
    });

    expect(workStretches).toBe(1);
  });

  it('05-approval-and-failure: the lead asks at the speaker, then slumps later', () => {
    const states: string[] = [];
    let askedAtSpeaker = false;

    replay('05-approval-and-failure.jsonl', (frame) => {
      const lead = frame.actors.find((a) => a.worker === LEAD_WORKER);
      if (lead) {
        states.push(lead.state);
        if (
          lead.station === 'speaker' &&
          lead.state === 'talking' &&
          Math.hypot(lead.pos.x - STATIONS.speaker.spot.x, lead.pos.y - STATIONS.speaker.spot.y) <
            0.1
        ) {
          askedAtSpeaker = true;
        }
      }
    });

    expect(askedAtSpeaker).toBe(true);
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
          desks: frame.desks.map((d) => ({
            slot: d.slot,
            phase: d.phase,
            subagents: d.subagents,
            screen: d.screen ?? null,
          })),
          actors: frame.actors.map((a) => ({
            worker: a.worker,
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
