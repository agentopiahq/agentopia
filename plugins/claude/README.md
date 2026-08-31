# agentopia plugin for Claude Code

Wires 18 Claude Code lifecycle hooks to `hooks/emit.mjs`, which appends one JSON line per
event to the file named by `$AGENTOPIA_BUS`.

Two ways to attach it:

**Per session, via the wrapper** — nothing installed globally, plain `claude` unaffected:

```sh
agentopia claude
```

**Standing, via settings hooks** — wire the 13 events in `~/.claude/settings.json` hooks
to run `node <repo>/plugins/claude/hooks/emit.mjs`. With no `AGENTOPIA_BUS` set, the emitter
derives a bus per harness session (`~/.agentopia/sessions/auto-<session id>/`), so every
future session — including Claude Code desktop-app sessions, which no wrapper can launch —
is recorded, and `agentopia watch` serves the latest. Hooks load at session startup only; a
running session never picks them up.

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
