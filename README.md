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

**Status: phase 0.** The monorepo skeleton and the event model exist. Nothing animates yet.
See [PLAN.md](./PLAN.md) for the architecture and roadmap.

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

- `apps/web` — the cubicle.town marketing site (Next.js 16, Tailwind v4, Storybook).
- `packages/core` — event vocabulary, office reducer, determinism primitives. Pure, no I/O.
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
