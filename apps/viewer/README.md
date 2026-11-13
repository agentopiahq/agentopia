# @agentopia/viewer

The office, rendered. An isometric, hand-inked cartoon skin over `@agentopia/core`'s
`OfficeFrame`s, drawn in canvas 2D and composited by PixiJS v8:
the browser connects to the CLI's SSE stream, folds catch-up events without animating,
and animates live ones at 60fps (with a coarse fallback tick while the tab is hidden,
since Chrome suspends rAF there).

Two modes. With no `?session` the page is **the floor**: every live session at once, one
desk each, live only — there is no single recording to scrub. Tap a desk's name to open
that session with the play bar; "‹ every session" under the title comes back. With `?session=<id>` it is
one session with the scrubber (`src/replay.ts` drives it): `?replay` re-animates the
recording from the start; without it the session is live, the office follows the live edge
(LIVE badge lit), clicking the track time-travels through what already happened, and the
go-live button — or just playing until the cursor catches up — rejoins the edge. The
speed pill at the bar's right end opens a log-scaled slider (0.25x–5x, snapping to the
common rates); resting the pointer on any control for a moment explains it.

The camera controls bottom right turn and zoom the office. **Drag** turns it round like a
model on a turntable (⟲ ⟳ and the arrow keys step it); `−` and `+` (or the `-` and `+` keys)
zoom from the camera's own fit down to 0.6x and up to 4x, holding the middle of the view
still; **Shift-drag** (or a right or middle drag) pans a zoomed-in view; `reset` (or `0`)
puts all three back (`src/zoom.ts`). The objects are real 3D models, so shading, which faces
show, cast shadows and depth order all follow the angle; light turns with the viewer, the
way Colorfigures does it. The room has four walls and only those on the far side stand,
fading as they swing round, with whatever hangs on them; each margin label travels with its part,
keeping its place relative to it as the room turns (and stepping clear of the title, the
readout and the footnote). While a drag turns it, each piece is redrawn
roughly into a canvas it keeps for the purpose (still sorted among the cast), and properly
when the drag ends.

Every desk is titled with the harness's own session name, read from the samples the
emitter writes onto turn-level bus records — no second data source — and carries a phase
badge straight from reduced state ("waiting on you", "needs approval"), a `+N` count of
the session's subagents, and a monitor that scrolls the running command in tiny terminal
type, laid onto the monitor's glass. The desk sorts into the cast by its footprint, so
whoever sits at the desk draws over the screen and whoever walks past behind it is hidden
by it. Speech bubbles float over everything, so a lead asking at its desk is always read.

### The look

