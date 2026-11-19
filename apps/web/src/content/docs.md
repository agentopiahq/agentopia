# Docs

We believe making things should feel like joy, not a race. As AI agents become smarter, we should get to enjoy the show. Agentopia turns each agent session into a desk in a cozy open-plan office in the browser. Each leading agent types at their own desk. Their monitor shows a breakdown of the session context. A whiteboard on the wall tallies the tokens spent. Everything stays local. Pour a coffee and watch the office work.

This page covers everything the `agentopia` command does.

## Install

Agentopia needs Node.js 20 or later, and Claude Code.

```sh
npm i -g agentopiahq   # install the agentopia command
agentopia start        # add the plugin (it asks), open the office
```

`agentopia start` asks once whether to install the agentopia plugin into Claude Code, then
serves the office in the background and opens it in your browser. Closing the terminal
leaves it open.

Restart the Claude Code desktop app, and any `claude` sessions already running, so they
load the plugin. From then on every new session is recorded, from the terminal or the
desktop app, and gets a desk in the office.

`@agentopia/cli` is an alias for `agentopiahq` that installs the same command. Install one
or the other, not both. To look without installing anything, run `npx agentopiahq watch`.

## Commands

| Command                      | What it does                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `agentopia start`            | Install the plugin if it is missing (asks first), then serve the office in the background and open it |
| `agentopia status`           | Say whether the office is running, and at which address                           |
| `agentopia stop`             | Stop the office, however it was started                                           |
| `agentopia watch`            | Serve the same office in this terminal, for as long as it stays open              |
| `agentopia install`          | Install the agentopia plugin into Claude Code                                     |
| `agentopia uninstall`        | Uninstall the plugin; new sessions are no longer recorded                         |
| `agentopia claude [args...]` | Run Claude Code with the office recording attached, without installing the plugin |
| `agentopia doctor`           | Check the setup: the plugin, its hooks, and the agents on your `PATH`             |
| `agentopia help`             | List the commands                                                                 |
| `agentopia --version`        | Print the version                                                                 |

### Options

- `--yes` (`start`): install the plugin without asking.
- `--no-open` (`start`, `watch`): serve the office without opening a browser tab.
- `--port <port>` (`start`, `watch`): serve on this port. The default is 7777, or the next
  free one.

Anything after `agentopia claude` goes straight to Claude Code, so
`agentopia claude --effort high` works as `claude --effort high` does.

## One office for every session

There is one office per machine. `start`, `watch` and `agentopia claude` all find an office
already running and use it, rather than opening a second one. Run `agentopia status` to see
its address.

Each live session gets a desk, up to eight; a ninth waits for one to free up. A session that
goes quiet for five minutes naps, then leaves, and its desk is free for the next. To clear a
desk by hand, click the desk and pick **Clear this desk**.

## Recording sessions

The plugin's hooks append one line per event (a prompt, a tool call, a subagent, an
approval) to a file for that session. The office follows those files as they grow.

- **With the plugin installed** (`agentopia install`, or saying yes to `agentopia start`):
  every Claude Code session is recorded, the desktop app's too.
- **Without it**: only sessions started with `agentopia claude` are recorded.

Use one or the other. Running `agentopia claude` with the plugin installed records the
session once, not twice.

## Where things are kept

Everything Agentopia writes stays in `~/.agentopia` (set `AGENTOPIA_HOME` to use another
folder):

- `sessions/`: one folder per recorded session, holding its event file.
- `server.json`: the office that is running (its process and port).
- `server.log`: what the background office prints.

The office's usage board and each desk's context are read from Claude Code's own records on
your machine. Nothing is sent anywhere: the server only listens on `127.0.0.1`.

## Uninstall

```sh
agentopia uninstall      # stop recording new sessions
agentopia stop           # close the office
npm rm -g agentopiahq    # remove the command
```

Recordings stay in `~/.agentopia` until you delete the folder.

## Troubleshooting

- **The office is empty.** Run `agentopia doctor`. If the plugin is installed, restart the
  Claude Code desktop app and any running `claude` sessions so they load it. A session
  shows up as soon as it starts.
- **The browser did not open.** Run `agentopia status` and open the address it prints.
- **Something else.** [Open an issue on GitHub](https://github.com/agentopiahq/agentopia/issues)
  or write to [contact@agentopia.town](mailto:contact@agentopia.town).
