# Bus file examples

Each `.jsonl` here is a complete, valid bus file illustrating one scenario. They are
distilled from real recorded sessions (ids anonymized, a few timestamps rounded), and
`src/__tests__/fixtures.test.ts` replays every one through the reader and reducer — so if
the format or the semantics drift, CI fails rather than the examples rotting.

A bus file's first line is always the `agentopia.session` header written by the CLI; every
later line is one hook record. Records are appended by concurrent processes and never
rewritten — see the invariant note in `src/bus.ts` for why ordering comes from line
position (`seq`, derived by the reader) and never from `ts`.

## Replaying a fixture

One command, end to end — build, serve, open the office, and re-animate the recording
(optionally at a speed multiplier) instead of jumping to its final scene:

```sh
yarn replay packages/core/fixtures/02-subagent.jsonl 2
```

It wraps `agentopia watch --bus <file> --replay <speed>`, which serves the file from
wherever it lives — nothing is copied, and the same flag replays a bus file recorded on
another machine. Drag the progress bar along the bottom of the office to scrub to any
point in the recording, pause or resume with the button at its left (play on a finished
replay starts it over), or step to the previous or next event with the buttons beside
it. Each tick on the bar is one event (failures in red) — click a tick to jump straight
to that event, or hover it to see what happened.

Alternatively, for a plain-text view of the normalized events in the terminal instead of
the office, point `tail` at the same file:

```sh
agentopia tail --bus packages/core/fixtures/02-subagent.jsonl
```

## 01 — simple session

The minimal shape: startup, one user turn, one tool call, stop. `tuid` (`toolu_01A`) links
the `PreToolUse` to its `PostToolUse`; `pid` groups everything belonging to the one prompt.
Between `Stop` and the next `UserPromptSubmit` is where the office shows "waiting on you" —
there is no explicit event for it, the gap *is* the state.

## 02 — subagent delegation

The two-desk choreography, taken from a real Explore run. Read it as the office will play
it:

1. The lead's `PreToolUse(Agent)` has `spawn:"Explore"` but **no `aid`** — the delegating
   call belongs to the lead's desk. (Getting this wrong was a real bug; see the adapter's
   regression test.)
2. `SubagentStart` introduces `aid:"a910ed00…"` — a worker walks in.
3. The subagent's own tool calls carry that same `aid` on every record. This per-record
   attribution is what makes per-desk animation possible at all.
4. `SubagentStop` (the worker leaves) and only then the lead's `PostToolUse(Agent)` —
   the delegation returns.

Note the interleaving: subagent records sit *between* the lead's start and end. One bus,
one timeline, workers distinguished by field.

## 03 — parallel tool calls

Three `Read`s issued in one batch, from a real recording. The details that shaped the
design:

- Lines 4–5 share `ts` **exactly** (`…144`), as do lines 6–7 (`…176`). Millisecond clocks
  stamped by independent processes collide routinely. This is why `ts` can never be an
  ordering or identity key, and why `seq` is derived from line position instead.
- The worker has up to two calls in flight at once. Only `tuid` says which `PostToolUse`
  closes which `PreToolUse` — name and path pairing would break on two reads of the same
  file. This is why `Worker.tools` is a map keyed by tool id, not a single slot.

## 04 — /clear inside one wrapper run

One agentopia session, two harness sessions. `SessionEnd` with `src:"clear"` closes
`11111111…`, then `SessionStart` with `src:"clear"` opens `22222222…` — same process, same
bus file. `harnessSessionIds()` returns both, in order. The reverse case (`claude -c`
reusing one harness session across two wrapper runs, hence two bus files) is why neither id
can substitute for the other.

Note for the renderer: the reducer resets the office on `session.start`, so a clear carts
the accumulated set dressing away. Deliberate — a clear *is* a fresh start.

## 05 — approval and failure

The two beats that never appear in the agent's own transcript, which is a large part of why
agentopia hooks events rather than tailing transcripts:

- `PermissionRequest` — the agent wants to run `Bash` and is waiting on the human. The
  office sends a worker to stand at your desk with a form. The six-second gap before the
  `PreToolUse` is the human deciding.
- `PostToolUseFailure` (`ok:false`) — `yarn build` failed. Monitor sparks, worker slumps.
  Failure arrives as its own event, not as a status inside a normal response.
