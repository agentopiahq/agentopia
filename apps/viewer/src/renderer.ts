import {
  Actor,
  Clock,
  DEFAULT_BUS,
  DESKS,
  DeskView,
  OfficeFrame,
  PetView,
  UsageReport,
} from '@agentopia/core';
import {
  Application,
  CanvasSource,
  CanvasTextMetrics,
  Container,
  Graphics,
  Matrix,
  Sprite,
  Text,
  TextStyleOptions,
  Texture,
} from 'pixi.js';

import { BoardContent, DEFAULT_BOARD, normalizeBoard } from './board';
import { BoardEditor } from './boardEditor';
import {
  AgentRig,
  DESK_STANCE,
  KEY_OFFSETS,
  RIG_SCALE,
  Vec,
  airborneOf,
  shadowOutline,
} from './character';
import { CORNER_INSET } from './corners';
import { Heading, headingView, nextHeading } from './heading';
import { HumanRig } from './humanRig';
import {
  Control,
  PieceStore,
  annotationOf,
  interactionOf,
  isOn,
  linked,
  pieceKey,
  toggled,
} from './interact';
import { fontsReady } from './kit/fonts';
import { Box3, FONT, Iso, V3, drawOrder, hull, viewToward } from './kit/iso';
import { ACCENT, MAT, SHEET, hexNum } from './kit/palette';
import { MONITOR_SCREEN, OBJECTS, chairPose } from './objects';
import { drawObject, measure, partsFor, worldBox } from './objects/bake';
import { AVATAR, PETS } from './objects/scale';
import { ObjectPart, PieceState } from './objects/types';
import { BLIND_DOWN as BLIND_DEFAULT, WINDOW, WINDOW_SPAN } from './objects/wall';
import { Rect, rectTouchesPolygon } from './overlap';
import { PetRig } from './petRig';
import { Hint, NOTE_PX, Popover } from './popover';
import {
  DESK_PIECES,
  MOUNTED_PIECES,
  MarginPlace,
  OFFICE_BOX,
  ORIGIN,
  PIVOT,
  READOUT,
  ROOM_PIECES,
  RoomPiece,
  SHEET_H,
  SHEET_W,
  STATUS_LINE,
  TILE,
  TITLE_LETTERING,
  bakeSheet,
  marginSpot,
  officeOutline,
  sheetPen,
  sheetPoint,
  wallAlpha,
} from './room';
import {
  HEADING_SPIN,
  SIT_S,
  SPIN_PER_S,
  deskChairOverSitter,
  deskSpin,
  easeAngle,
  easeToward,
  lounging,
  partsOverSitter,
  seatSlotOf,
  sitterBox,
  sitterOffset,
  sitterView,
  smooth,
} from './seating';
import { NOON, Sky, skyAt } from './sky';
import { SkyClock } from './skyClock';
import { UsageBoardState, glanceOf } from './usage';
import { UsagePanel } from './usagePanel';
import { ZOOM_STEP, ZoomState, centreOn, panRoom } from './zoom';

/**
 * The cartoon renderer: an OfficeFrame in, pixels out.
 *
 * The office is one hand-drawn Tinycharts sheet (`room.ts`) with its furniture
 * and its cast drawn in the Colorfigures manner: isometric solids in three
 * flat bands under heavy ink, each with a flat blue cast shadow. Everything is
 * drawn in canvas 2D — the sheet and every piece of furniture once, into
 * textures; the characters every frame, into a small canvas each — and Pixi
 * composites the result, sorts the cast among the furniture, and carries the
 * live overlays (the monitors' terminals, the desk badges, the speech).
 *
 * Positions come from core in tile space; this file only projects them. Depth
 * is the isometric kind: everything that stands on the floor — desks, copiers,
 * cabinets, plants, the door, and every character — is sorted against
 * everything else by its footprint every frame, so a worker can walk behind a
 * copier and in front of a desk.
 */

interface ActorSprite {
  root: Container;
  /** The Claude rig for every agent; the human is drawn as a person. */
  rig: AgentRig | HumanRig;
  bubble: Container;
  bubbleBg: Graphics;
  bubbleText: Text;
  bubbleBelow?: boolean;
  /** Where the bubble sits relative to the feet. */
  bubbleOffset: { x: number; y: number };
  nameplate: Text;
  zzz: Text;
  sweat: Graphics;
  /** Where it stood last frame, in tiles, to tell which way it walks. */
  last: { x: number; y: number };
  heading: Heading;
  /** How far it has sat down in its desk chair, 0..1, and at which desk. */
  sit: number;
  seat: number | null;
  /** The sofa or chair it is sat in, away from the desks. */
  lounge: Baked | null;
  /** Seen from behind this frame. */
  back: boolean;
  /** The frame time it was last updated at, for easing the sit. */
  lastAt: number | null;
  /** How far it has walked, in tiles: what its legs step by. */
  travel: number;
  /** Its box for sorting among the furniture this frame. */
  box: Box3;
}

/** A desk chair's pose, as its lead sits in it: how far tucked in, and swivelled. */
interface ChairPose {
  tucked: number;
  spin: number;
}

/** The dynamic part of a desk: everything that changes with its session. */
interface DeskOverlay {
  screen: Container;
  screenBg: Graphics;
  screenText: Text;
  nameplate: Text;
  badge: Container;
  badgeBg: Graphics;
  badgeText: Text;
  tag: Container;
  tagBg: Graphics;
  tagText: Text;
  /** What the screen currently shows, to rebuild its text only on change. */
  shownScreen: string | null | undefined;
  shownBadge: string;
  shownTag: string;
  /** Whether the monitor's glass faces the viewer from the current yaw. */
  glassFacing: boolean;
  /** The session sitting at the desk, for opening it. */
  bus: string | null;
}

/** A thing standing on the floor, sorted by its footprint among the cast. */
interface Standing {
  node: Container;
  box: Box3;
  /** How far its drawing reaches round `box`, for telling what it overlaps, if not the avatar's. */
  outline?: Box3;
}

/** One of the office pets, drawn among the cast. */
interface PetSprite {
  root: Container;
  rig: PetRig;
  /** Where it stood last frame, in tiles: how far it has walked since. */
  last: { x: number; y: number };
  /** How far it has walked, in tiles: what its legs step by. */
  travel: number;
  /** Which way along the screen it faces. */
  facing: 1 | -1;
  box: Box3;
  outline: Box3;
}

/** A piece of furniture, baked once into a texture (and again on a big zoom). */
interface Baked extends Standing {
  piece: RoomPiece;
  /** Which of the object's separately sorted parts this is (see `OfficeObject.parts`). */
  part?: ObjectPart;
  /** The piece's identity, for its state: shared by all its parts. */
  key: string;
  sprite: Sprite;
  /** The canvas it was last baked into, for telling what a click lands on. */
  canvas?: HTMLCanvasElement;
  /** A canvas re-drawn in place while a drag turns the room, and its texture. */
  draft?: { canvas: HTMLCanvasElement; texture: Texture };
}

/** How near a walking character has to be, in tiles, to swing a door open on its way. */
const DOOR_REACH = 1.15;
/** How far through a blind-pulling step the blind goes. */
const BLIND_PULL_AT = 0.45;

/**
 * How far a figure's drawing reaches round the box it sorts by: its rays
 * span the avatar's width, and its top ray its full height.
 */
function figureOutline(box: Box3): Box3 {
  const cx = (box[0][0] + box[1][0]) / 2;
  const cy = (box[0][1] + box[1][1]) / 2;
  const r = AVATAR.width / 2;
  return [
    [cx - r, cy - r, 0],
    [cx + r, cy + r, AVATAR.height],
  ];
}

/** A sprite is the figure, which outlives its role: a resident who becomes a lead keeps it. */
const spriteKey = (actor: Actor): string => actor.avatar ?? actor.id;
/** Every piece in the office, for linking a change to its partners. */
const ALL_PIECES: readonly RoomPiece[] = [...ROOM_PIECES, ...DESK_PIECES, ...MOUNTED_PIECES];

/** Where a door's opening is, in world tiles: the point whoever passes walks by. */
function doorway(piece: RoomPiece): { x: number; y: number } {
  const [x, y] = piece.place.at;
  // The booth's door is on its front, toward the open floor.
  return piece.name === 'booth' ? { x, y: y + 0.9 } : { x, y };
}

/** A browser's storage, if it has one it will let us use. */
function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Terminal type: tiny, dense, and fast — it should read as output, not as a caption. */
const SCREEN_FONT = 4.5;
const SCREEN_LINE_H = 5.2;
const SCREEN_LINES = 12;
/** How fast the terminal scrolls, in lines per second. Frenzied. */
const SCREEN_LINES_PER_SEC = 9;
/** The monitor's glass in sheet pixels, along its face. */
const SCREEN_W = (MONITOR_SCREEN.x1 - MONITOR_SCREEN.x0) * TILE;
const SCREEN_H = (MONITOR_SCREEN.z1 - MONITOR_SCREEN.z0) * TILE;
/** Sweat drops: how many at full stress, and the slowest and fastest cycles. */
const SWEAT_DROPS = 3;
const SWEAT_SLOW_S = 2.6;
const SWEAT_FAST_S = 0.9;
/** A character's footprint, for sorting it among the furniture. */
const ACTOR_HALF = 0.22;
const ACTOR_HEIGHT = 1.4;

const INK = hexNum(SHEET.ink);
const PAPER = hexNum(SHEET.paper);
const PILL = hexNum(SHEET.pill);
const LEAD = hexNum(SHEET.lead);
const RED = hexNum(SHEET.red);

/** Hand lettering at a size, for the few live words on the sheet. */
const hand = (size: number, color: number, weight: '400' | '700' = '400'): TextStyleOptions => ({
  fill: color,
  fontSize: size,
  fontFamily: FONT.hand,
  fontWeight: weight,
  // A halo of paper, so the lettering reads over whatever the room turns under it.
  stroke: { color: PAPER, width: 4, join: 'round' },
});

/** Hand lettering inside a pill, which is its own background. */
const flat = (size: number, color: number, weight: '400' | '700' = '400'): TextStyleOptions => ({
  ...hand(size, color, weight),
  stroke: { color, width: 0 },
});

/**
 * Nameplates read as names, not identifiers. Casing is a display concern, so
 * it happens here rather than in the labels core hands out — which mixes ones
 * the director invents (`lead`, `worker`) with whatever the harness supplies
 * for a subagent type.
 */
const nameplateFor = (label: string): string => label.charAt(0).toUpperCase() + label.slice(1);

/** A stable small hash, for filler that looks different per command. */
function hashOf(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return hash;
}

const FILLER = [
  '. . . .',
  'ok',
  '-- ---- --',
  '#### ##',
  'done',
  '>>',
  '[ ok ]',
  '.... ....',
  '## #',
];

/**
 * What scrolls up the monitor: the command line, then output-shaped filler.
 * The emitter records what was run, never what came back, so the output is
 * decorative — but it is deterministic per command, so a replay looks the same.
 */
function screenLines(text: string): string[] {
  const seed = hashOf(text);
  const lines = [`$ ${text.length > 22 ? `${text.slice(0, 21)}…` : text}`];
  for (let i = 1; i < SCREEN_LINES; i++) {
    const pick = Math.abs((seed ^ ((i + 1) * 2654435761)) % FILLER.length);
    const indent = ' '.repeat(Math.abs((seed >> i) % 3));
    lines.push(`${indent}${FILLER[pick]}`);
  }
  return lines;
}

/** The phase badge over a desk, or nothing for the phases that need none. */
function badgeFor(phase: DeskView['phase']): { text: string; color: number } | null {
  switch (phase) {
    case 'waiting_on_user':
      return { text: 'waiting on you', color: RED };
    case 'awaiting_approval':
      return { text: 'needs approval', color: hexNum(MAT.mustard.d) };
    case 'compacting':
      return { text: 'compacting', color: LEAD };
    default:
      return null;
  }
}

/** The desk's title: the session name, or a short form of the bus id. */
function deskTitle(desk: DeskView): string {
  if (desk.name) {
    return desk.name.length > 26 ? `${desk.name.slice(0, 25)}…` : desk.name;
  }
  // A lone recording (a story, a replayed file) has no bus worth naming.
  return desk.bus === DEFAULT_BUS ? '' : desk.bus.replace(/^auto-/, '').slice(0, 12);
}

