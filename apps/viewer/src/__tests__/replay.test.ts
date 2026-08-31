import { Director, SequencedEvent, manualClock, seededRng } from '@agentopia/core';

import { ReplayController } from '../replay';

function ev(seq: number, ts: number): SequencedEvent {
  return { seq, event: { ts, kind: 'tool.start', session: 's', worker: 'lead' } };
}

/**
 * A controller over real directors whose ingest/reconstruct calls are logged.
 * `applied()` reads the log of the *current* director — a seek swaps in a
 * fresh one, so the log restarting is itself part of the behavior under test.
 */
function makeHarness(live: boolean, speed = 1) {
  let applied: string[] = [];
  const controller = new ReplayController(
    speed,
    () => {
      applied = [];
      const director = new Director({ clock: manualClock(0), rng: seededRng(1) });
      const ingest = director.ingest.bind(director);
      const reconstruct = director.reconstruct.bind(director);
      director.ingest = (sequenced: SequencedEvent): void => {
        applied.push(`ingest:${sequenced.seq}`);
        ingest(sequenced);
      };
      director.reconstruct = (sequenced: SequencedEvent): void => {
        applied.push(`reconstruct:${sequenced.seq}`);
        reconstruct(sequenced);
      };
      return director;
    },
    () => {},
    live
  );
  return { controller, applied: (): string[] => applied };
}

describe('ReplayController live mode', () => {
  it('starts on the live edge: catch-up reconstructs, live events animate', () => {
    const { controller, applied } = makeHarness(true);
    controller.start();

    controller.add(ev(1, 1000));
    controller.add(ev(2, 2000));
    controller.add(ev(3, 3000), true);

    expect(applied()).toEqual(['reconstruct:1', 'reconstruct:2', 'ingest:3']);
    expect(controller.atLiveEdge()).toBe(true);
    const { cursor, duration } = controller.progress();
    expect(cursor).toBe(duration);
  });

  it('deduplicates a reconnect that replays already-applied events', () => {
    const { controller, applied } = makeHarness(true);
    controller.start();

    controller.add(ev(1, 1000), true);
    controller.add(ev(1, 1000));

    expect(applied()).toEqual(['ingest:1']);
    expect(controller.events()).toHaveLength(1);
  });

  it('scrubbing back leaves the edge; arrivals extend the timeline unapplied', () => {
    const { controller, applied } = makeHarness(true);
    controller.start();
    controller.add(ev(1, 1000));
    controller.add(ev(2, 2000), true);

    controller.beginScrub();
    controller.scrubTo(0);
    controller.endScrub();

    expect(controller.atLiveEdge()).toBe(false);
    expect(applied()).toEqual(['reconstruct:1']);

    controller.add(ev(3, 3000), true);
    expect(applied()).toEqual(['reconstruct:1']);
    expect(controller.progress()).toEqual({ cursor: 0, duration: 2000 });
  });

  it('playing forward from behind catches up and rejoins the live edge', () => {
    const { controller, applied } = makeHarness(true);
    controller.start();
    controller.add(ev(1, 1000));
    controller.add(ev(2, 2000), true);
    controller.scrubTo(0);
    controller.add(ev(3, 3000), true);

    controller.tick(0);
    controller.tick(2500);

    expect(applied()).toEqual(['reconstruct:1', 'ingest:2', 'ingest:3']);
    expect(controller.atLiveEdge()).toBe(true);

    controller.add(ev(4, 4000), true);
    expect(applied()).toContain('ingest:4');
  });

  it('scrubbing to the very end rejoins the edge on the next tick', () => {
    const { controller } = makeHarness(true);
    controller.start();
    controller.add(ev(1, 1000));
    controller.add(ev(2, 2000), true);

    controller.scrubTo(0.5);
    expect(controller.atLiveEdge()).toBe(false);

    controller.scrubTo(1);
    controller.tick(0);
    expect(controller.atLiveEdge()).toBe(true);
  });

  it('pause freezes the scene while the timeline grows; play catches back up', () => {
    const { controller, applied } = makeHarness(true);
    controller.start();
    controller.add(ev(1, 1000), true);

    controller.setPaused(true);
    expect(controller.atLiveEdge()).toBe(false);

    controller.add(ev(2, 2000), true);
    expect(applied()).toEqual(['ingest:1']);

    controller.setPaused(false);
    controller.tick(0);
    controller.tick(1000);

    expect(applied()).toEqual(['ingest:1', 'ingest:2']);
    expect(controller.atLiveEdge()).toBe(true);
  });

  it('play at the end of a live timeline resumes rather than restarting', () => {
    const { controller, applied } = makeHarness(true);
    controller.start();
    controller.add(ev(1, 1000), true);
    controller.add(ev(2, 2000), true);

    controller.setPaused(true);
    controller.setPaused(false);
    controller.tick(0);

    expect(controller.atLiveEdge()).toBe(true);
    expect(applied()).toEqual(['ingest:1', 'ingest:2']);
  });

  it('goLive jumps to the latest scene instantly and resumes applying arrivals', () => {
    const { controller, applied } = makeHarness(true);
    controller.start();
    controller.add(ev(1, 1000));
    controller.add(ev(2, 2000), true);
    controller.scrubTo(0);
    controller.setPaused(true);
    controller.add(ev(3, 3000), true);

    controller.goLive();

    expect(controller.atLiveEdge()).toBe(true);
    expect(controller.isPaused()).toBe(false);
    expect(applied()).toEqual(['reconstruct:1', 'reconstruct:2', 'reconstruct:3']);
    const { cursor, duration } = controller.progress();
    expect(cursor).toBe(duration);

    controller.add(ev(4, 4000), true);
    expect(applied()).toContain('ingest:4');
  });

  it('stepping back leaves the edge; stepping forward at the edge is a no-op', () => {
    const { controller, applied } = makeHarness(true);
    controller.start();
    controller.add(ev(1, 1000), true);
    controller.add(ev(2, 2000), true);

    controller.step(1, 0);
    expect(controller.atLiveEdge()).toBe(true);

    controller.step(-1, 100);
    expect(controller.atLiveEdge()).toBe(false);
    expect(applied()).toEqual(['reconstruct:1']);
  });
});

