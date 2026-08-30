# cubicle

> Watch your coding agent work as an animated office of little clones.

`cubicle` is a companion app for terminal coding agents. You run your agent through a
wrapper; a window shows an office where each worker sits at a desk. When the agent reads
files, a worker walks to the archive. When it spawns subagents, new workers file in and
take empty desks. When it wants your approval, someone stands at your desk holding a form
and taps their foot.

It is a toy. It is not a dashboard, not an observability tool, and not a debugger. The
success criterion is that you leave it open because it is pleasant, and that you glance at
it and smile.

Domain: `cubicle.town`. Command: `cubicle`. npm package: `cubicle-town` (the bare
`cubicle` name is squatted by an abandoned package; the installed binary is still
`cubicle`).

---

## 1. Design decisions (locked)

These came out of the design conversation and are not open for casual revision. Everything
downstream depends on them.

| Decision | Choice | Consequence |
|---|---|---|
| **Purpose** | Delight / companion | Abstraction is allowed. Legibility is not the goal. Crowd scenes can be illegible if they are funny. |
| **Time model** | Adaptive lag + sprint | Beats have minimum dwell times; when the queue falls behind, workers visibly sprint and skip. |
| **Launch** | Wrapper only | No auto-spawning from hooks. You opt in per session by typing `cubicle`. |
| **Cast** | Clones + tiny prop | Identical orange blobs. One persistent prop per agent type, one transient prop per activity. |
| **Ambient life** | Rich | Set dressing accretes over a session. Idle wanderers, time-of-day lighting, an office cat. |
| **Text on screen** | Minimal | Nameplates plus rare short bubbles of real strings, truncated to ~20 chars. |
| **Harness support** | Multi, tiered | Claude Code and Codex are both first-class via native hooks. |
| **Renderer** | Local web viewer on PixiJS v8 | Served by the CLI, animated in the browser. No Electron, no game *framework* — Pixi renders, our director stays the engine. ASCII was only ever a placeholder and is dropped. See §6. |

### The one rule that overrides convenience

**The hot path shares no code.** The hook emitter runs once per tool call and its entire
cost is process startup (measured: ~20ms on an M-series Mac, and a bare `node -e 0` costs
the same, so the runtime is irrelevant — spawning is the cost). It must remain a single
zero-import file. Everything interesting happens in the long-running viewer, where sharing
is free.

This is also what keeps the plugin directory self-contained. `--plugin-dir` points at a
directory on disk and marketplace installs are plain git clones, so the plugin must work
with no `node_modules` and no build step. If the emitter imported a workspace package we
would have to commit bundled output. We avoid the entire category of problem by keeping
the seam at the bus.

---

## 2. Architecture

```
  agent process                    cubicle viewer (long-lived)
  ┌──────────────┐
  │  claude/codex│
  │              │   hook fires
  │   PreToolUse ├───────────► emit.mjs ──► bus (JSONL)
  │  PostToolUse │            (zero-dep,        │
  │ SubagentStart│             ~20ms)           │ tail
  └──────────────┘                              ▼
                                         ┌─────────────┐
                                         │  normalize  │  harness payload → cubicle event
                                         ├─────────────┤
                                         │   reduce    │  events → OfficeState
                                         ├─────────────┤
                                         │   direct    │  state + clock → actor beats
                                         ├─────────────┤
                                         │   render    │  PixiJS in the browser   
                                         └─────────────┘
```

Five stages, four of them pure functions. Only `emit` and the bus tail touch I/O.

- **normalize** — harness-specific. Maps a Claude Code or Codex hook payload onto the
  shared event vocabulary (§3). The only place that knows a harness exists.
- **reduce** — `(OfficeState, CubicleEvent) → OfficeState`. Who is employed, who sits
  where, what has accumulated on the floor. No timing, no animation.
