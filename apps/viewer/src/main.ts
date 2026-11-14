import { Director, OfficeFrame, SequencedEvent, systemClock } from '@agentopia/core';

import { connectFeed } from './feed';
import { CartoonRenderer } from './renderer';
import { ReplayController } from './replay';
import { mountScrubber } from './scrubber';
import { pageTitle } from './title';

/** How many avatars the floor keeps about, sessions or not. */
const OFFICE_HEADCOUNT = 4;

/**
 * The viewer shell: SSE in, frames out, ~60fps.
 *
 * Two modes. With no `?session`, this is the floor: every live session at
 * once, live only — catch-up reconstructs the current scene without
 * animating, live events animate, and there is no scrubber because there is
 * no single recording to scrub. With `?session=<id>`, it is one session with
 * the scrubber; `?replay` re-animates that recording from the start.
 */
async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) {
    throw new Error('viewer shell markup missing');
  }

  const renderer = new CartoonRenderer();
  await renderer.mount(stage);

  const params = new URLSearchParams(window.location.search);
  const session = params.get('session');
  const replay = session !== null && params.has('replay');
  // The floor is live only; one session's view has the play bar. Tapping a
  // desk's name goes there, and "every session" comes back.
  if (session === null) {
    renderer.onOpenSession = (bus): void => {
      window.location.search = `?session=${encodeURIComponent(bus)}`;
    };
  } else {
    renderer.onOpenFloor = (): void => {
      window.location.search = '';
    };
  }

  let lastStatus = 'connecting…';
  let label = '';
  // Status and the session's name are lettered on the sheet itself.
  const setStatus = (text: string): void => {
    lastStatus = text;
    renderer.setStatus(text, label || session || '');
  };
  setStatus(lastStatus);
  const setLabel = (text: string): void => {
    if (text !== label) {
      label = text;
      setStatus(lastStatus);
    }
  };

  // Seeks swap in a fresh director, so the render loop reads a slot.
  let director!: Director;
  let beforeRender: (() => void) | null = null;
  let onFrame: ((frame: OfficeFrame) => void) | null = null;

  if (session === null) {
    // The floor is never empty: four avatars are always about, and the
    // residents among them keep busy until a session needs a lead.
    director = new Director({
      clock: systemClock,
      rng: Math.random,
      idleLife: { residents: OFFICE_HEADCOUNT },
    });
    document.title = pageTitle(null);
    connectFeed(null, {
      onCatchup: (event) => director.reconstruct(event),
      onLive: (event) => director.ingest(event),
      onStatus: setStatus,
    });
    onFrame = (frame): void => {
      // The sheet's readout counts the desks; this line only says who waits
      // for one, since six are all the office has.
      setLabel(frame.waiting > 0 ? `${frame.waiting} waiting for a desk` : '');
    };
  } else {
    // The harness's own name for the session rides the bus itself: the
    // emitter samples it onto turn-level records, so it arrives with
    // catch-up, updates live when the harness renames the session, and
    // travels with a copied recording. The latest sample wins.
    let sessionName: string | null = null;
    const noteSessionName = (sequenced: SequencedEvent): void => {
      const name = sequenced.event.meta?.sessionName;
      if (typeof name === 'string' && name && name !== sessionName) {
        sessionName = name;
        setLabel(name);
        document.title = pageTitle(sessionName);
      }
    };

    const live = !replay;
    const controller = new ReplayController(
      1,
      () => new Director({ clock: systemClock, rng: Math.random }),
      (next) => {
        director = next;
      },
      live
    );
    const scrubber = mountScrubber({
      onScrubStart: () => controller.beginScrub(),
      onScrub: (fraction) => controller.scrubTo(fraction),
      onScrubEnd: (fraction) => {
        controller.scrubTo(fraction);
        controller.endScrub();
      },
      onTogglePlay: () => controller.setPaused(!controller.isPaused()),
      onStepBack: () => controller.step(-1, Date.now()),
      onStepForward: () => controller.step(1, Date.now()),
      onSpeedChange: (speed) => controller.setSpeed(speed),
      onGoLive: () => controller.goLive(),
    });

    if (live) {
      // A live session starts on the live edge: catch-up reconstructs the
      // current scene instantly, live events animate, and the scrubber is
      // there from the first moment for stepping back in time.
      controller.start();
      scrubber.show(true);
      connectFeed(session, {
        onCatchup: (event) => {
          noteSessionName(event);
          controller.add(event);
        },
        onLive: (event) => {
          noteSessionName(event);
          controller.add(event, true);
        },
        onStatus: setStatus,
      });
    } else {
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let started = false;
      const startReplay = (): void => {
        started = true;
        controller.start();
        scrubber.show();
        setStatus('replay');
      };

      connectFeed(session, {
        onCatchup: (event) => {
          noteSessionName(event);
          controller.add(event);
          if (started) {
            return;
          }
          // The stream has no end-of-catchup marker; a quiet beat means the
          // recording has fully arrived.
          if (flushTimer) {
            clearTimeout(flushTimer);
          }
          flushTimer = setTimeout(startReplay, 300);
        },
        // A session still being written keeps extending the same timeline.
        onLive: (event) => {
          noteSessionName(event);
          controller.add(event);
        },
        onStatus: () => {
          if (!started) {
            setStatus('replay · loading…');
          }
        },
      });
    }

    beforeRender = (): void => {
      controller.tick(Date.now());
      const { cursor, duration } = controller.progress();
      scrubber.update({
        cursor,
        duration,
        entries: controller.events(),
        paused: controller.isPaused(),
        atLive: controller.atLiveEdge(),
        speed: controller.speed(),
      });
    };
  }

  // rAF while visible; a coarse interval while hidden. Chrome suspends rAF in
  // hidden tabs, and an office you glance at must be current the moment you
  // tab back (it also keeps screen-capture tooling honest).
  let rafId = 0;
  let fallback: ReturnType<typeof setInterval> | null = null;

  const tick = (): void => {
    beforeRender?.();
    const frame = director.frame();
    onFrame?.(frame);
    renderer.render(frame);
  };
  const loop = (): void => {
    tick();
    rafId = requestAnimationFrame(loop);
  };
  const applyVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      fallback ??= setInterval(tick, 250);
    } else {
      if (fallback) {
        clearInterval(fallback);
        fallback = null;
      }
      rafId = requestAnimationFrame(loop);
    }
  };
  document.addEventListener('visibilitychange', applyVisibility);
  applyVisibility();
}

void boot();
