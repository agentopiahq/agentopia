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

The camera controls bottom right show only a little mouse per move, lighting the part
that does it, with the reset key (two chasing arrows) under them. Hovering them opens
each row out leftward into its words and the buttons that do it by clicking; the panel
stays open half a second after the pointer leaves, so the buttons are easy to reach. **Left-drag** (or the four arrow buttons beside "move") moves the view around — a press that barely
moves is a click, never a drag; a **right-button drag** (or a middle or **Shift-drag**, for
a trackpad, or ⟲ ⟳ and the arrow keys) turns it round like a model on a turntable; the
**scroll wheel** (or a trackpad pinch) zooms about the cursor, and `−` and `+` (or the `-`
and `+` keys) step the zoom about the middle of the view, from 0.6x to 4x of the camera's
own fit; reset (or `0`) puts all three back (`src/zoom.ts`). Above the mice, the export key (an
arrow into a tray, lettered "save png" while hovered) saves a PNG of the whole view at the
screen's density, the corners included and the key itself left out (`src/snapshot.ts`): the
office's WebGL canvas is copied straight after a fresh paint, the page elements over it
are lettered by `html-to-image` on a clear ground, and the two are laid together. The
fonts it embeds are read when the pointer reaches the key, so the first picture is quick
too. The app and the website's hero both mount it. At the top of the stack, the settings key
(a cog) opens a card of settings to its left (`src/settings.ts`). It holds the daylight bar:
the sky's day from midnight to midnight, with a marker at the time outside. Drag the marker
and the sun, the moon and the light run along with it; click the bar and the sky jumps
there; either way the sky runs on from where it was left, at the time-lapse's pace. The
reset key beside the bar puts it back on the wall clock. The time outside is the
renderer's `SkyClock` (`src/skyClock.ts`): the wall clock's time-lapse plus an offset set
by hand. While the bar is dragged, the windows redraw at most every 50 ms and the floor's
sunlight waits until the bar rests. Under the bar, the weather section lists every kind the
sky has (`WEATHER_KINDS` in `src/sky.ts`), the one outside now lit. A pick rolls in over
about two seconds and is held through every ten-minute spell until the reset key beside the
row hands the weather back to the clock, which rolls across to the clock's weather the same
way. That is the renderer's `SkyWeather` (`src/skyWeather.ts`), handed to `skyAt` in place of
the clock's weather; the windows redraw while a change rolls in, as for a drag. Neither the
time nor the weather picked is saved: a reload puts both back on the clock. The objects are real 3D models, so shading, which faces
show, cast shadows and depth order all follow the angle; light turns with the viewer, the
way Colorfigures does it. The room has four walls and only those on the far side stand,
fading as they swing round, with whatever hangs on them; each margin label (when lettered) travels with its part,
keeping its place relative to it as the room turns (and stepping clear of the title, the
readout). While a drag turns it, each piece is redrawn
roughly into a canvas it keeps for the purpose (still sorted among the cast), and properly
when the drag ends.

