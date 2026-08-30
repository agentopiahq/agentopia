/**
 * Dev utility: replay a bus file through the director and print one line per
 * simulated second. Not a renderer — a debugging printout for eyeballing
 * choreography before the viewer exists, and for diagnosing it after.
 *
 *   yarn --cwd packages/core replay fixtures/02-subagent.jsonl
 *   yarn --cwd packages/core replay ~/.cubicle/sessions/<id>/bus.jsonl
 */
import { readFileSync } from 'node:fs';

import { normalizeClaudeCode } from '../src/adapters/claudeCode';
import { manualClock, seededRng } from '../src/clock';
import { Director, OfficeFrame } from '../src/director';
import { BusReader } from '../src/reader';

// Piping into `head` is a normal way to use this; die quietly when it closes.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') {
    process.exit(0);
  }
  throw err;
});

const path = process.argv[2];
if (!path) {
  process.stderr.write('usage: replay <bus.jsonl>\n');
  process.exit(1);
}

const events = new BusReader(normalizeClaudeCode).pushAll(
  readFileSync(path, 'utf8').trim().split('\n')
);
if (events.length === 0) {
  process.stderr.write('no events in that file\n');
  process.exit(1);
}

const start = events[0].event.ts;
const end = events[events.length - 1].event.ts;
const clock = manualClock(start);
const director = new Director({ clock, rng: seededRng(42) });

function line(frame: OfficeFrame): string {
  const t = String(Math.round((frame.at - start) / 1000)).padStart(4);
  const actors = frame.actors
    .filter((a) => a.role === 'worker')
    .map((a) => {
      const where = a.station ?? `(${a.pos.x.toFixed(0)},${a.pos.y.toFixed(0)})`;
      const bubble = a.bubble ? `  "${a.bubble.slice(0, 30)}"` : '';
      return `${a.label}:${a.state}@${where}${bubble}`;
    })
    .join('   ');
  const lag = frame.lagMs > 500 ? `  lag=${(frame.lagMs / 1000).toFixed(1)}s` : '';
  return `${t}s  [${frame.phase}]${lag}  ${actors}`;
}

let next = 0;
let lastPrinted = '';
for (let t = start; t <= end + 15000; t += 50) {
  clock.set(t);
  while (next < events.length && events[next].event.ts <= t) {
    director.ingest(events[next++]);
  }
  const frame = director.frame();
  if (t % 1000 < 50) {
    const printed = line(frame);
    // Skip runs of identical seconds so long waits collapse.
    if (printed.slice(6) !== lastPrinted.slice(6)) {
      process.stdout.write(`${printed}\n`);
      lastPrinted = printed;
    }
  }
}
