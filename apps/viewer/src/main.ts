import { Director, systemClock } from '@agentopia/core';

import { connectFeed } from './feed';
import { CartoonRenderer } from './renderer';
import { ReplayController } from './replay';
import { mountScrubber } from './scrubber';

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

  // Replay seeks swap in a fresh director, so the render loop reads a slot.
  let director = new Director({ clock: systemClock, rng: Math.random });
  let beforeRender: (() => void) | null = null;

  const params = new URLSearchParams(window.location.search);
  const session = params.get('session');
  // ?replay=N re-animates a finished recording at N x speed instead of
  // jumping to its final scene. Long thinking gaps are capped so any session
  // stays watchable.
  const replaySpeed = params.get('replay')
    ? Math.max(0.25, Number(params.get('replay')) || 1)
    : null;

  const setStatus = (text: string): void => {
    status.textContent = session ? `${text} · ${session}` : text;
  };

  if (replaySpeed === null) {
    connectFeed(session, {
      onCatchup: (event) => director.reconstruct(event),
      onLive: (event) => director.ingest(event),
      onStatus: setStatus,
    });
  } else {
    const controller = new ReplayController(
      replaySpeed,
      () => new Director({ clock: systemClock, rng: Math.random }),
      (next) => {
        director = next;
      }
    );
    const scrubber = mountScrubber({
      onScrubStart: () => controller.beginScrub(),
      onScrub: (fraction) => controller.scrubTo(fraction),
      onScrubEnd: (fraction) => {
        controller.scrubTo(fraction);
        controller.endScrub();
      },
    });

    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let started = false;
    const startReplay = (): void => {
      started = true;
      controller.start();
      scrubber.show();
      setStatus(`replay ×${replaySpeed}`);
    };

    connectFeed(session, {
      onCatchup: (event) => {
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
      onLive: (event) => controller.add(event),
      onStatus: () => {
        if (!started) {
          setStatus(`replay ×${replaySpeed} · loading…`);
        }
      },
    });

    beforeRender = (): void => {
      controller.tick(Date.now());
      const { cursor, duration } = controller.progress();
      scrubber.update(cursor, duration);
    };
  }

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
