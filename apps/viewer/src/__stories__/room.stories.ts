import { fontsReady } from '../kit/fonts';
import { Iso, compareBoxes } from '../kit/iso';
import { SHEET } from '../kit/palette';
import { OBJECTS } from '../objects';
import { drawObject, worldBox } from '../objects/bake';
import {
  DESK_PIECES,
  ORIGIN,
  PIVOT,
  ROOM_PIECES,
  SHEET_H,
  SHEET_W,
  TILE,
  bakeSheet,
} from '../room';

/**
 * The office with nobody in it: the Tinycharts sheet — paper, title block,
 * margin labels, the slab and its walls — with every piece of furniture stood
 * on it in depth order. This is the scene the cast walks around in, and the
 * place to judge the room's composition without a crowd in the way.
 */

interface Args {
  zoom: number;
  /** Quarter turns round the office, counter-clockwise from the home view. */
  turn: number;
}

function still(args: Args): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = `background:${SHEET.page};padding:16px;width:fit-content;`;
  const draw = (): void => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const res = dpr * args.zoom;
    const yaw = ((args.turn ?? 0) * Math.PI) / 2;
    const canvas = bakeSheet(res, yaw);
    canvas.style.width = `${SHEET_W * args.zoom}px`;
    canvas.style.height = `${SHEET_H * args.zoom}px`;
    canvas.style.boxShadow = '6px 8px 0 #6a60551f';
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(res, 0, 0, res, 0, 0);
    const k = new Iso(ctx, { unit: TILE, origin: ORIGIN, yaw, pivot: PIVOT });
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

const argTypes = {
  zoom: { control: { type: 'range' as const, min: 0.5, max: 2, step: 0.25 } },
  turn: { control: { type: 'range' as const, min: 0, max: 3, step: 1 } },
};

export const Empty = {
  args: { zoom: 1, turn: 0 },
  argTypes,
  render: (args: Args) => still(args),
};

/**
 * The office walked half way round, so the other two window bands face the
 * viewer: the Ferry Building and the Bay Bridge on one, Twin Peaks, Sutro
 * Tower and the Painted Ladies on the other.
 */
export const TurnedRound = {
  args: { zoom: 1, turn: 2 },
  argTypes,
  render: (args: Args) => still(args),
};
