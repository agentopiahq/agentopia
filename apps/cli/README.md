# @agentopia/cli

The `cubicle` command. Bundled to a single ESM file with esbuild so it starts fast and
ships without a dependency tree.

```sh
cubicle claude [args...]     # run an agent; the office opens in your browser
cubicle watch [session]      # serve the office for an existing/running session
cubicle watch --replay [N]   # re-animate a finished recording at N x speed
cubicle tail [session]       # stream normalized events as text
cubicle sessions             # list recorded sessions
cubicle doctor               # check plugin wiring
```

Joining a running session lands on its *current* scene (catch-up events rebuild state
without animating); `--replay` re-animates a recording from the start instead, with long
quiet gaps capped so any session stays watchable. The same is available in the viewer
directly via `?replay=N` on the URL.

`cubicle claude` starts the office server (viewer bundle + SSE on 127.0.0.1) and opens
the browser; `CUBICLE_NO_SERVER=1` skips the server, `CUBICLE_NO_OPEN=1` skips the
browser. A missing viewer build or busy port never stops the agent from launching.

`cubicle` is a prefix command like `time` or `nohup`: the first argument names the agent to
launch, and everything after it passes straight through untouched.

## Session model

A **cubicle session** is one wrapper run: one `cubicle claude` invocation, one directory,
one `bus.jsonl`. Its first line is a header written before the agent starts (harness, cwd,
argv, version); every line after it is a hook record.

A **harness session** is the agent's own conversation, identified by the uuid it puts in
every hook payload. The two are not interchangeable:

| | |
|---|---|
| One cubicle session, several harness sessions | `/clear` starts a fresh harness session inside the same wrapper run. Same process, same `$CUBICLE_BUS`, so it appends to the same file. |
| One harness session, several cubicle sessions | `claude -c` resumes a conversation in a new process, so it gets a new cubicle session that reuses the old harness uuid. Verified. |

Because the mapping is N:M, `cubicle sessions` prints both identities, and `cubicle tail`
accepts either — hand it the uuid you see in the agent's own tooling and it resolves to the
most recent run that used it.

**Worked examples** of all of this — including the parallel batch that shows why `ts`
cannot order records and the `/clear` case — live in `packages/core/fixtures/` with a
scenario-by-scenario README.

**Subagents share the bus.** They run inside the same agent process and inherit the same
`$CUBICLE_BUS`, so their events land in the same file, interleaved with the lead's and
distinguished by `agent_id`. That is what the office wants: one stream, one timeline,
workers told apart by a field rather than by which file you happened to open.

## Layout

- `harness.ts` — the agent registry. Adding an agent is an entry here plus a directory under `plugins/`.
- `paths.ts` — session directories, and finding `plugins/` by walking up from the running bundle.
- `follow.ts` / `lines.ts` — tailing a file that is being appended to, including torn final lines.
- `commands/` — one file per subcommand.

## Running it locally

From the repo root, `yarn cubicle <args>` builds if needed and runs:

```sh
yarn cubicle doctor
yarn cubicle claude
yarn cubicle tail        # in a second terminal, while the session runs
```

To get a real `cubicle` on your PATH:

```sh
yarn --cwd apps/cli build
ln -sf "$PWD/apps/cli/dist/cubicle.mjs" ~/.local/bin/cubicle
```

esbuild marks the bundle executable, so no `chmod` is needed.

## Environment

- `CUBICLE_HOME` relocates all state (default `~/.cubicle`). Point it somewhere disposable
  to keep experiments out of your real session list.
- `CUBICLE_PLUGINS_DIR` overrides plugin discovery, which otherwise walks up from the
  running bundle.
- `NO_COLOR` / `FORCE_COLOR` behave as usual.
