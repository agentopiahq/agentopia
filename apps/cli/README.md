# @repo/cli

The `cubicle` command. Bundled to a single ESM file with esbuild so it starts fast and
ships without a dependency tree.

```sh
cubicle claude [args...]   # run an agent with recording attached
cubicle tail [session]     # stream normalized events
cubicle sessions           # list recorded sessions
cubicle doctor             # check plugin wiring
```

`cubicle` is a prefix command like `time` or `nohup`: the first argument names the agent to
launch, and everything after it passes straight through untouched.

## Layout

- `harness.ts` — the agent registry. Adding an agent is an entry here plus a directory under `plugins/`.
- `paths.ts` — session directories, and finding `plugins/` by walking up from the running bundle.
- `follow.ts` / `lines.ts` — tailing a file that is being appended to, including torn final lines.
- `commands/` — one file per subcommand.

## Running it locally

From the repo root, `yarn cubicle <args>` builds if needed and runs:

```sh
yarn cubicle doctor
yarn cubicle claude
yarn cubicle tail        # in a second terminal, while the session runs
```

To get a real `cubicle` on your PATH:

```sh
yarn --cwd apps/cli build
ln -sf "$PWD/apps/cli/dist/cubicle.mjs" ~/.local/bin/cubicle
```

esbuild marks the bundle executable, so no `chmod` is needed.

## Environment

- `CUBICLE_HOME` relocates all state (default `~/.cubicle`). Point it somewhere disposable
  to keep experiments out of your real session list.
- `CUBICLE_PLUGINS_DIR` overrides plugin discovery, which otherwise walks up from the
  running bundle.
- `NO_COLOR` / `FORCE_COLOR` behave as usual.
