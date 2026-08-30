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

## Development

```sh
yarn --cwd apps/cli build     # produces dist/cubicle.mjs
CUBICLE_HOME=/tmp/scratch node apps/cli/dist/cubicle.mjs doctor
```

`CUBICLE_HOME` relocates all state, which is how tests and throwaway runs avoid touching
the real one. `CUBICLE_PLUGINS_DIR` overrides plugin discovery.
