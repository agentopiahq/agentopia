import { Director, SequencedEvent, systemClock } from '@agentopia/core';

import { connectFeed } from './feed';
import { CartoonRenderer } from './renderer';
import { ReplayController } from './replay';
import { mountScrubber } from './scrubber';
import { pageTitle } from './title';

/**
 * The viewer shell: SSE in, frames out, ~60fps.
 *
 * Catch-up events reconstruct office state without animating (a late join
 * lands on the current scene, not a 20-minute replay); live events animate.
 */
async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  const status = document.getElementById('status');
  if (!stage || !status) {
    throw new Error('viewer shell markup missing');
  }

  const renderer = new CartoonRenderer();
  await renderer.mount(stage);

  // Seeks swap in a fresh director, so the render loop reads a slot. The
  // controller's constructor fills it synchronously via onSwap.
  let director!: Director;
  let beforeRender: (() => void) | null = null;

  const params = new URLSearchParams(window.location.search);
  const session = params.get('session');
  // ?replay re-animates a finished recording from the start instead of
  // jumping to its final scene. Long thinking gaps are capped so any session
  // stays watchable; playback speed is the scrubber's speed control.
  const replay = params.has('replay');

  // The harness's own name for the session rides the bus itself: the emitter
  // samples it onto turn-level records, so it arrives with catch-up, updates
  // live when the harness renames the session, and travels with a copied
  // recording. The latest sample wins.
  let sessionName: string | null = null;
  let lastStatus = 'connecting…';
  const setStatus = (text: string): void => {
    lastStatus = text;
    const label = sessionName ?? session;
    status.textContent = label ? `${text} · ${label}` : text;
  };
  const noteSessionName = (sequenced: SequencedEvent): void => {
    const name = sequenced.event.meta?.sessionName;
    if (typeof name === 'string' && name && name !== sessionName) {
      sessionName = name;
      setStatus(lastStatus);
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

  // rAF while visible; a coarse interval while hidden. Chrome suspends rAF in
  // hidden tabs, and an office you glance at must be current the moment you
  // tab back (it also keeps screen-capture tooling honest).
  let rafId = 0;
  let fallback: ReturnType<typeof setInterval> | null = null;

  const tick = (): void => {
    beforeRender?.();
    renderer.render(director.frame());
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
