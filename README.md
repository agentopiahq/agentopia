# agentopia

> Watch your coding agent work as an animated office of little clones.

`agentopia` is a companion app for terminal coding agents. You run your agent through a
wrapper and a window shows an office where each worker sits at a desk. When the agent reads
files, a worker walks to the archive. When it spawns subagents, new workers file in and take
empty desks. When it wants your approval, someone stands at your desk holding a form and
taps their foot.

It is a toy. It is not a dashboard, not an observability tool, and not a debugger.

**Status: the office is alive.** `agentopia claude` runs a real session and animates it in
your browser — workers walk to stations, subagents arrive through the door and leave when
done, speech bubbles carry real tool details. See [PLAN.md](./PLAN.md) for architecture
and roadmap.

```sh
yarn install
yarn agentopia doctor      # check the plugin wiring
yarn agentopia claude      # run Claude Code — the office opens in your browser
```

Or serve a past (or still-running) session:

```sh
yarn agentopia watch
```

## How it works

Coding agents expose lifecycle hooks. `agentopia` installs a tiny hook that appends one line
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

- `apps/cli` — the `agentopia` command and the office server.
- `apps/viewer` — the office, rendered (PixiJS), plus the Storybook animation library (four stories per event kind, per harness).
- `apps/web` — the agentopia.town marketing site (Next.js 16, Tailwind v4).
- `plugins/<harness>` — self-contained plugin payloads, one per agent.
- `packages/core` — event vocabulary, source adapters, office reducer, choreography registries, the director, determinism primitives. Pure, no I/O.
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
yarn --cwd apps/viewer storybook  # the event/animation library on :6007
```

## License

[MIT](LICENSE)
