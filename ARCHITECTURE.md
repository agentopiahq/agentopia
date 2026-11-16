# agentopia

> Watch your coding agent work as an animated office of little clones.

`agentopia` is a companion app for terminal coding agents. Its hooks record every session
to a local bus file; a window shows one open-plan office where every live session has a
lead worker at a desk, typing at a big monitor. When a session spawns subagents, helpers
file in through the door, get briefed at the lead's desk, and work beside it. When a
session wants your approval, its lead walks over to you (the human on the sofa) and asks. When a
session goes quiet its lead naps, then leaves, and the desk is free for the next one.

It is a toy. It is not a dashboard, not an observability tool, and not a debugger. The
success criterion is that you leave it open because it is pleasant, and that you glance at
it and smile.

This document is the design: the decisions, the architecture and why it is shaped this way.
Some of what it describes is still to be built; `ROADMAP.md` tracks what is done and what
is next.

Domain: `agentopia.town`. Command: `agentopia`. npm package: `agentopia-town` (the bare
`agentopia` name is squatted by an abandoned package; the installed binary is still
`agentopia`).

---

## 1. Design decisions (locked)

These came out of the design conversation and are not open for casual revision. Everything
downstream depends on them.

| Decision            | Choice                        | Consequence                                                                                                                                                                           |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Delight / companion           | Abstraction is allowed. Legibility is not the goal. Crowd scenes can be illegible if they are funny.                                                                                  |
| **Time model**      | Adaptive lag, never cut       | Every beat plays in full, pre and post included. Falling behind is shown, not hidden: repeats coalesce, walks hurry, and a worker with a backlog sweats.                              |
| **Launch**          | Hooks record, `watch` shows   | Hooks (via the wrapper, or installed in settings) record every session. One `agentopia watch` shows all live sessions in one office; nothing is spawned per session.                  |
| **Cast**            | Clones + tiny prop            | Identical orange blobs. One persistent prop per agent type, one transient prop per activity.                                                                                          |
| **Ambient life**    | Rich                          | Set dressing accretes over a session. Idle wanderers, time-of-day lighting, an office cat.                                                                                            |
| **Text on screen**  | Minimal                       | Nameplates plus rare short bubbles of real strings, truncated to ~20 chars.                                                                                                           |
| **Harness support** | Multi, tiered                 | Claude Code and Codex are both first-class via native hooks.                                                                                                                          |
| **Renderer**        | Local web viewer on PixiJS v8 | Served by the CLI, animated in the browser. No Electron, no game _framework_ — Pixi renders, our director stays the engine. ASCII was only ever a placeholder and is dropped. See §6. |

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
  agent process                    agentopia viewer (long-lived)
  ┌──────────────┐
  │  claude/codex│
  │              │   hook fires
  │   PreToolUse ├───────────► emit.mjs ──► bus (JSONL)
  │  PostToolUse │            (zero-dep,        │
  │ SubagentStart│             ~20ms)           │ tail
  └──────────────┘                              ▼
                                         ┌─────────────┐
                                         │  normalize  │  harness payload → agentopia event
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
- **reduce** — `(OfficeState, AgentopiaEvent) → OfficeState`. Who is employed, who sits
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

The server tails _every_ live bus, not one. Each sequenced event is tagged with the bus it
came from (`SequencedEvent.bus`), and that tag is what the office keys a desk on: one bus
is one agent process is one lead. Office state is a map of per-session states, and the
per-session reducer is unchanged — a `session.start` still wipes its own session, never
another's.

### The bus

One JSONL file per wrapper run under `~/.agentopia/sessions/<id>/bus.jsonl`. Its first line
is a `agentopia.session` header written by the CLI before the agent starts; the rest are hook
records. No sidecar metadata file — a recording is one file and stays self-describing when
copied.

Append-only, one compact record per line. Record size is governed by the content policy
(the emitter clips every free-text field), with a 64KB backstop for pathological payloads
— concurrent appends measured torn-line-free up to 256KB per record on a local filesystem,
and the parser drops a torn line if one ever appears. The viewer tails it. Nothing else
writes to it.

