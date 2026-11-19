# Agentopia

> Somewhere in Agentopia, the agents are busy for you.
> Sit back, relax, and watch all your ideas come true.

![The agentopia office](https://aju9yvogcxlz4gql.public.blob.vercel-storage.com/agentopia-overview-v2-1080p-original.gif)

Agentopia is a companion app for your agents, starting with Claude Code. Its hooks record
every session, and your browser shows them as an open-plan office: each live session has a
lead at a desk, helpers come in for its subagents, and when it wants your approval, its lead
walks over and asks you. It also keeps a tally of the tokens your agents spend. Everything
stays on your machine.

## Install

Agentopia needs Node.js 20 or later.

```sh
npm i -g agentopiahq      # install the `agentopia` command
agentopia install         # install the agentopia plugin into Claude Code
agentopia watch           # open the office
```

`agentopia install` installs the plugin from a local marketplace (it shows in `/plugin`), and
its hooks record every Claude Code session, the desktop app's too. `agentopia uninstall`
removes it. Without it, only sessions started with
`agentopia claude` are recorded. To look without installing anything, run
`npx agentopiahq watch`.

## Usage

```sh
agentopia install                    # install the agentopia plugin into Claude Code
agentopia watch                      # every live session in one office; leave it open
agentopia claude [args...]           # run Claude Code; the office opens in your browser
agentopia uninstall                  # uninstall it
agentopia doctor                     # check the setup
```

`@agentopia/cli` is an alias for this package and installs the same command. Install one or
the other, not both.

## Links

- Website: [agentopia.town](https://agentopia.town)
- License: [MIT](https://github.com/agentopiahq/agentopia/blob/main/LICENSE)
