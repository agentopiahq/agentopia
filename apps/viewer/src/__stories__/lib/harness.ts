import {
  Actor,
  AgentopiaEvent,
  ChoreographyRegistry,
  Director,
  OFFICE_IDLE_LIFE,
  manualClock,
  seededRng,
} from '@agentopia/core';

import { CartoonRenderer } from '../../renderer';

/**
 * The story harness: plays one scenario through the real Director + renderer,
 * windowed to a single animation phase.
 *
 * Everything is deterministic (manual clock, seeded rng), so a phase's
 * boundaries can be found by simulating the scenario headlessly once, and the
 * visible playback loops the exact same frames forever. Phases are observed
 * from the frames rather than declared per story:
 *
 *   pre   — from the showcased event until the main animation starts
 *           (typically the walk to the station)
 *   main  — while the watched actor performs (working / slump, overridable)
 *   post  — from the end of main until the actor settles (linger, walk home)
 *   full  — the whole scenario
 */

export type Phase = 'pre' | 'main' | 'post' | 'full';

export interface TimedEvent {
  /** Offset from scenario start, ms. Events must be in order. */
  at: number;
  event: AgentopiaEvent;
  /** Which session the event belongs to. One-session scenarios leave it out. */
  bus?: string;
}

export interface Scenario {
  events: TimedEvent[];
  /** The worker whose animation the story frames. */
  watch: string;
  /** That worker's session, for scenarios with several. */
  watchBus?: string;
  durationMs: number;
  /** Playback speed multiplier, for scenes with long real-time waits. */
  speed?: number;
  /** Offset of the showcased event; phases are measured from here. */
  phaseStartMs?: number;
  /** Overrides "the watched actor is performing the main animation". */
  isMain?: (actor: Actor | undefined) => boolean;
}

export interface StoryOptions {
  scenario: Scenario;
  registry: ChoreographyRegistry;
  phase: Phase;
}

const STEP_MS = 50;
const HOLD_MS = 700;
const SETTLED = new Set(['idle', 'thinking', 'waiting', 'pacing', 'napping']);

/**
 * Chromatic's capture browser. A looping canvas would hand it a different
 * arbitrary frame every build, so under capture each story freezes on one
 * deterministic frame instead (the midpoint of its phase window). Same check
 * as the official `isChromatic()` helper, inlined to avoid the dependency.
 */
export function isSnapshotCapture(): boolean {
  return typeof navigator !== 'undefined' && /Chromatic/.test(navigator.userAgent);
}

/** Crisp at any zoom and free of per-platform emoji rendering. */
const ICON = {
  pause:
    '<svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true">' +
    '<rect x="0" y="0" width="3" height="11" rx="1" fill="currentColor"/>' +
    '<rect x="6" y="0" width="3" height="11" rx="1" fill="currentColor"/></svg>',
  play:
    '<svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true">' +
    '<path d="M0.5 0.5 L9 5.5 L0.5 10.5 Z" fill="currentColor"/></svg>',
};

export interface PlayToggle {
  el: HTMLButtonElement;
  /** Polled by the caller's frame loop. */
  isPaused: () => boolean;
}

/**
 * A play/pause toggle for a looping story.
 *
 * Starts playing, so it shows a pause icon; clicking it swaps to a play icon.
 * It owns nothing but the flag — callers poll `isPaused` from their own frame
 * loop, which keeps the button ignorant of how any given story animates and
 * lets both the event stories and the character sheet share it.
 */
export function playToggle(): PlayToggle {
  let paused = false;
  const el = document.createElement('button');
  el.type = 'button';
  el.style.cssText =
    'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;' +
    'padding:0;border:1px solid #d9d0bd;border-radius:7px;background:#fffdf7;color:#6b6152;' +
    'cursor:pointer;line-height:0;';
  const paint = (): void => {
    el.innerHTML = paused ? ICON.play : ICON.pause;
    const label = paused ? 'Play' : 'Pause';
    el.setAttribute('aria-label', label);
    el.title = label;
  };
  el.addEventListener('click', () => {
    paused = !paused;
    paint();
  });
  paint();
  return { el, isPaused: () => paused };
}

