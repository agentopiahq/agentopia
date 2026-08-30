import { Director, systemClock } from '@cubicle/core';

import { connectFeed } from './feed';
import { CartoonRenderer } from './renderer';

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

  const director = new Director({ clock: systemClock, rng: Math.random });

  const session = new URLSearchParams(window.location.search).get('session');
  connectFeed(session, {
    onCatchup: (event) => director.reconstruct(event),
    onLive: (event) => director.ingest(event),
    onStatus: (text) => {
      status.textContent = session ? `${text} · ${session}` : text;
    },
  });

  // rAF while visible; a coarse interval while hidden. Chrome suspends rAF in
  // hidden tabs, and an office you glance at must be current the moment you
  // tab back (it also keeps screen-capture tooling honest).
  let rafId = 0;
  let fallback: ReturnType<typeof setInterval> | null = null;

  const tick = (): void => {
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
