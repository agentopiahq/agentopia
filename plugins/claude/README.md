# Agentopia for Claude Code

We believe making things should feel like joy, not a race. As AI agents take on more of the work, we should get to enjoy the show. Agentopia turns each agent session into a desk in a cozy open-plan office in the browser. Each lead agent types away at its own desk, and its subagents join it as helpers. Their monitors pile up as the context fills, and a click shows the breakdown. When the agent needs your OK, it walks over and asks. A whiteboard on the wall tallies the tokens spent. Everything stays local. Pour a coffee and watch the office work.

This plugin is what lets the office see your sessions: its hooks note what each one does.

![The agentopia office](https://aju9yvogcxlz4gql.public.blob.vercel-storage.com/agentopia-overview-v2-1080p-original.gif)

## Install

In Claude Code (2.1.275 or later):

```
/plugin install agentopia --marketplace agentopiahq/agentopia
```

On older versions, add the marketplace first:

```
/plugin marketplace add agentopiahq/agentopia
/plugin install agentopia@agentopiahq
```

Then open the office with the `agentopia` command (Node.js 20 or later):

```sh
npx agentopiahq start
```

`agentopia start` sees the plugin is already installed and only opens the office. Plugins
load when a session starts, so restart any session (or the desktop app) that was already
running. The [docs](https://www.agentopia.town/docs) cover the rest of the command.

The hooks run `node` from your `PATH`. If the desktop app can't find it there (an app
started from the Dock often has no version manager's `PATH`), install with
`npx agentopiahq install` instead: it installs the same plugin pinned to the Node that ran
it, as `agentopia@agentopia`. Keep one or the other: with both, every event is recorded
twice.

## What it records, and where

On 18 Claude Code lifecycle events (session start and end, each prompt, each tool call and
its result, subagents starting and stopping, approval requests, compaction, tasks,
notifications), the hook runs `hooks/emit.mjs`, which appends one short JSON line to a file
under `~/.agentopia/sessions/` (or to `$AGENTOPIA_BUS` when the `agentopia claude` wrapper
names one). A line holds the event's name, time, session and subagent ids, the tool's name,
and short clipped snippets: the first 80 characters of a prompt, a file path, the first 70
characters of a shell command, a search pattern, a fetched URL's host. To title the desk, it
also reads the session's name from Claude Code's own session files on your machine
(`~/.claude/sessions/` and the desktop app's session list).

The plugin never uses the network, never blocks or changes a session, and prints nothing.
Its whole cost is starting Node, about 20 ms an event. Deleting `~/.agentopia` removes every
recording. See the [privacy policy](https://www.agentopia.town/privacy).

To remove it, run `/plugin uninstall agentopia@agentopiahq`.

## For contributors

### Constraints on `emit.mjs`

It runs once per event in the agent's critical path, so:

1. **No imports beyond node builtins.** Claude Code loads this directory as-is — there is
   no install step and no `node_modules`. `agentopia doctor` fails if a non-builtin import
   appears.
2. **No interpretation.** It extracts facts; `packages/core` decides what they mean. That
   keeps harness-specific mapping out of the hot path and in one testable place.
3. **No network, ever.**

The one extra I/O it allows itself is sampling Claude Code's own session name (desktop
title, else the live-session registry name) into the record. The full scan runs only on
turn-level events (SessionStart, UserPromptSubmit, Stop, SessionEnd); a finished tool call
looks the name up directly, and only until the desktop title has been recorded. Sampling into the bus keeps a
recording self-describing: the viewer titles the office from the bus alone, with no second
data source.

### How it gets installed

Three ways, all loading this same directory:

- **From a marketplace**, as above: `.claude-plugin/marketplace.json` at the repository root
  lists this directory as `agentopia@agentopiahq`, and Anthropic's directory lists it too.
  Claude Code updates it when `version` in `.claude-plugin/plugin.json` changes, which
  `yarn version-packages` keeps equal to the CLI's version.
- **`agentopia install`** copies this directory to `~/.agentopia/plugins/claude/agentopia/`
  beside a `.claude-plugin/marketplace.json`, and installs it from there as
  `agentopia@agentopia`. On the way, every hook command is pinned to the Node that ran the
  install, and the manifest's version becomes the CLI's plus a hash of what was staged, so
  `agentopia watch` and `agentopia claude` restage and run `claude plugin update` whenever an
  upgrade (or another Node) changed it. Where the plugin is already installed from another
  marketplace, the CLI leaves it be.
- **Per session, via the wrapper** (`agentopia claude`), with `--plugin-dir`. With the plugin
  installed either way, the wrapper stops passing it (the plugin would load twice) and only
  names the session's bus.

With no `AGENTOPIA_BUS` set, the emitter derives a bus per harness session
(`~/.agentopia/sessions/auto-<session id>/`). Hooks wired by hand in
`~/.claude/settings.json` to run `emit.mjs`, the old way to record the desktop app, record
twice beside the plugin; `agentopia install` and `agentopia doctor` say so.

### Two fields that are easy to confuse

- `atype` — the agent type this hook fired _inside_. Only meaningful alongside `aid`.
- `spawn` — the agent type a delegation tool is _creating_.

Conflating them makes the delegating worker's own `Agent` call appear on the spawned
worker's desk. There is a regression test for exactly this.

### What the output looks like

Worked examples of complete bus files — a simple session, subagent delegation, a parallel
tool batch, `/clear`, approvals and failures — live in `packages/core/fixtures/`, each with
a walkthrough in that directory's README and a CI test that replays it.
