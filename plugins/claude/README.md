# agentopia plugin for Claude Code

Wires 18 Claude Code lifecycle hooks to `hooks/emit.mjs`, which appends one JSON line per
event to the file named by `$AGENTOPIA_BUS`.

Two ways to attach it:

**Standing, via `agentopia install`** — records every session, plain `claude` and Claude
Code desktop-app sessions (which no wrapper can launch) alike:

```sh
agentopia install     # agentopia uninstall takes it out again
```

It copies this directory to `~/.agentopia/plugins/claude/agentopia/` beside a
`.claude-plugin/marketplace.json`, and installs it from there as `agentopia@agentopia` with
`claude plugin marketplace add` and `claude plugin install`. On the way, every hook command
is pinned to the Node that ran the install (an app started from the Dock often has no
version manager on its PATH), and the manifest's version becomes the CLI's plus a hash of
what was staged. Claude Code only refreshes its cached copy when that version changes, so
`agentopia watch` and `agentopia claude` restage and run `claude plugin update` whenever an
upgrade (or another Node) changed it. With no `AGENTOPIA_BUS` set, the emitter derives a bus
per harness session (`~/.agentopia/sessions/auto-<session id>/`). Plugins load at session
startup only; a running session picks it up when it restarts.

**Per session, via the wrapper** — nothing installed, plain `claude` unaffected:

```sh
agentopia claude
```

With the plugin installed, the wrapper stops passing `--plugin-dir` (the plugin would load
twice and record every event twice) and only names the session's bus. Hooks wired by hand
in `~/.claude/settings.json` to run `emit.mjs`, the old way to record the desktop app, record
twice beside the plugin; `agentopia install` and `agentopia doctor` say so.

## Constraints on `emit.mjs`

It runs once per event in the agent's critical path, so:

1. **No imports beyond node builtins.** Claude Code loads this directory as-is — there is
   no install step and no `node_modules`. `agentopia doctor` fails if a non-builtin import
   appears.
2. **No interpretation.** It extracts facts; `packages/core` decides what they mean. That
   keeps harness-specific mapping out of the hot path and in one testable place.
3. **No network, ever.**

Its whole cost is process startup, about 20ms. The one extra I/O it allows itself is
sampling Claude Code's own session name (desktop title, else the live-session registry
name) into the record — and only on turn-level events (SessionStart, UserPromptSubmit,
Stop, SessionEnd), never on a tool call, so the hot path stays reads-free. Sampling into
the bus keeps a recording self-describing: the viewer titles the office from the bus
alone, with no second data source.

## Two fields that are easy to confuse

- `atype` — the agent type this hook fired *inside*. Only meaningful alongside `aid`.
- `spawn` — the agent type a delegation tool is *creating*.

Conflating them makes the delegating worker's own `Agent` call appear on the spawned
worker's desk. There is a regression test for exactly this.

## What the output looks like

Worked examples of complete bus files — a simple session, subagent delegation, a parallel
tool batch, `/clear`, approvals and failures — live in `packages/core/fixtures/`, each with
a walkthrough in that directory's README and a CI test that replays it.