The office is one sheet in the manner of a Tinycharts annotated
scene: cream paper with a faint isometric construction grid, the title block top left, a
live readout top right ("the office has 3 sessions · 1 waiting on you", red while a desk
wants you), small-capital margin labels with leader lines down to the speaker, the
cabinets, the door, the copiers and the desks, and the office itself standing on a cut
slab of floorboards with two back walls. Every object follows
[Colorfigures](https://april-zhu.com/colorfigures): a real isometric solid shaded in three
flat bands (top light, the lit side mid, the shaded side dark), a heavy ink silhouette with
finer inner lines, and one flat blue cast shadow toward the lower left. No gradients, no
glows. Text on the sheet is Young Serif (the title) and Gaegu (every hand-lettered word),
bundled through `@fontsource` so the office works offline.

- `src/kit/iso.ts` — the isometric pen: projection, facing and three-band tone, boxes,
  prisms (swept outlines, banded strip by strip), cylinders, rods, balls, cast shadows,
  text laid on a face, and back-to-front sorting of an object's parts. The ink has a slight
  deterministic wobble; nothing reads a clock or an rng.
- `src/kit/palette.ts` — the paper, the ink, the shadow blue, the marker colours and the
  three-tone materials.
- `src/objects/` — one file per object (desk, printer, copier, cabinet, door, plant, and
  the wall pieces: speaker, shutter, whiteboard, clock, window), each authored in its own
  frame with its front toward local +y, then stood against whichever wall it belongs to.
  Body and cast shadow are separate: every shadow is painted into the floor before
  anything stands up.
- `src/room.ts` — the sheet: where each object stands, the floor, walls, rugs, labels,
  and the bake of all of it into one canvas.

The art is drawn once into textures and re-drawn only when the zoom settles at a new
device resolution, so it stays crisp at any size. The characters are drawn every frame.

`src/renderer.ts` bakes the sheet and the furniture, sorts the cast among them, and owns
the desks' live overlays and the camera; `src/character.ts` owns Claude, as a _rig_ drawn
into its own canvas each frame after T's reference cartoon: an orange starburst whose fat,
tapered spikes are longest on top, like a tuft, and short underneath (`RAY_LENGTHS`), with
a tiny low face of upright dot eyes and an open grin, and stubby limbs. It is cut into the
same three bands as every solid, but outlined thinly in its own darker orange (`edge`)
rather than the sheet's heavy ink, so it stays soft next to the inked furniture. It blinks now and then, each
actor on its own phase hashed from its id. A state is a pose:
`poseFor(state, facing, t)` is pure, so replays and golden frames stay reproducible. Real
sprite art swaps each drawn part for an image at the same pose, without touching the pose
function.

### Retuning the character

Every proportion is in the **tuning dials** block at the top of `src/character.ts` — size,
body shape, face, limbs, props, line weights. Changing how Claude _looks_ means editing
that block and nothing else. Two things live elsewhere on purpose:

- **Colours** are `CLAUDE` and `CLAUDE_SLUMP` at the top of `src/character.ts`, three
  tones each from the office's marker palette; the ink is the sheet's (`src/kit/palette.ts`).
- **Where the limbs go in each state** sits with the state itself, in `poseFor` and its
  helpers. That is choreography, not proportion: a hand's resting place is a dial
  (`HAND_X`), but the arc it swings through while walking belongs next to `walking`.

Tune against the `Character/Claude` stories — `Closeup` has a scale slider for silhouette
and line weight, `States` shows the whole vocabulary at once, `Turnaround` shows every side it can be
seen from. Check any change at office
scale too (any event story, in a narrow window): a hairline that reads at 7x can vanish
there, and it is the first thing to go.

This package is a _skin_. Restyling (pixel, HD-2D-ish) means a new renderer + art
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
- `showcase.stories.ts` — **Office**: the floor with one session touching every event kind
  and two neighbours sharing it, for judging how desks, badges and helper counts read
  together.
- `character.stories.ts` — the character sheet, outside the per-event structure. **States**
  poses every `ActorState` side by side; **Closeup** blows one up (with a scale slider) for
  judging silhouette and line weight; **Turnaround** shows it facing right, facing left and
  from behind, standing and walking. The event stories show a state _in context_; this one
  shows the whole vocabulary, which is what you want when changing proportions or the
  palette. `ActorState` is the contract between core and any skin, so the sheet doubles as
  the checklist a new skin has to fill in.
- `objects.stories.ts` — **Office/Objects**: every piece of furniture on its own plate of
  paper, one story each plus a **Catalogue** of all of them, with a zoom slider (ink scales
  with it, like a photograph of the office) and a facing control to turn an object to
  each wall it can stand against — `CabinetFromBehind` is how the far wall's cabinets look.
- `room.stories.ts` — **Office/Room**: the sheet with all its furniture and nobody in it,
  for judging the composition without a crowd in the way.

State-only events (`task.*`, `notify`, `approval.denied`, `context.compacted`) render
the full scene with a note saying no animation is staged — they are in the library on
purpose, as the catalog of what is _not yet_ animated.

CI builds this Storybook and uploads it to Chromatic (`.github/workflows/storybook.yaml`).
Under Chromatic's capture browser the harness freezes each story on one deterministic
frame — the midpoint of its phase window — because snapshotting a looping canvas would
diff a different arbitrary frame every build.

## Credits

The look follows two of April Zhu's drawing skills. The objects follow
[Colorfigures](https://april-zhu.com/colorfigures) (MIT; built on ISO-GLOW by April Zhu
and iso-figure by Tolga Cohce): its three-band shading, ink weights and flat cast shadows,
reimplemented here for canvas 2D. The sheet follows Tinycharts Pro's annotated-scene
layout and marker palette, used under the owner's licence; none of its kit files are
included. See `THIRD_PARTY_NOTICES.md`.
