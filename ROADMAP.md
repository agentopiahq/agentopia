# Roadmap

What is built and what is next. The design behind it is in `ARCHITECTURE.md`. Tick an item
in the PR that finishes it.

## Phase 0 — skeleton

- [x] Strip the template to the skeleton: lint, typecheck and test green (#1)

## Phase 1 — the office, Claude Code only

- [x] Event pipeline: plugin, zero-import emitter, bus, normalize seam, and the CLI's
      `claude` / `tail` / `sessions` / `doctor` (#2, #3)
- [x] Office engine: stations, director, beat queues, adaptive lag (#5, #7)
- [x] Office server and Pixi viewer, with SSE from the bus (#8)
- [x] Replay a bus file in the viewer; live scrubber; session names in the page title (#11, #12, #13)
- [x] One office for every live session (#17)

## Phase 2 — polish and reach

The office:

- [x] Per-event choreography and the Storybook animation library (#14)
- [x] The Claude character rig and its sheet (#16, #19, #25)
- [x] The office as a hand-inked isometric sheet, zoned like a real one (#18, #20)
- [x] Walks routed round the furniture (#21, #41)
- [x] Clickable objects: doors, blinds, drawers, screens, the sprint board (#22)
- [x] Leads seated in desk chairs, avatars on sofas and café chairs (#24, #32, #34)
- [x] Session titles on desks (#27)
- [x] Idle life: four avatars about, with idle activities (#28)
- [x] The office cat and dog (#35)
- [x] A cat tower the cat climbs, naps on, scratches and plays at (#57)
- [x] The usage board, from each agent's own records (#37)
- [x] The human replaces the wall speaker (#38)
- [x] San Francisco through the windows, with weather and a day–night sky (#40)
- [x] A time-lapse sky: a day every real hour, weather every ten minutes, the moon in its phases
- [x] A settings key with a daylight bar to scrub, set and reset the sky's time
- [x] A weather section in the settings: pick any weather for the rest of the current spell
- [x] Clear a desk by hand, and keep long-quiet sessions off a freshly opened floor (an archived thread fires no hook)
- [ ] Draw accreted set dressing: paper stacks by reads, stickies by tasks, pizza boxes
      by time (the reducer already keeps the tallies)
- [ ] Night lighting indoors: the office dims and desk lamps click on
- [ ] The office remembers: a cross-session profile in `~/.agentopia/profile.json` (a
      plant that grows, a lifetime mug counter)

Reach:

- [x] The website plays the real office, full-window, with the footer in its corners
      (#23, #39, #42, #43)
- [ ] Publish the CLI to npm (with the viewer and plugins bundled): `@agentopia/cli` and
      the `agentopia-town` alias are packaged and the Release workflow is in place; the
      first release ships when its "Version packages" pull request merges
- [ ] A plugin marketplace for `claude plugin install`
- [ ] Auto-launch the office from a `SessionStart` hook, with a lock so `watch` never
      starts twice
- [ ] Open the office as a companion window (`chrome --app`)

## Phase 3 — Codex

- [x] Carry each session's harness from the hook to the screen: per-desk choreography,
      per-harness skins, and an "Adding a harness" checklist in `AGENTS.md` (#44)
- [ ] Find out whether Codex sends `agent_id` on its tool hooks. It decides whether a Codex
      office ever has helpers at the desk, so it comes first.
- [ ] `plugins/codex`: the emitter copy and Codex's hook wiring
- [ ] Inject the hooks for one run: a `CODEX_HOME` overlay that seeds credentials, or
      repeated `-c` as the fallback. Prototype before committing.
- [ ] The Codex event adapter, reclassifying shell commands (`cat` → read, `rg` → search,
      `git` → its own) so the office is not all `execute`
- [ ] Codex's choreography registry and skin
- [ ] A recorded Codex bus fixture
- [ ] Optional: Codex usage on the usage board

## Phase 4 — cloud

Deferred indefinitely. `ARCHITECTURE.md` §10 has the one design note worth keeping.

## Known issues

- [ ] A worker mid-tool when the viewer joins sits at its desk until its next event:
      `reconstruct()` ignores `workers[*].tools`. A director-only fix.
- [ ] More than eight live sessions: a ninth waits for a free desk. A bigger floor is a
      layout change in `stations.ts`, not an engine change.

## Out of scope

Sound, and any form of writing back to the agent.
