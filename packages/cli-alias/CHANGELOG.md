# @agentopia/cli

## 0.1.0 - 2026-11-18

First npm release: watch your coding agents working in a relaxing office.

**Install** (needs Node 20+ and Claude Code on your `PATH`):

```sh
npm i -g agentopiahq
```

Or skip the install and use `npx agentopiahq` in place of `agentopia` below. `@agentopia/cli` is an alias for the same package (`npx @agentopia/cli watch`).

**Run**

```sh
agentopia claude    # start Claude Code with the office attached; it opens in your browser
agentopia watch     # or keep one office open for every live session
```

Arguments after `agentopia claude` go straight to Claude Code, e.g. `agentopia claude --effort high`. Only sessions started through `agentopia claude` show up in the office. Run `agentopia doctor` to check the hook wiring, and `agentopia help` for every command.
