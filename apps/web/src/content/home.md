# Agentopia

> Somewhere in Agentopia, the agents are busy for you.
> Sit back, relax, and watch all your ideas come true.

Agentopia is a free, open-source companion app for terminal coding agents, starting with Claude Code. It records every session through the agent's own lifecycle hooks and shows them as an animated, open-plan cartoon office in your browser.

## What you see in the office

- **A desk per session.** Every live session has a lead at a desk, typing at a big monitor
  that scrolls whatever the agent is running.
- **Subagents as helpers.** When a session spawns subagents, helpers come in through the
  door, get briefed at the lead's desk, and work beside it.
- **You, asked for approval.** You are in the office too. When you send a prompt you say
  it, and when a session wants your approval, its lead walks over and asks.
- **Quiet sessions leave.** When a session goes quiet, its lead naps, then leaves, and the
  desk is free for the next one.
- **A usage board.** A whiteboard tallies the tokens your agents use and what they would
  cost at API rates, by day, week and month, read from the agent's own records on your
  machine.
- **Office life.** Idle colleagues, an office cat and dog, and a San Francisco skyline
  outside the windows with weather and a day and night sky.

## How it works

Agentopia installs a tiny hook into your coding agent that appends one line per event
(prompts, tool calls, subagents, approvals) to a local file. A small local server tails
that file and streams it to the office in your browser, which animates every session live.
Everything stays on your machine: the server listens on 127.0.0.1 only.

## Get started

Agentopia needs Node.js 20 or later and works with Claude Code today, with Codex next.

```sh
npm i -g agentopiahq   # install the agentopia command
agentopia start        # install the plugin (it asks first), open the office
```

`agentopia start` runs the office in the background, so it stays open after you close the
terminal. Then use Claude Code as you always do, in a terminal or the desktop app: every
session gets a desk. `agentopia status` says where the office is, and `agentopia stop`
closes it. The [docs](/docs) cover every command.

## Who makes it

Agentopia is made by Starfish Software LLC and is MIT licensed.

- [About Agentopia](/about)
- [Docs](/docs)
- [Source code on GitHub](https://github.com/agentopiahq/agentopia)
- [Agentopia on X](https://x.com/agentopiahq)
- [Agentopia on LinkedIn](https://www.linkedin.com/company/agentopiahq)
- [Contact us](mailto:contact@agentopia.town)
- [Privacy Policy](/privacy)
- [Terms of Service](/terms)