/** The readout's three lines, from what the desks say right now. */
function readoutFor(desks: readonly DeskView[]): { label: string; state: string; detail: string } {
  if (desks.length === 0) {
    return { label: 'The office is', state: 'quiet', detail: 'waiting for a session to start' };
  }
  const waiting = desks.filter((desk) => desk.phase === 'waiting_on_user').length;
  const approval = desks.filter((desk) => desk.phase === 'awaiting_approval').length;
  const helpers = desks.reduce((sum, desk) => sum + desk.subagents, 0);
  const parts: string[] = [];
  if (approval > 0) {
    parts.push(`${approval} needs approval`);
  }
  if (waiting > 0) {
    parts.push(`${waiting} waiting on you`);
  }
  if (parts.length === 0) {
    parts.push(
      helpers > 0 ? `${helpers} helper${helpers === 1 ? '' : 's'} at work` : 'all heads down'
    );
  }
  return {
    label: 'The office has',
    state: `${desks.length} session${desks.length === 1 ? '' : 's'}`,
    detail: parts.join(' · '),
  };
}

/**
 * The paper's grid carried on past the sheet's edges, for a page that is all
 * office: the same lines the sheet's own paper is ruled with, so the seam
 * where the sheet ends never shows.
 */
function drawPaperBeyond(g: Graphics): void {
  const step = TILE * 2;
  const slope = Math.tan(Math.PI / 6);
  const reach = 6000;
  for (let i = -160; i < 200; i++) {
    const c = i * step;
    g.moveTo(ORIGIN[0] - reach, ORIGIN[1] + c - reach * slope);
    g.lineTo(ORIGIN[0] + reach, ORIGIN[1] + c + reach * slope);
    g.moveTo(ORIGIN[0] - reach, ORIGIN[1] + c + reach * slope);
    g.lineTo(ORIGIN[0] + reach, ORIGIN[1] + c - reach * slope);
  }
  g.stroke({ color: hexNum(SHEET.grid), width: 0.7 });
}

/**
 * The title block as page text, for page mode: each line placed on its
 * baseline as it is on the sheet, with the sheet's halo of paper round the
 * letters. It sits over the canvas, never takes a press, and is scaled with
 * the pinned lettering by `placeHud`. A `badge` (`RendererOptions.badge`) is
 * stamped just past the title's last letter; it is one of the block's own
 * lines, so it fades with the rest when the office runs under it.
 */
function makeTitleBlock(badge?: string): HTMLDivElement {
  const block = document.createElement('div');
  block.style.cssText =
    'position:absolute;left:0;top:0;z-index:1;pointer-events:none;user-select:none;' +
    'transform-origin:top left;';
  const halo = `0 0 2px ${SHEET.paper},0 0 2px ${SHEET.paper},0 0 4px ${SHEET.paper}`;
  // The slogan is lettered as large as an annotation's description once the
  // block is at full size, in `PAGE_SLOGAN`'s lines; they are placed in `settle`.
  const [title, slogan, second] = TITLE_LETTERING;
  const grow = NOTE_PX / PAGE_TITLE_SCALE / slogan.size;
  const leading = (second.baseline - slogan.baseline) * grow;
  const lettering = [
    title,
    ...PAGE_SLOGAN.map((text) => ({ ...slogan, text, size: slogan.size * grow })),
  ];
  const lines = lettering.map((line) => {
    const el = document.createElement('div');
    el.textContent = line.text;
    el.style.cssText =
      `position:absolute;left:${line.x}px;white-space:nowrap;transition:opacity 220ms ease;` +
      `font:400 ${line.size}px/0 ${line.font};color:${line.color};text-shadow:${halo};`;
    block.appendChild(el);
    return { line, el };
  });
  const stamp = badge ? makeBadge(badge) : null;
  if (stamp) {
    block.appendChild(stamp);
  }
  // With line-height 0 a line's baseline sits (ascent − descent) / 2 below
  // its top, which depends on the face: measure it, and again once the faces
  // land, so the baseline falls exactly where the sheet letters it.
  const measure = document.createElement('canvas').getContext('2d');
  /** How far `text` in `font` at `size` rises above its baseline. */
  const ascent = (text: string, font: string, size: number): number => {
    if (!measure) {
      return size * 0.72;
    }
    measure.font = `400 ${size}px ${font}`;
    return measure.measureText(text).actualBoundingBoxAscent;
  };
  const settle = (): void => {
    // From the title's baseline to the top of the slogan's letters, as the
    // sheet letters them: the slogan keeps that gap however large it is, and
    // the readout spaces its own lines by it.
    const gap = slogan.baseline - ascent(slogan.text, slogan.font, slogan.size) - title.baseline;
    let baseline = title.baseline;
    lines.forEach(({ line, el }, i) => {
      if (i === 1) {
        baseline = title.baseline + gap + ascent(line.text, line.font, line.size);
      } else if (i > 1) {
        baseline += leading;
      }
      let drop = line.size * 0.35;
      let above = line.size * 0.72;
      let below = line.size * 0.2;
      if (measure) {
        measure.font = `400 ${line.size}px ${line.font}`;
        const m = measure.measureText(line.text);
        drop = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
        above = m.actualBoundingBoxAscent;
        below = m.actualBoundingBoxDescent;
      }
      el.style.top = `${baseline - drop}px`;
      // The line's box has no height: where its ink runs, from the box's top,
      // for `fadeTitle` to test the letters themselves against the office.
      el.dataset.inkTop = String(drop - above);
      el.dataset.inkBottom = String(drop + below);
    });
    if (stamp) {
      // Past the title's last letter, centred on its capitals.
      let width = title.size * 0.6 * title.text.length;
      let cap = title.size * 0.7;
      if (measure) {
        measure.font = `400 ${title.size}px ${title.font}`;
        width = measure.measureText(title.text).width;
        cap = measure.measureText('A').actualBoundingBoxAscent;
      }
      stamp.style.left = `${title.x + width + BADGE.gap}px`;
      stamp.style.top = `${title.baseline - cap / 2}px`;
    }
    // Where the title's ink starts, for `placeHud` to stand it in from the corner.
    let inkTop = title.baseline - title.size * 0.72;
    let inkLeft: number = title.x;
    if (measure) {
      measure.font = `400 ${title.size}px ${title.font}`;
      const m = measure.measureText(title.text);
      inkTop = title.baseline - m.actualBoundingBoxAscent;
      inkLeft = title.x - m.actualBoundingBoxLeft;
    }
    block.dataset.inkTop = String(inkTop);
    block.dataset.gap = String(gap);
    block.dataset.inkLeft = String(Math.min(inkLeft, ...TITLE_LETTERING.map((l) => l.x)));
  };
  settle();
  void fontsReady().then(settle);
  void document.fonts?.ready.then(settle);
  return block;
}

/**
 * The slogan as the page letters it: in three lines, each shorter than the
 * one above, so they stay clear of the office's back wall as it slopes down
 * to the left. The sheet keeps its two (`TITLE_LETTERING`).
 */
const PAGE_SLOGAN = [
  'Watch your agents work, track every token',
  'they burn, and enjoy the view while',
  "you're still employed.",
] as const;

/** The title's badge: how far past the title it stands, its lettering, and its tilt. */
const BADGE = { gap: 20, size: 22, tilt: 6 } as const;

/**
 * A small rubber stamp in the sheet's hand: the word in red, boxed in red on
 * a cream pill, set a little askew. Placed by `makeTitleBlock`.
 */
function makeBadge(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'position:absolute;white-space:nowrap;' +
    `transform:translateY(-50%) rotate(${BADGE.tilt}deg);transform-origin:left center;` +
    `font:700 ${BADGE.size}px/1 ${FONT.hand};color:${SHEET.red};` +
    `background:${SHEET.pill};border:2.5px solid ${SHEET.red};border-radius:999px;` +
    'padding:4px 14px 5px;letter-spacing:0.5px;transition:opacity 220ms ease;';
  return el;
}

/** A canvas as a Pixi texture at a device resolution. */
function textureOf(canvas: HTMLCanvasElement, resolution: number): Texture {
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution }) });
}

export interface RendererOptions {
  /**
   * The office as a whole page (the website): paper and its grid run on past
   * the sheet's edges to fill the view, so there is no page round the print;
   * the title block, the status line and the readout stay pinned to the
   * view's top corners; and the camera frames the office itself, a little
   * larger than the whole sheet would be, held on its middle rather than
   * following the cast.
   */
  page?: boolean;
  /**
   * In page mode, a few words stamped beside the title (the website's
   * "coming soon"). They fade with the title when the office runs under it.
   */
  badge?: string;
}

/** In page mode, how far the office stands in from the view's edges, in sheet pixels. */
const PAGE_PAD = 24;
/** In page mode, the widest view at which the pinned lettering is drawn full size. */
const PAGE_HUD_W = 1100;
/** In page mode, the title block's size against the sheet's own lettering. */
const PAGE_TITLE_SCALE = 0.62;
/** In page mode, the least the title block is scaled to, so a phone can still read the slogan. */
const PAGE_TITLE_MIN = 0.45;
/** In page mode, how much of the title and the readout shows while the office runs under them. */
const PAGE_TITLE_SEE_THROUGH = 0.28;
/** How long the readout takes to fade (as the title's CSS transition does), in ms. */
const PAGE_FADE_MS = 220;
/** How far round a corner's lettering the pointer counts as over it, in CSS pixels. */
const HOVER_SLOP = 8;

/** Whether `pointer` is over the box round all of `boxes`, give or take `HOVER_SLOP`. */
function pointerOver(pointer: { x: number; y: number } | null, boxes: readonly Rect[]): boolean {
  if (!pointer || boxes.length === 0) {
    return false;
  }
  const x0 = Math.min(...boxes.map((b) => b.x)) - HOVER_SLOP;
  const y0 = Math.min(...boxes.map((b) => b.y)) - HOVER_SLOP;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + HOVER_SLOP;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + HOVER_SLOP;
  return pointer.x >= x0 && pointer.x <= x1 && pointer.y >= y0 && pointer.y <= y1;
}

/** The empty band after the readout's last letters, in hud pixels. */
const READOUT_TRAIL = 3;

/** For measuring where lettering's ink starts. */
const inkMeasure =
  typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
/** How far each lettered line's ink rises above its baseline, by face and words. */
const inkAscents = new Map<string, number>();

/** How far `text`'s letters rise above their baseline, in its own pixels. */
function inkAscent(text: Text): number {
  const { fontWeight, fontSize, fontFamily } = text.style;
  const font = `${fontWeight} ${fontSize}px ${String(fontFamily)}`;
  const key = `${font}|${text.text}`;
  let ascent = inkAscents.get(key);
  if (ascent === undefined) {
    ascent = fontSize * 0.72;
    if (inkMeasure) {
      inkMeasure.font = font;
      ascent = inkMeasure.measureText(text.text).actualBoundingBoxAscent;
    }
    inkAscents.set(key, ascent);
  }
  return ascent;
}

/** Where Pixi letters `text`'s baseline, below the top of its box. */
function baselineOf(text: Text): number {
  const metrics = CanvasTextMetrics.measureText(text.text, text.style);
  return (text.style._stroke?.width ?? 0) / 2 + metrics.fontProperties.ascent;
}

export class CartoonRenderer {
  /**
   * `wallClock` is what the wall clock reads. Left out, it reads the frame's
   * own time, which is the viewer's local time wherever the director runs on
   * the system clock; a demo on a made-up timeline passes the real one.
   */
  constructor(
    private readonly wallClock?: Clock,
    options: RendererOptions = {}
  ) {
    this.page = options.page ?? false;
    this.badge = options.badge;
  }

