import { fontsReady } from '../kit/fonts';
import { FONT, Facing, Iso } from '../kit/iso';
import { SHEET } from '../kit/palette';
import { OBJECTS, ObjectName, OfficeObject } from '../objects';
import { drawObject, makeCanvas, measure } from '../objects/bake';
import { PieceState } from '../objects/types';

/**
 * The object sheet: every piece of office furniture on its own plate, drawn
 * with the same pen as the office, at whatever size you want to judge it at.
 *
 * Each object is authored once, front toward local +y, and the office stands
 * it against whichever wall it belongs to — so every plate can also turn the
 * object to each way it can face, which is how a cabinet on the far wall
 * (showing its back) is checked.
 */

const FACINGS: readonly Facing[] = ['+y', '+x', '-y', '-x'];

interface Args {
  scale: number;
  facing: Facing;
  shadow: boolean;
}

/** One object on a plate of paper, with its name and what it is for (or the state it is in). */
function plate(obj: OfficeObject, args: Args, state?: PieceState, label?: string): HTMLElement {
  const host = document.createElement('figure');
  host.style.cssText =
    `margin:0;display:inline-flex;flex-direction:column;gap:6px;padding:14px 18px 16px;` +
    `background:${SHEET.paper};border-radius:6px;box-shadow:0 1px 0 #0000000f,0 6px 18px #3f382c14;` +
    `font-family:${FONT.hand};color:${SHEET.ink};`;
  const unit = 32 * args.scale;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const draw = (): void => {
    const probe = new Iso(
      document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D,
      {
        unit,
      }
    );
    const place = { at: [0, 0, 0] as [number, number, number], facing: args.facing };
    const rect = measure(probe, obj, place, args.shadow, 10 * args.scale);
    const canvas = makeCanvas(rect.w, rect.h, dpr);
    canvas.style.width = `${rect.w}px`;
    canvas.style.height = `${rect.h}px`;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.scale(dpr, dpr);
    const k = new Iso(ctx, { unit, origin: [-rect.x, -rect.y], lineScale: args.scale });
    drawObject(k, obj, place, args.shadow, state);
    host.replaceChildren(canvas, caption(obj, label));
  };
  draw();
  void fontsReady().then(draw);
  return host;
}

function caption(obj: OfficeObject, label?: string): HTMLElement {
  const el = document.createElement('figcaption');
  el.style.cssText = 'display:flex;flex-direction:column;gap:1px;max-width:340px;';
  const name = document.createElement('span');
  name.textContent = obj.name.toUpperCase();
  name.style.cssText = 'font-size:20px;letter-spacing:.08em;';
  const blurb = document.createElement('span');
  blurb.textContent = label ?? obj.blurb;
  blurb.style.cssText = `font-size:17px;color:${SHEET.lead};line-height:1.15;`;
  el.append(name, blurb);
  return el;
}

const argTypes = {
  scale: { control: { type: 'range' as const, min: 1, max: 6, step: 0.5 } },
  facing: { control: 'inline-radio' as const, options: FACINGS },
  shadow: { control: 'boolean' as const },
};

const story = (name: ObjectName, facing: Facing = '+y') => ({
  args: { scale: 3, facing, shadow: true },
  argTypes,
  render: (args: Args) => plate(OBJECTS[name], args),
});

export default {
  title: 'Office/Objects',
  parameters: { layout: 'padded' },
};

/** Every object at once, at office scale and a little over — the catalogue. */
export const Catalogue = {
  args: { scale: 1.6, facing: '+y', shadow: true },
  argTypes,
  render: (args: Args) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;padding:14px;background:${SHEET.page};`;
    for (const obj of Object.values(OBJECTS)) {
      wrap.append(plate(obj, args));
    }
    return wrap;
  },
};

/**
 * Every object a click changes, in each state a click leaves it in: the
 * doors swung open, the drawers out, the blinds up and down, the screens
 * dark, the clock wound. The office eases between these.
 */
const STATES: Array<[ObjectName, PieceState, string]> = [
  ['door', { open: 0 }, 'shut'],
  ['door', { open: 1 }, 'open (as it starts)'],
  ['glassDoorLeft', { open: 1 }, 'swung in'],
  ['glassDoorRight', { open: 1 }, 'swung in'],
  ['booth', { open: 1 }, 'door open'],
  ['drinksFridge', { open: 1 }, 'door open'],
  ['cabinet', { top: 1 }, 'top drawer out'],
  ['cabinet', { top: 1, bottom: 1 }, 'both drawers out'],
  ['windowBlind', { down: 0 }, 'blind up'],
  ['windowBlind', { down: 0.5 }, 'blind half down'],
  ['windowBlind', { down: 1 }, 'blind down'],
  ['screen', { on: false }, 'off'],
  ['projectionScreen', { up: 1, slides: true }, 'showing slides'],
  ['projectionScreen', { up: 0 }, 'rolled away'],
  ['speaker', { muted: true }, 'muted'],
  ['clock', { running: true, minutes: 15 * 60 + 42 }, 'wound, at 3:42'],
];

export const States = {
  args: { scale: 1.6, facing: '+y', shadow: true },
  argTypes,
  render: (args: Args) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;padding:14px;background:${SHEET.page};`;
    for (const [name, state, label] of STATES) {
      wrap.append(plate(OBJECTS[name], args, state, label));
    }
    return wrap;
  },
};

export const Desk = story('desk');
export const Printer = story('printer');
export const Copier = story('copier');
export const Cabinet = story('cabinet');
/** The cabinets on the far wall turn their backs to you. */
export const CabinetFromBehind = story('cabinet', '-x');
export const Door = story('door');
export const Plant = story('plant');
export const Speaker = story('speaker');
export const Whiteboard = story('whiteboard');
export const Clock = story('clock');
export const Window = story('window');
export const WindowWithBlind = story('windowBlind');
export const MobileWhiteboard = story('mobileBoard');
export const DeskChair = story('deskChair');
export const MeetingChair = story('meetingChair');
export const MeetingTable = story('meetingTable');
export const GlassPartition = story('glassPanel');
export const GlassDoor = story('glassDoorLeft');
export const Screen = story('screen');
export const PhoneBooth = story('booth');
export const WaterCooler = story('waterCooler');
export const Kitchen = story('kitchenCounter');
export const DrinksFridge = story('drinksFridge');
export const SnackCabinet = story('snackCabinet');
export const StandingTable = story('standingTable');
export const Sofa = story('sofa');
export const RustSofa = story('sofaRust');
export const Armchair = story('armchair');
export const BeanBag = story('beanBag');
export const SideTable = story('sideTable');
export const CoffeeTable = story('coffeeTable');
export const HuddleTable = story('huddleTable');
export const Bookshelf = story('bookshelf');
export const CafeTable = story('cafeTable');
export const ProjectionScreen = story('projectionScreen');
