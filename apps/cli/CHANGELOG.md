# agentopiahq

## 0.4.0 - 2026-11-19

### Minor Changes

- [#98](https://github.com/agentopiahq/agentopia/pull/98) [`f5c8b57`](https://github.com/agentopiahq/agentopia/commit/f5c8b57b9c270581a7aa49b2b365978f0db21804) - The office links to the website: under its slogan, "agentopia.town ↗", and the links in its bottom-left corner now include the website and its new docs page.

- [#99](https://github.com/agentopiahq/agentopia/pull/99) [`bfe09c2`](https://github.com/agentopiahq/agentopia/commit/bfe09c276c35f7e2e82131890715072db91b6516) - The usage board now gets its model prices from agentopia.town, which passes models.dev's price list through, and goes to models.dev directly when agentopia.town can't be reached, then to the copy it kept and the prices built in, as before. The request names the CLI's version, OS and architecture, and nothing else. `AGENTOPIA_PRICES_URL` points it at another address.

- [#96](https://github.com/agentopiahq/agentopia/pull/96) [`41b2a15`](https://github.com/agentopiahq/agentopia/commit/41b2a15f81e7086ba90851733eb8266a67dbe4d4) - agentopia now updates itself. The office checks npm every few hours, downloads a new release into `~/.agentopia/versions` (checked against npm's integrity hash), and switches over once no session is in the middle of a turn, going back if the new version won't start. Open tabs offer a reload, with a link to what changed. `agentopia update` (or `upgrade`) updates straight away, `--check` only says whether there is a new version, and `AGENTOPIA_AUTO_UPDATE=0` turns the automatic download off.

### Patch Changes

- [#95](https://github.com/agentopiahq/agentopia/pull/95) [`7bfc077`](https://github.com/agentopiahq/agentopia/commit/7bfc077912ee61315012d197d792d16c50e6b27e) - The READMEs now lead Usage with `agentopia start`, and the `@agentopia/cli` README, which had fallen behind, matches the `agentopiahq` one again. The slogan at the top keeps its two lines on npm.

## 0.3.0 - 2026-11-19

### Minor Changes

- [#91](https://github.com/agentopiahq/agentopia/pull/91) [`1796255`](https://github.com/agentopiahq/agentopia/commit/17962551ce9a6adf0de6e7ffb0c97304a6a8af8c) - `agentopia start` is the one command to get going. It offers to install the agentopia plugin into Claude Code if it isn't there yet (`--yes` installs without asking), then serves the office in the background, so it stays open after you close the terminal. `agentopia status` says whether it is running and where, and `agentopia stop` stops it. There is one office at a time: `agentopia watch` and `agentopia claude` open the one already running instead of starting another, and a newer agentopia replaces an older one's office. The office also keeps serving the viewer it started with when agentopia is upgraded underneath it.

## 0.2.0 - 2026-11-19

### Minor Changes

- [#84](https://github.com/agentopiahq/agentopia/pull/84) [`f69cfe6`](https://github.com/agentopiahq/agentopia/commit/f69cfe68d22a3ff5a6f2e3ee5eee9c5eb3be6596) - Add `agentopia install` and `agentopia uninstall`. `install` installs the agentopia plugin into Claude Code (from a local marketplace under `~/.agentopia`), whose hooks then record every session, plain `claude` and the desktop app's included, not only ones started with `agentopia claude`. It keeps itself current when the CLI is upgraded. `agentopia doctor` now says when plain sessions aren't being recorded, and `agentopia watch` points to `install` when the plugin is missing.

- [#80](https://github.com/agentopiahq/agentopia/pull/80) [`ba6a4f7`](https://github.com/agentopiahq/agentopia/commit/ba6a4f7dad11bd0fa36ef21298a62813959356f2) - Speech bubbles have a close mark. Closing one takes that bubble down early; the next thing the avatar says still shows.

- [#82](https://github.com/agentopiahq/agentopia/pull/82) [`eb7b331`](https://github.com/agentopiahq/agentopia/commit/eb7b331cfe0a457c95fac4379d215d88afd801b5) - The office is the floor: clicking a desk no longer offers a way into that one session's replay, and `agentopia help` no longer lists `watch <session>`, `tail` or `sessions`. All three still work.

- [#80](https://github.com/agentopiahq/agentopia/pull/80) [`ba6a4f7`](https://github.com/agentopiahq/agentopia/commit/ba6a4f7dad11bd0fa36ef21298a62813959356f2) - Clicking an object now opens its card right beside it, pointing at it, instead of in the sheet's margin, and only for objects with something to do. A blind's whole-wall controls sit on their own row. The card follows the object as you pan, zoom and turn the office, stays on screen, and closes on Escape or a click anywhere else.

- [#83](https://github.com/agentopiahq/agentopia/pull/83) [`f3bb4c9`](https://github.com/agentopiahq/agentopia/commit/f3bb4c94a143db382780a6647541edb8d9e91ee2) - The office fills the whole window, as on agentopia.town: its paper and grid run to the edges with no darker page round them, and it zooms out no further than the website's office does. It also keeps six people about at all times, as the website's office does, up from four.

- [#77](https://github.com/agentopiahq/agentopia/pull/77) [`d9bfe5c`](https://github.com/agentopiahq/agentopia/commit/d9bfe5c30b750c993859afff1c4048cce00aeced) - Drop the Charcoal, Infrared and Film negative drawing styles. A viewer that had one picked goes back to Cartoon.

- [#79](https://github.com/agentopiahq/agentopia/pull/79) [`41d133c`](https://github.com/agentopiahq/agentopia/commit/41d133cffe9ee77403899935eafb05fa62a202d9) - Turning the office now spins it about whatever is in the middle of the view, so a view zoomed in on one corner stays on that corner as it turns.

## 0.1.0 - 2026-11-18

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