  private app = new Application();
  private host: HTMLElement | null = null;
  /** Whether the office is the whole page (`RendererOptions.page`). */
  private readonly page: boolean;
  /** In page mode, what is stamped beside the title (`RendererOptions.badge`). */
  private readonly badge: string | undefined;
  /** In page mode: what stays put while the camera moves, pinned to the view's corners. */
  private hud = new Container();
  /** In page mode: the title block, as page text pinned to the view's top-left corner. */
  private titleBlock: HTMLDivElement | null = null;
  /** In page mode: the title block's scale, set by `placeHud`. */
  private titleScale = 1;
  /** The camera the title's see-through was last worked out for. */
  private titleFadeKey = '';
  /** In page mode: the title's lines, where their letters are and whether the office runs under them. */
  private titleLines: { el: HTMLElement; box: Rect; under: boolean }[] = [];
  /** Where the pointer is over the view, in view pixels; null when it is not over it. */
  private pointer: { x: number; y: number } | null = null;
  /** The frame time the readout's fade last stepped at. */
  private readoutFadeAt: number | null = null;
  private hostW = 0;
  private hostH = 0;
  private world = new Container();
  private sheet = new Sprite();
  /** Every character's cast shadow, flat on the floor under the cast. */
  private shadows = new Graphics();
  /** The cast, the furniture and the desks together, depth-sorted each frame. */
  private actorLayer = new Container();
  /** What nothing occludes: speech bubbles, and the leader line to a clicked part. */
  private topLayer = new Container();
  private actors = new Map<string, ActorSprite>();
  private pets = new Map<string, PetSprite>();
  private desks: DeskOverlay[] = [];
  private standing: Baked[] = [];
  /** The things hung on the walls, over the sheet and under everything else. */
  private mounted: Baked[] = [];
  private wallLayer = new Container();
  /** Rain running down the window glass, drawn live over the windows. */
  private rain = new Graphics();
  /** What the viewer has done to each piece: doors, blinds, the board. */
  private store = new PieceStore(localStore());
  /** The marker drawn on each board, as something the pen can lay down. */
  private inkImages = new Map<string, CanvasImageSource>();
  /** Pieces whose state changed in a way `step` does not ease, to redraw next frame. */
  private dirty = new Set<string>();
  /** Pieces easing toward a state the viewer set, and those that moved last frame. */
  private settling = new Set<string>();
  private easedLast = new Set<string>();
  /** Blind pulls already made, by the step that made them. */
  private pulledBlinds = new Set<string>();
  private sheetStale = false;
  private lastAt: number | null = null;
  /** Each desk chair's pose as its lead sits in it, by piece key; and when it last moved. */
  private chairPoses = new Map<string, ChairPose>();
  private chairsAt: number | null = null;
  private chairsMoved = false;
  /** Each desk chair's last swivel target, to carry a view turn straight across. */
  private chairWants = new Map<string, number>();
  /** Each desk's task chair, by desk slot. */
  /** Each desk's task chair, as its separately sorted parts. */
  private deskChairs: Baked[][] = [];
  private clockMinute = -1;
  /** The step of real time the sky outside was last drawn at (see `SKY_STEP_MS`). */
  private skyStep = -1;
  /** The sky clock's change count the sky was last drawn at: a change by hand redraws it at once. */
  private skyVersion = -1;
  /** The time outside the windows: the wall clock's time-lapse, or set by hand in the settings. */
  readonly skyClock = new SkyClock();
  /** The wall clock's local minutes at the last frame, for setting the sky clock against. */
  private localMinutes = 0;
  /** The sky outside the windows, moved on with the clock. */
  private sky: Sky = NOON;
  /** The sky the sheet's sunlight was last drawn under, coarsely. */
  private sheetSky = '';
  private popover: Popover | null = null;
  private hint: Hint | null = null;
  private editor: BoardEditor | null = null;
  private usagePanel: UsagePanel | null = null;
  /** What the usage board shows; unset, its authored sample day (the marketing site, stories). */
  private usage: UsageBoardState | undefined = undefined;
  /** The piece the popover is open on, and the piece under the pointer. */
  private open: Baked | null = null;
  /** The sheet point the annotation was opened from: its leader runs there. */
  private openAt = { x: 0, y: 0 };
  private hovering = false;
  /** The leader line from an open annotation to what was clicked. */
  private leader = new Graphics();
  /** Where the open annotation stands in the margin, and what it was worked out for. */
  private spot: MarginPlace = { at: [0, 0], align: 'left' };
  private spotKey = '';
  private readout = {
    label: new Text({ text: '', style: hand(18, LEAD) }),
    state: new Text({ text: '', style: hand(40, INK, '700') }),
    detail: new Text({ text: '', style: hand(19, LEAD) }),
    shown: '',
  };
  /** The connection's status pill and the session's name, under the title. */
  private status = {
    pill: new Graphics(),
    text: new Text({ text: '', style: flat(15, PAPER, '700') }),
    label: new Text({ text: '', style: hand(19, LEAD) }),
    shown: '',
    live: false,
  };
  private zoom: ZoomState | null = null;
  /** Called with a desk's session when its name is tapped, if the page wants that. */
  onOpenSession: ((bus: string) => void) | null = null;
  /** Called when "every session" is tapped, from one session's view. */
  onOpenFloor: (() => void) | null = null;
  private back = new Text({ text: '‹ every session', style: hand(18, LEAD, '700') });
  /** The device resolution the static art was last drawn at. */
  private bakedAt = 0;
  /** The yaw the static art was last drawn at. */
  private bakedYaw = 0;
  /** The yaw this frame is drawn from. */
  private yaw = 0;
  /** The quick draft drawn while a drag turns the room. */
  private draftCanvas = document.createElement('canvas');
  private draftTexture: Texture | null = null;
  private draftYaw = NaN;
  private drafting = false;
  private bakeWanted = 0;
  private bakeWantedSince = 0;

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: host.clientWidth || 800,
      height: host.clientHeight || 600,
      background: hexNum(SHEET.page),
      antialias: true,
      // We drive rendering ourselves from the frame loop. Pixi's own ticker
      // drawing on its own schedule races our in-loop resize — the buffer
      // resize lands between its paints and flashes black for a frame.
      autoStart: false,
      sharedTicker: false,
      // Render at native device density; without this a retina display gets a
      // half-resolution canvas stretched by CSS.
      resolution: this.dpr(),
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.host = host;
    // Where the pointer is, for the page's corners to show in full under it.
    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    host.addEventListener('pointerleave', () => {
      this.pointer = null;
    });
    this.zoom = new ZoomState(host, () => this.view());

    // The sheet's lettering is baked in, so give the faces a moment to land.
    await Promise.race([fontsReady(), new Promise((resolve) => setTimeout(resolve, 1500))]);
    // Ink measured before the faces landed was measured in the fallback.
    void fontsReady().then(() => inkAscents.clear());

    // The sheet sits on the page with a soft drop shadow, like a print; a
    // page that is all office has no page round it, only more paper.
    const drop = new Graphics();
    if (this.page) {
      this.app.renderer.background.color = hexNum(SHEET.paper);
      drawPaperBeyond(drop);
    } else {
      drop.rect(6, 8, SHEET_W, SHEET_H).fill({ color: hexNum(SHEET.lead), alpha: 0.12 });
    }
    this.world.addChild(
      drop,
      this.sheet,
      this.wallLayer,
      this.rain,
      this.shadows,
      this.actorLayer,
      this.topLayer
    );

