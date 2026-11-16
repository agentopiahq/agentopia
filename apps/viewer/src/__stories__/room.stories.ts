import { fontsReady } from '../kit/fonts';
import { Iso, compareBoxes } from '../kit/iso';
import { SHEET } from '../kit/palette';
import { OBJECTS } from '../objects';
import { drawObject, worldBox } from '../objects/bake';
import { PieceState } from '../objects/types';
import {
  DESK_PIECES,
  ORIGIN,
  PIVOT,
  ROOM_PIECES,
  RoomPiece,
  SHEET_H,
  SHEET_W,
  TILE,
  bakeSheet,
} from '../room';
import { WEATHER_KINDS, WeatherKind, skyFor } from '../sky';

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
  /** The hour of day outside, left out for a clear noon. */
  hour?: number;
  weather?: WeatherKind;
  /** The moon's phase, 0 new to 0.5 full; left out, full. */
  moon?: number;
}

function still(args: Args): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = `background:${SHEET.page};padding:16px;width:fit-content;`;
  const draw = (): void => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const res = dpr * args.zoom;
    const yaw = ((args.turn ?? 0) * Math.PI) / 2;
    const sky =
      args.hour === undefined
        ? undefined
        : skyFor(args.hour * 60, args.weather ?? 'clear', 0, args.moon ?? 0.5);
    const stateOf = (piece: RoomPiece): PieceState | undefined =>
      sky && piece.name.startsWith('window') ? { sky } : undefined;
    const canvas = bakeSheet(res, yaw, { stateOf });
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
      drawObject(k, OBJECTS[piece.name], piece.place, false, stateOf(piece));
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

const weatherArgs = {
  ...argTypes,
  hour: { control: { type: 'range' as const, min: 0, max: 24, step: 0.25 } },
  weather: {
    control: 'inline-radio' as const,
    options: [...WEATHER_KINDS],
  },
  moon: { control: { type: 'range' as const, min: 0, max: 1, step: 0.025 } },
};

/**
 * The view outside at any hour, in any weather, under any moon. In the office
 * the sky runs a whole day every hour of the wall clock (sunrise at a quarter
 * past, sunset at a quarter to), the weather changes every ten minutes, and
 * the moon goes round its phases every eight of those days.
 */
export const OutsideAtDusk = {
  args: { zoom: 1, turn: 0, hour: 18.1, weather: 'clear' },
  argTypes: weatherArgs,
  render: (args: Args) => still(args),
};

export const OutsideAtNight = {
  args: { zoom: 1, turn: 0, hour: 22, weather: 'clear' },
  argTypes: weatherArgs,
  render: (args: Args) => still(args),
};

/** A full moon coming up over the East Bay as the sun goes down. */
export const FullMoonRising = {
  args: { zoom: 1, turn: 0, hour: 19, weather: 'clear', moon: 0.5 },
  argTypes: weatherArgs,
  render: (args: Args) => still(args),
};

/** A waxing crescent in the evening, lit on the side the sun went down. */
export const CrescentMoon = {
  args: { zoom: 1, turn: 0, hour: 18.75, weather: 'clear', moon: 0.2 },
  argTypes: weatherArgs,
  render: (args: Args) => still(args),
};

/** The first-quarter moon, pale in the afternoon sky. */
export const MoonByDay = {
  args: { zoom: 1, turn: 0, hour: 15, weather: 'clear', moon: 0.25 },
  argTypes: weatherArgs,
  render: (args: Args) => still(args),
};

/** The sun just up over the East Bay by the Bay Bridge, the last-quarter moon high. */
export const Sunrise = {
  args: { zoom: 1, turn: 0, hour: 6.9, weather: 'clear', moon: 0.75 },
  argTypes: weatherArgs,
  render: (args: Args) => still(args),
};

/** The sun going down behind downtown's north end, swelling and reddening. */
export const Sunset = {
  args: { zoom: 1, turn: 0, hour: 15.75, weather: 'clear', moon: 0.5 },
  argTypes: weatherArgs,
  render: (args: Args) => still(args),
};

export const OutsideInFog = {
  args: { zoom: 1, turn: 0, hour: 9, weather: 'fog' },
  argTypes: weatherArgs,
  render: (args: Args) => still(args),
};

export const OutsideInRain = {
  args: { zoom: 1, turn: 0, hour: 15, weather: 'rain' },
  argTypes: weatherArgs,
  render: (args: Args) => still(args),
};
