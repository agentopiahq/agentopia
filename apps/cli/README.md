# Agentopia

> Somewhere in Agentopia, the agents are busy for you.
> Sit back, relax, and watch all your ideas come true.

![The agentopia office](https://aju9yvogcxlz4gql.public.blob.vercel-storage.com/agentopia-overview.png)

Agentopia is a companion app for your agents, starting with Claude Code. Its hooks record
every session, and your browser shows them as an open-plan office: each live session has a
lead at a desk, helpers come in for its subagents, and when it wants your approval, its lead
walks over and asks you. It also keeps a tally of the tokens your agents spend. Everything
stays on your machine.

## Install

Agentopia needs Node.js 20 or later.

```sh
npx agentopiahq watch     # open the office, nothing installed
npm i -g agentopiahq      # or install the `agentopia` command
agentopia claude          # run Claude Code with the office attached
```

## Usage

```sh
agentopia watch                      # every live session in one office; leave it open
agentopia claude [args...]           # run Claude Code; the office opens in your browser
agentopia doctor                     # check the setup
```

`@agentopia/cli` is an alias for this package and installs the same command. Install one or
the other, not both.

## Links

- Website: [agentopia.town](https://agentopia.town)
- License: [MIT](https://github.com/agentopiahq/agentopia/blob/main/LICENSE)