    for (const piece of ROOM_PIECES) {
      this.standing.push(...this.makeParts(piece));
    }
    this.deskChairs = DESKS.map((desk) => {
      const chair = this.standing.filter(
        (baked) =>
          baked.piece.name === 'deskChair' &&
          Math.hypot(
            baked.piece.place.at[0] - desk.chair.x,
            baked.piece.place.at[1] - desk.chair.y
          ) < 1e-6
      );
      if (chair.length === 0) {
        throw new Error('every desk has a chair');
      }
      return chair;
    });
    for (const piece of MOUNTED_PIECES) {
      const baked = this.makeStanding(piece);
      this.mounted.push(baked);
      this.wallLayer.addChild(baked.node);
    }
    this.loadInk();
    this.popover = new Popover(host, (control) => this.pick(control));
    this.hint = new Hint(host);
    this.editor = new BoardEditor(host, {
      onChange: (board, ink) => this.boardChanged(board, ink),
      onClose: () => {
        this.editingBoard = null;
      },
    });
    this.usagePanel = new UsagePanel(host, { onClose: () => undefined });
    if (this.zoom) {
      this.zoom.onTap = (e): void => this.tap(e);
      this.zoom.onHover = (e): void => this.hover(e);
      this.zoom.onDragStart = (): void => this.closePopover();
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closePopover();
      }
    });
    DESK_PIECES.forEach((piece) => {
      const baked = this.makeStanding(piece);
      const overlay = this.makeDeskOverlay();
      baked.node.addChild(overlay.screen, overlay.nameplate, overlay.badge, overlay.tag);
      this.standing.push(baked);
      this.desks.push(overlay);
    });
    for (const baked of this.standing) {
      this.actorLayer.addChild(baked.node);
    }
    this.topLayer.addChild(this.leader);
    this.bake(this.wantedResolution(1), 0);

    this.readout.label.anchor.set(1, 0);
    this.readout.state.anchor.set(1, 0);
    this.readout.detail.anchor.set(1, 0);
    this.readout.label.position.set(READOUT.x, READOUT.y);
    this.readout.state.position.set(READOUT.x, READOUT.y + 20);
    this.readout.detail.position.set(READOUT.x, READOUT.y + 66);
    // Pinned to the view's corners in page mode; lettered on the sheet otherwise.
    const lettering = this.page ? this.hud : this.topLayer;
    lettering.addChild(this.readout.label, this.readout.state, this.readout.detail);

    this.status.text.anchor.set(0.5, 0.5);
    this.status.label.anchor.set(0, 0.5);
    lettering.addChild(this.status.pill, this.status.text, this.status.label);
    this.back.anchor.set(0, 0.5);
    this.back.position.set(STATUS_LINE.x, STATUS_LINE.y + 30);
    this.back.eventMode = 'static';
    this.back.cursor = 'pointer';
    this.back.visible = false;
    this.back.on('pointertap', () => this.onOpenFloor?.());
    lettering.addChild(this.back);

    this.app.stage.addChild(this.world);
    if (this.page) {
      // The title is page text, not canvas: the browser letters it in its own
      // face as soon as that loads, which a bake done once never can.
      this.titleBlock = makeTitleBlock(this.badge);
      host.appendChild(this.titleBlock);
      this.app.stage.addChild(this.hud);
    }

    // Console-debugging handle; also used by automated visual checks.
    (window as unknown as Record<string, unknown>).__agentopia = this;
  }

  private dpr(): number {
    return Math.max(1, window.devicePixelRatio || 1);
  }

  /**
   * Paint the office now and copy the frame out, for a picture of it: WebGL
   * keeps no frame to read back once the browser has shown it.
   */
  paintSnapshot(): HTMLCanvasElement {
    this.app.render();
    const painted = this.app.canvas;
    const copy = document.createElement('canvas');
    copy.width = painted.width;
    copy.height = painted.height;
    copy.getContext('2d')?.drawImage(painted, 0, 0);
    return copy;
  }

  /** The sky's time of day now, in minutes past its midnight. */
  skyMinutesNow(): number {
    return this.skyClock.minutesAt(this.localMinutes);
  }

  /** Set the sky outside to `minutes` past its midnight; it runs on from there. */
  setSkyMinutes(minutes: number): void {
    this.skyClock.set(minutes, this.localMinutes);
  }

  /** Put the sky back on the wall clock's time-lapse. */
  followSkyClock(): void {
    this.skyClock.follow();
  }

  /** Whether the sky keeps the wall clock's time-lapse. */
  skyFollowsClock(): boolean {
    return this.skyClock.following;
  }

  /** Stack a row of keys above the camera's mice, in the bottom-right corner. */
  addAboveCamera(row: HTMLElement): void {
    this.zoom?.addAbove(row);
  }

  /** Device pixels per CSS pixel the office is drawn at. */
  pixelRatio(): number {
    return this.dpr();
  }

  /** The device resolution static art wants at a camera zoom, in coarse steps. */
  private wantedResolution(scale: number): number {
    return Math.max(1, Math.min(3, Math.ceil(scale * this.dpr() * 2) / 2));
  }

  // ---- static art ----------------------------------------------------------

  /** A piece as it stands among the cast: one sprite for each of its parts. */
  private makeParts(piece: RoomPiece): Baked[] {
    const parts = OBJECTS[piece.name].parts;
    return parts ? parts.map((part) => this.makeStanding(piece, part)) : [this.makeStanding(piece)];
  }

  private makeStanding(piece: RoomPiece, part?: ObjectPart): Baked {
    const node = new Container();
    const sprite = new Sprite();
    node.addChild(sprite);
    const baked: Baked = {
      node,
      sprite,
      piece,
      part,
      key: pieceKey(piece),
      box: [
        [0, 0, 0],
        [0, 0, 0],
      ],
    };
    this.placeFootprint(baked);
    return baked;
  }

  /** Sort a piece by its footprint as it stands now (an open door's is its swung leaf). */
  private placeFootprint(baked: Baked): void {
    const obj = OBJECTS[baked.piece.name];
    const probe = this.pen({} as CanvasRenderingContext2D, this.yaw);
    probe.place(baked.piece.place.at, baked.piece.place.facing);
    const state = this.stateOf(baked.piece);
    const part = baked.part && partsFor(obj, state)?.find((p) => p.name === baked.part?.name);
    const print = part?.footprint ?? (obj.footprintOf ? obj.footprintOf(state) : obj.footprint);
    baked.box = worldBox(probe, print);
  }

  /** A piece's state as it is drawn now, with what only this frame knows. */
  private stateOf = (piece: RoomPiece): PieceState => {
    const key = pieceKey(piece);
    const state = this.store.get(key);
    if (piece.name === 'mobileBoard') {
      return { ...state, inkImage: this.inkImages.get(key) };
    }
    if (piece.name === 'clock') {
      return { ...state, minutes: this.clockMinute };
    }
    if (piece.name.startsWith('window')) {
      return { ...state, sky: this.sky };
    }
    if (piece.name === 'usageBoard' && this.usage !== undefined) {
      return { ...state, usage: this.usage };
    }
    const chair = this.chairPoses.get(key);
    if (chair) {
      return { ...state, ...chair };
    }
    return state;
  };

  /**
   * Pull each desk's chair in under its lead as it sits, on the same curve,
   * and swivel it to the way the lead faces; push it back aside once the lead
   * is up. A chair that moved is redrawn this frame.
   */
  private stepChairs(at: number): void {
    const dt = this.chairsAt === null ? 0 : Math.min(100, Math.max(0, at - this.chairsAt));
    this.chairsAt = at;
    const movedBefore = this.chairsMoved;
    this.chairsMoved = false;
    const sitters = new Map<number, ActorSprite>();
    for (const sprite of this.actors.values()) {
      if (sprite.seat !== null) {
        sitters.set(sprite.seat, sprite);
      }
    }
    this.deskChairs.forEach((parts, slot) => {
      const { key } = parts[0];
      const sitter = sitters.get(slot);
      const was = this.chairPoses.get(key) ?? chairPose(undefined);
      // Facing the desk with its back to us, it turns its back squarely to us.
      const want =
        sitter && sitter.sit > 0
          ? sitter.heading === '-y'
            ? deskSpin(this.yaw)
            : HEADING_SPIN[sitter.heading]
          : 0;
      // A swivel the lead makes eases; one the view's turning asks for is
      // carried straight across, so the chair never lags under its sitter.
      const lastWant = this.chairWants.get(key) ?? want;
      this.chairWants.set(key, want);
      const carried = sitter?.heading === '-y' ? want - lastWant : 0;
      const next: ChairPose = {
        tucked: smooth(sitter?.sit ?? 0),
        spin: easeAngle(was.spin + carried, want, dt, SPIN_PER_S),
      };
      if (Math.abs(next.tucked - was.tucked) < 1e-4 && Math.abs(next.spin - was.spin) < 1e-4) {
        return;
      }
      this.chairPoses.set(key, next);
      this.chairsMoved = true;
      for (const baked of parts) {
        if (!this.drafting) {
          this.bakePiece(baked, this.bakedAt, this.bakedYaw);
        }
        this.placeFootprint(baked);
      }
    });
    // Their shadows are on the sheet: redraw it once the chairs come to rest.
    if (movedBefore && !this.chairsMoved) {
      this.sheetStale = true;
    }
  }

  /** Draw one piece's texture at a resolution, from a yaw, as its state stands. */
  private bakePiece(baked: Baked, resolution: number, yaw: number): void {
    const obj = OBJECTS[baked.piece.name];
    const probe = this.pen({} as CanvasRenderingContext2D, yaw);
    const rect = measure(probe, obj, baked.piece.place, false);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(rect.w * resolution);
    canvas.height = Math.ceil(rect.h * resolution);
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    g.scale(resolution, resolution);
    // Shift the sheet so this piece's corner is the canvas's corner.
    const k = this.pen(g, yaw, [ORIGIN[0] - rect.x, ORIGIN[1] - rect.y]);
    drawObject(k, obj, baked.piece.place, false, this.stateOf(baked.piece), baked.part?.name);
    const old = baked.sprite.texture;
    baked.sprite.texture = textureOf(canvas, resolution);
    baked.canvas = canvas;
    // The drag's canvas is kept for the next turn.
    if (old !== Texture.EMPTY && old !== baked.draft?.texture) {
      old.destroy(true);
    }
    baked.sprite.position.set(rect.x, rect.y);
  }

  /** The sheet itself, its shadows and sunlight as the pieces stand now. */
  private bakeSheetTexture(resolution: number, yaw: number): void {
    const oldSheet = this.sheet.texture;
    this.sheet.texture = textureOf(
      bakeSheet(resolution, yaw, {
        mounted: false,
        stateOf: this.stateOf,
        lettering: !this.page,
      }),
      resolution
    );
    if (oldSheet !== Texture.EMPTY && oldSheet !== this.draftTexture) {
      oldSheet.destroy(true);
    }
    this.sheetStale = false;
  }

  /** A pen on the sheet from a yaw, with world (0, 0, 0) at `origin`. */
  private pen(ctx: CanvasRenderingContext2D, yaw: number, origin = ORIGIN): Iso {
    return new Iso(ctx, { unit: TILE, origin, yaw, pivot: PIVOT });
  }

  /**
   * Draw the sheet and every piece of furniture at a device resolution, seen
   * from a yaw, and lay the desks' live overlays onto their monitors there.
   */
  private bake(resolution: number, yaw: number): void {
    this.bakedAt = resolution;
    this.bakedYaw = yaw;
    this.bakeSheetTexture(resolution, yaw);
    for (const baked of this.standing) {
      this.bakePiece(baked, resolution, yaw);
    }
    // What hangs on a wall turned toward the viewer fades with the wall.
    this.wallLayer.visible = true;
    for (const baked of this.mounted) {
      const alpha = baked.piece.wall ? wallAlpha(baked.piece.wall, yaw) : 1;
      baked.node.visible = alpha > 0.01;
      baked.node.alpha = alpha;
      if (baked.node.visible) {
        this.bakePiece(baked, resolution, yaw);
      }
    }
    DESK_PIECES.forEach((piece, i) => this.layoutDesk(this.desks[i], piece, yaw, resolution));
  }

  /**
   * Re-draw the static art when the view turns — roughly, at once, while a
   * drag is turning it; properly when it stops — or once the zoom has
   * settled somewhere new.
   */
  private maybeRebake(scale: number, now: number): void {
    const want = this.wantedResolution(scale);
    if (this.zoom?.turning) {
      if (this.yaw !== this.draftYaw) {
        this.drawDraft(this.yaw);
      }
      return;
    }
    if (this.drafting || this.yaw !== this.bakedYaw) {
      this.endDraft();
      this.bake(want, this.yaw);
      return;
    }
    if (want === this.bakedAt) {
      this.bakeWanted = 0;
      return;
    }
    if (want !== this.bakeWanted) {
      this.bakeWanted = want;
      this.bakeWantedSince = now;
      return;
    }
    if (now - this.bakeWantedSince > 400) {
      this.bake(want, this.yaw);
    }
  }

  /**
   * While a drag turns the room: one rough canvas with the furniture stood on
   * it, re-drawn in place each frame, and the separate furniture sprites and
   * monitor overlays hidden. The cast still draws on top.
   */
  private drawDraft(yaw: number): void {
    this.draftYaw = yaw;
    if (!this.drafting) {
      this.drafting = true;
      for (const overlay of this.desks) {
        overlay.screen.visible = false;
      }
    }
    // Mid-turn the wall pieces go into the rough sheet, and their sprites hide.
    const canvas = bakeSheet(1, yaw, {
      into: this.draftCanvas,
      stateOf: this.stateOf,
      lettering: !this.page,
    });
    this.wallLayer.visible = false;
    if (!this.draftTexture) {
      this.draftTexture = textureOf(canvas, 1);
    } else {
      this.draftTexture.source.update();
    }
    this.sheet.texture = this.draftTexture;
    // Each piece keeps its own sprite, so the cast still sorts among the
    // furniture mid-turn; only its canvas is re-drawn, roughly, in place.
    const probe = this.pen({} as CanvasRenderingContext2D, yaw);
    for (const baked of this.standing) {
      const obj = OBJECTS[baked.piece.name];
      const rect = measure(probe, obj, baked.piece.place, false);
      let draft = baked.draft;
      if (!draft || draft.canvas.width < rect.w || draft.canvas.height < rect.h) {
        // Grow once to fit, with room to spare for the turn to come.
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(rect.w * 1.25);
        canvas.height = Math.ceil(rect.h * 1.25);
        draft?.texture.destroy(true);
        draft = { canvas, texture: textureOf(canvas, 1) };
        baked.draft = draft;
      }
      const g = draft.canvas.getContext('2d') as CanvasRenderingContext2D;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, draft.canvas.width, draft.canvas.height);
      drawObject(
        this.pen(g, yaw, [ORIGIN[0] - rect.x, ORIGIN[1] - rect.y]),
        obj,
        baked.piece.place,
        false,
        this.stateOf(baked.piece),
        baked.part?.name
      );
      draft.texture.source.update();
      if (baked.sprite.texture !== draft.texture) {
        if (baked.sprite.texture !== Texture.EMPTY) {
          baked.sprite.texture.destroy(true);
        }
        baked.sprite.texture = draft.texture;
      }
      baked.sprite.position.set(rect.x, rect.y);
    }
    DESK_PIECES.forEach((piece, i) => this.layoutDesk(this.desks[i], piece, yaw, 1));
    for (const overlay of this.desks) {
      overlay.screen.visible = false;
    }
  }

  private endDraft(): void {
    if (!this.drafting) {
      return;
    }
    this.drafting = false;
    this.draftYaw = NaN;
  }

  // ---- the camera ----------------------------------------------------------

  /**
   * A wide-enough window sees the whole sheet; a narrow one fits the sheet's
   * height instead and pans a cropped view toward where the actors actually
   * are. Zoom never drops below a legible size just to cram the width in.
   */
  private placeCamera(frame: OfficeFrame): number {
    // Resize inside the frame loop, exactly when the size actually changed —
    // a ResizeObserver fires mid-drag and clears the canvas out of sync with
    // drawing, which reads as violent flicker.
    const vw = this.host?.clientWidth ?? 800;
    const vh = this.host?.clientHeight ?? 600;
    if (vw !== this.hostW || vh !== this.hostH) {
      this.hostW = vw;
      this.hostH = vh;
      this.app.renderer.resize(vw, vh);
    }
    const margin = 12;
    const fitAll = Math.min((vw - margin * 2) / SHEET_W, (vh - margin * 2) / SHEET_H);
    // Below this zoom a character stops reading as a character, so the view
    // crops and follows instead of shrinking further.
    const MIN_SCALE = 0.62;
    let base = fitAll;
    if (this.page) {
      // The office fills the view, and starts one zoom step in from that so
      // its details read; reset comes back here.
      const fitOffice = Math.min(
        vw / (OFFICE_BOX.w + PAGE_PAD * 2),
        vh / (OFFICE_BOX.h + PAGE_PAD * 2)
      );
      base = Math.max(fitOffice * ZOOM_STEP, Math.min(MIN_SCALE, vh / SHEET_H));
      this.placeHud(vw);
    } else if (fitAll < MIN_SCALE) {
      base = Math.max(fitAll, Math.min(vh / SHEET_H, MIN_SCALE));
    }
    const zoom = this.zoom?.zoom ?? 1;
    const scale = base * zoom;

    // Where to look: wherever the viewer panned to; otherwise, once the sheet
    // no longer fits across, the centroid of the cast.
    const focus = this.zoom?.focus;
    let wantX = this.page ? OFFICE_BOX.x + OFFICE_BOX.w / 2 : SHEET_W / 2;
    let wantY = this.page ? OFFICE_BOX.y + OFFICE_BOX.h / 2 : SHEET_H / 2;
    if (focus) {
      wantX = focus.x;
      wantY = focus.y;
    } else if (!this.page && frame.actors.length > 0 && SHEET_W * scale > vw) {
      // The sessions' cast, when there is one: residents wandering about
      // never pull the camera off the work.
      const working = frame.actors.filter((actor) => actor.role !== 'resident');
      const cast = working.length > 0 ? working : frame.actors;
      const pts = cast.map((actor) => sheetPoint([actor.pos.x, actor.pos.y, 0], this.yaw));
      wantX = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
      if (zoom > 1) {
        wantY = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
      }
    }
    // On a page the paper runs on past the sheet, so the office's middle needs no clamping.
    const free = this.page && !focus;
    const cx = free ? wantX : centreOn(wantX, SHEET_W, vw, scale);
    const cy = free ? wantY : centreOn(wantY, SHEET_H, vh, scale);
    const targetX = vw / 2 - cx * scale;
    const targetY = vh / 2 - cy * scale;
    if (this.zoom) {
      // A pan held at the sheet's edge stays there, so the way back answers
      // at once; and the pan buttons that would only push on it are off.
      if (focus && (focus.x !== cx || focus.y !== cy)) {
        this.zoom.focus = { x: cx, y: cy };
      }
      this.zoom.setPanRoom(
        panRoom({ x: cx, y: cy }, { w: SHEET_W, h: SHEET_H }, { w: vw, h: vh }, scale)
      );
    }

    // A zoom step or a drag lands at once; following the cast eases, so pans
    // glide instead of snapping.
    const snap = scale !== this.world.scale.x || Boolean(focus) || SHEET_W * scale <= vw;
    this.world.scale.set(scale);
    if (snap) {
      this.world.position.set(targetX, targetY);
    } else {
      this.world.x += (targetX - this.world.x) * 0.08;
      this.world.y += (targetY - this.world.y) * 0.08;
      if (Math.abs(targetX - this.world.x) < 0.5 && Math.abs(targetY - this.world.y) < 0.5) {
        this.world.position.set(targetX, targetY);
      }
    }
    if (this.host) {
      const grab = SHEET_W * scale > vw || SHEET_H * scale > vh ? 'grab' : '';
      this.host.style.cursor = this.hovering ? 'pointer' : grab;
    }
    return scale;
  }

  /** The camera right now: its scale and the sheet point at the view's middle. */
  private view(): { scale: number; centre: { x: number; y: number } } {
    const scale = this.world.scale.x || 1;
    return {
      scale,
      centre: {
        x: (this.hostW / 2 - this.world.x) / scale,
        y: (this.hostH / 2 - this.world.y) / scale,
      },
    };
  }

  /**
   * The connection's state ("live", "replay", "connecting…") as a pill on the
   * sheet under the title, and beside it what is being shown: the session's
   * name, or nothing on the floor, where the readout already counts desks.
   */
  setStatus(status: string, label: string): void {
    this.back.visible = this.onOpenFloor !== null;
    const key = `${status}|${label}`;
    if (key === this.status.shown) {
      return;
    }
    this.status.shown = key;
    const live = status === 'live';
    this.status.live = live;
    const { pill, text } = this.status;
    text.text = status;
    text.style.fill = live ? PAPER : INK;
    const w = text.width + 20;
    const h = text.height + 2;
    pill.clear();
    pill
      .roundRect(STATUS_LINE.x, STATUS_LINE.y - h / 2, w, h, h / 2)
      .fill(live ? RED : PILL)
      .stroke({ color: INK, width: 1.4 });
    text.position.set(STATUS_LINE.x + w / 2, STATUS_LINE.y);
    this.status.label.text = label;
    this.status.label.position.set(STATUS_LINE.x + w + 10, STATUS_LINE.y);
  }

  render(frame: OfficeFrame): void {
    this.yaw = this.zoom?.yaw ?? 0;
    const scale = this.placeCamera(frame);
    if (this.page) {
      this.fadeTitle();
    }
    this.maybeRebake(scale, frame.at);
    this.stepPieces(frame);
    this.drawRain(frame.at);
    const rigResolution = scale * this.dpr();

    const seen = new Set<string>();
    const cast: Standing[] = [];
    this.shadows.clear();
    // Everyone on the floor, you included: the human sorts, sits and talks
    // like any other figure, only drawn as a person.
    const people = [...frame.actors, frame.human];
    for (const actor of people) {
      const key = spriteKey(actor);
      seen.add(key);
      const sprite = this.actors.get(key) ?? this.spawn(actor);
      this.update(sprite, actor, frame.at, rigResolution, people);
      cast.push({ node: sprite.root, box: sprite.box });
    }
    const seenPets = new Set<string>();
    for (const pet of frame.pets) {
      seenPets.add(pet.id);
      const sprite = this.pets.get(pet.id) ?? this.spawnPet(pet);
      this.updatePet(sprite, pet, frame.at, rigResolution);
      cast.push({ node: sprite.root, box: sprite.box, outline: sprite.outline });
    }
    for (const [id, sprite] of [...this.pets]) {
      if (!seenPets.has(id)) {
        sprite.rig.destroy();
        sprite.root.destroy({ children: true });
        this.pets.delete(id);
      }
    }
    this.pullBlinds(frame.actors);
    for (const [id, sprite] of [...this.actors]) {
      if (!seen.has(id)) {
        sprite.rig.destroy();
        sprite.bubble.destroy({ children: true });
        sprite.root.destroy({ children: true });
        this.actors.delete(id);
      }
    }
    this.stepChairs(frame.at);
    this.sortCast(cast);

    const occupied = new Map(frame.desks.map((desk) => [desk.slot, desk]));
    this.desks.forEach((overlay, slot) => {
      this.updateDesk(overlay, occupied.get(slot), frame.at);
    });
    this.placePopover();
    this.updateReadout(frame.desks);
    if (this.page) {
      this.fadeReadout(frame.at);
    }
    // A live connection breathes; every other status sits still.
    const breath = this.status.live ? 0.7 + 0.3 * Math.cos((frame.at / 2400) * Math.PI * 2) : 1;
    this.status.pill.alpha = breath;
    this.status.text.alpha = breath;

    // One loop: resize, update, and paint together so a resize can never sit
    // unpainted for a frame.
    this.app.render();
  }

  /**
   * Back to front, by footprint. Pieces whose footprints are separated along
   * x or y go by which side of the gap the viewer is on; otherwise by depth.
   * Every such pair that overlaps on screen is a hard constraint, kept by
   * `drawOrder` (a plain sort on the pairwise comparison is not transitive,
   * and breaks them: a board's leg drawn over the figure standing in front).
   * A figure's outline is as wide and tall as it is drawn, so anything its
   * rays reach over is ordered against it. A seat and its sitter share a
   * footprint, so they go by the seat rule: the seat goes under its sitter,
   * and each of its other parts (a back, an arm) by which side of the sitter
   * it stands on. A desk chair's back goes over its sitter exactly when the
   * sitter is drawn from behind, so the backrest is across its back.
   */
  private sortCast(cast: Standing[]): void {
    const all: Standing[] = [...this.standing, ...cast];
    const index = new Map(all.map((item, i) => [item, i]));
    const view = viewToward(this.yaw);
    const outlineBoxes = all.map((item) =>
      cast.includes(item) ? (item.outline ?? figureOutline(item.box)) : item.box
    );
    const before: Array<[number, number]> = [];
    for (const sprite of this.actors.values()) {
      if (sprite.sit <= 0) {
        continue;
      }
      const chair = sprite.seat === null ? undefined : this.deskChairs[sprite.seat];
      const seat = chair?.[0] ?? sprite.lounge ?? undefined;
      const a = this.actorIndex(all, sprite);
      if (!seat || a === undefined) {
        continue;
      }
      if (!seat.part) {
        const s = index.get(seat);
        if (s !== undefined) {
          before.push(sprite.back ? [a, s] : [s, a]);
        }
        continue;
      }
      const parts = chair ?? this.standing.filter((baked) => baked.key === seat.key);
      const shown = parts.map((baked) => ({
        box: baked.box,
        seat: baked.part?.seat === true,
        back: baked.part?.name === 'back',
      }));
      const over = chair
        ? deskChairOverSitter(shown, sprite.box, view, sprite.back)
        : partsOverSitter(shown, sprite.box, view);
      parts.forEach((baked, k) => {
        const p = index.get(baked);
        if (p !== undefined) {
          before.push(over[k] ? [a, p] : [p, a]);
        }
      });
    }
    const probe = sheetPen({} as CanvasRenderingContext2D, this.yaw);
    const order = drawOrder(
      all.map((item) => item.box),
      view,
      (w) => probe.screenOfWorld(w),
      { outlineBoxes, before }
    );
    order.forEach((i, z) => {
      all[i].node.zIndex = z;
    });
    this.actorLayer.sortableChildren = true;
  }

  private actorIndex(all: Standing[], sprite: ActorSprite): number | undefined {
    const i = all.findIndex((item) => item.node === sprite.root);
    return i < 0 ? undefined : i;
  }

  // ---- the objects' state and clicks ---------------------------------------

  /**
   * Rain streaking down the glass of every window in view, while it rains
   * outside: a few drops per light, each falling on its own loop.
   */
  private drawRain(at: number): void {
    const g = this.rain;
    g.clear();
    const hard = this.sky.rain;
    g.visible = hard > 0.03 && !this.drafting;
    if (!g.visible) {
      return;
    }
    const k = this.pen({} as CanvasRenderingContext2D, this.bakedYaw);
    const { x0, x1, z0, transom } = WINDOW;
    const span = transom - z0 + 0.3;
    const drops = Math.round(3 + hard * 4);
    const t = at / 1000;
    this.mounted.forEach((baked, j) => {
      const { piece } = baked;
      if (!piece.name.startsWith('window') || !piece.wall || !baked.node.visible) {
        return;
      }
      k.place(piece.place.at, piece.place.facing);
      const alpha = wallAlpha(piece.wall, this.bakedYaw);
      for (let i = 0; i < drops; i++) {
        const seed = j * 17.3 + i * 5.1;
        const u = x0 + 0.06 + rainHash(seed) * (x1 - x0 - 0.12);
        const speed = 1.6 + rainHash(seed + 0.5) * 0.8;
        const top = transom + 0.15 - ((t * speed + rainHash(seed + 0.9) * span) % span);
        const hi = Math.min(transom - 0.02, top);
        const lo = Math.max(z0 + 0.02, top - 0.18);
        if (hi - lo < 0.02) {
          continue;
        }
        const lean = (z: number): number => (top - z) * 0.22;
        const [ax, ay] = k.P([u - lean(hi), 0.05, hi]);
        const [bx, by] = k.P([u - lean(lo), 0.05, lo]);
        g.moveTo(ax, ay).lineTo(bx, by);
        g.stroke({ width: 0.7, color: 0xe8f0f8, alpha: 0.6 * hard * alpha });
      }
    });
  }

  /**
   * Ease every piece toward its state, swing doors open for whoever is
   * walking through them, move the clock on, and redraw what moved. The
   * sheet's shadows and sunlight follow once a change the viewer made settles.
   */
  private stepPieces(frame: OfficeFrame): void {
    const dt = this.lastAt === null ? 0 : Math.min(100, Math.max(0, frame.at - this.lastAt));
    this.lastAt = frame.at;
    const holds = new Map<string, Record<string, number>>();
    for (const baked of this.standing) {
      const interaction = interactionOf(baked.piece);
      if (interaction?.kind !== 'toggle' || !interaction.door) {
        continue;
      }
      const at = doorway(baked.piece);
      const passing = frame.actors.some((actor) => {
        const sprite = this.actors.get(spriteKey(actor));
        const walking =
          sprite !== undefined && (sprite.last.x !== actor.pos.x || sprite.last.y !== actor.pos.y);
        return walking && Math.hypot(actor.pos.x - at.x, actor.pos.y - at.y) < DOOR_REACH;
      });
      if (passing) {
        for (const piece of linked(baked.piece, ALL_PIECES)) {
          holds.set(pieceKey(piece), { open: 1 });
        }
      }
    }
    const moved = new Set(this.store.step(dt, holds, (key, field) => this.fallbackOf(key, field)));
    // The clock keeps local time, moving on once a minute. The sky outside
    // runs a day an hour on the same local minutes, so it moves on in steps
    // of a few seconds.
    const now = this.wallClock?.now() ?? frame.at;
    const local = minutesOfDay(now);
    const minute = Math.floor(local);
    if (minute !== this.clockMinute) {
      this.clockMinute = minute;
      for (const baked of this.mounted) {
        if (baked.piece.name === 'clock') {
          moved.add(baked.key);
        }
      }
    }
    this.localMinutes = local;
    const step = Math.floor(now / SKY_STEP_MS);
    if (step !== this.skyStep || this.skyClock.version !== this.skyVersion) {
      this.skyStep = step;
      this.skyVersion = this.skyClock.version;
      this.sky = skyAt(now, this.skyClock.minutesAt(local));
      for (const baked of this.mounted) {
        if (baked.piece.name.startsWith('window')) {
          moved.add(baked.key);
        }
      }
      // The sunlight on the floor follows in coarser steps, and not at all
      // once the sun is down: it redraws the sheet.
      const sheetSky = [
        this.sky.day > 0 ? Math.floor(this.sky.minutes / SHEET_SKY_MINUTES) : 'night',
        Math.round(this.sky.cloud * 5),
        Math.round(this.sky.fog * 5),
        Math.round(this.sky.rain * 5),
      ].join('|');
      if (sheetSky !== this.sheetSky) {
        this.sheetSky = sheetSky;
        this.sheetStale = true;
      }
    }
    for (const key of this.dirty) {
      moved.add(key);
    }
    this.dirty.clear();
    if (moved.size > 0 && !this.drafting) {
      for (const baked of [...this.standing, ...this.mounted]) {
        // A piece on a wall turned away is redrawn when the view turns back.
        if (moved.has(baked.key) && (baked.node.visible || !baked.piece.wall)) {
          this.bakePiece(baked, this.bakedAt, this.bakedYaw);
          this.placeFootprint(baked);
        }
      }
    }
    // A change the viewer made that has just come to rest redraws the sheet under it.
    for (const key of this.easedLast) {
      if (!moved.has(key) && this.settling.delete(key)) {
        this.sheetStale = true;
      }
    }
    this.easedLast = moved;
    if (this.sheetStale && moved.size === 0 && !this.drafting && this.settling.size === 0) {
      this.bakeSheetTexture(this.bakedAt, this.bakedYaw);
    }
  }

  /** The seat a lounging avatar is in: the smallest piece whose floor it stands on. */
  private seatAt(at: { x: number; y: number }): Baked | null {
    let best: Baked | null = null;
    let bestArea = Infinity;
    for (const baked of this.standing) {
      const [[x0, y0], [x1, y1]] = baked.box;
      if (at.x < x0 || at.x > x1 || at.y < y0 || at.y > y1) {
        continue;
      }
      const area = (x1 - x0) * (y1 - y0);
      if (area < bestArea) {
        best = baked;
        bestArea = area;
      }
    }
    return best;
  }

  /**
   * An avatar working a window's blind pulls it, once, partway through the
   * step: down if it was up, up if it was down — the same change a click makes.
   */
  private pullBlinds(actors: readonly Actor[]): void {
    for (const actor of actors) {
      const activity = actor.activity;
      if (!activity?.blind || activity.act !== 'reach' || actor.progress < BLIND_PULL_AT) {
        continue;
      }
      if (this.pulledBlinds.has(activity.key)) {
        continue;
      }
      this.pulledBlinds.add(activity.key);
      if (this.pulledBlinds.size > 64) {
        this.pulledBlinds.delete(this.pulledBlinds.values().next().value as string);
      }
      const { wall, along } = activity.blind;
      let best: Baked | null = null;
      let bestGap = Infinity;
      for (const baked of this.mounted) {
        if (baked.piece.wall !== wall || !baked.piece.name.startsWith('windowBlind')) {
          continue;
        }
        const [x, y] = baked.piece.place.at;
        const gap = Math.abs((wall === '+y' ? x : y) - along);
        if (gap < bestGap) {
          best = baked;
          bestGap = gap;
        }
      }
      if (!best || bestGap > WINDOW_SPAN / 2 + 0.1) {
        continue;
      }
      const state = this.store.get(best.key);
      const down = typeof state.down === 'number' ? state.down : this.fallbackOf(best.key, 'down');
      this.setPieces([best.piece], { down: down >= 0.5 ? 0 : 1 });
    }
  }

  /** The value a piece's field has before anyone sets it: how it is authored. */
  private fallbackOf(key: string, field: string): number {
    const baked = [...this.standing, ...this.mounted].find((b) => b.key === key);
    const interaction = baked ? interactionOf(baked.piece) : undefined;
    if (interaction?.kind === 'toggle' && interaction.key === field) {
      return typeof interaction.fallback === 'number' ? interaction.fallback : 0;
    }
    if (field === 'down') {
      return BLIND_DEFAULT;
    }
    // A projection screen stands pulled up; every drawer and door starts shut.
    return field === 'up' ? 1 : 0;
  }

  /** Set a piece (and its partners) to a state the viewer chose. */
  private setPieces(pieces: readonly RoomPiece[], patch: Record<string, unknown>): void {
    for (const piece of pieces) {
      const key = pieceKey(piece);
      this.store.set(key, patch);
      this.dirty.add(key);
      const interaction = interactionOf(piece);
      if (interaction && 'sheet' in interaction && interaction.sheet) {
        this.settling.add(key);
      }
    }
  }

  /** Where a pointer event lands on the sheet. */
  private sheetAt(e: PointerEvent): { x: number; y: number } {
    const r = this.app.canvas.getBoundingClientRect();
    const s = this.world.scale.x || 1;
    return {
      x: (e.clientX - r.left - this.world.x) / s,
      y: (e.clientY - r.top - this.world.y) / s,
    };
  }

  /**
   * The piece drawn on top at a sheet point: furniture front to back, then
   * what hangs on the walls behind it. A piece is hit where it is drawn, not
   * across its bounding box, so a click through the gap under a table lands
   * on the floor.
   */
  private pieceAt(x: number, y: number): Baked | null {
    if (this.drafting) {
      return null;
    }
    const front = [...this.standing].sort((p, q) => q.node.zIndex - p.node.zIndex);
    const walls = this.mounted.filter((b) => b.node.visible && b.node.alpha > 0.5);
    for (const baked of [...front, ...walls]) {
      const canvas = baked.canvas;
      if (!canvas) {
        continue;
      }
      const px = Math.floor((x - baked.sprite.x) * this.bakedAt);
      const py = Math.floor((y - baked.sprite.y) * this.bakedAt);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
        continue;
      }
      const alpha = canvas.getContext('2d')?.getImageData(px, py, 1, 1).data[3] ?? 0;
      // Something clickable is hit wherever it shows at all, its glass
      // included; scenery only where it is solid, so a click goes through a
      // glass wall to the door behind it.
      if (alpha > (interactionOf(baked.piece) ? 40 : 200)) {
        return baked;
      }
    }
    return null;
  }

  /**
   * What a tap does: a part that does one thing does it; any other part
   * opens its popover (its label, and its controls if it has several); the
   * sprint board opens up close; the floor closes whatever is open.
   */
  private tap(e: PointerEvent): void {
    if (this.editor?.isOpen || this.usagePanel?.isOpen) {
      return;
    }
    const { x, y } = this.sheetAt(e);
    const hit = this.pieceAt(x, y);
    if (!hit) {
      this.closePopover();
      return;
    }
    const interaction = interactionOf(hit.piece);
    const state = { ...this.store.get(hit.key), ...this.store.wanted(hit.key) };
    if (interaction?.kind === 'toggle') {
      this.closePopover();
      this.setPieces(linked(hit.piece, ALL_PIECES), toggled(state, interaction));
    } else if (interaction?.kind === 'usage') {
      this.closePopover();
      this.hint?.hide();
      this.usagePanel?.open();
    } else if (interaction?.kind !== 'board') {
      // A part that does several things, or none: its label in the margin,
      // and its controls under it if any.
      if (this.open === hit) {
        this.closePopover();
        return;
      }
      this.open = hit;
      this.openAt = { x, y };
      const controls = interaction?.kind === 'menu' ? interaction.controls(state) : [];
      this.popover?.open(hit.key, annotationOf(hit.piece), controls);
      this.placePopover();
    } else {
      this.closePopover();
      this.hint?.hide();
      const board = normalizeBoard(this.store.wanted(hit.key).board ?? DEFAULT_BOARD);
      this.editingBoard = hit;
      this.editor?.open(board);
    }
    this.hover(e);
  }

  /** A control on the popover pressed: set it, and re-letter the card. */
  private pick(control: Control): void {
    const baked = this.open;
    const interaction = baked ? interactionOf(baked.piece) : undefined;
    if (!baked || interaction?.kind !== 'menu') {
      return;
    }
    this.setPieces(linked(baked.piece, ALL_PIECES, control.scope), control.patch);
    const state = { ...this.store.get(baked.key), ...this.store.wanted(baked.key) };
    this.popover?.refresh(annotationOf(baked.piece), interaction.controls(state));
  }

  private closePopover(): void {
    this.open = null;
    this.popover?.close();
    this.leader.clear();
  }

  /**
   * Keep the open annotation in its margin as the camera moves, and its
   * leader running from the title to the spot that was clicked: a short
   * level run, then straight to the part, ending on a dot.
   */
  private placePopover(): void {
    const g = this.leader;
    g.clear();
    if (!this.open || !this.popover) {
      return;
    }
    const label = annotationOf(this.open.piece);
    const to: [number, number] = [this.openAt.x, this.openAt.y];
    // Finding the spot searches the margin, so do it only when something moved.
    const size = this.popover.size();
    const spotKey = `${to.join(',')}|${this.yaw}|${size.w}|${size.h}`;
    if (spotKey !== this.spotKey) {
      this.spotKey = spotKey;
      this.spot = marginSpot(to, this.yaw, size.w, size.h);
    }
    const { at, align } = this.spot;
    const s = this.world.scale.x || 1;
    this.popover.place(this.world.x + at[0] * s, this.world.y + at[1] * s, s, align);
    const titleW = this.popover.titleWidth();
    const startX = align === 'left' ? at[0] + titleW + 10 : at[0] - titleW - 10;
    const y = at[1] - 7;
    const elbowX =
      align === 'left' ? Math.max(startX + 24, to[0] - 60) : Math.min(startX - 24, to[0] + 60);
    g.moveTo(startX, y)
      .lineTo(elbowX, y)
      .lineTo(to[0], to[1])
      .stroke({ color: INK, width: 0.8, alpha: 0.55 });
    g.circle(startX, y, 2.6).fill(PAPER).stroke({ color: INK, width: 0.9, alpha: 0.55 });
    g.circle(to[0], to[1], 2.2).fill(INK);
  }

  /** The pointer over the office: a pointing hand and a hint over what can be clicked. */
  private hover(e: PointerEvent | null): void {
    if (!e || this.editor?.isOpen || this.zoom?.dragging) {
      this.hovering = false;
      this.hint?.hide();
      return;
    }
    const { x, y } = this.sheetAt(e);
    const hit = this.pieceAt(x, y);
    const interaction = hit ? interactionOf(hit.piece) : undefined;
    this.hovering = Boolean(interaction);
    if (!hit || !interaction) {
      this.hint?.hide();
      return;
    }
    const state = { ...this.store.get(hit.key), ...this.store.wanted(hit.key) };
    const text =
      interaction.kind === 'toggle' ? interaction.hint(isOn(state, interaction)) : interaction.hint;
    const r = this.app.canvas.getBoundingClientRect();
    this.hint?.show(text, e.clientX - r.left, e.clientY - r.top);
  }

  /**
   * The office's usage, from the server: the board on the wall redraws with
   * it, and the ledger shows it. `reading` until the first report lands,
   * `none` where the page has no usage source; a `demo` report is made up
   * (`mockUsage.ts`), and the ledger says so.
   */
  setUsage(report: UsageReport | 'reading' | 'none', options: { demo?: boolean } = {}): void {
    this.usage = typeof report === 'object' ? glanceOf(report) : report;
    this.usagePanel?.update(report, options);
    for (const baked of this.mounted) {
      if (baked.piece.name === 'usageBoard') {
        this.dirty.add(baked.key);
      }
    }
  }

  /** The board being edited, for the editor's changes. */
  private editingBoard: Baked | null = null;

  private boardChanged(board: BoardContent, ink: HTMLCanvasElement | null): void {
    const baked = this.editingBoard;
    if (!baked) {
      return;
    }
    if (ink) {
      this.inkImages.set(baked.key, ink);
    } else {
      this.inkImages.delete(baked.key);
    }
    this.store.set(baked.key, { board });
    this.dirty.add(baked.key);
  }

  /** The marker kept on each board from a visit before, once it has decoded. */
  private loadInk(): void {
    for (const baked of this.standing) {
      if (baked.piece.name !== 'mobileBoard') {
        continue;
      }
      const board = this.store.wanted(baked.key).board;
      const ink = board ? normalizeBoard(board).ink : null;
      if (!ink) {
        continue;
      }
      const img = new Image();
      img.onload = (): void => {
        if (!this.inkImages.has(baked.key)) {
          this.inkImages.set(baked.key, img);
          this.dirty.add(baked.key);
        }
      };
      img.src = ink;
    }
  }

  /** The office's outline on screen, as the camera has it now. */
  private outlineOnScreen(): [number, number][] {
    const scale = this.world.scale.x;
    return officeOutline(this.yaw).map(([x, y]) => [
      this.world.x + x * scale,
      this.world.y + y * scale,
    ]);
  }

  /**
   * Page mode: let the office show through each line of the pinned title
   * where that line's letters run over it, as they do when zoomed in, panned
   * or turned; the lines clear of it stay solid. With the pointer over the
   * title, all of it shows in full.
   */
  private fadeTitle(): void {
    const block = this.titleBlock;
    if (!block || !this.host) {
      return;
    }
    const scale = this.world.scale.x;
    const key = `${this.world.x.toFixed(1)}|${this.world.y.toFixed(1)}|${scale}|${this.yaw}|${this.hostW}|${block.style.left}|${block.style.top}`;
    if (key !== this.titleFadeKey) {
      this.titleFadeKey = key;
      // Each line's letters, not its box (a line's box has no height).
      const host = this.host.getBoundingClientRect();
      const t = this.titleScale;
      const outline = this.outlineOnScreen();
      this.titleLines = Array.from(block.children).map((child) => {
        const el = child as HTMLElement;
        const r = el.getBoundingClientRect();
        const top = el.dataset.inkTop === undefined ? r.top : r.top + Number(el.dataset.inkTop) * t;
        const bottom =
          el.dataset.inkBottom === undefined ? r.bottom : r.top + Number(el.dataset.inkBottom) * t;
        const box = { x: r.left - host.left, y: top - host.top, w: r.width, h: bottom - top };
        return { el, box, under: rectTouchesPolygon(box, outline) };
      });
    }
    const shown = pointerOver(
      this.pointer,
      this.titleLines.map((line) => line.box)
    );
    for (const { el, under } of this.titleLines) {
      el.style.opacity = under && !shown ? String(PAGE_TITLE_SEE_THROUGH) : '1';
    }
  }

  /**
   * Page mode: each line of the readout goes see-through like the title's
   * wherever the office runs under it, easing there over `PAGE_FADE_MS` of
   * frame time; with the pointer over the readout, all of it shows in full.
   */
  private fadeReadout(at: number): void {
    const texts = [this.readout.label, this.readout.state, this.readout.detail];
    const outline = this.outlineOnScreen();
    const boxes = texts.map((text) => {
      const b = text.getBounds();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    const shown = pointerOver(
      this.pointer,
      boxes.filter((_, i) => texts[i].text)
    );
    const dt = this.readoutFadeAt === null ? Infinity : Math.max(0, at - this.readoutFadeAt);
    this.readoutFadeAt = at;
    const step = Math.min(1, dt / PAGE_FADE_MS) * (1 - PAGE_TITLE_SEE_THROUGH);
    texts.forEach((text, i) => {
      const under = Boolean(text.text) && rectTouchesPolygon(boxes[i], outline);
      const want = under && !shown ? PAGE_TITLE_SEE_THROUGH : 1;
      const gap = want - text.alpha;
      text.alpha = Math.abs(gap) <= step ? want : text.alpha + Math.sign(gap) * step;
    });
  }

  /**
   * Page mode: pin the title block to the view's top-left corner and the
   * readout to its top-right, each standing `CORNER_INSET` in from the edges,
   * at sheet size on a wide view and smaller on a narrow one, wherever the
   * camera has gone.
   */
  private placeHud(vw: number): void {
    const s = Math.max(0.55, Math.min(1, vw / PAGE_HUD_W));
    this.hud.scale.set(s);
    // The lettering's own offsets from the sheet's corner, kept as they are on the sheet.
    const block = this.titleBlock;
    const t = Math.max(PAGE_TITLE_MIN, s * PAGE_TITLE_SCALE);
    this.titleScale = t;
    if (block) {
      block.style.transform = `scale(${t})`;
      // Its first ink, not its sheet offsets, stands in from the corner.
      const inkLeft = Number(block.dataset.inkLeft ?? TITLE_LETTERING[0].x);
      const inkTop = Number(block.dataset.inkTop ?? 0);
      block.style.left = `${CORNER_INSET - inkLeft * t}px`;
      block.style.top = `${CORNER_INSET - inkTop * t}px`;
    }
    // The readout's first letters stand in from the corner, and each line
    // after hangs the title's gap below the one before (on screen, whatever
    // either is scaled to).
    const right = (vw - CORNER_INSET) / s + READOUT_TRAIL;
    const gap = (Number(block?.dataset.gap ?? 20) * t) / s;
    let inkTop = CORNER_INSET / s;
    for (const text of [this.readout.label, this.readout.state, this.readout.detail]) {
      const baseline = inkTop + inkAscent(text);
      text.position.set(right, baseline - baselineOf(text));
      inkTop = baseline + gap;
    }
  }

  destroy(): void {
    this.zoom?.destroy();
    for (const sprite of this.actors.values()) {
      sprite.rig.destroy();
    }
    for (const sprite of this.pets.values()) {
      sprite.rig.destroy();
    }
    this.app.destroy(true, { children: true, texture: true });
  }

  // ---- desks ---------------------------------------------------------------

  private makeDeskOverlay(): DeskOverlay {
    // The live terminal lies on the monitor's glass: a container whose x axis
    // runs along the face and whose y axis runs straight down (see `layoutDesk`).
    const screen = new Container();
    const screenBg = new Graphics();
    const screenMask = new Graphics();
    screenMask.rect(0, 0, SCREEN_W, SCREEN_H).fill(0xffffff);
    const screenText = new Text({
      text: '',
      style: {
        fill: hexNum(ACCENT.terminal),
        fontSize: SCREEN_FONT,
        lineHeight: SCREEN_LINE_H,
        fontFamily: FONT.mono,
      },
      resolution: 4,
    });
    screenText.mask = screenMask;
    screenText.position.set(2.5, 0);
    screen.addChild(screenBg, screenMask, screenText);

    // The labels float over the monitor, upright, in the sheet's hand.
    const nameplate = new Text({ text: '', style: hand(16, INK, '700') });
    nameplate.anchor.set(0.5, 1);
    // A desk's name opens its session, with the play bar to replay it.
    nameplate.eventMode = 'static';
    nameplate.cursor = 'pointer';

    const badge = new Container();
    const badgeBg = new Graphics();
    const badgeText = new Text({ text: '', style: flat(15, PAPER, '700') });
    badgeText.anchor.set(0.5, 0.5);
    badge.addChild(badgeBg, badgeText);
    badge.visible = false;

    const tag = new Container();
    const tagBg = new Graphics();
    const tagText = new Text({ text: '', style: flat(15, INK, '700') });
    tagText.anchor.set(0.5, 0.5);
    tag.addChild(tagBg, tagText);
    tag.visible = false;

    const overlay: DeskOverlay = {
      screen,
      screenBg,
      screenText,
      nameplate,
      badge,
      badgeBg,
      badgeText,
      tag,
      tagBg,
      tagText,
      shownScreen: undefined,
      shownBadge: '',
      shownTag: '',
      glassFacing: true,
      bus: null,
    };
    nameplate.on('pointertap', () => {
      if (overlay.bus && this.onOpenSession) {
        this.onOpenSession(overlay.bus);
      }
    });
    return overlay;
  }

  /**
   * Lay a desk's overlay onto its monitor as seen from a yaw: the terminal
   * mapped onto the glass (and hidden when the glass is turned away), the
   * labels above the monitor's top.
   */
  private layoutDesk(
    overlay: DeskOverlay,
    piece: RoomPiece,
    yaw: number,
    resolution: number
  ): void {
    const [ax, ay] = piece.place.at;
    const s = MONITOR_SCREEN;
    const corner: V3 = [ax + s.x0, ay + s.y + 0.002, s.z1];
    const [tx, ty] = sheetPoint(corner, yaw);
    const [ux, uy] = sheetPoint([corner[0] + 1, corner[1], corner[2]], yaw);
    // One sheet pixel along the face, then straight down.
    overlay.screen.setFromMatrix(new Matrix((ux - tx) / TILE, (uy - ty) / TILE, 0, 1, tx, ty));
    const k = this.pen({} as CanvasRenderingContext2D, yaw);
    k.place(piece.place.at, piece.place.facing);
    overlay.glassFacing = k.facing([0, 1, 0]);
    overlay.screen.visible = overlay.glassFacing;
    overlay.screenText.resolution = resolution * 2;

    const [lx, ly] = sheetPoint([ax, ay - 0.2, 2.1], yaw);
    overlay.nameplate.position.set(lx, ly - 6);
    overlay.badge.position.set(lx, ly - 36);
    const [rx, ry] = sheetPoint([ax + s.x1, ay + s.y, s.z1], yaw);
    const [qx, qy] = sheetPoint([ax + s.x0, ay + s.y, s.z1], yaw);
    // The +N tag sits at whichever top corner of the monitor is on the right.
    overlay.tag.position.set(Math.max(rx, qx) + 4, (rx > qx ? ry : qy) - 4);
  }

  /**
   * Paint the glass: dark and blank for an empty desk, a pale desktop with a
   * couple of windows when a session sits idle, a terminal while one runs.
   */
  private paintScreen(overlay: DeskOverlay, mode: 'off' | 'idle' | 'running'): void {
    const g = overlay.screenBg;
    g.clear();
    if (mode === 'off') {
      return;
    }
    if (mode === 'running') {
      g.rect(0, 0, SCREEN_W, SCREEN_H).fill(hexNum(MAT.screen.m));
      return;
    }
    g.rect(0, 0, SCREEN_W, SCREEN_H).fill(hexNum(MAT.glass.m));
    g.rect(4, 4, SCREEN_W * 0.5, SCREEN_H * 0.5)
      .fill(PAPER)
      .stroke({ color: INK, width: 0.6 });
    g.rect(4, 4, SCREEN_W * 0.5, 3).fill(hexNum(MAT.cobalt.m));
    g.rect(SCREEN_W * 0.6, 9, SCREEN_W * 0.32, SCREEN_H * 0.62)
      .fill(PILL)
      .stroke({ color: INK, width: 0.6 });
    g.rect(0, SCREEN_H - 3.5, SCREEN_W, 3.5).fill(hexNum(MAT.cobalt.d));
  }

  private updateDesk(overlay: DeskOverlay, desk: DeskView | undefined, at: number): void {
    if (!desk) {
      if (overlay.shownScreen !== null) {
        overlay.shownScreen = null;
        overlay.screenText.text = '';
        this.paintScreen(overlay, 'off');
      }
      overlay.nameplate.visible = false;
      overlay.badge.visible = false;
      overlay.tag.visible = false;
      overlay.shownBadge = '';
      overlay.shownTag = '';
      return;
    }

    overlay.nameplate.visible = true;
    overlay.nameplate.text = deskTitle(desk);
    overlay.bus = desk.bus;

    // The screen: a terminal scrolling the command while one runs. An empty
    // string stands for "occupied but idle", distinct from an empty desk.
    const screen = desk.screen ?? '';
    if (screen !== overlay.shownScreen) {
      overlay.shownScreen = screen;
      this.paintScreen(overlay, screen ? 'running' : 'idle');
      overlay.screenText.text = screen
        ? [...screenLines(screen), ...screenLines(screen)].join('\n')
        : '';
    }
    if (screen) {
      const block = SCREEN_LINES * SCREEN_LINE_H;
      const elapsed = Math.max(0, at - desk.screenSince) / 1000;
      overlay.screenText.y = 1.5 - ((elapsed * SCREEN_LINES_PER_SEC * SCREEN_LINE_H) % block);
    }

    const badge = badgeFor(desk.phase);
    const badgeKey = badge ? badge.text : '';
    if (badgeKey !== overlay.shownBadge) {
      overlay.shownBadge = badgeKey;
      overlay.badge.visible = badge !== null;
      if (badge) {
        overlay.badgeText.text = badge.text;
        const w = overlay.badgeText.width + 18;
        const h = overlay.badgeText.height + 4;
        overlay.badgeBg.clear();
        overlay.badgeBg
          .roundRect(-w / 2, -h / 2, w, h, h / 2)
          .fill(badge.color)
          .stroke({ color: INK, width: 1.4 });
      }
    }

    const tagKey = desk.subagents > 0 ? `+${desk.subagents}` : '';
    if (tagKey !== overlay.shownTag) {
      overlay.shownTag = tagKey;
      overlay.tag.visible = tagKey !== '';
      if (tagKey) {
        overlay.tagText.text = tagKey;
        const w = Math.max(24, overlay.tagText.width + 12);
        const h = overlay.tagText.height + 2;
        overlay.tagBg.clear();
        overlay.tagBg
          .roundRect(-w / 2, -h / 2, w, h, h / 2)
          .fill(PILL)
          .stroke({ color: INK, width: 1.4 });
      }
    }
  }

  private updateReadout(desks: readonly DeskView[]): void {
    const r = readoutFor(desks);
    const key = `${r.label}|${r.state}|${r.detail}`;
    if (key === this.readout.shown) {
      return;
    }
    this.readout.shown = key;
    this.readout.label.text = r.label;
    this.readout.state.text = r.state;
    this.readout.detail.text = r.detail;
    // The lit state: a desk that wants you turns the readout's detail red.
    const wants = desks.some(
      (desk) => desk.phase === 'waiting_on_user' || desk.phase === 'awaiting_approval'
    );
    this.readout.detail.style.fill = wants ? RED : LEAD;
  }

  // ---- actors --------------------------------------------------------------

  private spawn(actor: Actor): ActorSprite {
    const root = new Container();
    const rig = actor.role === 'human' ? new HumanRig() : new AgentRig();
    root.addChild(rig.view);

    const nameplate = new Text({ text: nameplateFor(actor.label), style: hand(14, LEAD, '700') });
    nameplate.anchor.set(0.5, 0);
    nameplate.y = 6;
    root.addChild(nameplate);

    const bubble = new Container();
    const bubbleBg = new Graphics();
    bubble.addChild(bubbleBg);
    const bubbleText = new Text({
      text: '',
      style: { ...hand(16, INK), wordWrap: true, wordWrapWidth: 190, lineHeight: 17 },
    });
    bubble.addChild(bubbleText);
    bubble.visible = false;
    // Speech is never hidden: it floats over the furniture and the cast alike,
    // so a lead asking at its desk is read over its own monitor.
    this.topLayer.addChild(bubble);

    const zzz = new Text({ text: 'z z z', style: hand(17, LEAD, '700') });
    zzz.anchor.set(0, 1);
    zzz.position.set(18, -48);
    zzz.visible = false;
    root.addChild(zzz);

    const sweat = new Graphics();
    root.addChild(sweat);

    const [x] = sheetPoint([actor.pos.x, actor.pos.y, 0], this.yaw);
    const sprite: ActorSprite = {
      root,
      rig,
      bubble,
      bubbleBg,
      bubbleText,
      bubbleOffset: { x: -10, y: 0 },
      nameplate,
      zzz,
      sweat,
      last: { ...actor.pos },
      heading: actor.facing > 0 ? '+x' : '+y',
      sit: 0,
      seat: null,
      lounge: null,
      back: false,
      lastAt: null,
      travel: 0,
      box: [
        [actor.pos.x, actor.pos.y, 0],
        [actor.pos.x, actor.pos.y, 0],
      ],
    };
    this.actors.set(spriteKey(actor), sprite);
    this.actorLayer.addChild(root);
    return sprite;
  }

  private update(
    sprite: ActorSprite,
    actor: Actor,
    at: number,
    resolution: number,
    others: readonly Actor[]
  ): void {
    // At its own desk a lead sits in the desk's chair, pulled in right up to
    // the keyboard, whatever it is doing there; it gets up to go anywhere
    // else. Sitting down and standing up ease, and so does the slide from the
    // seat to the chair. Helpers stand: they work beside the desk.
    const own = actor.state === 'working' && actor.station === 'own_desk' && actor.role === 'lead';
    const slot = seatSlotOf(actor);
    const dt = sprite.lastAt === null ? 0 : Math.min(100, Math.max(0, at - sprite.lastAt));
    sprite.lastAt = at;
    if (slot >= 0) {
      sprite.seat = slot;
    }
    // Idle, it may sit down elsewhere: on a sofa, in a café or meeting chair.
    const lounge = lounging(actor);
    if (lounge) {
      sprite.lounge = this.seatAt(actor.pos);
    }
    sprite.sit = easeToward(sprite.sit, slot >= 0 || lounge ? 1 : 0, dt, 1 / SIT_S);
    if (sprite.sit === 0) {
      sprite.seat = null;
      sprite.lounge = null;
    }
    // Face where it is going, or what it is standing at — never the viewer
    // for its own sake.
    sprite.heading = nextHeading(actor, sprite.last, sprite.heading, others);
    // A jump (a seek, a first frame) is not a walk.
    const moved = Math.hypot(actor.pos.x - sprite.last.x, actor.pos.y - sprite.last.y);
    if (moved < 1) {
      sprite.travel += moved;
    }
    sprite.last = { ...actor.pos };
    // Only a desk chair is pulled in to the keys; a sofa is sat in where it is.
    const pulled = sprite.seat !== null ? smooth(sprite.sit) : 0;
    // Back in the chair, against its backrest, whichever way it is swivelled.
    const chair = sprite.seat === null ? undefined : this.deskChairs[sprite.seat];
    const spin = chair ? (this.chairPoses.get(chair[0].key)?.spin ?? 0) : 0;
    // Seated, it turns with its chair, which swivels smoothly; on its feet it
    // faces its heading.
    const view =
      chair && sprite.sit > 0.5
        ? sitterView(spin, this.yaw)
        : headingView(sprite.heading, this.yaw);
    const lean = sitterOffset(spin, this.yaw);
    sprite.back = view.back;
    const root: V3 = [
      actor.pos.x + (DESK_STANCE.x + lean.x) * pulled,
      actor.pos.y + (DESK_STANCE.y + lean.y) * pulled,
      0,
    ];
    const [x, y] = sheetPoint(root, this.yaw);
    sprite.root.position.set(x, y);
    // Sorted from where it is drawn, in its chair, but never into its own
    // desk: that keeps the desk on the right side of it, and its chair's
    // parts are placed against it after.
    sprite.box = sitterBox(
      { x: root[0], y: root[1] },
      sprite.seat === null ? null : DESKS[sprite.seat],
      ACTOR_HALF,
      ACTOR_HEIGHT
    );
    const shown: Actor = view.facing === actor.facing ? actor : { ...actor, facing: view.facing };

    // The desk carries the session name; a lead's own plate would repeat it.
    sprite.nameplate.visible = actor.role === 'helper';
    sprite.nameplate.text = nameplateFor(actor.label);

    const t = at / 1000;
    // Typing, its hands go to where the desk's keys are from this view.
    let keys: [Vec, Vec] | undefined;
    if (own) {
      const key = (o: V3): Vec => {
        const [kx, ky] = sheetPoint([root[0] + o[0], root[1] + o[1], o[2]], this.yaw);
        return { x: (kx - x) / RIG_SCALE, y: (ky - y) / RIG_SCALE };
      };
      keys = [key(KEY_OFFSETS[0]), key(KEY_OFFSETS[1])];
    }
    // The pose loops on the worker's own animation clock, which the director
    // runs at its tempo and starts over with each state, so the loop drawn is
    // the loop the director waits on; hand-made frames fall back to the
    // frame clock.
    const anim = actor.phase === undefined ? t : actor.phase / 1000;
    sprite.rig.update(shown, anim, own, resolution, {
      back: view.back,
      keys,
      sit: sprite.sit,
      clock: t,
      travel: sprite.travel,
    });
    if (sprite.rig instanceof HumanRig) {
      this.shadows
        .ellipse(x, y - 1, 15, 5.5)
        .fill({ color: hexNum(SHEET.shadow), alpha: SHEET.shadowAlpha });
    } else {
      this.drawShadow(x, y, airborneOf(shown, anim, own, sprite.sit, sprite.travel));
    }

    sprite.zzz.visible = actor.state === 'napping';
    this.drawSweat(sprite.sweat, actor.stress, t);
    if (actor.bubble) {
      // Near the top of the sheet the usual above-the-head spot is off it, so
      // the bubble flips underneath.
      this.setBubble(sprite, actor.bubble, y < 150);
      sprite.bubble.position.set(x + sprite.bubbleOffset.x, y + sprite.bubbleOffset.y);
    } else {
      sprite.bubble.visible = false;
    }
  }

  // ---- pets ----------------------------------------------------------------

  private spawnPet(pet: PetView): PetSprite {
    const root = new Container();
    const rig = new PetRig(pet.kind);
    root.addChild(rig.view);
    const sprite: PetSprite = {
      root,
      rig,
      last: { ...pet.pos },
      travel: 0,
      facing: 1,
      box: [
        [pet.pos.x, pet.pos.y, 0],
        [pet.pos.x, pet.pos.y, 0],
      ],
      outline: [
        [pet.pos.x, pet.pos.y, 0],
        [pet.pos.x, pet.pos.y, 0],
      ],
    };
    this.pets.set(pet.id, sprite);
    this.actorLayer.addChild(root);
    return sprite;
  }

  private updatePet(sprite: PetSprite, pet: PetView, at: number, resolution: number): void {
    const { x: px, y: py } = pet.pos;
    // A jump (a seek, a first frame) is not a walk.
    const moved = Math.hypot(px - sprite.last.x, py - sprite.last.y);
    if (moved < 1) {
      sprite.travel += moved;
    }
    sprite.last = { x: px, y: py };
    // Side-on, it faces whichever way along the screen it is headed.
    const [ax] = sheetPoint([px, py, 0], this.yaw);
    const [bx] = sheetPoint([px + pet.dir.x, py + pet.dir.y, 0], this.yaw);
    if (Math.abs(bx - ax) > 3) {
      sprite.facing = bx > ax ? 1 : -1;
    }
    const [x, y] = sheetPoint([px, py, pet.z], this.yaw);
    sprite.root.position.set(x, y);
    sprite.rig.update(pet, sprite.facing, sprite.travel, at / 1000, resolution);
    const size = PETS[pet.kind];
    sprite.box = [
      [px - size.half, py - size.half, pet.z],
      [px + size.half, py + size.half, pet.z + size.height],
    ];
    const r = size.length / 2;
    sprite.outline = [
      [px - r, py - r, pet.z],
      [px + r, py + r, pet.z + size.height],
    ];
    // Its shadow where it stands, on the floor or on top of what it is up on;
    // in the air it falls on the floor, smaller.
    const ground = pet.act === 'jump' ? 0 : pet.z;
    const [sx, sy] = sheetPoint([px, py, ground], this.yaw);
    const shrink = pet.act === 'jump' ? 0.7 : 1;
    this.shadows
      .ellipse(sx - 1, sy, size.length * 14 * shrink, size.length * 5 * shrink)
      .fill({ color: hexNum(SHEET.shadow), alpha: SHEET.shadowAlpha });
  }

  /** A character's flat blue shadow, on the floor layer under everyone. */
  private drawShadow(x: number, y: number, airborne: number): void {
    const pts = hull(shadowOutline(airborne)).flatMap(([px, py]) => [
      x + px * RIG_SCALE,
      y - 2 + py * RIG_SCALE,
    ]);
    this.shadows.poly(pts).fill({ color: hexNum(SHEET.shadow), alpha: SHEET.shadowAlpha });
  }

  /**
   * Sweat drops beside the head, the more and the faster the further behind
   * the worker's session has fallen. Each drop falls and fades on its own
   * cycle, so at full stress they come in a steady patter.
   */
  private drawSweat(g: Graphics, stress: number, t: number): void {
    g.clear();
    if (stress <= 0.02) {
      return;
    }
    const drops = Math.min(SWEAT_DROPS, Math.ceil(stress * SWEAT_DROPS));
    const period = SWEAT_SLOW_S - (SWEAT_SLOW_S - SWEAT_FAST_S) * stress;
    for (let i = 0; i < drops; i++) {
      const phase = ((t + i * 0.7) % period) / period;
      const x = 21 + i * 5;
      const y = -54 + i * 4 + phase * 8;
      const alpha = (1 - phase) * (0.6 + 0.4 * stress);
      g.moveTo(x, y - 4)
        .quadraticCurveTo(x + 3, y + 1.5, x, y + 3.2)
        .quadraticCurveTo(x - 3, y + 1.5, x, y - 4)
        .fill({ color: hexNum(MAT.cobalt.l), alpha })
        .stroke({ color: INK, width: 0.9, alpha });
    }
  }

  private setBubble(sprite: ActorSprite, text: string, below: boolean): void {
    if (sprite.bubbleText.text !== text || !sprite.bubble.visible || sprite.bubbleBelow !== below) {
      sprite.bubbleBelow = below;
      sprite.bubbleText.text = text;
      const pad = 9;
      const w = sprite.bubbleText.width + pad * 2;
      const h = sprite.bubbleText.height + pad * 1.4;
      // Redraw the one persistent Graphics rather than allocating a fresh one
      // per change — dropped Graphics keep their GPU geometry alive.
      const bg = sprite.bubbleBg;
      bg.clear();
      // A flat offset copy in ink makes the card sit up off the sheet.
      bg.roundRect(2.5, 3, w, h, 10).fill(INK);
      if (below) {
        bg.poly([14, 0, 22, -8, 30, 0])
          .fill(PAPER)
          .stroke({ color: INK, width: 1.5, join: 'round' });
      } else {
        bg.poly([14, h, 22, h + 8, 30, h])
          .fill(PAPER)
          .stroke({ color: INK, width: 1.5, join: 'round' });
      }
      bg.roundRect(0, 0, w, h, 10).fill(PAPER).stroke({ color: INK, width: 1.5 });
      // Re-cover the tail's root so it joins the card without a seam.
      bg.rect(15, below ? 0.8 : h - 2.2, 14, 1.4).fill(PAPER);
      sprite.bubbleText.position.set(pad, pad * 0.6);
      sprite.bubbleOffset = { x: -10, y: below ? 32 : -h - 74 };
      sprite.bubble.visible = true;
    }
  }
}

/** A deterministic hash in [0, 1), for where each raindrop falls. */
function rainHash(n: number): number {
  const s = Math.sin(n * 91.7 + 13.3) * 43758.5453;
  return s - Math.floor(s);
}

/** How often the sky outside moves on, in real time: two of its minutes. */
const SKY_STEP_MS = 5000;
/** How many of the sky's minutes the sunlight on the floor holds still for. */
const SHEET_SKY_MINUTES = 15;

/** Minutes past local midnight at a time: what the clock shows. */
function minutesOfDay(at: number): number {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}
