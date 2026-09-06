import { Actor } from '@agentopia/core';
import { Application, Container, Graphics, Text } from 'pixi.js';

import { AgentRig } from '../character';
import { THEME } from '../theme';
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
}

const CELLS: readonly Cell[] = [
  { key: 'idle', label: 'idle', state: 'idle' },
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
  const cellH = Math.round(100 * scale);
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
    actor: actorFor(cell, i, facing),
    rig: new AgentRig(),
  }));

  let disposed = false;
  let wasConnected = false;
  const createdAt = performance.now();

  void app
    .init({
      width: cols * cellW,
      height: rows * cellH,
      background: THEME.floor,
      antialias: true,
      autoStart: false,
      sharedTicker: false,
      resolution: Math.max(1, window.devicePixelRatio || 1),
      autoDensity: true,
    })
    .then(() => {
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      stage.appendChild(app.canvas);

      posed.forEach(({ cell, rig }, i) => {
        const slot = new Container();
        slot.position.set((i % cols) * cellW, Math.floor(i / cols) * cellH);

        const guide = new Graphics();
        guide
          .roundRect(6, 6, cellW - 12, cellH - 12, 10)
          .fill(THEME.stationZone)
          .stroke({ color: THEME.floorLine, width: 2 });
        guide
          .moveTo(cellW / 2 - 24 * scale, baseline)
          .lineTo(cellW / 2 + 24 * scale, baseline)
          .stroke({ color: THEME.floorLine, width: 2 });
        slot.addChild(guide);

        const caption = new Text({
          text: cell.label,
          style: {
            fill: THEME.stationLabel,
            fontSize: 13,
            fontFamily: 'ui-rounded, system-ui',
            fontWeight: '600',
          },
        });
        caption.anchor.set(0.5, 1);
        caption.position.set(cellW / 2, cellH - 12);
        slot.addChild(caption);

        const zoom = new Container();
        zoom.position.set(cellW / 2, baseline);
        zoom.scale.set(scale);
        zoom.addChild(rig.view);
        slot.addChild(zoom);
        app.stage.addChild(slot);
      });

      const paint = (t: number): void => {
        for (const { actor, cell, rig } of posed) {
          rig.update(actor, t, cell.own === true);
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

/** One state, big — the view for judging the silhouette and the line weight. */
export const Closeup = {
  args: { facing: 'right', scale: 6, state: CELLS[0].key },
  argTypes: {
    ...facingControl,
    scale: { control: { type: 'range' as const, min: 3, max: 10, step: 0.5 } },
    state: { control: 'select' as const, options: CELLS.map((cell) => cell.key) },
  },
  render: (args: Args) =>
    mountSheet({
      facing: facingOf(args),
      cells: CELLS.filter((cell) => cell.key === args.state),
      scale: args.scale,
      cols: 1,
    }),
};