The margin labels are not lettered on the sheet; a part's label shows when you click it.
**Clicking an object** works it (`src/interact.ts`). One that does one thing toggles at
once: the front door, the meeting room's double door (both leaves together), a phone
booth's door, the drinks fridge, the meeting room's screen. The clock is not a control: it always shows your local time. One that
does several letters its annotation in the margin (`src/popover.ts`), as the sheet's labels
were, with a leader line to where you clicked and its controls under the note: a blind goes
up, half or down, or the whole wall's at once, and the sunlight on the floor follows; a
filing cabinet's drawers slide out; the projection screen rolls away or shows slides. On
the floor, an occupied desk's annotation offers "Clear this desk", which sends its session
home (`Director.dismiss`) for one that left without a goodbye, such as an archived thread;
it comes back on its next event, and the page remembers the dismissal across reloads
(`src/dismissed.ts`). The
sprint board opens up close (`src/boardEditor.ts`, over `src/board.ts`): edit the title and
the notes, add, tear off and drag notes between columns, draw in the tray's three markers,
rub out with the eraser, or wipe it. The usage board over the print corner
(`src/objects/usageBoard.ts`) shows today's API-rate cost, the last seven days as marker
bars and today's spend by agent on sticky notes, from the server's `/api/usage` (polled every
minute by `src/usage.ts`); a click opens the ledger (`src/usagePanel.ts`): daily, weekly or
monthly bars back to the first day with usage (scrolling sideways, opening on today), the picked period's tokens and spend by agent, by project (a desktop worktree counts as its repo; each opens, closed by
default, to its sessions) and by model (and by
harness once there are two), and where its prices came from. The
marketing site's office has no server, so `src/hero.ts` hands it made-up usage
(`src/mockUsage.ts`: a seeded few months ending today), and the ledger says it is made up. Any other part
shows just its annotation.
A hint follows the pointer over anything clickable;
a click on the floor closes whatever is open. Every number eases, so doors swing; a door
also swings open for whoever walks through it and goes back to how you left it. Hit tests
read the pixels a piece was drawn into, so a click through the gap under a table lands on
the floor. The arrangement is the viewer's own, kept in the browser (`localStorage`), and
never reaches core. Things hung on the walls are sprites of their own over the sheet, so a
blind can change without the sheet redrawn; the sheet is redrawn once a change that casts a
shadow or moves the sunlight has settled.

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
wants you), small-capital margin labels with leader lines down to the meeting room, the
cabinets, the door, the copiers and the desks, and the office itself standing on a cut
slab of oak planks with cream walls and daylight from the windows laid on the floor. The
office is zoned like a real one (see core's `stations.ts`): a glass meeting room and two
phone booths in the far corner, then the print corner and the kitchen along
the far right wall; eight sit-stand desks in one block of two rows by the window wall; a storage bank of
cabinets; and along the near wall the entrance, a huddle table, and a lounge with a
sofa, an armchair and a bean bag. The style follows the project's reference cartoon:
warm wood, charcoal chairs, plants, thin soft brown outlines (`SHEET.line`) and warm
shadows. Every piece is sized to the avatar, whose dimensions live in
`src/objects/scale.ts` (`AVATAR`): seats at its hip height (`SEAT_Z`), desk and worktop at
its hands, buttons within its reach, and every door, the meeting room's walkway and the
phone booths wide and tall enough for it. `src/__tests__/scale.test.ts` checks each of
these, so sitting, making coffee or walking into a room can be animated later without
resizing the furniture. Every object follows
[Colorfigures](https://april-zhu.com/colorfigures): a real isometric solid shaded in three
bands (top light, the lit side mid, the shaded side dark), a heavy ink silhouette with
finer inner lines, and one blue cast shadow toward the lower left. On top of the bands the
pen lays a little light for a more realistic read (`Iso.sheen`, 0 for the flat original):
each face grades within its band, curved bodies shade smoothly, the lit front edges of a
top catch a rim of highlight, shadows deepen where a body meets the floor, and the room's
shadow layer is softened with a small blur. Text on the sheet is Young Serif (the title) and Gaegu (every hand-lettered word),
bundled through `@fontsource` so the office works offline.

- `src/kit/iso.ts` — the isometric pen: projection, facing and three-band tone with its
  in-band grading, boxes, prisms (swept outlines, banded strip by strip, smooth when
  curved), cylinders, rods, balls, cast and contact shadows, text laid on a face, and
  back-to-front sorting of an object's parts (`drawOrder`: a topological order over the
  pairs that overlap on screen, so separation constraints are never broken). The ink has a slight
  deterministic wobble; nothing reads a clock or an rng.
- `src/kit/palette.ts` — the paper, the ink, the shadow blue, the marker colours and the
  three-tone materials.
- `src/objects/` — one file per kind of object (desk, printer, copier, cabinet, door,
  plant, chairs, the meeting room and booths in `meeting.ts`, the kitchen, the lounge
  and huddle pieces, and the wall pieces:
  shutter, whiteboard, clock, windows), each authored in its own
  frame with its front toward local +y, then stood against whichever wall it belongs to.
  Body and cast shadow are separate: every shadow is painted into the floor before
  anything stands up.
- `src/objects/skyline.ts` and `src/sky.ts` — San Francisco through the windows: one
  panorama per glazed wall, as from a high floor in SoMa: the long wall looks east over
  downtown end to end, its rooftops carrying the billboards (`BILLBOARDS`, on fixed
  `BILLBOARD_SLOTS`, every other light), with the Bay Bridge at the far end; the front wall
  looks north to Alcatraz, Coit Tower and the Ferry Building; the right wall looks west to
  Twin Peaks, the Painted Ladies and the Golden Gate. Each is anchored to the world so it runs
  unbroken behind a band. `sky.ts` is the pure sky model, a time-lapse: a whole day every
  real hour on the wall clock's local minutes (`skyMinutes`: midnight on the hour, sunrise
  at a quarter past, noon at half past, sunset at a quarter to), while the clock itself
  keeps real time. The moon goes round its phases every `LUNAR_DAYS` (8) of those days,
  rising a phase of a day behind the sun as the real one does (new with the sun, full at
  sunset), and is drawn lit on the side facing the sun. The weather (clear, cloudy, fog,
  rain, storm, snow) changes every ten minutes from a hash of the time block. Clouds keep
  low enough to show under the transom and a blind at its default height. The renderer
  redraws the windows every five seconds, the floor's sunlight in coarser steps, and draws
  live on the glass: rain streaking down it, snow drifting past it, and in a storm a
  lightning strike every couple of seconds, the glass flaring white with a bolt across one
  light, and now and then (about one every three minutes) a tornado that drops out of the cloud,
  crawls across one light for about 24 seconds and lifts away (`src/storm.ts`, pure: time
  in, strike and tornado out). The `Office/Room` stories take an hour, a weather
  and a moon phase.