describe('ReplayController replay mode', () => {
  it('never follows a live edge, even when the cursor reaches the end', () => {
    const { controller } = makeHarness(false, 1);
    controller.add(ev(1, 1000));
    controller.add(ev(2, 2000));
    controller.start();

    controller.tick(0);
    controller.tick(5000);

    expect(controller.atLiveEdge()).toBe(false);
    expect(controller.progress().cursor).toBe(controller.progress().duration);
  });

  it('pressing play on a finished replay restarts from the beginning', () => {
    const { controller, applied } = makeHarness(false, 1);
    controller.add(ev(1, 1000));
    controller.add(ev(2, 2000));
    controller.start();
    controller.tick(0);
    controller.tick(5000);

    controller.setPaused(true);
    controller.setPaused(false);

    expect(controller.progress().cursor).toBe(0);
    expect(applied()).toEqual([]);
  });

  it('ignores goLive', () => {
    const { controller } = makeHarness(false, 1);
    controller.add(ev(1, 1000));
    controller.add(ev(2, 2000));
    controller.start();

    controller.goLive();

    expect(controller.atLiveEdge()).toBe(false);
    expect(controller.progress().cursor).toBe(0);
  });
});

describe('ReplayController speed', () => {
  it('applies a speed change from the next tick delta on', () => {
    const { controller } = makeHarness(false, 1);
    controller.add(ev(1, 1000));
    controller.add(ev(2, 2000));
    controller.add(ev(3, 3000));
    controller.start();

    controller.tick(0);
    controller.tick(500);
    expect(controller.progress().cursor).toBe(500);

    controller.setSpeed(2);
    controller.tick(1000);
    expect(controller.progress().cursor).toBe(1500);
    expect(controller.speed()).toBe(2);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['infinite', Infinity],
  ])('ignores a %s speed', (_label, value) => {
    const { controller } = makeHarness(false, 1.5);
    controller.setSpeed(value);
    expect(controller.speed()).toBe(1.5);
  });
});
