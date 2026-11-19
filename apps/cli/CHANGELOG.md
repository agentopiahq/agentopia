# agentopiahq

## 0.2.0

### Minor Changes

- [#84](https://github.com/agentopiahq/agentopia/pull/84) [`f69cfe6`](https://github.com/agentopiahq/agentopia/commit/f69cfe68d22a3ff5a6f2e3ee5eee9c5eb3be6596) Thanks [@tuliren](https://github.com/tuliren)! - Add `agentopia install` and `agentopia uninstall`. `install` installs the agentopia plugin into Claude Code (from a local marketplace under `~/.agentopia`), whose hooks then record every session, plain `claude` and the desktop app's included, not only ones started with `agentopia claude`. It keeps itself current when the CLI is upgraded. `agentopia doctor` now says when plain sessions aren't being recorded, and `agentopia watch` points to `install` when the plugin is missing.

### Patch Changes

- [#80](https://github.com/agentopiahq/agentopia/pull/80) [`ba6a4f7`](https://github.com/agentopiahq/agentopia/commit/ba6a4f7dad11bd0fa36ef21298a62813959356f2) Thanks [@tuliren](https://github.com/tuliren)! - Speech bubbles have a close mark. Closing one takes that bubble down early; the next thing the avatar says still shows.

- [#82](https://github.com/agentopiahq/agentopia/pull/82) [`eb7b331`](https://github.com/agentopiahq/agentopia/commit/eb7b331cfe0a457c95fac4379d215d88afd801b5) Thanks [@tuliren](https://github.com/tuliren)! - The office is the floor: clicking a desk no longer offers a way into that one session's replay, and `agentopia help` no longer lists `watch <session>`, `tail` or `sessions`. All three still work.

- [#80](https://github.com/agentopiahq/agentopia/pull/80) [`ba6a4f7`](https://github.com/agentopiahq/agentopia/commit/ba6a4f7dad11bd0fa36ef21298a62813959356f2) Thanks [@tuliren](https://github.com/tuliren)! - Clicking an object now opens its card right beside it, pointing at it, instead of in the sheet's margin, and only for objects with something to do. A blind's whole-wall controls sit on their own row. The card follows the object as you pan, zoom and turn the office, stays on screen, and closes on Escape or a click anywhere else.

- [#83](https://github.com/agentopiahq/agentopia/pull/83) [`f3bb4c9`](https://github.com/agentopiahq/agentopia/commit/f3bb4c94a143db382780a6647541edb8d9e91ee2) Thanks [@tuliren](https://github.com/tuliren)! - The office fills the whole window, as on agentopia.town: its paper and grid run to the edges with no darker page round them, and it zooms out no further than the website's office does. It also keeps six people about at all times, as the website's office does, up from four.

- [#77](https://github.com/agentopiahq/agentopia/pull/77) [`d9bfe5c`](https://github.com/agentopiahq/agentopia/commit/d9bfe5c30b750c993859afff1c4048cce00aeced) Thanks [@tuliren](https://github.com/tuliren)! - Drop the Charcoal, Infrared and Film negative drawing styles. A viewer that had one picked goes back to Cartoon.

- [#79](https://github.com/agentopiahq/agentopia/pull/79) [`41d133c`](https://github.com/agentopiahq/agentopia/commit/41d133cffe9ee77403899935eafb05fa62a202d9) Thanks [@tuliren](https://github.com/tuliren)! - Turning the office now spins it about whatever is in the middle of the view, so a view zoomed in on one corner stays on that corner as it turns.

## 0.1.0 - 2026-11-19

First npm release: watch your coding agents working in a relaxing office.

**Install** (needs Node 20+ and Claude Code on your `PATH`):

```sh
npm i -g agentopiahq
```

Or skip the install and use `npx agentopiahq` in place of `agentopia` below. `@agentopia/cli` is an alias for the same package (`npx @agentopia/cli watch`).

**Run**

```sh
agentopia claude    # start Claude Code with the office attached; it opens in your browser
agentopia watch     # or keep one office open for every live session
```

Arguments after `agentopia claude` go straight to Claude Code, e.g. `agentopia claude --effort high`. Only sessions started through `agentopia claude` show up in the office. Run `agentopia doctor` to check the hook wiring, and `agentopia help` for every command.
