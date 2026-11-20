import { fontsReady } from '../kit/fonts';
import { Iso, drawOrder, viewToward } from '../kit/iso';
import { SHEET } from '../kit/palette';
import { OBJECTS } from '../objects';
import { drawObject, worldBox } from '../objects/bake';
import { ORIGIN, PIVOT, SHEET_H, SHEET_W, TILE } from '../room';
import { SERVER_PIECES, bakeServerSheet } from '../serverRoom';

/**
 * The server floor with nobody on it: its own sheet — paper, the raised
 * floor and the plenum under it, the walls and their signs, the labels —
 * with every rack, cooler and cable tray stood on it in depth order, each
 * moving part at one still of its loop.
 */

interface Args {
  zoom: number;
  /** Quarter turns round the floor, counter-clockwise from the home view. */
  turn: number;
  /** Which still of every moving part's loop to show. */
  frame: number;
}

function still(args: Args): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = `background:${SHEET.page};padding:16px;width:fit-content;`;
  const draw = (): void => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const res = dpr * args.zoom;
    const yaw = ((args.turn ?? 0) * Math.PI) / 2;
    const canvas = bakeServerSheet(res, yaw);
    canvas.style.width = `${SHEET_W * args.zoom}px`;
    canvas.style.height = `${SHEET_H * args.zoom}px`;
    canvas.style.boxShadow = '6px 8px 0 #6a60551f';
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(res, 0, 0, res, 0, 0);
    const k = new Iso(ctx, { unit: TILE, origin: ORIGIN, yaw, pivot: PIVOT });
    const boxes = SERVER_PIECES.map((piece) => {
      k.place(piece.place.at, piece.place.facing);
      return worldBox(k, OBJECTS[piece.name].footprint);
    });
    const order = drawOrder(boxes, viewToward(yaw), (w) => k.screenOfWorld(w));
    for (const i of order) {
      const piece = SERVER_PIECES[i];
      const obj = OBJECTS[piece.name];
      drawObject(k, obj, piece.place, false);
      for (const motion of obj.motions ?? []) {
        motion.draw(k, (args.frame + piece.phase) % motion.frames);
      }
    }
    host.replaceChildren(canvas);
  };
  draw();
  void fontsReady().then(draw);
  return host;
}

export default {
  title: 'Office/Server floor',
  parameters: { layout: 'fullscreen' },
};

const argTypes = {
  zoom: { control: { type: 'range' as const, min: 0.5, max: 3, step: 0.25 } },
  turn: { control: { type: 'range' as const, min: 0, max: 3, step: 1 } },
  frame: { control: { type: 'range' as const, min: 0, max: 5, step: 1 } },
};

export const Empty = {
  args: { zoom: 1, turn: 0, frame: 0 },
  argTypes,
  render: (args: Args) => still(args),
};

/** Walked half way round: the backs of the rows that face away, and their cables. */
export const TurnedRound = {
  args: { zoom: 1, turn: 2, frame: 0 },
  argTypes,
  render: (args: Args) => still(args),
};