- `src/room.ts` — the sheet: where each object stands, the floor, walls, rugs, labels,
  and the bake of all of it into one canvas.

The art is drawn once into textures and re-drawn only when the zoom settles at a new
device resolution, so it stays crisp at any size. The characters are drawn every frame.

`src/renderer.ts` bakes the sheet and the furniture, sorts the cast among them, and owns
the desks' live overlays and the camera; `src/character.ts` owns Claude, as a _rig_ drawn
into its own canvas each frame after T's reference cartoon: a head of seven straight-sided,
round-tipped rays (`RAYS`, each a bearing and a reach, the top one longest) whose roots
meet in notches on one circle (`CORE_R`), so the head reads round with no gaps between
rays. It runs straight on into a torso a touch narrower at the base, and the legs carry
the torso's sides straight down. The whole figure is one flat orange silhouette with one
dark brown-orange outline (`edge`) rather than the sheet's black ink. The face is
close-set upright dot eyes over a small D smile of white teeth. Stub arms end in mitten
hands, one raising a pointing finger while it talks. Thinking, it paces back and forth
(core's `pacing`) or pauses with the near hand under its chin and a serious, narrowed look;
the hand under the chin, and a tablet or folder held in front, are the only things drawn over
the body. Its legs leave the torso's outer corners and each steps under its own hip, never
crossing. Flat out (core's `running`, the furthest behind) the legs blur into a small
round wheel of motion lines under the body. Working away from a keyboard, a helper taps at a tablet and anyone at the cabinets
files sheets from a folder. Each state loops on the worker's own animation clock
(`Actor.phase`, in core's `CYCLE_MS`), and a change of state eases over `BLEND_S`. It blinks now and then, each
actor on its own phase hashed from its id. A state is a pose:
`poseFor(state, facing, t)` is pure, so replays and golden frames stay reproducible.

At its own desk a lead **sits** in the desk's task chair, whatever it is doing there
(`src/seating.ts`). Every seated pose is the same idle figure set down: the torso's base
on the cushion (`SEAT_TOP_Z`), stub legs hanging off the front, hands on the armrests,
in the lap or on the keys. Typing and a slump face the monitor, so they are seen from
behind with the chair's back over them: the chair swivels (up to a quarter turn) to keep
its back square to you, all through a turn of the view, and the lead sits right against it with its legs tucked out
of sight, so the backrest hides the body and the head shows above (seen at an angle,
the backrest slants off to one side and reads as an empty chair in front of someone
standing). The task chair is built wider than an ordinary one, to the avatar's hips
(`TASK` in `objects/chair.ts`, checked by the scale test); idle, thinking, waiting and napping swivel the
chair a quarter turn toward the room, and a briefing turns it to face the helper.
Sitting down and getting up blend the standing and seated poses over `SIT_S`, and the
chair slides in from where it stands aside on the same curve (its `tucked` and `spin`
state, which the renderer sets; the viewer can't). The task chair is baked in parts like
the seats below — its seat and base, its back, and each armrest — whose footprints swivel
and slide with it (`OfficeObject.partsOf`). The lead sorts from where it is drawn, pulled
in, but never into its desk (`sitterBox`), so its desk and everything on the desk are on
the right side of it from every view; its seat is always under it, each armrest goes by
which side of it it is on, and the back goes over it exactly when the lead is drawn from
behind (`deskChairOverSitter`). An explicit order like this overrides the boxes for that
pair in `drawOrder`, so the two rules can never close a loop. Core knows nothing of this: a lead
at its seat and not walking is a lead sitting. Real
sprite art swaps each drawn part for an image at the same pose, without touching the pose
function.

Idle life (`src/idlePose.ts`) is an overlay, never a state: core's `Actor.activity` names
the act (`read`, `drink`, `water`, `reach`…) and the prop in hand, and `activityPose`
adjusts the state's pose — hands, face, sway — while `drawProp` draws the book, mug, cup,
snack or watering can in the hand. An activity that sits down (`seated`) eases into the
same seated pose on a sofa or a café or meeting chair. Those seats are baked in parts
(`OfficeObject.parts`: a sofa's seat, back and two arms, a chair's seat and back), each
its own sprite sorted among the cast, so the sitter is drawn over the seat it sits on,
under the back only when the back is between it and the viewer, and under an arm only on
the viewer's side (`partsOverSitter`). A step that works a blind pulls the nearest window's blind
up or down partway through, the same change a click makes. The `Character/Claude/Idle`
story shows every act.

The office cat and dog (`src/pet.ts`, drawn by `src/petRig.ts`) follow the avatar's look —
chibi, flat coat colour under a thin outline in its own darker shade, ink only on the face —
side-on, turned to face left or right along the way they go. `petPose` is a pure function of
core's `PetView` (the act, its clock, how far it has walked); the renderer places each pet
at its `z` (up on a perch) and sorts it among the furniture by `PETS` in
`objects/scale.ts`. Their bowls and the dog's bed are office objects in `objects/pets.ts`.
The `Character/Pets` stories show every act for each.

The human — you — (`src/human.ts`, drawn by `src/humanRig.ts`) is after the project's
reference cartoon: a big-headed chibi with a mop of dark hair, a black hoodie, dark jeans and
white socks, in the same soft outlines over flat colour. Its arms and legs are drawn the
Claude rig's way: one stub each, behind the body, with a mitten or a sock on the end. Core reports the human in
`OfficeFrame.human`, an `Actor` with `role: 'human'`, and the renderer runs it through the
same sprite, heading, seating and sorting as every other figure, only with a `HumanRig`: on
a seat it is sorted against the seat's parts like any sitter; on the floor (`act: 'hug'`)
it sits with its knees hugged. Talking points a finger ahead; thinking puts a hand under
the chin. Its size is `HUMAN` in `objects/scale.ts`. The `Character/Human` story shows every
pose.

### Retuning the character

Every proportion is in the **tuning dials** block at the top of `src/character.ts` — size,
body shape, face, limbs, props, line weights. Changing how Claude _looks_ means editing
that block and nothing else. Two things live elsewhere on purpose:

- **Colours** come from the actor's harness skin (`src/skins/`: `claude.ts`, listed in
  `SKINS`), a body and a slump tone, three tones each from the office's marker palette; the
  ink is the sheet's (`src/kit/palette.ts`). Residents and harnesses with no skin are drawn
  as Claude.
- **Where the limbs go in each state** sits with the state itself, in `poseFor` and its
  helpers. That is choreography, not proportion: a hand's resting place is a dial
  (`HAND_X`), but the arc it swings through while walking belongs next to `walking`.

Tune against the `Character/Claude` stories — `Closeup` has a scale slider for silhouette
and line weight, `States` shows the whole vocabulary at once, `Turnaround` shows every side it can be
seen from, and `Seated` shows every state a lead sits through, in its chair. Check any change at office
scale too (any event story, in a narrow window): a hairline that reads at 7x can vanish
there, and it is the first thing to go.

This package is a _skin_. Restyling (pixel, HD-2D-ish) means a new renderer + art
against the same frames — see `ARCHITECTURE.md` §6. No game framework: the director in core owns the
loop and clock.

```sh
yarn turbo build --filter=@agentopia/viewer   # dist/ served by the CLI
yarn --cwd apps/viewer dev                  # vite dev server (needs a running agentopia server for /events)
yarn --cwd apps/viewer storybook            # the event/animation library on :6007
```

## The website's hero

`src/hero.ts` (exported as `@agentopia/viewer/hero`) mounts this same renderer
and director into any element with no server behind it, fed by the endless mock
session in `src/heroScript.ts`: one lead working through a turn, a helper filing
in, a walk over to the human for approval, a failing test then a passing one, and
a breather before the next turn. Its clock is advanced by the frame loop and its
rng is seeded, so every visit plays the same office. The office is the whole page, so
the hero runs the renderer in page mode (`new CartoonRenderer(clock, { page: true })`): the
paper and its grid carry on past the sheet's edges, so there is no page round the print; the
title block (as page text, smaller than on the sheet) and the readout stay pinned to the
view's top corners, and the title turns see-through wherever the office runs under it
(`officeOutline` in `room.ts`, `overlap.ts`); and the camera frames the office itself
(`OFFICE_BOX`), one zoom step in from fitting it, held on its middle instead of following
the cast. The hero sets no status line. It has the export key and the settings key above the
camera's mice too, so a visitor can save a picture of the demo office or run its sky round. The marketing
site (`apps/web`) loads it client-side in `OfficeScene.tsx`, as the whole home page.

## The small print

`src/credits/` folds the website's footer into two pill icons side by side in the office's
bottom-left corner, styled like the camera controls, so it never covers the office. The ©
opens into "Brought to you by folks from" with the makers' company logos (inlined SVG in
`logos.ts`) and the copyright; the link icon beside it opens into the GitHub mark and the
website's terms and privacy pages. Each opens upward while hovered (lingering half a second after the pointer leaves, so it can be reached on any path) or focused, and a tap
toggles it on touch screens. Every link opens in a new tab; on the website the legal links
are relative, in the local viewer they point at agentopia.town. The year comes from the
injected clock. Both the hero and the local viewer
(`main.ts`) mount it; `credits.stories.ts` shows the corners folded and open.

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
  `CartoonRenderer`, fast-forwarded silently to the phase window. Idle life (residents,
  and the office pets) is off unless a story passes `idleLife`, so an event story shows
  that event's staging and nothing wandering through it.
- `claude/` — one story file per event kind, bound to `choreographyFor('claude')`.
  When a harness gets its own choreography (Codex), it gets a sibling folder reusing
  the same scenarios against its own registry.
- `showcase.stories.ts` — **Office**: the floor with one session touching every event kind
  and two neighbours sharing it, for judging how desks, badges and helper counts read
  together. The one story with `idleLife: OFFICE_IDLE_LIFE`, so it is as lived in as the
  real floor.
- `character.stories.ts` — the character sheet, outside the per-event structure. **States**
  poses every `ActorState` side by side; **Closeup** blows one up (with a scale slider) for
  judging silhouette and line weight; **Turnaround** shows it facing right, facing left and
  from behind, standing and walking; **Seated** puts every desk state in the task chair. The event stories show a state _in context_; this one
  shows the whole vocabulary, which is what you want when changing proportions or the
  palette. `ActorState` is the contract between core and any skin, so the sheet doubles as
  the checklist a new skin has to fill in.
- `objects.stories.ts` — **Office/Objects**: every piece of furniture on its own plate of
  paper, one story each plus a **Catalogue** of all of them, with a zoom slider (ink scales
  with it, like a photograph of the office) and a facing control to turn an object to
  each wall it can stand against — `CabinetFromBehind` is how the far wall's cabinets look —
  and **States**: every object a click changes, in each state a click leaves it in.
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
