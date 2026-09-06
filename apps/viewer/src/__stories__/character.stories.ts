import { Actor } from '@agentopia/core';
import { Application, Container, Graphics, Text } from 'pixi.js';

import { AgentRig } from '../character';
import { THEME } from '../theme';
import { isSnapshotCapture } from './lib/harness';

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
  label: string;
  state: Actor['state'];
  /** Seated work at the worker's own machine, rather than at a station. */
  own?: boolean;
}

const CELLS: readonly Cell[] = [
  { label: 'idle', state: 'idle' },
  { label: 'thinking', state: 'thinking' },
  { label: 'waiting', state: 'waiting' },
  { label: 'walking', state: 'walking' },
  { label: 'sprinting', state: 'sprinting' },
  { label: 'pacing', state: 'pacing' },
  { label: 'working · station', state: 'working' },
  { label: 'working · own desk', state: 'working', own: true },
  { label: 'slump', state: 'slump' },
  { label: 'coffee', state: 'coffee' },
  { label: 'napping', state: 'napping' },
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
    role: 'worker',
    label: cell.label,
    pos: { x: 0, y: 0 },
    state: cell.state,
    station: cell.own ? 'own_desk' : 'workbench',
    progress: 0,
    facing,
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
  host.style.cssText = 'border-radius:12px;overflow:hidden;width:fit-content;';

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
      host.appendChild(app.canvas);

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

        rig.view.position.set(cellW / 2, baseline);
        rig.view.scale.set(scale);
        slot.addChild(rig.view);
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
      const started = performance.now();
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
        paint((now - started) / 1000);
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
  args: { facing: 'right', scale: 6, state: CELLS[0].label },
  argTypes: {
    ...facingControl,
    scale: { control: { type: 'range' as const, min: 3, max: 10, step: 0.5 } },
    state: { control: 'select' as const, options: CELLS.map((cell) => cell.label) },
  },
  render: (args: Args) =>
    mountSheet({
      facing: facingOf(args),
      cells: CELLS.filter((cell) => cell.label === args.state),
      scale: args.scale,
      cols: 1,
    }),
};
