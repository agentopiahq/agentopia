# Agentopia

> Somewhere in Agentopia, the agents are busy for you.
> Sit back, relax, and watch all your ideas come true.

![The agentopia office](https://aju9yvogcxlz4gql.public.blob.vercel-storage.com/agentopia-overview-v2-1080p-original.gif)

`agentopia` is a companion app for coding agents. Its hooks record every session events,
and renders an open-plan office where every live session has a lead at a desk,
typing at a big monitor that scrolls whatever it is running. When a session spawns
subagents, helpers fly in through the door, get briefed at the lead's desk, and work beside
it. You are there too, on a sofa or on the floor by the window: when you send a prompt you
say it, and when a session wants your approval, its lead walks over to you and asks.
When a session goes quiet, its lead naps, then leaves, and the desk is free for the next.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design and [ROADMAP.md](./ROADMAP.md) for what
is next.

## Install

```sh
npm i -g agentopiahq              # install the `agentopia` command
agentopia start                   # install the plugin (it asks first) and open the office
```

`agentopia start` offers to install the agentopia plugin into Claude Code (`--yes` skips the
question), then serves the office in the background, so it stays open after the terminal
closes; `agentopia status` and `agentopia stop` go with it. The plugin's hooks record every
Claude Code session, the desktop app's too, and `agentopia uninstall` removes it. Without it, only `agentopia claude` sessions are
recorded; `npx agentopiahq watch` opens the office with nothing installed.

`@agentopia/cli` is an alias package for the same command (`npx @agentopia/cli watch`).

## From a clone

```sh
yarn install
yarn agentopia doctor      # check the plugin wiring
yarn agentopia claude      # run Claude Code — the office opens in your browser
```

Or leave the office open for every session, however they were started:

```sh
yarn agentopia start              # the floor in the background (status, stop)
yarn agentopia watch              # the floor in this terminal: all live sessions, live only
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

| Module                                                                          | Description                                                                                                                                           |
|---------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| `apps/cli`                                                                      | The `agentopia` command: session wrapper, hook injection, and the office server (viewer bundle + SSE event stream).                                   |
| `apps/viewer`                                                                   | The office, rendered — a PixiJS cartoon skin over core's frames — plus the Storybook animation library (four stories per event kind, per harness).    |
| `apps/web`                                                                      | The agentopia.town marketing site (Next.js 16, Tailwind v4).                                                                                          |
| `plugins/<harness>`                                                             | Self-contained plugin payloads, one per agent. Deliberately outside the workspace graph: the zero-import hook emitter must run from a bare git clone. |
| `packages/core`                                                                 | Event vocabulary, source adapters, office reducer, choreography registries, the director, determinism primitives. Pure, no I/O.                       |
| `packages/lib`                                                                  | Shared React components.                                                                                                                              |
| `packages/eslint-config`, `packages/jest-presets`, `packages/typescript-config` | Shared lint, test, and tsconfig presets consumed by every workspace.                                                                                  |

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

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md): first-time contributors sign the
[CLA](CLA.md) by adding their GitHub username to [`.github/contributors.md`](.github/contributors.md) in
their first pull request. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md), and
security issues go to [contact@agentopia.town](mailto:contact@agentopia.town) ([SECURITY.md](SECURITY.md)).

## License

[MIT](LICENSE)
