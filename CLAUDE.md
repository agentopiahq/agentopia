# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`agentopia` animates a coding agent's activity as an office of little clone workers. Agent
lifecycle hooks append events to a local file; a long-lived viewer tails that file and
animates it.

`PLAN.md` at the repo root is the source of truth for architecture, the locked design
decisions, and the phased roadmap. Read it before making design choices — several decisions
that look arbitrary (why the emitter has no imports, why the office is a tile grid, why the
event vocabulary comes from ACP) are load-bearing and explained there.

## Repo layout

Turborepo monorepo managed with Yarn 4 (Berry) workspaces. Node 20+.

- `apps/cli` — the `agentopia` command (`@agentopia/cli`). Bundled to one ESM file with esbuild. Includes the office server: viewer static bundle + SSE event stream, bound to 127.0.0.1.
- `apps/web` — Next.js 16 marketing site (agentopia.town). Tailwind v4, Storybook.
- `plugins/<harness>` — self-contained plugin payloads, one per agent. **Outside the workspace graph on purpose** — see `plugins/README.md`.
- `packages/core` — event vocabulary, source adapters, the per-session reducer and the office map over it, the floor plan (a zoned office: meeting room and booths in `ROOMS`, kept clear of every straight walk by a test), choreography registries, and the director (`@agentopia/core`). Pure, no I/O, no runtime dependencies. The director is the sequencer: desks (one per live session), beat queues, walking, dwell minimums, coalescing, lag + hurry, seating, idle life. _What_ each event stages comes from an injected `ChoreographyRegistry` (`src/choreography/`) — an `EventChoreography` per event kind with `pre`/`main`/`post` phases plus lifecycle flags, one registry per harness. All positions are tile-space; renderers are skins.
- `packages/lib` — shared React components (`@agentopia/lib`).
- `packages/eslint-config` — flat-config ESLint presets (`base.js`, `typescript.js`, `next.js`, `react-internal.js`, `library.js`). ESLint 9.
- `packages/jest-presets` — Jest presets consumed by workspace jest configs.
- `packages/typescript-config` — shared tsconfig bases.

