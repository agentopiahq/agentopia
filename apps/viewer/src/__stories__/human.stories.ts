import { Actor, ArmSwing } from '@agentopia/core';

import { drawHuman, humanPose } from '../human';
import { fontsReady } from '../kit/fonts';
import { FONT } from '../kit/iso';
import { SHEET } from '../kit/palette';
import { SEAT_Z } from '../objects/chair';
import { isSnapshotCapture, playToggle } from './lib/harness';

/**
 * The human sheet: you, in every pose the office asks of you, side by side —
 * on your feet, standing at ease swaying, and walking, sat on a seat (at ease, saying a prompt, thinking
 * over a lead's request), and on the floor against the wall hugging your
 * knees — facing either way and from behind.
 */

interface Cell {
  label: string;
  state: Actor['state'];
  /** 0 on its feet, 1 sat down. */
  sit: number;
  seat: 'sit' | 'hug';
  facing: 1 | -1;
  back?: boolean;
  /** Standing at ease, swaying, the arms swinging this way. */
  sway?: ArmSwing;
}

const CELLS: Cell[] = [
  { label: 'standing', state: 'idle', sit: 0, seat: 'sit', facing: 1 },
  { label: 'at ease · arms together', state: 'idle', sit: 0, seat: 'sit', facing: 1, sway: 'same' },
  {
    label: 'at ease · arms against',
    state: 'idle',
    sit: 0,
    seat: 'sit',
    facing: -1,
    sway: 'opposite',
  },
  {
    label: 'at ease, from behind',
    state: 'idle',
    sit: 0,
    seat: 'sit',
    facing: 1,
    back: true,
    sway: 'same',
  },
  { label: 'walking', state: 'walking', sit: 0, seat: 'sit', facing: 1 },
  { label: 'walking away', state: 'walking', sit: 0, seat: 'sit', facing: -1, back: true },
  { label: 'on a seat', state: 'idle', sit: 1, seat: 'sit', facing: 1 },
  { label: 'saying a prompt', state: 'talking', sit: 1, seat: 'sit', facing: 1 },
  { label: 'thinking it over', state: 'thinking', sit: 1, seat: 'sit', facing: -1 },
  { label: 'on a seat, from behind', state: 'idle', sit: 1, seat: 'sit', facing: 1, back: true },
  { label: 'on the floor', state: 'idle', sit: 1, seat: 'hug', facing: -1 },
  { label: 'on the floor, saying it', state: 'talking', sit: 1, seat: 'hug', facing: 1 },
  { label: 'on the floor, thinking', state: 'thinking', sit: 1, seat: 'hug', facing: 1 },
  { label: 'on the floor, from behind', state: 'idle', sit: 1, seat: 'hug', facing: 1, back: true },
];

interface Args {
  scale: number;
}

/** A plain cushion under a sitter, at seat height, so the sit reads. */
function cushion(g: CanvasRenderingContext2D): void {
  const top = -(SEAT_Z * 32) / 1.55;
  g.fillStyle = '#d8c7a8';
  g.strokeStyle = SHEET.ink;
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(-9, top, 16, -top, 2);
  g.fill();
  g.stroke();
}

function sheet(args: Args): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = `background:${SHEET.paper};padding:16px;font-family:${FONT.hand};color:${SHEET.ink}`;
  const toggle = playToggle();
  if (!isSnapshotCapture()) {
    wrap.append(toggle.el);
  }
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:8px';
  wrap.append(grid);
  const scale = args.scale;
  const w = 56 * scale;
  const h = 72 * scale;
  const cells = CELLS.map((cell) => {
    const figure = document.createElement('figure');
    figure.style.cssText = 'margin:0;text-align:center;font-size:15px';
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.cssText = `width:${w}px;height:${h}px;background:#fbf6ea;border-radius:8px`;
    const caption = document.createElement('figcaption');
    caption.textContent = cell.label;
    figure.append(canvas, caption);
    grid.append(figure);
    return { cell, canvas, dpr };
  });

  const draw = (t: number): void => {
    for (const { cell, canvas, dpr } of cells) {
      const g = canvas.getContext('2d') as CanvasRenderingContext2D;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      // Rig units are 1/1.55 of a sheet pixel; the sheet draws them at `scale`.
      const k = scale * dpr * 1.55;
      g.setTransform(k, 0, 0, k, (w / 2) * dpr, (h - 5 * scale) * dpr);
      g.fillStyle = SHEET.shadow;
      g.globalAlpha = SHEET.shadowAlpha;
      g.beginPath();
      g.ellipse(0, 0, 10, 3.4, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      if (cell.sit > 0 && cell.seat === 'sit') {
        cushion(g);
      }
      const actor: Actor = {
        id: 'human',
        bus: '',
        worker: 'human',
        role: 'human',
        label: 'you',
        pos: { x: 0, y: 0 },
        state: cell.state,
        progress: 0,
        facing: cell.facing,
        stress: 0,
        activity: cell.sway
          ? { id: 'human', act: 'sway', arms: cell.sway, key: 'human#sheet' }
          : undefined,
      };
      g.scale(cell.facing, 1);
      drawHuman(g, humanPose(actor, t, cell.sit, cell.seat, t * 1.6), cell.back === true, t);
    }
  };

  if (isSnapshotCapture()) {
    void fontsReady().then(() => draw(1.7));
  } else {
    let t = 0;
    let last: number | null = null;
    const frame = (now: number): void => {
      if (!wrap.isConnected && last !== null) {
        return;
      }
      if (last !== null && !toggle.isPaused()) {
        t += (now - last) / 1000;
      }
      last = now;
      draw(t);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  return wrap;
}

export default {
  title: 'Character/Human',
  args: { scale: 3 },
  argTypes: { scale: { control: { type: 'range', min: 1, max: 6, step: 0.5 } } },
};

export const Poses = { render: (args: Args) => sheet(args) };
