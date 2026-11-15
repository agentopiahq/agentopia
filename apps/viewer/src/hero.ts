import {
  AgentopiaEvent,
  Director,
  choreographyFor,
  manualClock,
  seededRng,
  systemClock,
} from '@agentopia/core';

import { mountCredits } from './credits/credits';
import { HERO_EPOCH, HERO_IDLE_LIFE, heroCycle } from './heroScript';
import { mockUsageReport } from './mockUsage';
import { CartoonRenderer } from './renderer';

/**
 * The office as a demo, for embedding in a page that has no agentopia server
 * behind it (the marketing site's hero).
 *
 * The same renderer and director as the real viewer, with every object
 * clickable and the room turnable, fed by the endless mock session in
 * `heroScript.ts` instead of the event stream. Time is a manual clock advanced
 * by the frame loop, so a hidden tab simply pauses the scene, and the idle
 * life comes from a seeded rng, so every visit plays the same office.
 *
 * Returns a function that stops the scene and frees the canvas.
 */
export function mountHero(host: HTMLElement): () => void {
  // The script runs on its own timeline; the wall clock still shows the visitor's time.
  // The office is the whole page: paper edge to edge, its title pinned top
  // left with a stamp beside it until the app ships.
  const renderer = new CartoonRenderer(systemClock, { page: true, badge: 'coming soon' });
  const clock = manualClock(HERO_EPOCH - 1500);
  const director = new Director({
    clock,
    rng: seededRng(7),
    choreography: choreographyFor('claude'),
    idleLife: HERO_IDLE_LIFE,
  });

  let queue: AgentopiaEvent[] = [];
  let cycle = 0;
  let seq = 0;
  let rafId = 0;
  let last = 0;
  let disposed = false;
  let mounted = false;
  let unmountCredits: (() => void) | null = null;

  const feed = (): void => {
    // Keep a cycle in hand, so the next turn is always queued before it is due.
    while (queue.length < 4) {
      queue = queue.concat(heroCycle(cycle));
      cycle += 1;
    }
    while (queue[0].ts <= clock.now()) {
      director.ingest({ seq, event: queue.shift()!, bus: 'hero' });
      seq += 1;
    }
  };

  const loop = (now: number): void => {
    if (disposed) {
      return;
    }
    // A long gap (a hidden tab, a stalled main thread) is a pause, not a jump.
    const dt = last === 0 ? 0 : Math.min(100, now - last);
    last = now;
    clock.advance(dt);
    feed();
    renderer.render(director.frame());
    rafId = requestAnimationFrame(loop);
  };

  void renderer.mount(host).then(() => {
    if (disposed) {
      renderer.destroy();
      host.replaceChildren();
      return;
    }
    mounted = true;
    // The office is the whole page, so a finger's drag pans it rather than scrolling.
    host.querySelector('canvas')?.style.setProperty('touch-action', 'none');
    // No server to read usage from: the board and its ledger show a made-up few months, ending today.
    renderer.setUsage(mockUsageReport(systemClock.now()), { demo: true });
    // The site's footer lives in the office's corners; its legal pages are on this site.
    unmountCredits = mountCredits(host, { clock: systemClock, site: '' });
    rafId = requestAnimationFrame(loop);
  });

  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    cancelAnimationFrame(rafId);
    unmountCredits?.();
    if (mounted) {
      renderer.destroy();
      // The renderer's popovers and board editor live beside its canvas.
      host.replaceChildren();
    }
  };
}
