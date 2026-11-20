# Agentopia

> Somewhere in Agentopia, the agents are busy for you.\
> Sit back, relax, and watch all your ideas come true.

![The agentopia office](https://aju9yvogcxlz4gql.public.blob.vercel-storage.com/agentopia-overview-v2-1080p-original.gif)

We believe making things should feel like joy, not a race. As AI agents take on more of the work, we should get to enjoy the show. Agentopia turns each agent session into a desk in a cozy open-plan office in the browser. Each lead agent types away at its own desk, and its subagents join it as helpers. Their monitors pile up as the context fills, and a click shows the breakdown. When the agent needs your OK, it walks over and asks. A whiteboard on the wall tallies the tokens spent. Everything stays local. Pour a coffee and watch the office work.

It works with Claude Code today: its hooks record every session on your machine.

## Install

Agentopia needs Node.js 20 or later.

```sh
npm i -g agentopiahq      # install the `agentopia` command
agentopia start           # install the plugin (it asks first) and open the office
```

`agentopia start` offers to install the agentopia plugin into Claude Code (`--yes` answers
for you), then serves the office in the background, so closing the terminal leaves it open.

`agentopia install` installs the plugin from a local marketplace (it shows in `/plugin`), and
its hooks record every Claude Code session, the desktop app's too. `agentopia uninstall`
removes it. Without it, only sessions started with `agentopia claude` are recorded. To look
without installing anything, run `npx agentopiahq watch`.

The plugin can also be installed from Claude Code itself, from agentopia's marketplace on
GitHub: `/plugin install agentopia --marketplace agentopiahq/agentopia`. `agentopia start`
then installs nothing more. Keep one install or the other, or every event is recorded twice
(`agentopia doctor` says so).

## Usage

```sh
agentopia start [--yes]              # install the plugin if needed, then open the office in the background
agentopia status                     # is it running, and where
agentopia stop                       # stop it
agentopia update [--check]           # update now (it also updates itself); alias: upgrade
agentopia install                    # install the agentopia plugin into Claude Code
agentopia uninstall                  # uninstall it
agentopia watch                      # the same office in this terminal; leave it open
agentopia claude [args...]           # run Claude Code; the office opens in your browser
agentopia doctor                     # check the setup
```

## Updates

agentopia keeps itself up to date. The office checks npm every few hours, downloads a new
release into `~/.agentopia/versions` (checked against npm's integrity hash, never written
into npm's own folders), and switches over once no session is in the middle of a turn. Open
tabs then offer a reload. `agentopia update` does it straight away. To turn the automatic
download off, set `AGENTOPIA_AUTO_UPDATE=0`.

## Links

- Website: [agentopia.town](https://agentopia.town)
- License: [MIT](https://github.com/agentopiahq/agentopia/blob/main/LICENSE)
