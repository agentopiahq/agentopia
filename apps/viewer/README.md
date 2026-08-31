# @agentopia/viewer

The office, rendered. A PixiJS v8 cartoon skin over `@agentopia/core`'s `OfficeFrame`s:
the browser connects to the CLI's SSE stream, folds catch-up events without animating,
and animates live ones at 60fps (with a coarse fallback tick while the tab is hidden,
since Chrome suspends rAF there).

One scrubber serves both modes (`src/replay.ts` drives it). `?replay` re-animates a
recording from the start. Without it the session is live: the office follows the live
edge (LIVE badge lit), clicking the track time-travels through what already happened, and
the go-live button — or just playing until the cursor catches up — rejoins the edge. The
speed pill at the bar's right end opens a log-scaled slider (0.25x–5x, snapping to the
common rates); resting the pointer on any control for a moment explains it. The HUD
titles the office with the harness's own session name, read from the samples the emitter
writes onto turn-level bus records — no second data source.

This package is a *skin*. Restyling (pixel, HD-2D-ish) means a new renderer + theme
against the same frames — see PLAN §6. No game framework: the director in core owns the
loop and clock.

```sh
yarn turbo build --filter=@agentopia/viewer   # dist/ served by the CLI
yarn --cwd apps/viewer dev                  # vite dev server (needs a running agentopia server for /events)
yarn --cwd apps/viewer storybook            # the event/animation library on :6007
```

## The animation library (Storybook)

`src/__stories__/` is the workshop for tuning event animations one at a time, without
running a live session. Every event kind gets four stories — **Pre** (the transition in,
usually the walk), **Main** (the performance at the station), **Post** (the release:
linger, walk home), and **Full** (the whole scenario) — windowed automatically by
simulating the deterministic director headlessly and observing the watched actor's
states, then looping just that slice.

- `lib/scenarios.ts` — harness-agnostic event scripts, written in the normalized
  vocabulary. One per event kind; parameterized ones (tool kind, failure) take args.
- `lib/harness.ts` — the phase player: manual clock + seeded rng + the real
  `CartoonRenderer`, fast-forwarded silently to the phase window.
- `claude/` — one story file per event kind, bound to `choreographyFor('claude')`.
  When a harness gets its own choreography (Codex), it gets a sibling folder reusing
  the same scenarios against its own registry.

State-only events (`task.*`, `notify`, `approval.denied`, `context.compacted`) render
the full scene with a note saying no animation is staged — they are in the library on
purpose, as the catalog of what is *not yet* animated.