interface Window {
  t0: number;
  t1: number;
  note?: string;
}

interface Run {
  director: Director;
  clock: ReturnType<typeof manualClock>;
  /** Ingest every event due at scenario-offset `t`. */
  feed(t: number): void;
  start: number;
}

function freshRun(scenario: Scenario, registry: ChoreographyRegistry): Run {
  const start = scenario.events[0]?.event.ts ?? 0;
  const clock = manualClock(start);
  // Every story's office is lived in, like the real one.
  const director = new Director({
    clock,
    rng: seededRng(7),
    choreography: registry,
    idleLife: OFFICE_IDLE_LIFE,
  });
  let next = 0;
  const feed = (t: number): void => {
    while (next < scenario.events.length && scenario.events[next].event.ts <= start + t) {
      const timed = scenario.events[next];
      director.ingest({ seq: next, event: timed.event, bus: timed.bus });
      next += 1;
    }
  };
  return { director, clock, feed, start };
}

/** The watched actor at every STEP_MS tick, from one headless playthrough. */
function sample(scenario: Scenario, registry: ChoreographyRegistry): Array<Actor | undefined> {
  const run = freshRun(scenario, registry);
  const samples: Array<Actor | undefined> = [];
  for (let t = 0; t <= scenario.durationMs; t += STEP_MS) {
    run.clock.set(run.start + t);
    run.feed(t);
    const frame = run.director.frame();
    samples.push(
      frame.actors.find(
        (actor) =>
          actor.worker === scenario.watch &&
          (scenario.watchBus === undefined || actor.bus === scenario.watchBus)
      )
    );
  }
  return samples;
}

