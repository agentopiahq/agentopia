# Agentopia

> Watch your agents work, track every token they burn, and enjoy the view while you're still employed.

Agentopia is a free, open-source companion app for terminal coding agents, starting with
Claude Code. It records every session through the agent's own lifecycle hooks and shows
them as an animated, open-plan cartoon office in your browser.

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
The npm package is coming soon; until then, run it from a clone of the repository:

```sh
git clone https://github.com/tuliren/agentopia.git
cd agentopia
yarn install
yarn agentopia claude   # run Claude Code; the office opens in your browser
yarn agentopia watch    # or keep one office open for every live session
```

## Who makes it

Agentopia is made by Starfish Software LLC and is MIT licensed.

- [Source code on GitHub](https://github.com/tuliren/agentopia)
- [Contact us](mailto:contact@agentopia.town)
- [Privacy Policy](/privacy)
- [Terms of Service](/terms)
