import {
  Director,
  OFFICE_IDLE_LIFE,
  choreographyFor,
  manualClock,
  seededRng,
  systemClock,
} from '@agentopia/core';

import { mountCredits } from './credits/credits';
import { mountFloors } from './floorKeys';
import { HERO_EPOCH, HeroScript } from './heroScript';
import { mockContextGlance, mockContextReport } from './mockContext';
import { mockUsageReport } from './mockUsage';
import { CartoonRenderer, type TitleLink } from './renderer';
import { mountSettings } from './settings';
import { mountExport } from './snapshot';

/**
 * The office as a demo, for embedding in a page that has no agentopia server
 * behind it (the marketing site's hero).
 *
 * The same renderer and director as the real viewer, with every object
 * clickable and the room turnable, fed by the endless mock sessions in
 * `heroScript.ts` instead of the event stream. Time is a manual clock advanced
 * by the frame loop, so a hidden tab simply pauses the scene. The sessions and
 * the idle life share one seeded rng, seeded from the time of the visit, so
 * each visit plays a different office (and a seed replays one exactly).
 *
 * Returns a function that stops the scene and frees the canvas.
 */
export interface HeroOptions {
  /** Replays one visit's office exactly; left out, each visit plays a different one. */
  seed?: number;
  /**
   * A link lettered under the slogan, for the page to say what the office is
   * and how to get it (the website opens its "get started" card).
   */
  link?: TitleLink;
}

export function mountHero(host: HTMLElement, options: HeroOptions = {}): () => void {
  const seed = options.seed ?? systemClock.now() % 2 ** 31;
  // The script runs on its own timeline; the wall clock still shows the visitor's time.
  // The office is the whole page: paper edge to edge, its title pinned top
  // left, with the page's link under the slogan.
  const renderer = new CartoonRenderer(systemClock, { page: true, link: options.link });
  const clock = manualClock(HERO_EPOCH - 1500);
  const rng = seededRng(seed);
  const script = new HeroScript(rng);
  const director = new Director({
    clock,
    rng,
    choreography: choreographyFor('claude'),
    idleLife: OFFICE_IDLE_LIFE,
  });

  let seq = 0;
  let rafId = 0;
  let last = 0;
  let disposed = false;
  let mounted = false;
  let unmountCredits: (() => void) | null = null;
  let unmountExport: (() => void) | null = null;
  let unmountSettings: (() => void) | null = null;
  let unmountFloors: (() => void) | null = null;

  const feed = (): void => {
    for (const { bus, event } of script.due(clock.now())) {
      director.ingest({ seq, event, bus });
      renderer.noteEvent({ seq, event, bus });
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
    const frame = director.frame();
    // Each mock desk's made-up context, for its monitor's clutter.
    renderer.setContext(
      Object.fromEntries(frame.desks.map((desk) => [desk.bus, mockContextGlance(desk.bus)]))
    );
    renderer.render(frame);
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
    // Nor any transcripts: a desk's monitor opens a made-up breakdown of its context.
    renderer.contextSource = (bus) => Promise.resolve(mockContextReport(bus, systemClock.now()));
    renderer.contextDemo = true;
    // The site's footer lives in the office's corners; its legal pages are on this site.
    unmountCredits = mountCredits(host, { clock: systemClock, site: '' });
    // Above the camera's mice, as in the app: a key that saves a picture of the whole view.
    unmountExport = mountExport(host, renderer, { clock: systemClock });
    // Then the settings key, with the daylight bar.
    unmountSettings = mountSettings(renderer);
    // And at the top, the keys down to the server floor and back up.
    unmountFloors = mountFloors(renderer);
    rafId = requestAnimationFrame(loop);
  });

  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    cancelAnimationFrame(rafId);
    unmountCredits?.();
    unmountExport?.();
    unmountSettings?.();
    unmountFloors?.();
    if (mounted) {
      renderer.destroy();
      // The renderer's popovers and board editor live beside its canvas.
      host.replaceChildren();
    }
  };
}
