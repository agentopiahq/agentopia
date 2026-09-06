# @agentopia/viewer

The office, rendered. A PixiJS v8 cartoon skin over `@agentopia/core`'s `OfficeFrame`s:
the browser connects to the CLI's SSE stream, folds catch-up events without animating,
and animates live ones at 60fps (with a coarse fallback tick while the tab is hidden,
since Chrome suspends rAF there).

Two modes. With no `?session` the page is **the floor**: every live session at once, one
desk each, live only — there is no single recording to scrub. With `?session=<id>` it is
one session with the scrubber (`src/replay.ts` drives it): `?replay` re-animates the
recording from the start; without it the session is live, the office follows the live edge
(LIVE badge lit), clicking the track time-travels through what already happened, and the
go-live button — or just playing until the cursor catches up — rejoins the edge. The
speed pill at the bar's right end opens a log-scaled slider (0.25x–5x, snapping to the
common rates); resting the pointer on any control for a moment explains it.

Every desk is titled with the harness's own session name, read from the samples the
emitter writes onto turn-level bus records — no second data source — and carries a phase
badge straight from reduced state ("waiting on you", "needs approval"), a `+N` count of
the session's subagents, and a monitor that scrolls the running command in tiny terminal
type. The desk overlay sorts into the cast by the desk's own depth, so whoever sits at the
desk (with their bubble and thought dots) draws over the screen, and whoever walks past
behind it is hidden by it.

`src/renderer.ts` owns the room, the furniture, the desks and their overlays, and the
camera; `src/character.ts` owns Claude, as a *rig*. The body and face are built once and then translated, rotated and squashed,
and only the limbs and the held terminal are rebuilt per frame. A state is a pose:
`poseFor(state, facing, t)` is pure, so replays and golden frames stay reproducible. Real
sprite art swaps each part for a textured `Sprite` behind the same rig, without touching
the pose function.

### Retuning the character

Every proportion is in the **tuning dials** block at the top of `src/character.ts` — size,
body shape, face, limbs, props, line weights. Changing how Claude *looks* means editing
that block and nothing else. Two things live elsewhere on purpose:

- **Colours** are in `src/theme.ts`, because the office shares that palette. `worker`,
  `workerLine` and `slumpTint` are the body; `eye` is the face.
- **Where the limbs go in each state** sits with the state itself, in `poseFor` and its
  helpers. That is choreography, not proportion: a hand's resting place is a dial
  (`HAND_X`), but the arc it swings through while walking belongs next to `walking`.

Tune against the `Character/Claude` stories — `Closeup` has a scale slider for silhouette
and line weight, `States` shows the whole vocabulary at once. Check any change at office
scale too (any event story, in a narrow window): a hairline that reads at 7x can vanish
there, and it is the first thing to go.

This package is a *skin*. Restyling (pixel, HD-2D-ish) means a new renderer + theme
against the same frames — see PLAN §6. No game framework: the director in core owns the
loop and clock.

```sh
yarn turbo build --filter=@agentopia/viewer   # dist/ served by the CLI
yarn --cwd apps/viewer dev                  # vite dev server (needs a running agentopia server for /events)
yarn --cwd apps/viewer storybook            # the event/animation library on :6007
```

## The animation library (Storybook)

`src/__stories__/` is the workshop for tuning event animations one at a time, without
running a live session. Every event kind gets four stories — **Pre** (the transition in,
usually the walk), **Main** (the performance at the station), **Post** (the release:
linger, walk home), and **Full** (the whole scenario) — windowed automatically by
simulating the deterministic director headlessly and observing the watched actor's
states, then looping just that slice.

- `lib/scenarios.ts` — harness-agnostic event scripts, written in the normalized
  vocabulary. One per event kind; parameterized ones (tool kind, failure) take args.
- `lib/harness.ts` — the phase player: manual clock + seeded rng + the real
  `CartoonRenderer`, fast-forwarded silently to the phase window.
- `claude/` — one story file per event kind, bound to `choreographyFor('claude')`.
  When a harness gets its own choreography (Codex), it gets a sibling folder reusing
  the same scenarios against its own registry.
- `showcase.stories.ts` — **Office** is one session touching every event kind; **Floor** is
  three sessions at once, for judging how desks, badges and helper counts read together.
- `character.stories.ts` — the character sheet, outside the per-event structure. **States**
  poses every `ActorState` side by side; **Closeup** blows one up (with a scale slider) for
  judging silhouette and line weight. The event stories show a state *in context*; this one
  shows the whole vocabulary, which is what you want when changing proportions or the
  palette. `ActorState` is the contract between core and any skin, so the sheet doubles as
  the checklist a new skin has to fill in.

State-only events (`task.*`, `notify`, `approval.denied`, `context.compacted`) render
the full scene with a note saying no animation is staged — they are in the library on
purpose, as the catalog of what is *not yet* animated.

CI builds this Storybook and uploads it to Chromatic (`.github/workflows/storybook.yaml`).
Under Chromatic's capture browser the harness freezes each story on one deterministic
frame — the midpoint of its phase window — because snapshotting a looping canvas would
diff a different arbitrary frame every build.
