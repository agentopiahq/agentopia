import {
  Director,
  OFFICE_IDLE_LIFE,
  OfficeFrame,
  SequencedEvent,
  systemClock,
} from '@agentopia/core';

import { fetchContext, pollContext } from './context';
import { mountCredits } from './credits/credits';
import { loadDismissed, rememberDismissed } from './dismissed';
import { connectFeed } from './feed';
import { localStore } from './interact';
import { CartoonRenderer } from './renderer';
import { ReplayController } from './replay';
import { mountScrubber } from './scrubber';
import { mountSettings } from './settings';
import { mountExport } from './snapshot';
import { pageTitle } from './title';
import { pollUsage } from './usage';

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
  mountCredits(stage, { clock: systemClock });
  // Above the camera's mice: a key that saves a picture of the whole view.
  mountExport(stage, renderer, { clock: systemClock });
  // Above that, at the top: the settings key, with the daylight bar.
  mountSettings(renderer);
  // The usage board on the wall: told it is adding up until the first report lands.
  renderer.setUsage('reading');
  pollUsage(
    (report) => renderer.setUsage(report),
    () => renderer.setUsage('none')
  );

  // Each desk's context: its monitor piles up as it fills, and a tap on the
  // monitor or the desk's name opens the breakdown.
  renderer.contextSource = fetchContext;
  pollContext((glances) => renderer.setContext(glances));

  const params = new URLSearchParams(window.location.search);
  const session = params.get('session');
  const replay = session !== null && params.has('replay');
  // The floor is live only; one session's view has the play bar. A desk's
  // context breakdown has "watch replay" to go there, and "every session"
  // comes back.
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
    // The office is never empty: four avatars are always about, and the
    // residents among them keep busy until a session needs a lead.
    director = new Director({ clock: systemClock, rng: Math.random, idleLife: OFFICE_IDLE_LIFE });
    document.title = pageTitle(null);
    // A desk cleared by hand stays clear across reloads until its session
    // does something new; the director holds these before catch-up arrives.
    const storage = localStore();
    for (const [bus, through] of loadDismissed(storage)) {
      director.dismiss(bus, through);
    }
    renderer.onDismissSession = (bus): void => {
      rememberDismissed(storage, bus, director.dismiss(bus));
    };
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
      () => new Director({ clock: systemClock, rng: Math.random, idleLife: OFFICE_IDLE_LIFE }),
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
