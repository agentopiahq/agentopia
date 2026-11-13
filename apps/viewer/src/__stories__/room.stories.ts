import { fontsReady } from '../kit/fonts';
import { Iso, compareBoxes } from '../kit/iso';
import { SHEET } from '../kit/palette';
import { OBJECTS } from '../objects';
import { drawObject, worldBox } from '../objects/bake';
import { DESK_PIECES, ORIGIN, ROOM_PIECES, SHEET_H, SHEET_W, TILE, bakeSheet } from '../room';

/**
 * The office with nobody in it: the Tinycharts sheet — paper, title block,
 * margin labels, the slab and its walls — with every piece of furniture stood
 * on it in depth order. This is the scene the cast walks around in, and the
 * place to judge the room's composition without a crowd in the way.
 */

interface Args {
  zoom: number;
}

function still(args: Args): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = `background:${SHEET.page};padding:16px;width:fit-content;`;
  const draw = (): void => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const res = dpr * args.zoom;
    const canvas = bakeSheet(res);
    canvas.style.width = `${SHEET_W * args.zoom}px`;
    canvas.style.height = `${SHEET_H * args.zoom}px`;
    canvas.style.boxShadow = '6px 8px 0 #6a60551f';
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(res, 0, 0, res, 0, 0);
    const k = new Iso(ctx, { unit: TILE, origin: ORIGIN });
    const pieces = [...ROOM_PIECES, ...DESK_PIECES].map((piece) => {
      k.place(piece.place.at, piece.place.facing);
      return { piece, box: worldBox(k, OBJECTS[piece.name].footprint) };
    });
    pieces.sort((p, q) => compareBoxes(p.box, q.box));
    for (const { piece } of pieces) {
      drawObject(k, OBJECTS[piece.name], piece.place, false);
    }
    host.replaceChildren(canvas);
  };
  draw();
  void fontsReady().then(draw);
  return host;
}

export default {
  title: 'Office/Room',
  parameters: { layout: 'fullscreen' },
};

export const Empty = {
  args: { zoom: 1 },
  argTypes: { zoom: { control: { type: 'range' as const, min: 0.5, max: 2, step: 0.25 } } },
  render: (args: Args) => still(args),
};
