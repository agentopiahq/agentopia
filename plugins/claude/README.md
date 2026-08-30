# cubicle plugin for Claude Code

Wires 18 Claude Code lifecycle hooks to `hooks/emit.mjs`, which appends one JSON line per
event to the file named by `$CUBICLE_BUS`.

The `cubicle` CLI loads this for a single session with `--plugin-dir`, so nothing is
installed globally and plain `claude` is unaffected:

```sh
cubicle claude
```

## Constraints on `emit.mjs`

It runs once per event in the agent's critical path, so:

1. **No imports beyond node builtins.** Claude Code loads this directory as-is — there is
   no install step and no `node_modules`. `cubicle doctor` fails if a non-builtin import
   appears.
2. **No interpretation.** It extracts facts; `packages/core` decides what they mean. That
   keeps harness-specific mapping out of the hot path and in one testable place.
3. **No network, ever.**

Its whole cost is process startup, about 20ms.

## Two fields that are easy to confuse

- `atype` — the agent type this hook fired *inside*. Only meaningful alongside `aid`.
- `spawn` — the agent type a delegation tool is *creating*.

Conflating them makes the delegating worker's own `Agent` call appear on the spawned
worker's desk. There is a regression test for exactly this.

## What the output looks like

Worked examples of complete bus files — a simple session, subagent delegation, a parallel
tool batch, `/clear`, approvals and failures — live in `packages/core/fixtures/`, each with
a walkthrough in that directory's README and a CI test that replays it.