Two identities coexist and neither substitutes for the other: an agentopia session is one
wrapper run, a harness session is the agent's conversation. `/clear` starts a new harness
session inside one run; `claude -c` reuses one across runs. Subagents share their parent's
bus, distinguished by `agent_id`.

Hooks run **synchronously**, on purpose. Measured end to end, an event costs 23.6ms (the
spawn dominates; the emitter's own work is ~5ms). `async: true` exists in the hook config,
but synchronous hooks are what make file order ≈ causal order: async would let a `tool.end`
land before its `tool.start`, permanently sticking a worker mid-tool. Up to ~47ms per tool
call, overlapped for parallel calls, is the price of ordering, and it is invisible against
real tool latency.

Choosing a file over a socket buys three things: the emitter needs no connection logic or
retry, a crashed viewer loses nothing, and **every session is automatically a recording**.
That last one matters more than it looks — see §10.

---

## 3. Event model

We adopt the [Agent Client Protocol](https://agentclientprotocol.com) vocabulary rather
than inventing one. ACP is Zed's open standard for agent↔editor communication, adopted by
25+ agents. Its tool-call taxonomy maps onto office stations almost exactly, and using it
means any future ACP-speaking agent is a nearly free adapter.

```ts
type ToolKind =
  'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'other';
type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
```

The normalized event:

```ts
type AgentopiaEvent = {
  ts: number; // emitter wall clock, ms
  kind: EventKind; // see below
  session: string;
  turn?: string; // Claude: prompt_id · Codex: turn_id
  worker: string; // 'lead' or a subagent id — which desk this belongs to
  workerType?: string; // agent type, for the nameplate and persistent prop
  tool?: { id?: string; name: string; kind: ToolKind; status: ToolStatus; detail?: string };
  meta?: Record<string, string | number | boolean>; // includes rid, the record's durable id
};

type EventKind =
  | 'session.start'
  | 'session.end'
  | 'turn.user'
  | 'turn.stop'
  | 'worker.start'
  | 'worker.stop'
  | 'tool.start'
  | 'tool.end'
  | 'approval.request'
  | 'approval.denied'
  | 'context.compact'
  | 'task.created'
  | 'task.completed'
  | 'notify';
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

|                               | Claude Code 2.1.201                         | Codex CLI (~v0.150)                        |
| ----------------------------- | ------------------------------------------- | ------------------------------------------ |
| Config format                 | `hooks.json` in a plugin                    | `hooks.json` or `[hooks]` in `config.toml` |
| Entry shape                   | `{matcher, hooks:[{type,command,timeout}]}` | identical                                  |
| Payload transport             | JSON on stdin                               | identical                                  |
| Configurable events           | 26                                          | ~12                                        |
| Turn correlation              | `prompt_id`                                 | `turn_id`                                  |
| Tool                          | ACP kind                                    | Staged as                                  |
| ----------------------------- | ---------                                   | ------------------                         |
| `Read`, `NotebookEdit` (read) | `read`                                      | typing at the desk                         |
| `Glob`, `Grep`                | `search`                                    | typing at the desk                         |
| `Edit`, `Write`               | `edit`                                      | typing at the desk                         |
| `Bash`                        | `execute`                                   | typing at the desk                         |
| `WebFetch`, `WebSearch`       | `fetch`                                     | typing at the desk                         |
| `Agent`, `Task`               | —                                           | spawns a helper                            |
| `TodoWrite`                   | `think`                                     | typing at the desk                         |
| `Skill`, `Workflow`           | `think`                                     | typing at the desk                         |
| `mcp__*`                      | `other`                                     | typing at the desk                         |

Every kind is typed at the desk, with the tool and its detail on the monitor; the kind
survives into the event so a renderer can still tell them apart by prop. Compaction is
not a tool: `PreCompact` / `PostCompact` become `context.compact` / `context.compacted`,
which is what sends a session to the cabinets.

**Codex is coarser and this is a real problem.** Its tool surface is roughly `Bash`,
`apply_patch`, and MCP tools. There is no distinct read or search tool — file reading
happens _inside_ shell commands. Left alone, nearly everything on Codex classifies as
`execute` and the office becomes one worker pacing between their desk and the terminal
rack.

Mitigation: parse `tool_input.command` and reclassify. `cat`/`head`/`sed -n` → `read`,
`rg`/`grep`/`fd`/`find` → `search`, `git` → its own station. This is a heuristic and will
be wrong sometimes; for a delight app being wrong occasionally is acceptable in a way it
would not be for an observability tool. Worth stating plainly: **the Codex office is
inherently a duller show than the Claude Code office**, and no amount of adapter work
fixes that, because Codex has no comparable subagent fan-out to fill the desks.

### Why per-tool attribution matters

Claude Code's payload schema documents `agent_id` as: _"Present only when the hook fires
from within a subagent (e.g., a tool called by an AgentTool worker). Absent for the main
thread."_ That single field is what lets a `Bash` call from a `code-review` worker land on
the reviewer's desk instead of the lead's. Without it, every beat piles onto one desk and
the office premise collapses into a single busy worker.

If Codex turns out not to carry `agent_id` on tool hooks, the fallback is correlating
through `turn_id` plus subagent start/stop windows — lossy when subagents run
concurrently. **This is the first thing to test when Codex support starts.**

---

## 5. The office

### Cast

One office, every live session. The office is open plan — no walls, no rooms — with six
desks. Each live session gets one **lead** at one desk, and that desk is the lead's home
for the whole session: its nameplate is the harness's own session name, and its badge
shows the session's phase (working, waiting on you, needs approval) the instant the state
changes, however far behind the animation is. A seventh live session waits for a desk;
the next one freed goes to whichever waiting session was active most recently.

Every worker is the same orange blob. Two prop layers give just enough identity without
breaking the clone joke:

- **Persistent prop** by `workerType` — the reviewer always carries a clipboard, `Explore`
  a magnifying glass. Stable across the session so you recognize a returning worker.
- **Transient prop** by current activity — anyone doing `search` picks up a magnifier
  while they do it, then puts it down.

**Subagents are helpers, not tenants.** A subagent walks in through the door, goes to its
lead's desk, gets briefed (a short two-way `talking` beat), and then works standing at one
of three helper spots around that desk. At most three are animated per desk; the desk's
`+N` tag counts every subagent the session has running, drawn or not.

### The floor

All tool work happens at the desk. The old walk-to-a-station stations are gone: whatever
the tool kind, the worker types at the desk's big monitor, and the monitor shows what is
being run, scrolling. The rest of the floor is furniture with a job:

| Piece               | Where                                            | Used by                                                                              |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Desks with monitors | Two rows of three across the middle              | Every tool call; the monitor scrolls the command                                     |
| The human (you)     | A sofa, the armchair, or the floor by the window | `turn.user` (you speaking) and `approval.request` (the lead walks over and asks)     |
| Two printers        | Top middle                                       | Dressing for now                                                                     |
| Usage board         | On the back wall, over the copier and printer    | Today's API-rate cost, the week in bars, today's spend by agent; a click opens the ledger |
| Two copiers         | Top right, beside the printers                   | Dressing for now                                                                     |
| Shutter             | Far top right, beside the copiers                | Dressing for now                                                                     |
| File cabinets       | Three along the left wall, three along the right | `context.compact`: the session files its papers away in the cabinet nearest its desk |
| The door            | Bottom left, a real door with a frame            | Leads and helpers arriving and leaving                                               |

### The human

You are in the office, as one human avatar after the project's reference cartoon (a mop
of dark hair, a black hoodie, dark jeans, white socks), drawn by `humanRig.ts` and
moved by core's `human.ts`. Most of the time you sit on a sofa or in a chair; now and
then on the floor against the window wall, hugging your knees. When a prompt lands
(`turn.user`) the human says it (the prompt goes up in a bubble, a finger pointing) and
the session's lead gets to work; an `approval.request` walks the lead over to wherever
the human is sitting (the `human` station) to ask, and the human thinks it over. The
human never moves while a lead is on its way over. There is no keystroke hook, and there
does not need to be: the human was the speaker on the wall until it was replaced. The window between `turn.stop` and the next `turn.user` **is** "this
session is waiting on you", and it shows on the desk badge immediately. With several
sessions live, several desks can wait on you at once, which is exactly the signal you
opened the office for.

### Ambient life

Most wall-clock time in a real session is the agent thinking or you typing. For a
companion app, the idle loop _is_ the product, so it gets first-class treatment.

- **Quiet sessions rest, then leave.** A lead with no events for a while naps at its desk;
  after longer still it walks out the door and the desk is emptied for the next session.
  If the session wakes up again it comes back in — to its old desk if that desk is still
  free, otherwise to any free one. A desk is never reserved for a lead that may never
  return. `session.end` sends the lead out as soon as its queued beats finish. Not every
  ending says so: archiving a Claude Code thread fires no hook and leaves its process
  running, so neither `SessionEnd` nor a liveness check can tell. For those, a desk can be
  cleared by hand (`Director.dismiss`): the session leaves as if it had gone quiet and is
  held off the floor until something newer than its last event arrives. The viewer
  remembers what it cleared and hands it back to a fresh director before catch-up.
- **The office is never empty.** With idle life on (the floor view), the office keeps
  four avatars about at all times: residents, who belong to no session, make up the
  numbers. A new session's lead is a resident who walks over to the desk; a lead whose
  session ends stays on as a resident while the office is short. Every idle avatar —
  residents, and leads quiet between turns for `LEAD_IDLE_AFTER_MS` — picks activities
  from `IDLE_ACTIVITIES` (`packages/core/src/idle.ts`) at random, for random lengths,
  never the same twice running: the meeting room, the sprint board, a book or a nap on
  the sofa, a snack, a drink, a coffee brewed and drunk at the café, a nap at a desk,
  pacing, the window, the plants, a blind pulled up or down, and chats in pairs that take
  turns to talk. The list is the extension point; the director knows no activity by name.
  Idle life is filler, never a beat: the first event calls a lead straight back.
- **The office pets.** A cat and a dog live on the floor whenever idle life is on
  (`idleLife.pets`). Each picks activities from `PET_ACTIVITIES`
  (`packages/core/src/pets.ts`) the same way an idle avatar does — eating and drinking at
  their own bowls by the kitchen, napping in the sun or (the dog) in its bed, sitting at
  the window, wandering, visiting or tagging along after an avatar, playing, stretching,
  and for the cat washing and perching up on the bookshelf or a cabinet. `PetLife`
  (`petLife.ts`) runs them on a chance stream of their own; no beat waits for a pet and
  pets never plan a spot an avatar has claimed.
- **Set dressing accretes** (the reducer keeps the tallies; the viewer does not draw them
  yet). Paper stacks grow with read count. Pizza boxes appear after
  an hour. Whiteboard fills with stickies. The office _shows_ how long and how hard the
  session has been without printing a single number. It survives auto-compaction: the
  `SessionStart(source: "compact")` that compaction fires is bookkeeping, not a new
  office, and the reducer treats it so. `/clear` does reset — a clear is a fresh start,
  and carting the piles away is a good animation.
- **Time-of-day lighting.** The sky through the windows runs a time-lapse day every hour
  of the wall clock, midnight on the hour and noon at half past, with a moon in its phases
  (`sky.ts`); the wall clock keeps real time. The office itself dimming at night, desk lamps clicking on, is still to come.
  These sessions happen at 1am.
- **Failure is comedy.** A failed tool call sparks a monitor, the worker slumps, the lead
  wanders over to look at their screen.
- **The office remembers** (not built yet). A small cross-session profile at `~/.agentopia/profile.json` —
  the plant grows, a lifetime mug counter, sessions survived. Companion apps live on
  continuity and this costs almost nothing.

### Time model: adaptive lag, never cut

The hard problem. Real events are bursty and instantaneous; a burst of eight tool calls in
400ms cannot be eight separate performances.

The rule is that **no beat is ever cut short**. Every event's pre, main and post play in
full, and the next event queues behind them. Two things keep the queue honest:

- **Coalescing.** Consecutive beats for the same worker at the same spot collapse into one
  longer beat with a repetition count, so ten reads become one longer session at the
  monitor rather than ten aborted ones.
- **The badge is instant.** The desk badge reads from reduced state, which is updated the
  moment an event arrives. "Waiting on you" shows immediately even while the lead is still
  acting out the last few tool calls.

```
backlog            behaviour
──────────────     ────────────────────────────────────────────
0                  idle loop, ambient life
< 2s behind        full dramatization, normal walk speed
> 2s behind        walks hurry; dwell minimums never compress
> 6s behind        workers sprint between spots
> 8s behind        once the beat that is playing has finished, the queue collapses
                   to its newest beat — the middle is skipped, the current is not
growing            the worker sweats: drops appear around its head, more often the
                   further behind it is, and the smile goes
```

Falling behind is _visible_ and part of the joke rather than a hidden correctness bug.

---

## 6. Rendering

### Tile grid

The office is defined as a **tile grid** (22 × 22 tiles). Actors hold world positions in
tiles with fractional offsets; the viewer draws 32 px per tile. Layout — desk seats, helper
spots, the furniture, the human's spots and the door — lives in tile space inside
`packages/core`, never in the renderer.

### The split: dumb server, animated browser

The server lives inside the CLI process — plain `node:http`, zero dependencies:

- `GET /` — the viewer's static bundle, shipped with the CLI the way `plugins/` is
- `GET /api/sessions` — recorded sessions, with when each was last written and whether it
  has ended
- `GET /api/usage` — token usage and its API-rate cost, by day, week and month, and within
  each by harness, agent, project, session and model (§6, Usage). The server's one outbound request
  is the models.dev price list behind it, at most daily, and it works without it
- `GET /events` — SSE, every live bus multiplexed on one stream (not ended, and written
  within `IDLE_LEAVE_MS`: `FLOOR_WINDOW_MS`, since the office would already have walked a
  quieter one out and harnesses do not always say goodbye): each is replayed with
  catch-up events marked, then live events as they land, and buses that appear later are
  picked up. Every payload is a normalized `SequencedEvent` tagged with its `bus`. One
  stream rather than one per session because browsers cap open connections per host at
  about six, and each stream holds one. This is the only place the harness adapter runs.
- `GET /events?session=<id>` — the same for one bus, which is what the scrubber and
  replay need: a recording is one file.

The server tails each bus on its own poll timer and backs the timer off for buses that
stop growing, so fifty quiet recordings cost nothing.

The browser runs everything animated. `reduce` and the director are pure TS with no node
APIs, so the viewer imports `@agentopia/core` directly:

```
SSE ──► director.ingest(event)        // catch-up folds state, no animation
rAF ──► director.frame()              // ► OfficeFrame { actors, desks, human, lagMs, pets }
     ──► renderer.render(frame)       // thin Pixi draw, y-sorted, 32px tiles
```

The director interpolates positions from the injected clock each frame, so 60 fps never
depends on event rate. Running the director in the browser (not the server) is deliberate:
the marketing-site demo embed needs no server at all — it feeds a recorded log to the same
code; every tab animates independently; and the server stays the same dumb pipe a future
cloud relay would consume.

### Usage: read from each agent's records, not the hooks

No hook carries a token count, so the usage board does not come from the bus. Claude Code
writes `message.usage` on every assistant message in its own JSONL transcripts
(`~/.claude/projects/<project>/<session>.jsonl`, a subagent's beside it under
`<session>/subagents/`, workflow agents a folder further down) — the files ccusage reads.
The office server follows them the way it follows buses: it remembers how far it has read
each file and reads only what was appended (the first read of a few gigabytes takes a few
seconds, once per server), skips lines without usage unparsed, and keeps one entry per
`message.id` + `requestId`, since one response is written as a line per content block and a
resumed session copies earlier lines into its new transcript. `CLAUDE_CONFIG_DIR` points it
elsewhere, as for ccusage.

Usage is per harness, in the same two halves as events. The pure half is a `UsageAdapter`
(`packages/core/src/usage/adapters/`): one line of the harness's records to a usage entry or
a session title, priced from the harness's own `PriceTable`. The I/O half is a `UsageReader`
(`apps/cli/src/usage/`) that says which files to follow; `JsonlUsageReader` does the
following, the one-entry-per-key bookkeeping and the session naming, so a new harness's
reader is mostly a list of paths. A `Harness` brings its reader (`usage()`), and the server
adds every reader into one report, with rows kept apart by harness and a by-harness
breakdown once there are two. Claude Code is the only one so far. Codex is the obvious next, once
it is checked which of its session logs (under `~/.codex/sessions`) carry token counts.

The adding-up is pure too, in `packages/core/src/usage/report.ts`: periods are the
caller's local calendar days, weeks start on Sunday. Cost is the API-rate equivalent (a
subscription bills nothing per token, so this is what the work would have cost on the API),
and it is worked out when usage is added up, not when it is read, so a fresher price
reprices everything already read. Prices come from models.dev
(https://github.com/anomalyco/models.dev), whose public `api.json` lists every provider's
models and rates: the server fetches it at most once a day (a plain GET that says nothing
about you), keeps the providers its harnesses name (`UsageAdapter.modelsDev`) in
`~/.agentopia/cache/models.dev.json`, and lays them over the harness's bundled table, which
keeps what models.dev does not list (1-hour cache writes at twice input, fast-mode premiums,
retired models). Offline or blocked, it uses the kept copy or
the bundled tables, and the ledger says which. A model no table knows counts as $0 and is
named in the report. Agents are the lead and each subagent type; projects are the directory the work was
done in, a Claude Code desktop worktree (`<repo>/.claude/worktrees/<name>`) counted as its
repo, and shared across harnesses; sessions are named by
their `custom-title` line, else the office's recording of them (the bus's `name`), else
their project.

The board is a whiteboard rather than a file cabinet on purpose: a glance has to be
readable from across the room, and the cabinets already mean something (compaction files
papers there). The detail lives in a ledger the board opens, like the sprint board's
editor.

### PixiJS, but no game engine

The renderer is **PixiJS v8**. The decision is driven by art-direction range: the office
should launch as a flat cartoon but may later restyle as pixel art or HD-2D (Octopath-ish
sprites in a lit 2.5D scene). Canvas 2D covers cartoon and pixel but has no path to
shaders; Pixi covers all three — filters, particles, and layered parallax get to
"HD-2D-ish" — for ~100KB gzipped. True perspective HD-2D with real depth-of-field would
mean Three.js and is explicitly out of scope.

A game _framework_ (Phaser-class) stays ruled out: it wants to own the loop, the clock,
and scene state, and the director already is the game loop — its injected Clock/Rng is
what makes replay and golden-frame testing possible. Pixi is only a renderer; we drive it
from our own rAF and it holds no game state.

Style is a skin, never a fork: the `OfficeFrame` is style-free (semantic actor states,
tile positions, progress), and the viewer's seam is a `Renderer` interface —
`mount / render(frame) / destroy` — with each style an implementation plus an asset pack.
Restyling is an art project, not a rewrite; the actor-state vocabulary is the stable
contract every style animates.

### Per-event choreography

Staging is data, not director code. Each event kind maps to an `EventChoreography`
(`packages/core/src/choreography/`): three phase hooks — `pre` (the transition in; the
walk itself is implicit), `main` (the performance), `post` (extra staging after release)
— plus lifecycle flags (`enters`, `departs`, `interrupt`, `scope`) and two resolution
hooks (`release` closes an open beat, `bubble` speaks without one). Every hook receives
an `AnimationContext`: the event, the worker's previous event, the worker's live
snapshot, and reduced office state — enough for a choreography to stage the same event
differently depending on where its actor is coming from. Phases emit `Segment`s:
stationary performances in semantic states. Movement, dwell timing, coalescing, lag +
sprint, and idle life stay in the director, which is what keeps choreographies
position-free and pixel-free.

Registries are **per harness** (`choreographyFor('claude')`), because the same
normalized event can deserve different staging per agent — Codex's near-everything-is-
`execute` stream will want its own show. Harness registries extend the shared default.
The director looks the registry up per desk, from the harness its session's stream names
(the emitter stamps it on every record; the server tags every event with it), so one
office can seat sessions from several harnesses, each staged and skinned as its own.

The tuning workshop is Storybook in `apps/viewer` (`yarn --cwd apps/viewer storybook`):
per-harness story folders over shared, harness-agnostic scenarios, four stories per
event (Pre / Main / Post / Full), windowed by simulating the deterministic director
headlessly and looping just that phase.

v1 art is programmatic cartoon, drawn in code with no asset pipeline. The office is an
isometric annotated scene in the Tinycharts manner — a cream sheet with a title block, a
live readout and margin labels, and the office on a cut slab of floor with two back walls —
and every object in it is a Colorfigures-style solid: three light/mid/dark bands by the
way each face meets the light, a heavy ink silhouette, and one blue cast shadow, with a
layer of light on top (faces graded within their band, rim highlights, contact shadows,
daylight on the floor) for a richer, more realistic read. Set dressing includes a glass
meeting room and two phone booths (`ROOMS` in core's floor plan) and a chair at every
desk. Core knows the floor every piece takes up (`OBSTACLES`, kept in step with what the
viewer draws by its room test), and the director walks every route round it on a fine
grid (`route.ts`), so nobody walks through a desk.
It is all drawn in canvas 2D with a small isometric pen (`apps/viewer/src/kit/iso.ts`):
the sheet and the furniture once, into textures, re-drawn only when the zoom settles
somewhere new; the characters every frame, into a small canvas each. Pixi composites the
result and depth-sorts furniture and cast by tile footprint, so a worker can walk behind a
copier. Tile space stays the only layout: the renderer projects core's `(x, y)` onto the
sheet and nothing positional moves into it.

The character is a **posed rig**, not a frame sheet: an `ActorState` maps to a _pose_
(`poseFor(state, facing, t)`, pure) rather than to a frame index, and the pose is drawn —
body, face, limbs, props — into the character's canvas. This is the seam sprite art
arrives through: each part becomes an image drawn at the pose, and the pose function is
unchanged. Full frame sheets are deliberately not the plan: the camera zooms continuously,
the state space is ten states times facing times context, and an `AnimatedSprite` advancing
on Pixi's own ticker would break the injected-clock determinism that replay and
golden-frame tests depend on.

### Not Electron

Electron ships ~150MB of Chromium plus signing and auto-update machinery — for a toy. The
CLI is already a long-lived process; serving `localhost` gets a second monitor, a phone on
the LAN, and the marketing embed for free. `chrome --app=http://localhost:7777` gives a
chrome-less companion window; Tauri (~3MB) wraps the same web build if a native shell is
ever wanted. Either way the renderer is unchanged.

## 7. The CLI

`agentopia` is a **prefix command**, like `time` or `nohup`:

```bash
agentopia claude --effort xhigh
agentopia codex --model gpt-5
```

The first argument is the agent to launch. Neutral naming made this possible and it is
much nicer than a `--harness` flag.

What it does:

1. Mint a session directory and bus file.
2. Detect the harness from argv[0] and inject hooks for it —
   Claude Code via `--plugin-dir`, Codex via a `CODEX_HOME` overlay or repeated `-c`.
3. Export `AGENTOPIA_BUS` so the emitter knows where to write.
4. Start the local server (viewer bundle + SSE) and print the URL.
5. Spawn the agent, passing through every remaining argument, stdio untouched.
6. On exit, tear the viewer down and keep the bus file for replay.

Subcommands (built): `agentopia tail [session]` streams normalized events — it accepts
either an agentopia session id or a harness session uuid, since the mapping is N:M;
`agentopia sessions` lists recordings with both identities; `agentopia doctor` verifies the
wiring, including that the emitter has no non-builtin imports.

`agentopia watch` with no arguments is the office: every live session on one floor, live
only. It is the command to leave running. `agentopia watch <session>` shows one session,
and that is where time travel lives: the same scrubber serves a live session (the office
follows arriving events by default, clicking the track time-travels over a pure re-reduce,
the go-live button or a catch-up rejoins the edge) and a finished one (`--replay`
re-animates it from the start, long quiet gaps capped; playback speed is the speed control
on the scrubber, not a flag). Replay is single-session on purpose — a recording is one bus
file, and a multi-session floor has no single recording to scrub. Every desk is titled
with the harness's own session name, which the emitter samples onto turn-level bus records
and, when the desktop app's title is a direct read, onto finished tool calls: every one until
the title is recorded (it lands a moment after the first prompt, and a long first turn would
otherwise keep the CLI's placeholder name until it ends), then at most every five minutes to
catch a rename (no hook fires on one). The emitter remembers when it recorded the title by
an empty `bus.jsonl.titled` marker's mtime — its own cache, read by nothing downstream. The
bus stays the single source, and a copied recording keeps its name.

**The Codex `CODEX_HOME` catch:** that variable relocates the entire config directory,
including auth and session state, so the wrapper must seed or symlink credentials into the
overlay rather than pointing at a bare temp directory. This is the fiddliest part of Codex
support and should be prototyped before committing to the approach; the repeatable `-c`
flag is the fallback.

---

## 8. Repo layout

The workspace layout is described in `AGENTS.md`. One part of it is architecture rather
than housekeeping:

`plugins/` is deliberately outside the workspace graph. Each harness directory is
hand-written source that must run standalone from a git clone. Do not let it become a build
target. The emitter is duplicated per harness rather than shared, because a marketplace
install may extract only one harness subtree; the copies differ only in the `HARNESS` id
they stamp on every record.

---

## 9. Testing

This project is unusually testable, and that is a deliberate consequence of the
architecture rather than a happy accident.

- **`reduce` and `direct` are pure.** Unit test them directly with synthetic event streams.
- **Every session is a recording.** The bus file _is_ a fixture. Five scenario fixtures
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

## 10. Cloud — deferred

**Not in scope. Nothing local should be shaped around it.** Recorded only so the
one decision that would be expensive to reverse is written down.

If a cloud version ever happens, the emitter does not change and does not learn about the
network. It keeps writing to the local bus, and **the local server relays to the cloud**.
The server is already long-lived, already tailing the bus, and already the only component
holding session state — so it is the natural place for batching, retry, and
store-and-forward. An outage or a slow network then cannot touch the agent's critical
path, because nothing in that path ever makes a network call.

That is the whole design note. It falls out of the architecture in §2 for free, which is
why no work is needed now.

If it happens, the template's FastAPI backend, Prisma database and Clerk auth, cut in the
first commit, are recoverable from git history.

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

`agent_id` is documented in the schema as _"Present only when the hook fires from within a
subagent (e.g., a tool called by an AgentTool worker). Absent for the main thread, even in
--agent sessions. Use this field (not agent_type) to distinguish subagent calls from
main-thread calls."_

**Per-event additions:**

| Event                           | Fields                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PreToolUse`                    | `tool_name`, `tool_input`, `tool_use_id`                                                        |
| `PostToolUse`                   | + `tool_response`, `duration_ms`                                                                |
| `UserPromptSubmit`              | `prompt`, `session_title`                                                                       |
| `SessionStart`                  | `source` (`startup`\|`resume`\|`clear`\|`compact`), `model`, `session_title`                    |
| `SessionEnd`                    | `reason`                                                                                        |
| `Stop`                          | `stop_hook_active`, `last_assistant_message`, `background_tasks`                                |
| `SubagentStop`                  | `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message` |
| `SubagentStart`                 | `agent_id`, `agent_type`                                                                        |
| `Notification`                  | `message`, `title`, `notification_type`                                                         |
| `PreCompact`                    | `trigger` (`manual`\|`auto`), `custom_instructions`                                             |
| `PostCompact`                   | `trigger`, `compact_summary`                                                                    |
| `TaskCreated` / `TaskCompleted` | `task_id`, `task_subject`, `task_description`, `teammate_name`                                  |
| `PermissionRequest`             | `tool_name`, `tool_input`, `permission_suggestions`                                             |

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