- **direct** — the interesting one. Owns the beat queue, minimum dwell times, walk paths,
  and the sprint-catchup behaviour. Takes state plus a clock, emits `Actor[]` with world
  positions and animation keys.
- **render** — dumb. Draws `Actor[]` and set dressing onto a tile grid.

`reduce` and `direct` are pure and renderer-agnostic. That is the whole reason the ASCII
prototype is not throwaway work: swapping the renderer changes one stage out of five.

Between the tail and `normalize` sits a thin reader (`BusReader`) that derives each
event's `seq` from line position — see §3 for why order cannot come from the records
themselves. The tail always reads from line 0 and labels each line catch-up or live: a
late-joining viewer folds catch-up events through `reduce` without animating them, then
animates the live ones. That reconstruct/animate split is decided once, in the follower,
so every consumer inherits it.

### The bus

One JSONL file per wrapper run under `~/.cubicle/sessions/<id>/bus.jsonl`. Its first line
is a `cubicle.session` header written by the CLI before the agent starts; the rest are hook
records. No sidecar metadata file — a recording is one file and stays self-describing when
copied.

Append-only, one compact record per line. Record size is governed by the content policy
(the emitter clips every free-text field), with a 64KB backstop for pathological payloads
— concurrent appends measured torn-line-free up to 256KB per record on a local filesystem,
and the parser drops a torn line if one ever appears. The viewer tails it. Nothing else
writes to it.

Two identities coexist and neither substitutes for the other: a cubicle session is one
wrapper run, a harness session is the agent's conversation. `/clear` starts a new harness
session inside one run; `claude -c` reuses one across runs. Subagents share their parent's
bus, distinguished by `agent_id`.

Choosing a file over a socket buys three things: the emitter needs no connection logic or
retry, a crashed viewer loses nothing, and **every session is automatically a recording**.
That last one matters more than it looks — see §11.

---

## 3. Event model

