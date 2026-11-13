import { Actor } from '@agentopia/core';
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';

import { AgentRig } from '../character';
import { fontsReady } from '../kit/fonts';
import { C, FONT, Iso, S, V3 } from '../kit/iso';
import { SHEET, hexNum } from '../kit/palette';
import { DESK_CHAIR_TUCK, OBJECTS } from '../objects';
import { drawObject, makeCanvas, measure } from '../objects/bake';
import { HEADING_SPIN, deskSpin, sitterOffset } from '../seating';
import { isSnapshotCapture, playToggle } from './lib/harness';

/**
 * The character sheet: every actor state the director can ask for, posed side
 * by side at 2× so the rig can be tuned without hunting through scenarios.
 *
 * The event stories show a state *in context*; this one shows the whole
 * vocabulary at once, which is what you want when changing proportions, the
 * palette, or a pose. `ActorState` is the stable contract between core and any
 * skin, so this sheet is also the checklist a future skin has to fill in.
 */

interface Cell {
  /** Slug, so the closeup's state can travel in a Storybook args URL. */
  key: string;
  label: string;
  state: Actor['state'];
  /** Seated work at the worker's own machine, rather than at a station. */
  own?: boolean;
  /** Backlog pressure, 0..1: the face strains, then frowns. */
  stress?: number;
  /**
   * Seen from behind. Typing at its own desk always is, since the lead faces
   * its monitor; this forces it for any other state.
   */
  back?: boolean;
  /** Overrides the sheet's facing, for the turnaround. */
  facing?: 1 | -1;
  /**
   * Sat in its desk chair, the chair swivelled this way (`-y` is toward the
   * desk, so seen from behind).
   */
  seated?: '-y' | '+x' | '+y';
}

const CELLS: readonly Cell[] = [
  { key: 'idle', label: 'idle', state: 'idle' },
  { key: 'behind', label: 'idle · from behind', state: 'idle', back: true },
  { key: 'thinking', label: 'thinking', state: 'thinking' },
  { key: 'waiting', label: 'waiting', state: 'waiting' },
  { key: 'walking', label: 'walking', state: 'walking' },
  { key: 'sprinting', label: 'sprinting', state: 'sprinting' },
  { key: 'pacing', label: 'pacing', state: 'pacing' },
  { key: 'station', label: 'working · station', state: 'working' },
  { key: 'desk', label: 'working · own desk', state: 'working', own: true },
  { key: 'talking', label: 'talking', state: 'talking' },
  { key: 'strained', label: 'working · strained', state: 'working', own: true, stress: 0.5 },
  { key: 'worried', label: 'thinking · worried', state: 'thinking', stress: 1 },
  { key: 'slump', label: 'slump', state: 'slump' },
  { key: 'napping', label: 'napping', state: 'napping' },
];

/**
 * The turnaround: one look from each side the office can show — three-quarter
 * right, three-quarter left, and from behind — standing and mid-stride, so a
 * change to the face or the banding can be judged from every angle at once.
 */
const TURNAROUND: readonly Cell[] = [
  { key: 'right', label: 'facing right', state: 'idle', facing: 1 },
  { key: 'left', label: 'facing left', state: 'idle', facing: -1 },
  { key: 'back', label: 'from behind', state: 'idle', back: true },
  { key: 'walk-right', label: 'walking right', state: 'walking', facing: 1 },
  { key: 'walk-left', label: 'walking left', state: 'walking', facing: -1 },
  { key: 'walk-back', label: 'walking away', state: 'walking', back: true },
];

/**
 * Seated at its desk, in its task chair: every state a lead can be in there.
 * Typing and a slump face the monitor, so they are seen from behind with the
 * chair's back over them; everything else swivels round toward the room.
 */
const SEATED: readonly Cell[] = [
  { key: 'sit-typing', label: 'typing', state: 'working', own: true, seated: '-y' },
  { key: 'sit-idle', label: 'idle', state: 'idle', seated: '+x' },
  { key: 'sit-thinking', label: 'thinking', state: 'thinking', seated: '+x' },
  { key: 'sit-waiting', label: 'waiting', state: 'waiting', seated: '+x' },
  { key: 'sit-talking', label: 'talking', state: 'talking', seated: '+y', facing: -1 },
  { key: 'sit-napping', label: 'napping', state: 'napping', seated: '+x' },
  { key: 'sit-slump', label: 'slump', state: 'slump', seated: '-y' },
  { key: 'sit-worried', label: 'thinking · worried', state: 'thinking', seated: '+x', stress: 1 },
];

