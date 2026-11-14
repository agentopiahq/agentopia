import { PetKind, PetView } from '@agentopia/core';

import { fontsReady } from '../kit/fonts';
import { FONT } from '../kit/iso';
import { SHEET } from '../kit/palette';
import { drawPet, petPose } from '../pet';
import { isSnapshotCapture, playToggle } from './lib/harness';

/**
 * The pet sheet: every act the office cat and dog can be asked for, side by
 * side, so their poses can be tuned without waiting for one to come up on
 * the floor. `PetAct` is the contract between core and the skin, so this
 * sheet is also the checklist a future skin has to fill in.
 */

const ACTS: ReadonlyArray<[PetView['act'], string]> = [
  ['stand', 'standing'],
  ['walk', 'walking'],
  ['trot', 'running'],
  ['sniff', 'sniffing about'],
  ['sit', 'sitting'],
  ['gaze', 'gazing out'],
  ['beg', 'saying hello'],
  ['eat', 'eating'],
  ['drink', 'drinking'],
  ['loaf', 'lying down'],
  ['nap', 'napping'],
  ['stretch', 'stretching'],
  ['play', 'playing'],
  ['groom', 'washing'],
  ['jump', 'jumping up'],
];

interface Args {
  scale: number;
}

function sheet(kind: PetKind, args: Args): HTMLElement {
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
  const h = 46 * scale;
  const cells = ACTS.filter(([act]) => kind === 'cat' || act !== 'groom').map(([act, label]) => {
    const cell = document.createElement('figure');
    cell.style.cssText = 'margin:0;text-align:center;font-size:15px';
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.cssText = `width:${w}px;height:${h}px;background:#fbf6ea;border-radius:8px`;
    const caption = document.createElement('figcaption');
    caption.textContent = label;
    cell.append(canvas, caption);
    grid.append(cell);
    return { act, canvas, dpr };
  });

  const draw = (t: number): void => {
    for (const { act, canvas, dpr } of cells) {
      const g = canvas.getContext('2d') as CanvasRenderingContext2D;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      const k = scale * dpr;
      g.setTransform(k, 0, 0, k, (w / 2) * dpr, (h - 8 * scale) * dpr);
      // Its shadow on the floor.
      g.fillStyle = SHEET.shadow;
      g.globalAlpha = SHEET.shadowAlpha;
      g.beginPath();
      g.ellipse(0, 0, kind === 'cat' ? 9 : 11, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      const pet: PetView = {
        id: `pet/${kind}`,
        kind,
        pos: { x: 0, y: 0 },
        z: 0,
        dir: { x: 1, y: 0 },
        act,
        phase: (t * 1000) % 6000,
        progress: act === 'jump' ? (t % 1.2) / 1.2 : 0,
      };
      drawPet(g, kind, petPose(pet, pet.phase / 1000, t * 1.3), pet.id, t);
    }
  };

  // Under capture, one deterministic frame; otherwise, live.
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
  title: 'Character/Pets',
  args: { scale: 3 },
  argTypes: { scale: { control: { type: 'range', min: 1, max: 6, step: 0.5 } } },
};

export const Cat = { render: (args: Args) => sheet('cat', args) };
export const Dog = { render: (args: Args) => sheet('dog', args) };