function windowsFor(scenario: Scenario, registry: ChoreographyRegistry): Record<Phase, Window> {
  const samples = sample(scenario, registry);
  const isMain =
    scenario.isMain ??
    ((actor: Actor | undefined) =>
      !!actor && (actor.state === 'working' || actor.state === 'slump'));
  const phaseStart = scenario.phaseStartMs ?? 0;
  const full: Window = { t0: 0, t1: scenario.durationMs };

  let m0 = -1;
  for (let i = Math.ceil(phaseStart / STEP_MS); i < samples.length; i++) {
    if (isMain(samples[i])) {
      m0 = i;
      break;
    }
  }
  if (m0 === -1) {
    const note = 'This event stages no animation of its own — showing the full scene.';
    return { pre: { ...full, note }, main: { ...full, note }, post: { ...full, note }, full };
  }

  let m1 = samples.length - 1;
  for (let i = m0 + 1; i < samples.length; i++) {
    if (!isMain(samples[i])) {
      m1 = i;
      break;
    }
  }

  let p1 = samples.length - 1;
  for (let i = m1; i < samples.length; i++) {
    const actor = samples[i];
    if (!actor || SETTLED.has(actor.state)) {
      p1 = Math.min(samples.length - 1, i + Math.round(1500 / STEP_MS));
      break;
    }
  }

  const pre: Window = { t0: phaseStart, t1: m0 * STEP_MS };
  if (pre.t1 - pre.t0 < 200) {
    pre.t1 = Math.min(scenario.durationMs, pre.t0 + 2000);
    pre.note = 'No transition needed — the actor is already in place.';
  }
  return {
    pre,
    main: { t0: m0 * STEP_MS, t1: m1 * STEP_MS },
    post: { t0: m1 * STEP_MS, t1: p1 * STEP_MS },
    full,
  };
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/**
 * Mounts a looping, windowed playback of one scenario phase. The returned
 * element cleans itself up once Storybook detaches it from the document.
 */
export function mountStory(options: StoryOptions): HTMLElement {
  const { scenario, registry, phase } = options;
  const windows = windowsFor(scenario, registry);
  const window_ = windows[phase];
  const speed = scenario.speed ?? 1;

  const container = document.createElement('div');
  container.style.cssText =
    'display:flex;flex-direction:column;gap:8px;font-family:ui-rounded,system-ui,sans-serif;';

  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;align-items:center;gap:10px;padding:6px 10px;background:#f4eee0;' +
    'border-radius:10px;color:#3f382c;font-size:13px;';
  const chip = document.createElement('b');
  chip.textContent = phase;
  const range = document.createElement('span');
  range.style.color = '#857863';
  range.textContent =
    `${seconds(window_.t0)} → ${seconds(window_.t1)}` + (speed !== 1 ? ` · ${speed}×` : '');
  const note = document.createElement('span');
  note.style.cssText = 'color:#857863;font-style:italic;';
  note.textContent = window_.note ?? '';
  const bar = document.createElement('div');
  bar.style.cssText =
    'margin-left:auto;width:120px;height:5px;background:#d9d0bd;border-radius:999px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:0;background:#c2604a;border-radius:999px;';
  bar.appendChild(fill);
  const toggle = playToggle();
  // Under snapshot capture the story is frozen, so the control says so.
  if (isSnapshotCapture()) {
    toggle.el.innerHTML = ICON.play;
  }
  header.append(chip, range, note, bar, toggle.el);

  const stage = document.createElement('div');
  stage.style.cssText =
    'position:relative;height:540px;border-radius:12px;overflow:hidden;background:#e9e2d3;';
  container.append(header, stage);

  const renderer = new CartoonRenderer();
  let disposed = false;
  let wasConnected = false;
  const createdAt = performance.now();

  const dispose = (): void => {
    if (!disposed) {
      disposed = true;
      renderer.destroy();
    }
  };

  const startLoop = (): void => {
    if (disposed) {
      return;
    }
    const run = freshRun(scenario, registry);
    // Silent fast-forward to the window: frames still tick so walks happen.
    for (let t = 0; t <= window_.t0; t += STEP_MS) {
      run.clock.set(run.start + t);
      run.feed(t);
      run.director.frame();
    }
    let sim = window_.t0;
    let last = performance.now();

    const tick = (now: number): void => {
      if (disposed) {
        return;
      }
      // Self-teardown once Storybook swaps the story out.
      if (container.isConnected) {
        wasConnected = true;
      } else if (wasConnected || now - createdAt > 10000) {
        dispose();
        return;
      }
      const dt = Math.min(100, now - last);
      last = now;
      if (toggle.isPaused()) {
        // Hold the frame. `last` still advances, so resuming does not jump.
        requestAnimationFrame(tick);
        return;
      }
      sim = Math.min(window_.t1, sim + dt * speed);
      run.clock.set(run.start + sim);
      run.feed(sim);
      renderer.render(run.director.frame());
      const span = Math.max(1, window_.t1 - window_.t0);
      fill.style.width = `${(((sim - window_.t0) / span) * 100).toFixed(1)}%`;
      if (sim >= window_.t1) {
        // Paused on the last frame, stay there rather than snapping back to
        // the start of the window the moment the hold elapses.
        const loopWhenPlaying = (): void => {
          if (disposed) {
            return;
          }
          if (toggle.isPaused()) {
            setTimeout(loopWhenPlaying, 120);
            return;
          }
          startLoop();
        };
        setTimeout(loopWhenPlaying, HOLD_MS);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /** One still frame at the window's midpoint, for visual snapshots. */
  const renderFrozen = (): void => {
    const run = freshRun(scenario, registry);
    const mid = window_.t0 + (window_.t1 - window_.t0) / 2;
    for (let t = 0; t <= mid; t += STEP_MS) {
      run.clock.set(run.start + t);
      run.feed(t);
      run.director.frame();
    }
    renderer.render(run.director.frame());
    fill.style.width = '50%';
  };

  void renderer.mount(stage).then(() => {
    if (disposed) {
      renderer.destroy();
      return;
    }
    if (isSnapshotCapture()) {
      renderFrozen();
      return;
    }
    startLoop();
  });

  return container;
}

/** The standard four stories every event gets. */
export function phaseStory(
  phase: Phase,
  scenario: () => Scenario,
  registry: ChoreographyRegistry
): { render: () => HTMLElement } {
  return { render: () => mountStory({ scenario: scenario(), registry, phase }) };
}