/** A desk chair pulled in and swivelled, drawn with the office's pen, centred on the sitter. */
function chairSprite(spin: number, resolution: number): Sprite {
  const chair = OBJECTS.deskChair;
  const unit = 32;
  const probe = new Iso(
    document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D,
    {
      unit,
    }
  );
  // The room stands desk chairs a half turn round, so the tuck flips: placed
  // there, the tucked chair is centred on the origin, under the rig's feet.
  const place = { at: [DESK_CHAIR_TUCK[0], DESK_CHAIR_TUCK[1], 0] as V3, facing: '-y' as const };
  const state = { tucked: 1, spin };
  const rect = measure(probe, chair, place, false, 4);
  const canvas = makeCanvas(rect.w, rect.h, resolution);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(resolution, resolution);
  drawObject(new Iso(ctx, { unit, origin: [-rect.x, -rect.y] }), chair, place, false, state);
  const sprite = new Sprite(Texture.from(canvas));
  sprite.scale.set(1 / resolution);
  sprite.position.set(rect.x, rect.y);
  return sprite;
}

/** The frame Chromatic captures: mid-stride for the walks, mid-tap for typing. */
const FROZEN_T = 2.37;

interface SheetOptions {
  facing: 1 | -1;
  cells: readonly Cell[];
  scale: number;
  cols: number;
}

function actorFor(cell: Cell, index: number, facing: 1 | -1): Actor {
  return {
    // A stable, distinct id per cell: the terminal's scroll is hashed from it.
    id: `sheet-${index}`,
    bus: 'sheet',
    worker: `sheet-${index}`,
    role: 'lead',
    label: cell.label,
    pos: { x: 0, y: 0 },
    state: cell.state,
    station: cell.own ? 'own_desk' : 'speaker',
    progress: 0,
    facing,
    stress: cell.stress ?? 0,
  };
}

