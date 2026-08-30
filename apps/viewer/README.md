# @cubicle/viewer

The office, rendered. A PixiJS v8 cartoon skin over `@cubicle/core`'s `OfficeFrame`s:
the browser connects to the CLI's SSE stream, folds catch-up events without animating,
and animates live ones at 60fps (with a coarse fallback tick while the tab is hidden,
since Chrome suspends rAF there).

This package is a *skin*. Restyling (pixel, HD-2D-ish) means a new renderer + theme
against the same frames — see PLAN §6. No game framework: the director in core owns the
loop and clock.

```sh
yarn turbo build --filter=@cubicle/viewer   # dist/ served by the CLI
yarn --cwd apps/viewer dev                  # vite dev server (needs a running cubicle server for /events)
```
