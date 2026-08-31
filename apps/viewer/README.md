# @agentopia/viewer

The office, rendered. A PixiJS v8 cartoon skin over `@agentopia/core`'s `OfficeFrame`s:
the browser connects to the CLI's SSE stream, folds catch-up events without animating,
and animates live ones at 60fps (with a coarse fallback tick while the tab is hidden,
since Chrome suspends rAF there).

One scrubber serves both modes (`src/replay.ts` drives it). `?replay=N` re-animates a
recording at N x speed. Without it the session is live: the office follows the live edge
(LIVE badge lit), clicking the track time-travels through what already happened, and the
go-live button — or just playing until the cursor catches up — rejoins the edge. The HUD
shows the harness's own name for the session when the server can find one on disk.

This package is a *skin*. Restyling (pixel, HD-2D-ish) means a new renderer + theme
against the same frames — see PLAN §6. No game framework: the director in core owns the
loop and clock.

```sh
yarn turbo build --filter=@agentopia/viewer   # dist/ served by the CLI
yarn --cwd apps/viewer dev                  # vite dev server (needs a running agentopia server for /events)
```
