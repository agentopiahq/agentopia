# cubicle

> Watch your coding agent work as an animated office of little clones.

`cubicle` is a companion app for terminal coding agents. You run your agent through a
wrapper and a window shows an office where each worker sits at a desk. When the agent reads
files, a worker walks to the archive. When it spawns subagents, new workers file in and take
empty desks. When it wants your approval, someone stands at your desk holding a form and
taps their foot.

It is a toy. It is not a dashboard, not an observability tool, and not a debugger.

```
┌─ CUBICLE ─────────────────────────────────────────────── 04:21 ─┐
│   ARCHIVE          ┌──── WHITEBOARD ────┐         ☕            │
│  ▤▤▤▤▤▤            │ 1. audit CRUD      │        \*/            │
│  ▤▤▤ \*/           │ 2. FK-safe deletes │       (o‿o)   🪴      │
│  ▤▤▤ (o‿o)[▤]      └────────────────────┘       ══════          │
│  ══════════                                                     │
│  ╭─ YOU ───────╮  ╭─ LEAD ──────╮  ╭─ code-review ─╮            │
│  │   ▄▀▄       │  │   \*/       │  │   \*/         │            │
│  │  (•_•) 💬   │  │  (o‿o)      │  │  (o⁀o)        │            │
│  ╰─────────────╯  ╰─────────────╯  ╰───────────────╯            │
└─────────────────────────────────────────────────────────────────┘
```

**Status: phase 1, event pipeline.** Recording works end to end — you can run a real
session and watch normalized events stream. Nothing animates yet; the office renderer is
next. See [PLAN.md](./PLAN.md) for the architecture and roadmap.

```sh
yarn install
yarn cubicle doctor      # check the plugin wiring
yarn cubicle claude      # run Claude Code with recording attached
```

Then in a second terminal, watch the events land as they happen:

```sh
yarn cubicle tail
```

## How it works

Coding agents expose lifecycle hooks. `cubicle` installs a tiny hook that appends one line
per event to a local file, and a long-lived viewer tails that file and animates it.

```
agent ──hook──► emit.mjs ──► bus (JSONL) ──► normalize ──► reduce ──► direct ──► render
```

Claude Code and Codex are both supported through native hooks; their hook systems converged
on nearly identical shapes, so the adapter layer is thin. The normalized event vocabulary is
borrowed from the [Agent Client Protocol](https://agentclientprotocol.com) rather than
invented.

## Repo layout

Turborepo monorepo managed with Yarn 4 workspaces. Node 20+.

- `apps/cli` — the `cubicle` command.
- `apps/web` — the cubicle.town marketing site (Next.js 16, Tailwind v4, Storybook).
- `plugins/<harness>` — self-contained plugin payloads, one per agent.
- `packages/core` — event vocabulary, source adapters, office reducer, determinism primitives. Pure, no I/O.
- `packages/lib` — shared React components.
- `packages/eslint-config`, `packages/jest-presets`, `packages/typescript-config` — shared config.

## Commands

```sh
yarn install
yarn dev          # turbo dev
yarn build        # turbo build
yarn lint         # eslint across all workspaces
yarn typecheck    # tsc --noEmit across all workspaces
yarn test         # jest unit tests
yarn format:write # prettier
```

## License

MIT
