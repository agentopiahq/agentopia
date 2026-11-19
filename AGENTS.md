# AGENTS.md

This file provides guidance to coding agents (Claude Code, Codex and others) when working with code in this repository. `CLAUDE.md` imports it.

## What this project is

`agentopia` animates a coding agent's activity as an office of little clone workers. Agent
lifecycle hooks append events to a local file; a long-lived viewer tails that file and
animates it.

`ARCHITECTURE.md` at the repo root is the source of truth for architecture and the locked
design decisions; `ROADMAP.md` is the checklist of what is built and what is next. Read
`ARCHITECTURE.md` before making design choices — several decisions
that look arbitrary (why the emitter has no imports, why the office is a tile grid, why the
event vocabulary comes from ACP) are load-bearing and explained there.

## Repo layout

Turborepo monorepo managed with Yarn 4 (Berry) workspaces. Node 20+.

- `apps/cli` — the `agentopia` command (`agentopiahq` on npm). Bundled to one ESM file with esbuild. Includes the office server: viewer static bundle + SSE event stream, bound to 127.0.0.1, plus `/api/usage`, which follows each harness's own usage records (`src/usage/`) for the usage board. `agentopia start` / `status` / `stop` (`src/commands/background.ts`) run that floor server detached, `start` first offering to install the plugin where it is missing (`setUpInstalls`, asking only at a terminal and remembering a no in `prefs.json`); the floor server's `~/.agentopia/server.json` (`src/serverRecord.ts`) keeps it one per home, and every server serves its viewer from memory (`src/viewerBundle.ts`) so an upgrade can't mix versions. `agentopia install` / `uninstall` (`src/install/`) register the plugin with each agent for good, so plain runs and desktop apps are recorded too.
- `apps/web` — Next.js 16 marketing site (agentopia.town). Tailwind v4, Storybook. Its home page is the real office alone, full-window (the footer's credits and links are lettered in the office's corners by the viewer's `src/credits/`): it imports `@agentopia/viewer/hero` (transpiled by Next via `transpilePackages`), which mounts the viewer's renderer and director on endless randomized mock sessions (one to three agents on real tasks) from `heroScript.ts`. Nothing is copied out of the viewer. For search engines and AI agents, `PAGES` in `src/seo.ts` lists every page; metadata, JSON-LD, the sitemap, `robots.txt`, `llms.txt` and each page's markdown twin (`<path>.md`, also served for `Accept: text/markdown` by `src/proxy.ts`) all read it (see `apps/web/README.md`).
- `packages/cli-alias` — the `@agentopia/cli` npm alias: a one-line bin that imports `agentopiahq`. Released in lock-step with it; its README is generated from `apps/cli/README.md` (`node scripts/readmes.mjs`).
- `plugins/<harness>` — self-contained plugin payloads, one per agent. **Outside the workspace graph on purpose** — see `plugins/README.md`.
- `packages/core` — event vocabulary, source adapters, the per-session reducer and the office map over it, the floor plan (a zoned office: meeting room and booths in `ROOMS`, kept clear of every straight walk by a test), choreography registries, and the director (`@agentopia/core`). Pure, no I/O, no runtime dependencies. The director is the sequencer: desks (one per live session), beat queues, walking (routed round the furniture by `route.ts`), dwell minimums, coalescing, lag + hurry, seating, idle life. _What_ each event stages comes from an injected `ChoreographyRegistry` (`src/choreography/`) — an `EventChoreography` per event kind with `pre`/`main`/`post` phases plus lifecycle flags, one registry per harness. All positions are tile-space; renderers are skins.
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
  its own canvas; a lead at its own desk sits in the desk's task chair (`seating.ts`: the
  renderer slides the chair in under it and swivels it, and the rig blends standing into
  seated poses), all built from the one idle figure. A seat that someone sits _in_ (a sofa, a café or meeting chair, a desk's task chair) declares `parts` (`partsOf` when its state moves them, as a swivelling task chair's do), and the renderer bakes and sorts each part on its own so the sitter lands between them. Objects take an optional `PieceState` in `draw`/`shadow` (a door's
  `open`, a blind's `down`) with a default for every key; `interact.ts` says what a click
  on each kind does (toggle, popover menu, the sprint board editor, or the usage ledger) and keeps every
  piece's state in the viewer's browser — none of it reaches core. Drawing styles (`src/styles/`, picked
  in the settings card) redraw the same art in other media: `styled(ctx)` on every drawing
  canvas maps each fill, line and letter through the active style, and a GPU `finish` goes over
  the whole office. No object or character knows its style; new drawing canvases must be
  wrapped in `styled`. The windows look out on
  San Francisco (`objects/skyline.ts`) under a time-lapse sky: a whole day every hour of the wall clock
  (which itself keeps real time), weather that changes every ten minutes, and a moon that
  goes round its phases every eight of those days (`sky.ts`, pure: time in, sky out). Also hosts the animation library: Storybook stories under
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
yarn agentopia start      # the same floor in the background; `status` and `stop` to match
yarn replay <bus.jsonl>   # replay a bus file (e.g. a core fixture) in the office viewer
yarn --cwd apps/viewer storybook   # the event/animation library on :6007
yarn changeset            # describe a user-facing CLI change for the next release
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
  session out after `IDLE_LEAVE_MS`. Harnesses do not always say goodbye (archiving a
  Claude Code thread fires no hook and leaves the process running), so the floor stream
  only replays buses written within that window (`FLOOR_WINDOW_MS` in the server), and a
  desk can be cleared by hand: `Director.dismiss(bus, throughTs)` holds a session off the
  floor until a newer event, which the viewer remembers across reloads. Replay and the scrubber are single-session on purpose.
- **You are in the office.** One human avatar (`packages/core/src/human.ts`, reported in
  `OfficeFrame.human` with `role: 'human'`, drawn by the viewer's `humanRig.ts`) replaced
  the wall speaker: a prompt (`turn.user`) has the human say it, and `approval.request`
  sends the lead to the `human` station, a step in front of wherever they sit
  (`askSpotFor`), to ask for the exact call (`askFor`). The ask is held open there until
  the call goes ahead (yes) or a denial, prompt or turn end says no; then the lead's
  bubble comes down, the human answers (`HumanAnswer`: a nod, a thumbs up, a shake of the
  head, or a word) and the lead walks straight back. The human is there with or without idle life (without it they stay on
  the corner sofa); with it they move between `HUMAN_SPOTS` (seats, the floor against
  the window wall, and open floor to stand about on, swaying) on a chance stream of their own, never while a lead is headed their way,
  and never into a seat someone has claimed.
- **Idle life is filler, never a beat.** With `DirectorOptions.idleLife` (the floor and
  the website set six), residents — `role: 'resident'`, no session — top the leads up to that headcount,
  and every idle avatar plays activities from `IDLE_ACTIVITIES` in `packages/core/src/idle.ts`
  (add one there; the director knows none by name). A new lead takes over a spare
  resident's figure, and an ended lead stays on as one, so `Actor.avatar` (not `id`) is
  the figure's identity and what the renderer keys sprites by. Any beat drops a lead's
  activity at once. A chat plays a script from `CONVERSATIONS` in
  `packages/core/src/conversations.ts` (two to five rounds of shop talk, line by line; add
  one there), and whenever someone is free to join, an activity for two is picked first more
  often than not, so the office talks a lot. Off by default, so golden frames and the per-event stories are
  unchanged; of the stories only the showcase turns it on (`StoryOptions.idleLife`).
  `idleLife.pets` adds the office cat and dog (`OFFICE_IDLE_LIFE` has both): they run
  `PET_ACTIVITIES` in `packages/core/src/pets.ts` (add one there, naming which pets do it),
  reported in `OfficeFrame.pets`, never as actors. A perch (`Perch`: the cat up on a
  bookshelf or cabinet, the dog in its bed) gives the pet a `z`; the viewer sorts pets
  among the furniture by `PETS` in `objects/scale.ts`, and layering.test.ts covers every
  pet spot and perch. Perches that name the same `tower` (the cat tower's den, ledge and
  bed, `TOWER_PERCHES`) are climbed between directly, never via the floor; the tower's
  levels live in core's `CAT_TOWER`, and the viewer draws each one as its own sorted part.
- **No beat is ever cut.** Nothing interrupts: new segments queue behind the current beat,
  a failure's slump queues after the work, and departures wait for the queue. Every action
  also finishes its loop: each state's animation loops in `CYCLE_MS` (`packages/core/src/cycles.ts`),
  the director only changes a worker's state at a loop's end (and never halfway along a
  pacing leg), and skins drive each loop from `Actor.phase` so the loop drawn is the loop
  waited on; the viewer then eases the old pose into the new. Beats queued behind a worker
  raise its `tempo` (up to `TEMPO_MAX`): its animation, dwell minimums and walks all play
  faster, but in full. Legs never step faster than `MAX_STRIDES_PER_SEC` (`GAIT` in `stations.ts`): the
  director picks walking, sprinting or running (legs a wheel) by speed, and the viewer
  steps the legs by distance covered. Bursts of tool work coalesce into one open beat
  that holds every running call. When a worker is more than `LAG_SKIP_MS` behind once a
  beat finishes, its queue collapses to the newest beat — skip the middle, never the
  current. The desk badge reads phase from reduced state, so "waiting on you" is instant
  however far behind the animation is.
- **Staging lives in choreography registries, not the director.** The director never
  hardcodes what an event kind looks like; it executes the injected registry
  (`packages/core/src/choreography/`). To change an animation, edit (or add) a harness's
  `EventChoreography`; to add a harness with different staging, add a registry beside
  `choreography/claude.ts` and list it in `CHOREOGRAPHIES`. The director stages each desk by
  its own session's harness (`choreographyFor(run.harness)`); `DirectorOptions.choreography`
  is a fixed override for single-harness views (stories, the hero). Segments are stationary
  performances — walking between spots is always the director's job, which is what keeps
  choreographies position- and pixel-free.
- **Usage comes from each agent's own records, not hooks.** No hook carries a token count,
  so the usage board (`objects/usageBoard.ts`, ledger in `usagePanel.ts`) reads the server's
  `/api/usage`, not the bus. It is per harness in two halves, like the event adapters: a pure
  `UsageAdapter` in `packages/core/src/usage/adapters/` (one line of the harness's records to a
  usage or title fact, plus its `PriceTable`), registered in `USAGE_ADAPTERS`; and a
  `UsageReader` in `apps/cli/src/usage/` that finds and follows its files (subclass
  `JsonlUsageReader` and list the files), returned by the harness's `usage()` in `harness.ts`.
  `OfficeUsage` adds every reader up into one report, rows kept apart by harness. Only Claude
  Code has one so far. Cost is worked out at report time from models.dev prices
  (`apps/cli/src/usage/prices.ts`: fetched at most daily, cached in `~/.agentopia/cache`) laid over the adapter's bundled `PriceTable`, which is the
  offline fallback and keeps what models.dev lacks (1-hour cache writes, fast mode). Unknown
  models count as $0 and are named in the report. The marketing hero has no server: it feeds
  the board and ledger `mockUsageReport` (`apps/viewer/src/mockUsage.ts`), flagged as a demo.
  Count each response once by its key: Claude Code writes one line per
  content block with the same usage, and resumed sessions copy old lines.
- **Context comes from the transcripts too.** `/api/context` reports each desk's context:
  measured as the latest response's prompt plus its reply, broken into parts worked out from
  the transcript's text (`packages/core/src/context/`, a `ContextAdapter` per harness in
  `CONTEXT_ADAPTERS`; the CLI's `ContextReader` in `apps/cli/src/context/`, returned by the
  harness's `context()`). A bus is read on its newest harness session (`latestHarnessSession`).
  The viewer clutters each monitor by how full it is (`monitorClutter.ts`) and opens the
  breakdown (`contextPanel.ts`) from a monitor or a desk's name; "watch replay" there opens
  the session view the name used to open, but only while `SESSION_VIEWS`
  (`apps/viewer/src/flags.ts`) is on. It is off for now, and the CLI's `tail`, `sessions` and
  `watch <session>` are hidden from its help to match; all of it still works.
- **`worker` is the load-bearing field**
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

## Adding a harness

Harness-specific code is split by layer on purpose (the plugin stays out of the workspace,
core stays pure, the viewer owns the art), so a harness is a file named after it in each
layer — `claude.ts` today — plus one entry in that layer's registry. The harness id (the
plugin's directory name) travels with every session: the emitter stamps `h` on each record,
the server tags each streamed event with `harness`, the director stages each desk by it and
reports it on `Actor.harness`, and the viewer draws the actor in its skin. For `<id>`:

1. **`plugins/<id>/`** — copy `plugins/claude/hooks/emit.mjs` (changing only `HARNESS`),
   plus the agent's manifest and hook wiring. Map its payload onto `RawRecord`'s fields.
2. **`packages/core/src/adapters/<id>.ts`** — the event adapter (`RawRecord` →
   `AgentopiaEvent`), listed in `EVENT_ADAPTERS`. Map tools onto ACP's `ToolKind`s.
3. **`packages/core/src/choreography/<id>.ts`** — its registry (spread `defaultChoreography`
   and override what it stages differently), listed in `CHOREOGRAPHIES`.
4. **`apps/viewer/src/skins/<id>.ts`** — its look, listed in `SKINS`. Residents stay Claude.
5. **`apps/cli/src/harness.ts`** — a `Harness` entry in `HARNESSES`: binary, launch args,
   plugin manifest and hooks paths, and its adapter.
6. Optional, for `agentopia install`: a `PluginInstaller` in **`apps/cli/src/install/<id>.ts`**
   (the agent's own way to register a plugin for good), returned by the entry's `installer()`.
7. Optional, for the usage board: **`packages/core/src/usage/adapters/<id>.ts`** (listed in
   `USAGE_ADAPTERS`) and **`apps/cli/src/usage/<id>.ts`** (a `JsonlUsageReader`), returned by
   the entry's `usage()`.
8. Optional, for the desks' context: **`packages/core/src/context/adapters/<id>.ts`** (listed
   in `CONTEXT_ADAPTERS`) and **`apps/cli/src/context/<id>.ts`** (a `JsonlContextReader`),
   returned by the entry's `context()`.
9. Stories under `apps/viewer/src/__stories__/<id>/` if its staging differs, and a recorded
   bus fixture in `packages/core/fixtures/`.

`harnessParts.test.ts` (CLI) and `skins.test.ts` (viewer) fail by name for any harness
missing a required piece.

## Releasing

`agentopiahq` and its alias `@agentopia/cli` are the only published packages; every
other workspace is private. Changesets (`.changeset/`, both packages in one `fixed`
group) holds the version and the changelog (its generator, `.changeset/changelog.mjs`, thanks only outside contributors, and `scripts/changelogs.mjs` dates each version heading and keeps `@agentopia/cli`'s changelog a link to `agentopiahq`'s). `@agentopia/cli`'s README is generated from `apps/cli/README.md` by `scripts/readmes.mjs`: edit only that one (`node scripts/readmes.mjs` regenerates the copy, and `yarn version-packages` runs it before every release). A change users of the CLI should hear about
gets a changeset (`yarn changeset`). The Release workflow (`.github/workflows/release.yaml`)
is run by hand: it turns pending changesets into a "Release v<version>" pull request
(ordinary pushes to `main` never do), and dispatches Check and Storybook on it (a pull request pushed with `GITHUB_TOKEN`
triggers no `pull_request` workflows). Merging that pull request (a push that bumps the packages' versions) starts the workflow on its own, which publishes both packages (with npm provenance only while the repository is public, since npm rejects it from a private one; `yarn release`:
build the CLI and viewer, then `changeset publish`, which runs `yarn npm publish`) and
pushes the tags and creates the GitHub releases. It needs the `NPM_TOKEN` repository secret. The CLI's version
comes from its `package.json` (`src/version.ts`); never hand-edit either version.

## Testing conventions

- Unit tests live under `__tests__/` adjacent to the code under test.
- Use `it.each` to group similar test cases together. Do not use "should" in test descriptions.
- `packages/core` is pure, so it needs no mocking. Prefer real event streams over stubs.
- Recorded bus files are the preferred fixture format — a real session captured once is
  worth more than hand-written events.
- The `Check` workflow (`.github/workflows/check.yaml`) runs lint + format:check, typecheck,
  and test as three parallel jobs sharing the setup in `.github/actions/setup`. The
  Storybook/Chromatic flow lives in `.github/workflows/storybook.yaml` and builds the
  viewer's animation library (`apps/viewer`); under Chromatic capture the story harness
  freezes each story on one deterministic frame.
- The `CLA Check` workflow (`.github/workflows/cla-check.yaml`) fails any pull request whose
  author is not listed in `.github/contributors.md` (bots exempt). Signing is adding your
  username there in your first pull request; see `CONTRIBUTING.md` and `CLA.md`.

## Dev Preferences

- After each change, run `yarn lint`, `yarn typecheck`, `yarn test`, and `yarn format:write`.
- DRY the code when appropriate.
- Always use curly braces after `if` statements.
- Think about adding unit tests for new features and bug fixes. Aim for good coverage on
  critical parsing and reduction logic. Skip unit tests if they would need complicated
  mocking or stubs.
- When a React component file is long, separate subcomponents into their own component files.
- After making a change, think about updating these docs, if applicable:
  - `AGENTS.md` (this file; `CLAUDE.md` only imports it)
  - `ARCHITECTURE.md` (if the change affects architecture)
  - `ROADMAP.md` (tick what the change finishes, or add what it leaves for later)
  - `README.md` in relevant directories