function mountSheet(options: SheetOptions): HTMLElement {
  const { facing, cells, scale, cols } = options;
  const cellW = Math.round(96 * scale);
  // Tall enough that the thinking dots stay inside their own plate.
  const cellH = Math.round(124 * scale);
  // Feet sit above the caption strip at the bottom of the cell.
  const baseline = cellH - Math.round(28 * scale);
  const rows = Math.ceil(cells.length / cols);
  const host = document.createElement('div');
  host.style.cssText =
    'display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:fit-content;' +
    'font-family:ui-rounded,system-ui,sans-serif;';
  const toggle = playToggle();
  const stage = document.createElement('div');
  stage.style.cssText = 'border-radius:12px;overflow:hidden;';
  host.append(toggle.el, stage);

  const app = new Application();
  const posed = cells.map((cell, i) => ({
    cell,
    actor: actorFor(cell, i, cell.facing ?? facing),
    // No floor here to catch it, so each character casts its own shadow.
    rig: new AgentRig({ shadow: true }),
  }));
  const resolution = scale * Math.max(1, window.devicePixelRatio || 1);

  let disposed = false;
  let wasConnected = false;
  const createdAt = performance.now();

  void fontsReady()
    .then(() =>
      app.init({
        width: cols * cellW,
        height: rows * cellH,
        background: hexNum(SHEET.page),
        antialias: true,
        autoStart: false,
        sharedTicker: false,
        resolution: Math.max(1, window.devicePixelRatio || 1),
        autoDensity: true,
      })
    )
    .then(() => {
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      stage.appendChild(app.canvas);

      posed.forEach(({ cell, rig }, i) => {
        const slot = new Container();
        slot.position.set((i % cols) * cellW, Math.floor(i / cols) * cellH);

        // A plate of paper per pose, like the object sheet.
        const guide = new Graphics();
        guide
          .roundRect(6, 6, cellW - 12, cellH - 12, 6)
          .fill(hexNum(SHEET.paper))
          .stroke({ color: hexNum(SHEET.grid), width: 1.5 });
        slot.addChild(guide);

        const caption = new Text({
          text: cell.label.toUpperCase(),
          style: {
            fill: hexNum(SHEET.ink),
            fontSize: 15,
            fontFamily: FONT.hand,
            letterSpacing: 1.5,
          },
        });
        caption.anchor.set(0.5, 1);
        caption.position.set(cellW / 2, cellH - 12);
        slot.addChild(caption);

        const zoom = new Container();
        zoom.position.set(cellW / 2, baseline);
        zoom.scale.set(scale);
        zoom.addChild(rig.view);
        if (cell.seated) {
          // Back in the chair, against its backrest, as the office seats it.
          const spin = cell.seated === '-y' ? deskSpin(0) : HEADING_SPIN[cell.seated];
          const lean = sitterOffset(spin, 0);
          rig.view.position.set((lean.x - lean.y) * C * 32, (lean.x + lean.y) * S * 32);
          // Seen from behind, the chair's back is nearer than its sitter.
          const chair = chairSprite(spin, resolution);
          zoom.addChildAt(chair, cell.seated === '-y' ? 1 : 0);
        }
        slot.addChild(zoom);
        app.stage.addChild(slot);
      });

      const paint = (t: number): void => {
        for (const { actor, cell, rig } of posed) {
          rig.update(actor, t, cell.own === true, resolution, {
            back: cell.back === true || cell.seated === '-y' || (cell.own === true && !cell.seated),
            sit: cell.seated ? 1 : 0,
          });
        }
        app.render();
      };

      if (isSnapshotCapture()) {
        paint(FROZEN_T);
        return;
      }
      // Elapsed time is accumulated rather than read off the wall clock, so a
      // pause holds the frame instead of the poses jumping when it resumes.
      let elapsed = 0;
      let last = performance.now();
      paint(elapsed);
      const tick = (now: number): void => {
        if (disposed) {
          return;
        }
        // Self-teardown once Storybook swaps the story out.
        if (host.isConnected) {
          wasConnected = true;
        } else if (wasConnected || now - createdAt > 10000) {
          disposed = true;
          posed.forEach(({ rig }) => rig.destroy());
          app.destroy(true, { children: true });
          return;
        }
        const dt = now - last;
        last = now;
        if (!toggle.isPaused()) {
          elapsed += dt;
          paint(elapsed / 1000);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  return host;
}

export default {
  title: 'Character/Claude',
};

interface Args {
  facing: 'right' | 'left';
  scale: number;
  state: string;
}

const facingOf = (args: Args): 1 | -1 => (args.facing === 'left' ? -1 : 1);

const facingControl = {
  facing: { control: 'inline-radio' as const, options: ['right', 'left'] },
};

/** Every state at once — the view for judging the whole vocabulary. */
export const States = {
  args: { facing: 'right', scale: 2.2 },
  argTypes: {
    ...facingControl,
    scale: { control: { type: 'range' as const, min: 1, max: 4, step: 0.2 } },
  },
  render: (args: Args) =>
    mountSheet({ facing: facingOf(args), cells: CELLS, scale: args.scale, cols: 4 }),
};

/** Every side of the character, standing and walking. */
export const Turnaround = {
  args: { scale: 2.6 },
  argTypes: {
    scale: { control: { type: 'range' as const, min: 1, max: 4, step: 0.2 } },
  },
  render: (args: Args) => mountSheet({ facing: 1, cells: TURNAROUND, scale: args.scale, cols: 3 }),
};

/** Every state a lead sits through at its desk, in its task chair. */
export const Seated = {
  args: { scale: 2.2 },
  argTypes: {
    scale: { control: { type: 'range' as const, min: 1, max: 4, step: 0.2 } },
  },
  render: (args: Args) => mountSheet({ facing: 1, cells: SEATED, scale: args.scale, cols: 4 }),
};

/** One state, big — the view for judging the silhouette and the line weight. */
export const Closeup = {
  args: { facing: 'right', scale: 6, state: CELLS[0].key },
  argTypes: {
    ...facingControl,
    scale: { control: { type: 'range' as const, min: 3, max: 10, step: 0.5 } },
    state: { control: 'select' as const, options: [...CELLS, ...SEATED].map((cell) => cell.key) },
  },
  render: (args: Args) =>
    mountSheet({
      facing: facingOf(args),
      cells: [...CELLS, ...SEATED].filter((cell) => cell.key === args.state),
      scale: args.scale,
      cols: 1,
    }),
};