We adopt the [Agent Client Protocol](https://agentclientprotocol.com) vocabulary rather
than inventing one. ACP is Zed's open standard for agent↔editor communication, adopted by
25+ agents. Its tool-call taxonomy maps onto office stations almost exactly, and using it
means any future ACP-speaking agent is a nearly free adapter.

```ts
type ToolKind   = 'read' | 'edit' | 'delete' | 'move' | 'search'
                | 'execute' | 'think' | 'fetch' | 'other'
type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'
```

The normalized event:

```ts
type CubicleEvent = {
  ts: number                 // emitter wall clock, ms
  kind: EventKind            // see below
  session: string
  turn?: string              // Claude: prompt_id · Codex: turn_id
  worker: string             // 'lead' or a subagent id — which desk this belongs to
  workerType?: string        // agent type, for the nameplate and persistent prop
  tool?: { id?: string; name: string; kind: ToolKind; status: ToolStatus; detail?: string }
  meta?: Record<string, string | number | boolean>   // includes rid, the record's durable id
}

type EventKind =
  | 'session.start' | 'session.end'
  | 'turn.user'     | 'turn.stop'
  | 'worker.start'  | 'worker.stop'
  | 'tool.start'    | 'tool.end'
  | 'approval.request' | 'approval.denied'
  | 'context.compact'
  | 'task.created'  | 'task.completed'
  | 'notify'
```

`worker` is the load-bearing field. It is what assigns a beat to a desk, and it is why
this project works at all — see §4.

**Identity and order are separate, and neither comes from `ts`.** Concurrent hook
processes stamp timestamps independently at millisecond resolution; a real parallel Read
batch produced two records in the same millisecond. So: identity is `rid`, a random id the
emitter stamps per record (random because concurrent processes cannot share a counter
without coordinating in the hot path); order is `seq`, derived by the reader from line
position, valid because the bus is append-only. `tool.id` (the harness's tool_use_id)
pairs a start with its end — a worker can have several calls of the same tool in flight at
once. `ts` is for pacing and lag measurement only. Worked examples live in
`packages/core/fixtures/`, each replayed by CI.

---

## 4. Harness adapters

Both supported harnesses expose remarkably similar hook systems. The shapes converged
independently, which makes the adapter layer thin.

### Capability matrix

Claude Code figures verified directly against the installed binary (2.1.201) on
2026-08-29. Codex figures are from published documentation, not yet tested.

| | Claude Code 2.1.201 | Codex CLI (~v0.150) |
|---|---|---|
| Config format | `hooks.json` in a plugin | `hooks.json` or `[hooks]` in `config.toml` |
| Entry shape | `{matcher, hooks:[{type,command,timeout}]}` | identical |
| Payload transport | JSON on stdin | identical |
| Configurable events | 26 | ~12 |
| Turn correlation | `prompt_id` | `turn_id` |
| Tool events | `tool_name`, `tool_input`, `tool_use_id`, `tool_response`, `duration_ms` | same minus `duration_ms` |
| Subagent lifecycle | `SubagentStart` / `SubagentStop` with `agent_id`, `agent_type` | same |
| **Per-tool subagent attribution** | **Yes** — `agent_id` on every hook fired inside a subagent | **Unverified** — documented only on start/stop |
| Explicit failure event | `PostToolUseFailure` | infer from `tool_response` |
| Notifications | `Notification` | none |
| Todo events | `TaskCreated` / `TaskCompleted` | none |
| Session-scoped injection | `--plugin-dir <path>` | `CODEX_HOME` override, or repeatable `-c` |

### Tool-name mapping

Claude Code has a rich tool vocabulary that maps cleanly:

| Tool | ACP kind | Station |
|---|---|---|
| `Read`, `NotebookEdit` (read) | `read` | Archive |
| `Glob`, `Grep` | `search` | Map wall |
| `Edit`, `Write` | `edit` | Workbench |
| `Bash` | `execute` | Terminal rack |
| `WebFetch`, `WebSearch` | `fetch` | Phone booth |
| `Agent`, `Task` | — | spawns a worker |
| `TodoWrite` | `think` | Whiteboard |
| `Skill`, `Workflow` | `think` | Whiteboard |
| `mcp__*` | `other` | Mail room |

**Codex is coarser and this is a real problem.** Its tool surface is roughly `Bash`,
`apply_patch`, and MCP tools. There is no distinct read or search tool — file reading
happens *inside* shell commands. Left alone, nearly everything on Codex classifies as
`execute` and the office becomes one worker pacing between their desk and the terminal
rack.

Mitigation: parse `tool_input.command` and reclassify. `cat`/`head`/`sed -n` → `read`,
`rg`/`grep`/`fd`/`find` → `search`, `git` → its own station. This is a heuristic and will
be wrong sometimes; for a delight app being wrong occasionally is acceptable in a way it
would not be for an observability tool. Worth stating plainly: **the Codex office is
inherently a duller show than the Claude Code office**, and no amount of adapter work
fixes that, because Codex has no comparable subagent fan-out to fill the desks.

### Why per-tool attribution matters

Claude Code's payload schema documents `agent_id` as: *"Present only when the hook fires
from within a subagent (e.g., a tool called by an AgentTool worker). Absent for the main
thread."* That single field is what lets a `Bash` call from a `code-review` worker land on
the reviewer's desk instead of the lead's. Without it, every beat piles onto one desk and
the office premise collapses into a single busy worker.

If Codex turns out not to carry `agent_id` on tool hooks, the fallback is correlating
through `turn_id` plus subagent start/stop windows — lossy when subagents run
concurrently. **This is the first thing to test when Codex support starts.**

---

## 5. The office

### Cast

Every worker is the same orange blob. Two prop layers give just enough identity without
breaking the clone joke:

- **Persistent prop** by `workerType` — the reviewer always carries a clipboard, `Explore`
  a magnifying glass. Stable across the session so you recognize a returning worker.
- **Transient prop** by current activity — anyone doing `search` picks up a magnifier
  while they do it, then puts it down.

The lead worker is distinguished only by desk position and by being the one who talks to
you. `SessionStart` carries `model`, so the lead can carry a small model-dependent detail.

### Stations

| Station | Triggered by | Animation |
|---|---|---|
| Archive / bookshelf | `read` | Walk over, pull a folder, carry it back |
| Map wall | `search` | Trace a finger across pinned pages |
| Workbench | `edit` | Hammering, sparks |
| Own desk | `execute` | The worker types at their own computer; its little screen scrolls output |
| Phone booth | `fetch` | Picks up a handset, cord stretches |
| Mail room | MCP tools | Loads a pneumatic tube, it thunks away |
| Whiteboard | `think`, task events | Sticky notes appear and get crossed off |
| Reception | `approval.request` | Stands at **your** desk with a form, escalating impatience |
| Box room | `context.compact` | Everyone boxes up papers and carries them off |
| Coffee machine | idle | Loitering, refills |
| The door | session start/end, worker start/stop | Filing in and out |

### The human

There is no keystroke hook and there does not need to be. The window between `turn.stop`
and the next `turn.user` **is** "the agent is waiting on you", and that inference is
exactly right. Your avatar types during it and hands over a note on submit. `notify`
fires when the agent actively wants you.

This covers the single most common state in any real session, which is why it gets the
most animation budget.

### Ambient life

Most wall-clock time in a real session is the agent thinking or you typing. For a
companion app, the idle loop *is* the product, so it gets first-class treatment.

- **Waiting escalates.** Lead leaves their desk, gets coffee, paces, checks the clock,
  eventually naps. The longer you take, the more elaborate it gets.
- **Set dressing accretes.** Paper stacks grow with read count. Pizza boxes appear after
  an hour. Whiteboard fills with stickies. The office *shows* how long and how hard the
  session has been without printing a single number. It survives auto-compaction: the
  `SessionStart(source: "compact")` that compaction fires is bookkeeping, not a new
  office, and the reducer treats it so. `/clear` does reset — a clear is a fresh start,
  and carting the piles away is a good animation.
- **Time-of-day lighting.** Dims at night, desk lamp clicks on. These sessions happen at 1am.
- **Failure is comedy.** A failed tool call sparks a monitor, the worker slumps, the lead
  wanders over to look at their screen.
- **The office remembers.** A small cross-session profile at `~/.cubicle/profile.json` —
  the plant grows, a lifetime mug counter, sessions survived. Companion apps live on
  continuity and this costs almost nothing.

### Time model: adaptive lag + sprint

The hard problem. Real events are bursty and instantaneous; a burst of eight tool calls in
400ms cannot be eight walks to the bookshelf.

```
queue depth        behaviour
──────────────     ────────────────────────────────────────────
0                  idle loop, ambient life
1–3 beats          full dramatization, normal walk speed
> 2s behind        walk speed ramps up, dwell times compress
> 6s behind        workers sprint, intermediate beats coalesce
> 15s behind       teleport to the current station, drop the backlog
```

Falling behind is *visible* and becomes part of the joke rather than a hidden correctness
bug. Coalescing rule: consecutive beats for the same worker at the same station collapse
into one longer beat with a repetition count, so eight reads become one worker at the
archive with a growing stack rather than eight aborted walks.

---

## 6. Rendering

### Tile grid

The office is defined as a **tile grid** (~48 × 18 tiles). Actors hold world positions in
tiles with fractional offsets; the viewer draws 32 px per tile (~1536 × 576 canvas).
Layout, station coordinates, walk targets, and desk slots all live in tile space inside
`packages/core`, never in the renderer.

### The split: dumb server, animated browser

The server lives inside the CLI process — plain `node:http`, zero dependencies:

- `GET /` — the viewer's static bundle, shipped with the CLI the way `plugins/` is
- `GET /api/sessions` — recorded sessions
- `GET /events/:session` — SSE: the bus replayed with catch-up events marked, then live
  events as they land. Payloads are normalized `SequencedEvent`s; this is the only place
  the harness adapter runs.

The browser runs everything animated. `reduce` and the director are pure TS with no node
APIs, so the viewer imports `@agentopia/core` directly:

```
SSE ──► director.ingest(event)        // catch-up folds state, no animation
rAF ──► director.frame()              // ► OfficeFrame { actors, phase, lagMs, dressing }
     ──► renderer.render(frame)       // thin Pixi draw, y-sorted, 32px tiles
```

The director interpolates positions from the injected clock each frame, so 60 fps never
depends on event rate. Running the director in the browser (not the server) is deliberate:
the marketing-site demo embed needs no server at all — it feeds a recorded log to the same
code; every tab animates independently; and the server stays the same dumb pipe a future
cloud relay would consume.

### PixiJS, but no game engine

The renderer is **PixiJS v8**. The decision is driven by art-direction range: the office
should launch as a flat cartoon but may later restyle as pixel art or HD-2D (Octopath-ish
sprites in a lit 2.5D scene). Canvas 2D covers cartoon and pixel but has no path to
shaders; Pixi covers all three — filters, particles, and layered parallax get to
"HD-2D-ish" — for ~100KB gzipped. True perspective HD-2D with real depth-of-field would
mean Three.js and is explicitly out of scope.

A game *framework* (Phaser-class) stays ruled out: it wants to own the loop, the clock,
and scene state, and the director already is the game loop — its injected Clock/Rng is
what makes replay and golden-frame testing possible. Pixi is only a renderer; we drive it
from our own rAF and it holds no game state.

Style is a skin, never a fork: the `OfficeFrame` is style-free (semantic actor states,
tile positions, progress), and the viewer's seam is a `Renderer` interface —
`mount / render(frame) / destroy` — with each style an implementation plus an asset pack.
Restyling is an art project, not a rewrite; the actor-state vocabulary is the stable
contract every style animates.

v1 art is programmatic cartoon — blobs, desks, and props as Pixi Graphics. Crisp at any
zoom, no asset pipeline, in keeping with "identical clones". Sprite sheets slot into the
same seam when real art arrives.

### Not Electron

Electron ships ~150MB of Chromium plus signing and auto-update machinery — for a toy. The
CLI is already a long-lived process; serving `localhost` gets a second monitor, a phone on
the LAN, and the marketing embed for free. `chrome --app=http://localhost:7777` gives a
chrome-less companion window; Tauri (~3MB) wraps the same web build if a native shell is
ever wanted. Either way the renderer is unchanged.


## 7. The CLI

`cubicle` is a **prefix command**, like `time` or `nohup`:

```bash
cubicle claude --effort xhigh
cubicle codex --model gpt-5
```

The first argument is the agent to launch. Neutral naming made this possible and it is
much nicer than a `--harness` flag.

What it does:

1. Mint a session directory and bus file.
2. Detect the harness from argv[0] and inject hooks for it —
   Claude Code via `--plugin-dir`, Codex via a `CODEX_HOME` overlay or repeated `-c`.
3. Export `CUBICLE_BUS` so the emitter knows where to write.
4. Start the local server (viewer bundle + SSE) and print the URL.
5. Spawn the agent, passing through every remaining argument, stdio untouched.
6. On exit, tear the viewer down and keep the bus file for replay.

Subcommands (built): `cubicle tail [session]` streams normalized events — it accepts
either a cubicle session id or a harness session uuid, since the mapping is N:M;
`cubicle sessions` lists recordings with both identities; `cubicle doctor` verifies the
wiring, including that the emitter has no non-builtin imports; and
`cubicle watch --replay [N]` re-animates a finished recording at N x speed (long quiet
gaps capped), the viewer's `?replay=N` doing the work.

**The Codex `CODEX_HOME` catch:** that variable relocates the entire config directory,
including auth and session state, so the wrapper must seed or symlink credentials into the
overlay rather than pointing at a bare temp directory. This is the fiddliest part of Codex
support and should be prototyped before committing to the approach; the repeatable `-c`
flag is the fallback.

---

## 8. Repo layout

The repo was created from `tuliren/turbo-template`, which is a kitchen-sink template. Most
of it is not needed, and some of it is needed *later*.

### Target layout

```
cubicle/
├── apps/
│   ├── web/            # cubicle.town — marketing, embeds the real viewer on a demo log
│   ├── docs/           # Nextra docs
│   ├── cli/            # the `cubicle` binary → npm `cubicle-town`
│   └── viewer/         # web viewer, builds to static assets the CLI serves
├── packages/
│   ├── core/           # events, adapters, reducer, stations, director — pure, no I/O
│   ├── lib/            # shared React (marketing site + viewer)
│   ├── eslint-config/
│   ├── jest-presets/
│   └── typescript-config/
└── plugins/              # one dir per harness, NOT a workspace, NOT build output
    ├── claude/           # built
    │   ├── .claude-plugin/plugin.json
    │   └── hooks/        # hooks.json + emit.mjs (zero imports)
    └── codex/            # phase 3; emit.mjs duplicated, kept byte-identical by a test
```

`plugins/` is deliberately outside the workspace graph. Each harness directory is
hand-written source that must run standalone from a git clone. Do not let it become a build
target. The emitter is duplicated per harness rather than shared, because a marketplace
install may extract only one harness subtree.

### Template surgery

**Cut now** — these carry CI, lint, and typecheck cost for nothing:

- `apps/chrome` — Chrome extension. No use here.
- `apps/backend` — FastAPI / Poetry. Adds Python to a Node project.
- `packages/database` — Prisma. There is no database in v1.
- In `turbo.json`: the `db:generate` / `db:deploy` / `db:migrate` tasks, the
  `^db:generate` dependencies on `dev` / `build` / `integrationTest`, and the
  `DATABASE_URL` / Clerk entries in `globalEnv`.
- In `apps/web`: the `@clerk/nextjs` and `@agentopia/database` dependencies. The marketing site
  is static.
- Root `package.json`: rename `turbo-template` → `cubicle`.

They are all recoverable from the initial commit, and this is not a loss — **the backend,
database, and Clerk auth are precisely what the cloud phase needs** (§11). They are parked
in git history, not deleted forever.

**Keep**: `apps/web`, `apps/docs`, `packages/lib`, and the three config packages. Jest is
the established test runner via `packages/jest-presets`; stay with it rather than
introducing vitest.

---

## 9. Roadmap

### Phase 0 — skeleton ✅ (PR #1)

Template surgery per §8. Stub `packages/core` with the event types and an empty reducer.
Get `yarn lint`, `yarn typecheck`, `yarn test` green on the trimmed tree.

### Phase 1a — event pipeline, Claude Code only ✅ (PR #2)

The plugin, the emitter, the bus, the normalize seam, and the CLI (`run`/`tail`/
`sessions`/`doctor`). Verified against real sessions: per-desk attribution confirmed on a
live subagent run, and the parallel-batch recording drove the identity/order design (§3).

### Phase 1b — the office engine

`stations.ts` (tile-grid layout, desk slots, tool-kind → station mapping) and the
director (per-worker beat queues, dwell minimums, coalescing, adaptive lag + sprint,
idle behaviour) in `packages/core`. Pure and deterministic; tested by replaying the
fixtures through it and snapshotting `OfficeFrame`s at a fixed clock.

### Phase 1c — server + viewer ✅

The CLI serves the viewer bundle plus the SSE stream; the browser runs the director and a
canvas 2D draw loop. `cubicle claude` prints the URL and the office animates a real
session.

Done when: a real working session is watchable end to end, a burst of parallel subagents
produces a legible sprint-and-catch-up, and the idle loop holds attention for five minutes.

### Phase 2 — polish and reach

`chrome --app` launch path for the companion-window feel; the marketing site embeds the
viewer running a recorded demo log; ambient richness (accretion, lighting, the cat) grows
here.

### Phase 3 — Codex adapter

Second normalizer, Codex hook manifest, `CODEX_HOME` overlay in the wrapper, and the
shell-command reclassification heuristic. First task is verifying whether `agent_id` is
present on Codex tool hooks (§4) — the answer determines how good Codex support can be.

### Phase 4 — cloud

Deferred indefinitely. See §11 for the single architectural note worth remembering.

### Explicitly out of scope for v0

Many-desk overflow layout beyond ~8 workers, multi-session views, clicking anything,
sound, and any form of writing back to the agent.

---

## 10. Testing

This project is unusually testable, and that is a deliberate consequence of the
architecture rather than a happy accident.

- **`reduce` and `direct` are pure.** Unit test them directly with synthetic event streams.
- **Every session is a recording.** The bus file *is* a fixture. Five scenario fixtures
  distilled from real recordings live in `packages/core/fixtures/` — simple session,
  subagent delegation, a parallel batch with colliding timestamps, `/clear`, approval +
  failure — each documented and replayed by CI so the examples cannot rot.
- **Golden-frame snapshots.** Replay a fixture through the director at a fixed clock and
  snapshot the `OfficeFrame`s. Renderer-independent, so art churn never breaks them, and
  any future renderer has a reference to draw against.

**Hard requirement this implies:** `direct` must take an **injected clock and a seeded
RNG**. If it reads `Date.now()` or bare `Math.random()`, snapshot testing and reproducible
replay are both impossible. Design it in from the first commit; retrofitting determinism is
miserable.

---

## 11. Cloud — deferred

**Not in scope. Nothing in phases 0–3 should be shaped around it.** Recorded only so the
one decision that would be expensive to reverse is written down.

If a cloud version ever happens, the emitter does not change and does not learn about the
network. It keeps writing to the local bus, and **the local server relays to the cloud**.
The server is already long-lived, already tailing the bus, and already the only component
holding session state — so it is the natural place for batching, retry, and
store-and-forward. An outage or a slow network then cannot touch the agent's critical
path, because nothing in that path ever makes a network call.

That is the whole design note. It falls out of the architecture in §2 for free, which is
why no work is needed now.

The cut `apps/backend`, `packages/database`, and Clerk (§8) are what this phase would want,
which is another reason to park them in git history rather than agonize over the deletion.

---

## 12. Open questions and risks

| Item | Impact | Notes |
|---|---|---|
| Does Codex carry `agent_id` on tool hooks? | **High** — determines whether the Codex office has more than one occupied desk | Untestable here; Codex is not installed. First task of phase 3. |
| `CODEX_HOME` relocates auth and session state | Medium | Wrapper must seed/symlink credentials. Fallback is repeatable `-c`. Prototype before committing. |
| Hook overhead at high tool volume | **Decided: stay synchronous** | Measured 23.6ms/event end to end (spawn dominates; the emitter's own work is ~5ms). `async: true` exists in the hook config, but synchronous hooks are what make file order ≈ causal order — async would let a `tool.end` land before its `tool.start`, permanently sticking a worker at a station. ≤~47ms per tool call, overlapped for parallel calls, is the price of ordering, and it is invisible against real tool latency. |
| Hook APIs are moving fast | Medium | Codex hooks did not exist a few months ago; a cross-harness architecture doc I read still claims Codex has no native hooks. Pin versions, feature-detect, fail soft. |
| Mid-join in-flight tools invisible | Low, queued | `reconstruct()` ignores `workers[*].tools`, so a worker mid-tool at join sits at their desk until the next event. The reduced state already holds everything needed; director-only fix, tracked as a follow-up task. |
| Layout beyond ~8 workers | Medium | `cubicle` tiles, which is why the name helps — but a real answer is needed for 20+. Deferred past v0. |
| Browser tab gets lost among tabs | Low | `chrome --app` mode; Tauri shell if it ever matters. |
| npm name | Low | `cubicle` is squatted by an abandoned package. Ship `cubicle-town` (or an `@cubicle` scope) with binary `cubicle`. |

---

## Appendix A — verified hook facts

Verified directly against the installed Claude Code binary (2.1.201) on 2026-08-29 by
reading its embedded payload schemas. Recorded here because it was non-trivial to obtain
and is not fully documented publicly.

**All 26 configurable events:** `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
`PostToolBatch`, `PermissionDenied`, `Notification`, `UserPromptSubmit`,
`UserPromptExpansion`, `SessionStart`, `SessionEnd`, `Stop`, `StopFailure`,
`SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `PermissionRequest`,
`Setup`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Elicitation`,
`ElicitationResult`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`.

**Common fields on every payload:** `session_id`, `transcript_path`, `cwd`, `prompt_id`
(optional), `permission_mode` (optional), `agent_id` (optional), `agent_type` (optional).

`agent_id` is documented in the schema as *"Present only when the hook fires from within a
subagent (e.g., a tool called by an AgentTool worker). Absent for the main thread, even in
--agent sessions. Use this field (not agent_type) to distinguish subagent calls from
main-thread calls."*

**Per-event additions:**

| Event | Fields |
|---|---|
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` |
| `PostToolUse` | + `tool_response`, `duration_ms` |
| `UserPromptSubmit` | `prompt`, `session_title` |
| `SessionStart` | `source` (`startup`\|`resume`\|`clear`\|`compact`), `model`, `session_title` |
| `SessionEnd` | `reason` |
| `Stop` | `stop_hook_active`, `last_assistant_message`, `background_tasks` |
| `SubagentStop` | `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message` |
| `SubagentStart` | `agent_id`, `agent_type` |
| `Notification` | `message`, `title`, `notification_type` |
| `PreCompact` | `trigger` (`manual`\|`auto`), `custom_instructions` |
| `PostCompact` | `trigger`, `compact_summary` |
| `TaskCreated` / `TaskCompleted` | `task_id`, `task_subject`, `task_description`, `teammate_name` |
| `PermissionRequest` | `tool_name`, `tool_input`, `permission_suggestions` |

**Measured on this machine:** hook process spawn ≈ 20ms. A bare `sh` script and a bare
`node -e 0` cost the same, so the cost is process creation, not the runtime. Node is
therefore free to use for the emitter.

**Session-scoped plugin injection:** `claude --plugin-dir <path>` loads a plugin for one
session only, repeatable. This is what makes the wrapper work without touching global
settings.

---

## Appendix B — prior art

- [Agent Client Protocol](https://agentclientprotocol.com) — Zed's agent↔editor standard.
  Source of our event vocabulary. 25+ agents, JSON-RPC over stdio.
- [Codex hooks documentation](https://learn.chatgpt.com/docs/hooks) — the Codex hook
  system, near-identical in shape to Claude Code's.
- [Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) —
  closest existing thing. Dual native hooks for Claude Code and Codex, SQLite, React over
  WebSocket/SSE. A dashboard rather than a toy, but validates the ingestion architecture.
- [coder/agentapi](https://github.com/coder/agentapi) — drives ~11 agents by terminal
  emulation. The universal bottom tier if we ever need a harness with no hooks.
- [wshobson/agents](https://github.com/wshobson/agents) — multi-harness plugin marketplace.
  Source of the "adapters should stay thin, no lowest-common-denominator translation"
  discipline adopted in §4.
