# @agentopia/core

The engine. Event vocabulary, source adapters, the office reducer, the stations floor
plan, and the director — pure TypeScript, no I/O, no runtime dependencies, all time and
chance injected. Renderers are skins over the `OfficeFrame`s it emits.

## Trying it locally

There is no visual renderer yet (that is phase 1c). Two ways to see the engine work:

```sh
yarn turbo test --filter=@agentopia/core        # 131 tests incl. fixture replays
yarn --cwd packages/core replay fixtures/02-subagent.jsonl
```

`replay` prints one line per simulated second of any bus file — including your own
recorded sessions:

```sh
yarn --cwd packages/core replay ~/.agentopia/sessions/<id>/bus.jsonl
```

The golden-frames snapshot in `src/__tests__/__snapshots__/` is the same choreography as
reviewable data.
