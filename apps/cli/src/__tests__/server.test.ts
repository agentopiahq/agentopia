import { appendFileSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { busPath } from '../paths';
import { RunningServer, startOfficeServer } from '../server';
import { createSession } from '../session';

interface Envelope {
  seq: number;
  bus: string;
  harness?: string;
  live: boolean;
  event: { kind: string };
}

function record(id: string, sid: string, ev = 'SessionStart'): void {
  appendFileSync(busPath(id), `${JSON.stringify({ ts: Date.now(), ev, sid })}\n`);
}

function age(id: string, agoMs: number): void {
  const when = (Date.now() - agoMs) / 1000;
  utimesSync(busPath(id), when, when);
}

/**
 * Open an SSE stream and collect events until `done` says so (or time runs
 * out). `onOpen` runs once the response headers are in — the moment to make
 * something appear on disk.
 */
function collect(
  url: string,
  done: (events: Envelope[]) => boolean,
  onOpen?: () => void,
  timeoutMs = 4000
): Promise<Envelope[]> {
  return new Promise((resolve, reject) => {
    const events: Envelope[] = [];
    let buffered = '';
    const req = get(url, (res) => {
      onOpen?.();
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffered += chunk;
        const frames = buffered.split('\n\n');
        buffered = frames.pop() ?? '';
        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (line.startsWith('data: ')) {
              events.push(JSON.parse(line.slice(6)) as Envelope);
            }
          }
        }
        if (done(events)) {
          clearTimeout(timer);
          req.destroy();
          resolve(events);
        }
      });
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`timed out with ${events.length} events`));
    }, timeoutMs);
    req.on('error', (err: Error & { code?: string }) => {
      // Destroying the request on completion surfaces as a socket error.
      if (err.code !== 'ECONNRESET' && !req.destroyed) {
        reject(err);
      }
    });
  });
}

function json(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

describe('office server', () => {
  let home: string;
  let running: RunningServer | null = null;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentopia-server-'));
    process.env.AGENTOPIA_HOME = home;
    writeFileSync(join(home, 'index.html'), '<!doctype html>');
  });

  afterEach(() => {
    running?.close();
    running = null;
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENTOPIA_HOME;
  });

  it('multiplexes every live bus on the floor stream, freshest first, tagged by bus', async () => {
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

    running = await startOfficeServer({ viewerDist: home, port: 0 });
    const events = await collect(`${running.url}/events`, (seen) => seen.length >= 2);

    expect(events.map((e) => e.bus)).toEqual([fresh, old]);
    expect(events[0]).toMatchObject({ seq: 1, live: false, event: { kind: 'session.start' } });
  });

  it('picks up a bus that appears after the stream opened, and marks its lines live', async () => {
    const first = createSession('claude', []).id;
    record(first, 'sid-first');

    running = await startOfficeServer({ viewerDist: home, port: 0, discoveryIntervalMs: 30 });
    let second = '';
    const events = await collect(
      `${running.url}/events`,
      (seen) => seen.some((e) => e.bus === second),
      () => {
        second = createSession('claude', []).id;
        record(second, 'sid-second');
      }
    );

    expect(events.map((e) => e.bus)).toEqual([first, second]);
    // Catch-up for a bus that was already there; the newcomer's history is
    // catch-up too — it existed before its follower's first drain.
    expect(events.map((e) => e.live)).toEqual([false, false]);
  });

  it('streams one session on request, tagged the same way', async () => {
    const a = createSession('claude', []).id;
    record(a, 'sid-a');
    const b = createSession('claude', []).id;
    record(b, 'sid-b');

    running = await startOfficeServer({ viewerDist: home, port: 0 });
    const events = await collect(`${running.url}/events?session=${a}`, (seen) => seen.length >= 1);

    expect(events).toHaveLength(1);
    expect(events[0].bus).toBe(a);
    expect(events[0].harness).toBe('claude');
  });

  it('leaves a bus from an unknown harness off the floor', async () => {
    const strange = createSession('nobody', []).id;
    record(strange, 'sid-strange');
    const known = createSession('claude', []).id;
    record(known, 'sid-known');
    age(known, 60_000);

    running = await startOfficeServer({ viewerDist: home, port: 0 });
    const events = await collect(`${running.url}/events`, (seen) => seen.length >= 1);

    expect(events.map((e) => e.bus)).toEqual([known]);
  });

  it('reports liveness for each session', async () => {
    const live = createSession('claude', []).id;
    record(live, 'sid-live');
    const ended = createSession('claude', []).id;
    record(ended, 'sid-ended', 'SessionEnd');

    running = await startOfficeServer({ viewerDist: home, port: 0 });
    const body = (await json(`${running.url}/api/sessions`)) as {
      sessions: Array<{ id: string; live: boolean; ended: boolean; updatedAt: number }>;
    };

    const byId = new Map(body.sessions.map((s) => [s.id, s]));
    expect(byId.get(live)).toMatchObject({ live: true, ended: false });
    expect(byId.get(ended)).toMatchObject({ live: false, ended: true });
    expect(byId.get(live)?.updatedAt).toBeGreaterThan(0);
  });
});
