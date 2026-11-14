import {
  AgentopiaEvent,
  Director,
  OFFICE_IDLE_LIFE,
  choreographyFor,
  manualClock,
  seededRng,
  systemClock,
} from '@agentopia/core';

import { HERO_EPOCH, heroCycle } from './heroScript';
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
/** How far in the hero starts, so the lead reads at a glance; reset shows the whole office. */
const HERO_ZOOM = 2.2;

export function mountHero(host: HTMLElement): () => void {
  // The script runs on its own timeline; the wall clock still shows the visitor's time.
  const renderer = new CartoonRenderer(systemClock);
  const clock = manualClock(HERO_EPOCH - 1500);
  const director = new Director({
    clock,
    rng: seededRng(7),
    choreography: choreographyFor('claude'),
    idleLife: OFFICE_IDLE_LIFE,
  });

  let queue: AgentopiaEvent[] = [];
  let cycle = 0;
  let seq = 0;
  let rafId = 0;
  let last = 0;
  let disposed = false;
  let mounted = false;

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
    // A vertical swipe over the office still scrolls the page; a sideways
    // drag turns the room.
    host.querySelector('canvas')?.style.setProperty('touch-action', 'pan-y');
    renderer.setStatus('demo', 'tidy up the office');
    renderer.followCast(HERO_ZOOM);
    rafId = requestAnimationFrame(loop);
  });

  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    cancelAnimationFrame(rafId);
    if (mounted) {
      renderer.destroy();
      // The renderer's popovers and board editor live beside its canvas.
      host.replaceChildren();
    }
  };
}