- `apps/viewer` — the office, rendered (`@agentopia/viewer`). An isometric, hand-inked
  skin over core's `OfficeFrame`s, drawn in canvas 2D and composited by PixiJS v8; Vite
  build to `dist/`, which the CLI discovers and serves. A restyle is a new renderer + art,
  never a core change. The office is one Tinycharts-style annotated sheet (`room.ts`: paper,
  title block, margin labels, the floor slab and back walls); every object is a
  Colorfigures-style solid in `objects/` (three light/mid/dark bands, graded within each
  band with rim highlights by the pen's `sheen`, heavy ink silhouette, blue cast shadow), drawn with the isometric pen in `kit/iso.ts` from
  the palette in `kit/palette.ts`. `renderer.ts` bakes the sheet and the furniture into
  textures, depth-sorts furniture and cast by footprint each frame, and owns the desks'
  live overlays and the camera; `character.ts` owns the Claude rig, drawn per frame into
  its own canvas. Also hosts the animation library: Storybook stories under
  `src/__stories__/<harness>/` (four per event kind — Pre/Main/Post/Full) over shared
  scenarios in `src/__stories__/lib/`, for tuning each event's animation in isolation,
  plus `character.stories.ts` for the character, `objects.stories.ts` (one story per
  office object) and `room.stories.ts` (the empty office). See `apps/viewer/README.md`.

## Common commands (run from repo root)

```sh
yarn install              # first time / after lockfile change
yarn --cwd apps/cli build # build the agentopia binary to apps/cli/dist
yarn dev                  # turbo dev — runs all persistent dev tasks
yarn build                # turbo build
yarn lint                 # turbo lint across all workspaces
yarn typecheck            # turbo typecheck
yarn test                 # turbo test (unit)
yarn format:check         # prettier check
yarn format:write         # prettier write
yarn agentopia watch      # the floor: every live session in one office (needs a build first)
yarn replay <bus.jsonl>   # replay a bus file (e.g. a core fixture) in the office viewer
yarn --cwd apps/viewer storybook   # the event/animation library on :6007
```

Scope a turbo task to one workspace with `--filter`, e.g. `yarn turbo test --filter=@agentopia/core`.
To run a single Jest test inside a workspace, use `yarn --cwd packages/core jest path/to/file.test.ts -t "test name"`.

## Project rules that override convenience

These two constraints are the reason the architecture is shaped the way it is. Breaking
either one is a correctness bug, not a style preference.

- **The hook emitter shares no code.** It runs once per tool call and its entire cost is
  process startup (~20ms). It must stay a single zero-import file with no dependencies.
  It also has to work from a bare `git clone` with no `node_modules` and no build step,
  because agents load it by pointing at a directory on disk. Never make it import a
  workspace package, and never make it a build artifact. `agentopia doctor` enforces this.
- **`plugins/` stays out of the workspace graph.** No `package.json`, and never move it
  under `apps/` or `packages/`. Workspace membership brings hoisted `node_modules`, which
  would let an accidental import work locally while breaking every installed user.
- **Nothing time- or chance-dependent reads the ambient environment.** The director takes an
  injected `Clock` and `Rng` (see `packages/core/src/clock.ts`). Never call `Date.now()` or
  bare `Math.random()` in `packages/core` or in any renderer. Reproducible replay and
  golden-frame snapshot tests both depend on this.

Beyond that: the reducer is pure and total. It must tolerate a dropped or out-of-order event
by degrading rather than throwing, because hooks can be missed.

## Architecture notes that aren't obvious from a quick read

- **Event vocabulary is borrowed, not invented.** `ToolKind` and `ToolStatus` in
  `packages/core/src/events.ts` come from the Agent Client Protocol. Don't add ad-hoc kinds;
  map new tools onto the existing set (`other` is the escape hatch).
- **One office, many sessions.** `OfficeState` is a map of per-session `SessionState`s keyed
  by bus (the agentopia session id: one bus, one agent process, one lead, one desk).
  `SequencedEvent.bus` carries that key; the server tags every event with it, and bare
  `/events` multiplexes every live bus on one stream. The per-session reducer is unchanged
  and never touches another session. The director seats sessions (eight desks; a ninth
  waits; a returning session gets its old desk only if still free), puts subagents at
  helper spots around their lead's desk (three drawn, all counted), and walks a quiet
  session out after `IDLE_LEAVE_MS`. Replay and the scrubber are single-session on purpose.
- **No beat is ever cut.** Nothing interrupts: new segments queue behind the current beat,
  a failure's slump queues after the work, departures wait for the queue, and dwell
  minimums are never compressed under lag. Bursts of tool work coalesce into one open beat
  that holds every running call. When a worker is more than `LAG_SKIP_MS` behind once a
  beat finishes, its queue collapses to the newest beat — skip the middle, never the
  current. The desk badge reads phase from reduced state, so "waiting on you" is instant
  however far behind the animation is.
- **Staging lives in choreography registries, not the director.** The director never
  hardcodes what an event kind looks like; it executes the injected registry
  (`packages/core/src/choreography/`). To change an animation, edit (or add) a harness's
  `EventChoreography`; to add a harness with different staging, add a registry next to
  `claudeChoreography` and wire it into `choreographyFor`. Segments are stationary
  performances — walking between spots is always the director's job, which is what keeps
  choreographies position- and pixel-free.
- **`worker` is the load-bearing field** on `AgentopiaEvent`. It is what assigns a beat to a
  desk. Claude Code supplies `agent_id` on every hook fired inside a subagent, which is what
  makes per-desk attribution possible at all. Verified against a real session: a subagent's
  tool calls arrive with its own `agent_id`, distinct from the lead's.
- **`atype` and `spawn` mean different things.** `atype` is the agent a hook fired _inside_;
  `spawn` is the agent a delegation tool is _creating_. Conflating them puts the delegator's
  own `Agent` call on the spawned worker's desk. There is a regression test for it.
- **One bus file per wrapper run, header first.** There is no sidecar metadata file. The
  first bus line is a `agentopia.session` header; the `agentopia.` prefix is reserved for lines
  agentopia writes about itself, so it can never collide with a harness event name. Anything
  reading the bus must skip headers before handing records to an adapter.
- **Two session identities, N:M.** An agentopia session is one wrapper run; a harness session
  is the agent's conversation. `/clear` starts a new harness session inside one run, and
  `claude -c` reuses one harness session across runs. Neither id substitutes for the other,
  so `resolveSessionId` accepts both. Subagents share the bus with their parent.
- **ESLint 9 flat config.** Configs live in `eslint.config.{js,cjs}` per workspace.
  `eslint-plugin-import` is replaced by `eslint-plugin-import-x` — don't reintroduce the old
  plugin. TypeScript packages should extend `@agentopia/eslint-config/typescript.js`, which turns
  off the base `no-unused-vars` and ignores `coverage/`.
- **Tailwind v4** in `apps/web` via `@tailwindcss/postcss` — use v4 conventions, not
  `tailwind.config` content scanning.

## Testing conventions

- Unit tests live under `__tests__/` adjacent to the code under test.
- Use `it.each` to group similar test cases together. Do not use "should" in test descriptions.
- `packages/core` is pure, so it needs no mocking. Prefer real event streams over stubs.
- Recorded bus files are the preferred fixture format — a real session captured once is
  worth more than hand-written events.
- CI (`.github/workflows/ci.yaml`) runs lint, format:check, typecheck, and test. The
  Storybook/Chromatic flow lives in `.github/workflows/storybook.yaml` and builds the
  viewer's animation library (`apps/viewer`); under Chromatic capture the story harness
  freezes each story on one deterministic frame.

## Dev Preferences

- After each change, run `yarn lint`, `yarn typecheck`, `yarn test`, and `yarn format:write`.
- DRY the code when appropriate.
- Always use curly braces after `if` statements.
- Think about adding unit tests for new features and bug fixes. Aim for good coverage on
  critical parsing and reduction logic. Skip unit tests if they would need complicated
  mocking or stubs.
- When a React component file is long, separate subcomponents into their own component files.
- After making a change, think about updating these docs, if applicable:
  - `CLAUDE.md` (this file)
  - `PLAN.md` (if the change affects architecture or roadmap)
  - `README.md` in relevant directories
