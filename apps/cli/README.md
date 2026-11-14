# @agentopia/cli

The `agentopia` command. Bundled to a single ESM file with esbuild so it starts fast and
ships without a dependency tree.

```sh
agentopia claude [args...]     # run an agent; the office opens in your browser
agentopia watch                # the floor: every live session on one screen, live only
agentopia watch <session>      # one session, with the scrubber
agentopia watch <session> --replay   # re-animate a finished recording from the start
agentopia tail [session]       # stream normalized events as text
agentopia sessions             # list recorded sessions
agentopia doctor               # check plugin wiring
```

`agentopia watch` with no session is the command to leave running. The server tails every
live bus on disk (not ended, written recently) and multiplexes them onto one SSE stream,
each event tagged with its bus, picking up new buses as they appear; the browser gives each
one a desk. It polls fast while a bus is growing and backs off once it goes quiet, so
following every recording at once costs nothing.

The same server answers `/api/usage` for the office's usage board: tokens and their
API-rate cost by day, week and month, by harness, agent, session and model. Each harness
that has a usage reader (`src/usage/`; only Claude Code so far) reads its own records:
Claude Code's transcripts in `~/.claude/projects`, or `CLAUDE_CONFIG_DIR` as ccusage reads
it, the first time in full and then only what was appended. Nothing is written and nothing
leaves the machine.

Naming a session lands on its *current* scene (catch-up events rebuild state without
animating) with the scrubber for time travel; `--replay` re-animates the recording from the
start instead, with long quiet gaps capped so any session stays watchable. Replay is
single-session on purpose: a recording is one bus file, and the floor has no single
recording to scrub. Playback speed is the speed control on the office's scrubber, not a
flag.

`agentopia claude` starts the office server (viewer bundle + SSE on 127.0.0.1) and opens
the browser; `AGENTOPIA_NO_SERVER=1` skips the server, `AGENTOPIA_NO_OPEN=1` skips the
browser. A missing viewer build or busy port never stops the agent from launching.

`agentopia` is a prefix command like `time` or `nohup`: the first argument names the agent to
launch, and everything after it passes straight through untouched.

## Session model

A **agentopia session** is one wrapper run: one `agentopia claude` invocation, one directory,
one `bus.jsonl`. Its first line is a header written before the agent starts (harness, cwd,
argv, version); every line after it is a hook record.

A **harness session** is the agent's own conversation, identified by the uuid it puts in
every hook payload. The two are not interchangeable:

| | |
|---|---|
| One agentopia session, several harness sessions | `/clear` starts a fresh harness session inside the same wrapper run. Same process, same `$AGENTOPIA_BUS`, so it appends to the same file. |
| One harness session, several agentopia sessions | `claude -c` resumes a conversation in a new process, so it gets a new agentopia session that reuses the old harness uuid. Verified. |

Because the mapping is N:M, `agentopia sessions` prints both identities, and `agentopia tail`
accepts either — hand it the uuid you see in the agent's own tooling and it resolves to the
most recent run that used it.

**Worked examples** of all of this — including the parallel batch that shows why `ts`
cannot order records and the `/clear` case — live in `packages/core/fixtures/` with a
scenario-by-scenario README.

**Subagents share the bus.** They run inside the same agent process and inherit the same
`$AGENTOPIA_BUS`, so their events land in the same file, interleaved with the lead's and
distinguished by `agent_id`. That is what the office wants: one stream, one timeline,
workers told apart by a field rather than by which file you happened to open.

## Layout

- `harness.ts` — the agent registry. Adding an agent is an entry here plus a directory under `plugins/`.
- `paths.ts` — session directories, and finding `plugins/` by walking up from the running bundle.
- `follow.ts` / `lines.ts` — tailing a file that is being appended to, including torn final lines.
- `commands/` — one file per subcommand.

## Running it locally

From the repo root, `yarn agentopia <args>` builds if needed and runs:

```sh
yarn agentopia doctor
yarn agentopia claude
yarn agentopia tail        # in a second terminal, while the session runs
```

To get a real `agentopia` on your PATH:

```sh
yarn --cwd apps/cli build
ln -sf "$PWD/apps/cli/dist/agentopia.mjs" ~/.local/bin/agentopia
```

esbuild marks the bundle executable, so no `chmod` is needed.

## Environment

- `AGENTOPIA_HOME` relocates all state (default `~/.agentopia`). Point it somewhere disposable
  to keep experiments out of your real session list.
- `AGENTOPIA_PLUGINS_DIR` overrides plugin discovery, which otherwise walks up from the
  running bundle.
- `NO_COLOR` / `FORCE_COLOR` behave as usual.
