# plugins

One directory per agent harness. Each is a **self-contained** plugin payload: an agent
loads it by pointing at the directory on disk, so it must work from a bare `git clone`
with no `node_modules`, no install step, and no build output.

- `claude/` — Claude Code

Planned: `codex/`.

## Rules

These directories are deliberately outside the Yarn workspace graph. Do not add a
`package.json`, and do not move them under `apps/` or `packages/` — workspace membership
would give them hoisted `node_modules`, and an accidental `import '@agentopia/core'` in an
emitter would then work locally while breaking for every installed user.

`hooks/emit.mjs` is duplicated per harness rather than shared, because a marketplace
install may extract only one harness subtree and a `../shared/` reference would not
survive it. `plugins/claude/hooks/emit.mjs` is the canonical copy; when a second harness
is added, copy it changing only its `HARNESS` constant (the id stamped as `h` on every
record), and add a test asserting the copies are otherwise identical. See "Adding a
harness" in `AGENTS.md` for the rest.
