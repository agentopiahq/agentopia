import { Actor, DeskView, PetView } from '@agentopia/core';
import { CanvasSource, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';

import { AgentRig } from './character';
import { Heading, headingView } from './heading';
import {
  Control,
  PieceStore,
  SERVER_STORAGE_KEY,
  Toggle,
  floorInteraction,
  isOn,
  isRack,
  localStore,
  pieceKey,
  toggled,
} from './interact';
import { Box3, FONT, Iso, V2, drawOrder, viewToward } from './kit/iso';
import { SHEET, hexNum } from './kit/palette';
import { OBJECTS, ObjectName } from './objects';
import { Rect, drawObject, measure, partsFor, worldBox } from './objects/bake';
import { PETS } from './objects/scale';
import {
  RACK,
  RackKind,
  RackSide,
  doorOpen,
  driveOut,
  rackSpecs,
  roofBlades,
} from './objects/serverRack';
import { PieceState } from './objects/types';
import { PetRig } from './petRig';
import { ORIGIN, PIVOT, TILE } from './room';
import {
  CAT_SPOTS,
  FloorMeter,
  Robot,
  SESSION_RACKS,
  SPIN_DOWN_MS,
  SessionRack,
  SessionRacks,
  along,
  faultRack,
  floorCelsius,
  floorTempo,
  pathLength,
  rackNumber,
} from './serverLife';
import {
  AISLES,
  CROSS_AISLE_X,
  FloorPiece,
  SERVER_PIECES,
  bakeServerSheet,
  sideToward,
} from './serverRoom';
import { Sky } from './sky';
import { styled } from './styles';

/**
 * The server floor, drawn: its sheet, and every piece on it as a sprite of
 * its own, sorted by footprint (again whenever something moves: a door
 * swinging out into its aisle, the robot on its rounds, someone come down
 * the stairs).
 *
 * Every rack of a kind facing one way looks the same from a given view, and
 * an isometric view only moves a drawing about the page, so each kind is
 * drawn once per facing (a template) and every piece of it shows that one
 * drawing where it stands. The moving parts — blinking lights, spinning fans
 * — are each a loop of stills drawn the same way, and each piece plays its
 * loops from its own beat, so no two racks blink together, on the floor's
 * own clock, which runs faster the busier the office upstairs is.
 *
 * A rack's two glass doors and a pulled drive are parts of their own, so its
 * body stays shared: a door at rest, shut or open, is a template too, and
 * only a door mid-swing is drawn for its rack alone, frame by frame. So are
 * the few pieces that show something live (the status board, the
 * thermometer), and what sits over a rack for a while (its session's blades,
 * a fault's red flash and smoke).
 *
 * What the floor knows of the office comes in with `feed` (`serverLife.ts`
 * works it out). A click swings a door (`tap`), or opens a card of a
 * rack's specs, its session's numbers, or the emergency power off.
 */

/** One drawing shared by every piece like it: where its canvas sits when drawn at its anchor. */
interface Template {
  rect: Rect;
  /** The sheet point its anchor was drawn at. */
  anchor: V2;
  body: Texture;
  /** Its pixels, for telling a click on it from one through it. */
  canvas: HTMLCanvasElement;
  /** Each motion's stills. */
  motions: Texture[][];
}

/** One separately sorted group of sprites: a piece's body, one of a rack's parts, or something moving. */
interface Shown {
  node: Container;
  sprite: Sprite;
  box: Box3;
  /** What it shows, for hit tests. */
  canvas: HTMLCanvasElement | null;
  /** A drawing this group owns (mid-swing, live), rather than a shared template: freed when replaced. */
  own: Texture | null;
}

/** A rack's separately sorted parts: its two doors, and a drive pulled out. */
type PartName = RackSide | 'drive';

interface Part extends Shown {
  part: PartName;
}

/** One piece on the floor: its body and its moving parts, and a rack's parts. */
interface Piece {
  piece: FloorPiece;
  /** Its state's key, by kind and spot. */
  key: string;
  body: Shown;
  motions: Sprite[];
  parts: Part[];
  /** Over the body: a session's blades in the roof, drawn for this rack alone. */
  extra: Sprite;
  extraKey: string;
  /** A fault's red flash over the body, and its smoke. */
  flash: Sprite;
  smoke: Container;
  /** The live state last drawn, for the pieces that show something live. */
  liveKey: string;
}

/** What a click on a piece of the floor does. */
type Act = Toggle | 'card';

/** A piece of the floor under a point, and which of a rack's doors that is. */
export interface FloorHit {
  piece: FloorPiece;
  key: string;
  side: RackSide;
  act: Act | undefined;
}

/** A card the floor wants opened: a part's label, a line about it, and its controls. */
export interface FloorCard {
  key: string;
  title: string;
  note: string;
  controls: Control[];
}

/** What the floor knows of the office upstairs, this frame. */
export interface FloorPulse {
  desks: readonly DeskView[];
  actors: readonly Actor[];
  pets: readonly PetView[];
  meter: FloorMeter;
  sky: Pick<Sky, 'sun' | 'rain' | 'day'>;
}

/** One wisp of mist or shimmer: where in its aisle, and its own beat. */
interface Wisp {
  sprite: Sprite;
  x: number;
  y: number;
  seed: number;
}

interface Air {
  node: Container;
  box: Box3;
  cold: boolean;
  wisps: Wisp[];
}

function textureOf(canvas: HTMLCanvasElement, resolution: number): Texture {
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution }) });
}

function pen(ctx: CanvasRenderingContext2D, yaw: number, origin: V2 = ORIGIN): Iso {
  return new Iso(ctx, { unit: TILE, origin, yaw, pivot: PIVOT });
}

/** A field's value at rest, or null while it eases between. */
const rest = (v: number): string | null => (v === 0 || v === 1 ? String(v) : null);

/** Which rack kind each rack's object name is. */
const KIND_OF: Partial<Record<ObjectName, RackKind>> = {
  serverRack: 'compute',
  serverRackStorage: 'storage',
  serverRackNetwork: 'network',
  serverRackGpu: 'gpu',
  serverRackMixed: 'mixed',
  serverRackSparse: 'sparse',
};

/** How long the lights stay dimmed after the big red button, and how long they take to come back, ms. */
const DIM_MS = 1000;
const UNDIM_MS = 450;
/** How long the button stays pushed in, ms. */
const PRESS_MS = 400;
/** How often the moving things are sorted again among the pieces, at most, ms. */
const SORT_EVERY_MS = 90;
/** A figure's box to sort by: a little floor, and its height. */
const FIGURE = { half: 0.22, height: 1.4 } as const;

const SESSION_WORDS: Record<DeskView['phase'], string> = {
  empty: 'getting started',
  working: 'working',
  waiting_on_user: 'waiting on you',
  awaiting_approval: 'asking you something',
  compacting: 'filing its context',
  closed: 'done',
};

export interface ServerFloorOptions {
  /** Whether to letter the floor's own title block on its sheet (not on a page, which pins its own). */
  lettering: boolean;
  /** Whether to letter the margin labels (not on a page, which frames the floor without its margins). */
  labels: boolean;
}

export class ServerFloor {
  /** Everything on the floor, to be stood in the office's art. */
  readonly root = new Container();
  private readonly sheet = new Sprite();
  private readonly layer = new Container();
  /** Over the pieces: a faulted rack's smoke, rising into the air above everything. */
  private readonly smokeLayer = new Container();
  /** Lettering over everything: the session racks' tags. */
  private readonly tagLayer = new Container();
  /** Each shared drawing's red silhouette, for a fault's flash. */
  private readonly flashes = new Map<Texture, Texture>();
  /** The dark of the lights going off, over the whole floor. */
  private readonly dim = new Graphics();
  private readonly pieces: Piece[];
  private readonly byKey = new Map<string, Piece>();
  private readonly store = new PieceStore(localStore(), SERVER_STORAGE_KEY);
  private templates = new Map<string, Template>();
  private bakedAt = 0;
  private bakedYaw = NaN;
  /** Whether the art is the quick kind a drag's turn draws. */
  private drafting = false;
  private draftCanvas: HTMLCanvasElement | null = null;
  private wanted = 0;
  private wantedSince = 0;
  private lastAt: number | null = null;
  private now = 0;
  /** The floor's own clock, which the lights and fans play from: faster the busier upstairs. */
  private clock = 0;
  private tempo = 0.45;
  /** Pieces whose shadow on the sheet waits for them to come to rest. */
  private settling = new Set<string>();
  private pulse: FloorPulse | null = null;
  private readonly sessions = new SessionRacks();
  private held: SessionRack[] = [];
  private readonly tags = new Map<string, { text: Text; beacon: Graphics }>();
  /** How far home each session rack's blades are, by rack. */
  private readonly blades = new Map<string, number[]>();
  private readonly robot = new Robot();
  private readonly robotShown: Shown & { motion: Sprite };
  private cat: { rig: PetRig; node: Container; box: Box3; since: number } | null = null;
  private readonly air: Air[] = [];
  private puff: Texture | null = null;
  private coldWisp: Texture | null = null;
  private warmWisp: Texture | null = null;
  private dimAt: number | null = null;
  private pressedAt: number | null = null;
  private sortedAt = -Infinity;
  private sortWanted = false;

  constructor(private readonly options: ServerFloorOptions) {
    this.layer.sortableChildren = true;
    this.root.addChild(this.sheet, this.layer, this.smokeLayer, this.tagLayer, this.dim);
    this.pieces = SERVER_PIECES.map((piece) => {
      const body = this.group();
      const motions = (OBJECTS[piece.name].motions ?? []).map(() => {
        const sprite = new Sprite();
        body.node.addChild(sprite);
        return sprite;
      });
      const extra = new Sprite();
      const flash = new Sprite();
      flash.visible = false;
      const smoke = new Container();
      body.node.addChild(extra, flash);
      this.smokeLayer.addChild(smoke);
      const parts: Part[] = isRack(piece.name)
        ? (['front', 'back', 'drive'] as const).map((part) => ({ ...this.group(), part }))
        : [];
      const p: Piece = {
        piece,
        key: pieceKey(piece),
        body,
        motions,
        parts,
        extra,
        extraKey: '',
        flash,
        smoke,
        liveKey: '',
      };
      this.byKey.set(p.key, p);
      return p;
    });
    const bot = this.group();
    const motion = new Sprite();
    bot.node.addChild(motion);
    this.robotShown = { ...bot, motion };
    for (const aisle of AISLES) {
      for (const [x0, x1] of [
        [3.2, CROSS_AISLE_X - 1.65],
        [CROSS_AISLE_X + 1.65, 18.7],
      ]) {
        const node = new Container();
        this.layer.addChild(node);
        const cold = aisle.kind === 'cold';
        const count = cold ? 9 : 6;
        const wisps: Wisp[] = Array.from({ length: count }, (_, i) => {
          const sprite = new Sprite();
          sprite.anchor.set(0.5);
          node.addChild(sprite);
          const seed = hash01(aisle.y0 * 7 + x0, i);
          return {
            sprite,
            x: x0 + 0.4 + ((i + seed * 0.8) / count) * (x1 - x0 - 0.8),
            y: aisle.y0 + 0.35 + hash01(i, aisle.y1) * (aisle.y1 - aisle.y0 - 0.7),
            seed,
          };
        });
        this.air.push({
          node,
          cold,
          wisps,
          box: [
            [x0, aisle.y0 + 0.05, 0],
            [x1, aisle.y1 - 0.05, cold ? 0.5 : 2.0],
          ],
        });
      }
    }
  }

  private group(): Shown {
    const node = new Container();
    const sprite = new Sprite();
    node.addChild(sprite);
    this.layer.addChild(node);
    return { node, sprite, box: emptyBox(), canvas: null, own: null };
  }

  /** What the office upstairs is doing, for this frame. */
  feed(pulse: FloorPulse): void {
    this.pulse = pulse;
  }

  /**
   * Bring the floor up to date for this frame: redraw it if the view has
   * turned (quickly while a drag turns it, properly when it stops) or the
   * zoom has settled at a new resolution, swing whatever doors are on the
   * move, follow the office upstairs, and step every moving part to its
   * still. Says whether it was drawn afresh, which takes a moment.
   */
  render(at: number, resolution: number, yaw: number, turning: boolean): boolean {
    let baked = true;
    if (turning) {
      if (!this.drafting || yaw !== this.bakedYaw) {
        this.bake(1, yaw, true);
      } else {
        baked = false;
      }
    } else if (this.drafting || yaw !== this.bakedYaw || this.bakedAt === 0) {
      this.bake(resolution, yaw, false);
    } else if (
      resolution !== this.bakedAt &&
      resolution === this.wanted &&
      at - this.wantedSince > 400
    ) {
      this.bake(resolution, yaw, false);
    } else {
      baked = false;
      if (resolution !== this.bakedAt && resolution !== this.wanted) {
        this.wanted = resolution;
        this.wantedSince = at;
      }
    }
    const dt = this.lastAt === null ? 0 : Math.min(100, Math.max(0, at - this.lastAt));
    this.lastAt = at;
    this.now = at;
    this.swing(dt);
    this.follow(at, dt, resolution);
    this.step();
    if (this.sortWanted && at - this.sortedAt >= SORT_EVERY_MS) {
      this.sort();
    }
    return baked;
  }

  /** Draw it all again at once, as it is: a new drawing style. */
  redraw(): void {
    if (this.bakedAt > 0) {
      this.bake(this.bakedAt, this.bakedYaw, false);
    }
  }

  // ---- clicks ------------------------------------------------------------------

  /** The piece drawn on top at a sheet point, if any, and what a click there would do. */
  pieceAt(x: number, y: number): FloorHit | null {
    if (this.drafting || this.bakedAt === 0) {
      return null;
    }
    const groups: Array<{ shown: Shown; piece: Piece; part?: PartName }> = [];
    for (const piece of this.pieces) {
      groups.push({ shown: piece.body, piece });
      for (const part of piece.parts) {
        groups.push({ shown: part, piece, part: part.part });
      }
    }
    groups.sort((a, b) => b.shown.node.zIndex - a.shown.node.zIndex);
    for (const { shown, piece, part } of groups) {
      const canvas = shown.canvas;
      if (!canvas) {
        continue;
      }
      const px = Math.floor((x - shown.sprite.x) * this.bakedAt);
      const py = Math.floor((y - shown.sprite.y) * this.bakedAt);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
        continue;
      }
      const side: RackSide =
        part === 'front' || part === 'back' ? part : sideToward(piece.piece, this.bakedYaw);
      const act = actOf(piece.piece.name, part, side);
      // A door is hit wherever it shows, its glass included; scenery only where it is solid.
      if (alphaAt(canvas, px, py) > (act ? 40 : 200)) {
        return { piece: piece.piece, key: piece.key, side, act };
      }
    }
    return null;
  }

  /** What a click at a sheet point would do, said on hover; null over nothing to do. */
  hintAt(x: number, y: number): string | null {
    const hit = this.pieceAt(x, y);
    if (!hit?.act) {
      return null;
    }
    if (hit.act === 'card') {
      return hit.piece.name === 'epoButton' ? 'the big red button' : 'look inside the rack';
    }
    return hit.act.hint(isOn(this.stateNow(hit.key), hit.act));
  }

  /**
   * A click at a sheet point: swing the door there, or say which card to
   * open. Null when there is nothing there to click.
   */
  tap(x: number, y: number): FloorCard | 'done' | null {
    const hit = this.pieceAt(x, y);
    if (!hit?.act) {
      return null;
    }
    if (hit.act === 'card') {
      return this.cardFor(hit.key);
    }
    const patch = toggled(this.stateNow(hit.key), hit.act);
    // A door shut on a drive left out pushes it back in.
    if (patch.front === 0) {
      patch.drive = 0;
    }
    this.set(hit.key, patch, hit.act.sheet === true);
    return 'done';
  }

  /** The card for a piece, as it stands now. */
  cardFor(key: string): FloorCard | null {
    const p = this.byKey.get(key);
    if (!p) {
      return null;
    }
    const state = this.stateNow(key);
    if (p.piece.name === 'epoButton') {
      const up = frac(state.cover, 0) >= 0.5;
      return {
        key,
        title: 'EMERGENCY POWER OFF',
        note: up
          ? 'for emergencies only (it only dims the lights)'
          : 'under its cover, for emergencies',
        controls: up
          ? [
              { label: 'Press it', active: false, patch: { press: true } },
              { label: 'Lower the cover', active: false, patch: { cover: 0 } },
            ]
          : [{ label: 'Lift the cover', active: false, patch: { cover: 1 } }],
      };
    }
    if (!isRack(p.piece.name)) {
      return null;
    }
    const front = doorOpen(state, 'front') >= 0.5;
    const back = doorOpen(state, 'back') >= 0.5;
    const drive = driveOut(state) >= 0.5;
    const controls: Control[] = [
      {
        label: front ? 'Close the front door' : 'Open the front door',
        active: front,
        patch: front ? { front: 0, drive: 0 } : { front: 1 },
      },
    ];
    if (front) {
      controls.push({
        label: drive ? 'Push the drive back' : 'Pull a drive',
        active: drive,
        patch: { drive: drive ? 0 : 1 },
      });
    }
    controls.push({
      label: back ? 'Close the back door' : 'Open the back door',
      active: back,
      patch: { back: back ? 0 : 1 },
    });
    const number = rackNumber(p.piece);
    const kind = KIND_OF[p.piece.name] ?? 'compute';
    const session = this.held.find((r) => r.rack === p.piece && r.downSince === null);
    const desk = session ? this.pulse?.desks.find((d) => d.bus === session.bus) : undefined;
    if (session && desk) {
      const calls = this.pulse?.meter.callsFor(desk.bus, this.now) ?? 0;
      const helpers = desk.subagents;
      return {
        key,
        title: `${session.tag} · ${number}`,
        note: [
          SESSION_WORDS[desk.phase],
          `${helpers} helper${helpers === 1 ? '' : 's'}`,
          `${calls} call${calls === 1 ? '' : 's'} in 10 min`,
          desk.lagMs > 1500 ? `${Math.round(desk.lagMs / 1000)}s behind` : 'keeping up',
        ].join(' · '),
        controls,
      };
    }
    return {
      key,
      title: `${number} · ${kind.toUpperCase()} RACK`,
      note: rackSpecs(kind),
      controls,
    };
  }

  /** A control on a floor card pressed: do it, and say what the card says now. */
  pick(key: string, control: Control): FloorCard | null {
    if (control.patch.press === true) {
      this.dimAt = this.now;
      this.pressedAt = this.now;
      this.set(key, { pressed: 1 }, false);
      return this.cardFor(key);
    }
    this.set(key, control.patch, false);
    return this.cardFor(key);
  }

  /** Where a piece is drawn on the sheet, for a card to stand beside it. */
  anchorOf(key: string): { x0: number; y0: number; x1: number; y1: number } | null {
    const p = this.byKey.get(key);
    if (!p) {
      return null;
    }
    const k = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    k.place(p.piece.place.at, p.piece.place.facing);
    const { footprint } = OBJECTS[p.piece.name];
    const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const c of Iso.corners(footprint[0], footprint[1])) {
      const [px, py] = k.P(c);
      out.x0 = Math.min(out.x0, px);
      out.y0 = Math.min(out.y0, py);
      out.x1 = Math.max(out.x1, px);
      out.y1 = Math.max(out.y1, py);
    }
    return out;
  }

  private set(key: string, patch: Record<string, unknown>, sheet: boolean): void {
    this.store.set(key, patch);
    if (sheet) {
      this.settling.add(key);
    }
  }

  /** A piece's state as set, over how it is drawn now. */
  private stateNow(key: string): PieceState {
    return { ...this.store.get(key), ...this.store.wanted(key) };
  }

  // ---- each frame --------------------------------------------------------------------

  /** Ease every door toward where it was set, and redraw the ones that moved. */
  private swing(dt: number): void {
    if (this.pressedAt !== null && this.now - this.pressedAt > PRESS_MS) {
      this.pressedAt = null;
      for (const p of this.pieces) {
        if (p.piece.name === 'epoButton') {
          this.store.set(p.key, { pressed: 0 });
        }
      }
    }
    const moved = new Set(
      this.store.step(dt, new Map(), (_key, field) => (field === 'open' ? 1 : 0))
    );
    if (moved.size > 0 && this.bakedAt > 0) {
      for (const p of this.pieces) {
        if (moved.has(p.key)) {
          this.showPiece(p);
        }
      }
      this.sortWanted = true;
    }
    // A door that has come to rest casts its new shadow on the sheet.
    let settled = false;
    for (const key of [...this.settling]) {
      if (!moved.has(key)) {
        this.settling.delete(key);
        settled = true;
      }
    }
    if (settled && !this.drafting && this.bakedAt > 0) {
      this.bakeSheet(this.bakedAt, this.bakedYaw, false);
    }
  }

  /** Follow the office: the floor's tempo, the sessions' racks, the board, the robot, whoever came down. */
  private follow(at: number, dt: number, resolution: number): void {
    const desks = this.pulse?.desks ?? [];
    this.tempo = floorTempo(desks);
    const lightsOut = this.lightsOut();
    this.clock += dt * (lightsOut ? 0 : this.tempo);
    this.held = this.sessions.update(at, desks);
    if (this.bakedAt === 0) {
      return;
    }
    this.placeTags(at);
    this.stepBlades(dt);
    this.stepLive();
    this.stepFaults(at, dt, lightsOut);
    this.stepCat(at, resolution);
    this.stepAir(at);
    this.stepDim(at);
  }

  private lightsOut(): boolean {
    return this.dimAt !== null && this.now - this.dimAt < DIM_MS;
  }

  /** Show each piece's moving parts at their stills on the floor's clock; a rack spun down shows none. */
  private step(): void {
    const lightsOut = this.lightsOut();
    const down = new Set(this.held.filter((r) => r.downSince !== null).map((r) => r.rack));
    for (const p of this.pieces) {
      const template = this.templates.get(this.bodyKey(p));
      if (!template) {
        continue;
      }
      const dark = lightsOut || down.has(p.piece);
      const motions = OBJECTS[p.piece.name].motions ?? [];
      motions.forEach((motion, i) => {
        p.motions[i].visible = !dark;
        const stills = template.motions[i];
        const frame =
          Math.floor((this.clock / 1000) * motion.fps + p.piece.phase * 1.7) % motion.frames;
        const texture = stills[(frame + motion.frames) % motion.frames];
        if (p.motions[i].texture !== texture) {
          p.motions[i].texture = texture;
        }
      });
    }
  }

  /** Letter each session's rack with its name, a light for how it is doing, fading as it spins down. */
  private placeTags(at: number): void {
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    const seen = new Set<string>();
    for (const held of this.held) {
      const key = pieceKey(held.rack);
      seen.add(key);
      let tag = this.tags.get(key);
      if (!tag) {
        const text = new Text({
          text: '',
          style: {
            fill: hexNum(SHEET.ink),
            fontSize: 15,
            fontFamily: FONT.hand,
            fontWeight: '700',
            stroke: { color: hexNum(SHEET.paper), width: 4, join: 'round' },
          },
        });
        text.anchor.set(0.5, 1);
        const beacon = new Graphics();
        this.tagLayer.addChild(beacon, text);
        tag = { text, beacon };
        this.tags.set(key, tag);
      }
      const down = held.downSince !== null;
      const label = down ? `${held.tag} · spinning down` : held.tag;
      if (tag.text.text !== label) {
        tag.text.text = label;
      }
      const [x, y] = probe.screenOfWorld([
        held.rack.place.at[0],
        held.rack.place.at[1],
        RACK.h + 0.75,
      ]);
      tag.text.position.set(x + 7, y);
      const fade = down ? Math.max(0, 1 - (at - (held.downSince ?? at)) / SPIN_DOWN_MS) : 1;
      tag.text.alpha = 0.35 + 0.65 * fade;
      const breath = down ? 0.4 : 0.7 + 0.3 * Math.cos((at / 1600) * Math.PI * 2);
      tag.beacon
        .clear()
        .circle(x + 7 - tag.text.width / 2 - 6, y - 9, 4.2)
        .fill({ color: hexNum(held.light), alpha: breath * fade + 0.15 })
        .stroke({ color: hexNum(SHEET.ink), width: 1.2, alpha: 0.8 });
    }
    for (const [key, tag] of [...this.tags]) {
      if (!seen.has(key)) {
        tag.text.destroy();
        tag.beacon.destroy();
        this.tags.delete(key);
      }
    }
  }

  /** Slide each session's blades home (or out), one per helper, and redraw the roofs that changed. */
  private stepBlades(dt: number): void {
    const want = new Map(this.held.map((r) => [pieceKey(r.rack), r.blades]));
    const keys = new Set([...want.keys(), ...this.blades.keys()]);
    for (const key of keys) {
      const target = want.get(key) ?? 0;
      const shown = [...(this.blades.get(key) ?? [])];
      while (shown.length < target) {
        shown.push(0);
      }
      const step = dt / 1300;
      for (let i = 0; i < shown.length; i++) {
        shown[i] = i < target ? Math.min(1, shown[i] + step) : Math.max(0, shown[i] - step * 1.5);
      }
      while (shown.length > target && shown[shown.length - 1] <= 0) {
        shown.pop();
      }
      if (shown.length === 0) {
        this.blades.delete(key);
      } else {
        this.blades.set(key, shown);
      }
      const p = this.byKey.get(key);
      if (p) {
        this.showExtra(p, shown);
      }
    }
  }

  /** Draw a rack's blades over its body, when they have moved. */
  private showExtra(p: Piece, shown: readonly number[]): void {
    const key = shown.map((v) => v.toFixed(2)).join(',');
    if (key === p.extraKey) {
      return;
    }
    p.extraKey = key;
    const old = p.extra.texture;
    if (shown.length === 0) {
      p.extra.texture = Texture.EMPTY;
    } else {
      const drawn = this.drawPiece(p.piece, {}, undefined, false, (k) => roofBlades(k, shown));
      p.extra.texture = drawn.body;
      p.extra.position.set(drawn.rect.x, drawn.rect.y);
    }
    if (old !== Texture.EMPTY) {
      old.destroy(true);
    }
  }

  /** The live pieces' state: what the board shows, what the thermometer reads. */
  private liveOf(p: Piece): PieceState | null {
    const pulse = this.pulse;
    if (p.piece.name === 'statusBoard') {
      const desks = pulse?.desks ?? [];
      return {
        series: pulse?.meter.perMinute(this.now) ?? [],
        sessions: desks.length,
        helpers: desks.reduce((n, d) => n + d.subagents, 0),
      };
    }
    if (p.piece.name === 'thermometer') {
      return { celsius: pulse ? floorCelsius(pulse.sky) : 18 };
    }
    return null;
  }

  private stepLive(): void {
    for (const p of this.pieces) {
      const live = this.liveOf(p);
      if (!live) {
        continue;
      }
      const key = JSON.stringify(live);
      if (key !== p.liveKey) {
        p.liveKey = key;
        this.showPiece(p);
      }
    }
  }

  /** Flash a faulted rack red and puff smoke off it, and send the robot round to fix it. */
  private stepFaults(at: number, dt: number, lightsOut: boolean): void {
    const faults = (this.pulse?.meter.faultsAt(at) ?? []).map((f) => ({
      ...f,
      rack: faultRack(f.bus, this.held),
    }));
    const bot = this.robot.step(at, dt, faults);
    const open = faults.filter((f) => !this.robot.isFixed(f));
    const burning = new Map(open.map((f) => [f.rack, f]));
    for (const p of this.pieces) {
      const fault = burning.get(p.piece);
      if (!fault) {
        if (p.flash.visible || p.smoke.children.length > 0) {
          p.flash.visible = false;
          p.smoke.removeChildren().forEach((c) => c.destroy());
        }
        continue;
      }
      const t = at - fault.at;
      p.flash.visible = !lightsOut;
      p.flash.texture = this.flashOf(p);
      p.flash.position.copyFrom(p.body.sprite.position);
      p.flash.alpha = 0.3 + 0.3 * (0.5 + 0.5 * Math.cos((t / 380) * Math.PI));
      this.puffSmoke(p, t);
    }
    // The robot: drawn by heading and how far its arm is out.
    const reach = Math.round(bot.reach * 4) / 4;
    const piece: FloorPiece = {
      name: 'maintenanceBot',
      place: { at: [bot.at[0], bot.at[1], 0], facing: bot.heading },
      phase: 7,
    };
    const key = `bot|${bot.heading}|${reach}`;
    this.show(this.robotShown, piece, key, { reach }, undefined);
    const template = this.templates.get(key);
    const motion = OBJECTS.maintenanceBot.motions?.[0];
    if (template && motion) {
      const frame = Math.floor((at / 1000) * motion.fps) % motion.frames;
      this.robotShown.motion.texture = template.motions[0]?.[frame] ?? Texture.EMPTY;
      this.robotShown.motion.position.copyFrom(this.robotShown.sprite.position);
      this.robotShown.motion.visible = !lightsOut;
    }
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    probe.place(piece.place.at, piece.place.facing);
    const box = worldBox(probe, OBJECTS.maintenanceBot.footprint);
    if (!sameBox(box, this.robotShown.box)) {
      this.robotShown.box = box;
      this.sortWanted = true;
    }
  }

  /** A rack's body as a flat red silhouette, drawn once per shared drawing. */
  private flashOf(p: Piece): Texture {
    const body = p.body.sprite.texture;
    let flash = this.flashes.get(body);
    if (!flash && p.body.canvas) {
      const from = p.body.canvas;
      const canvas = document.createElement('canvas');
      canvas.width = from.width;
      canvas.height = from.height;
      const g = styled(canvas.getContext('2d') as CanvasRenderingContext2D);
      g.drawImage(from, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = '#ff3b2a';
      g.fillRect(0, 0, canvas.width, canvas.height);
      flash = textureOf(canvas, this.bakedAt);
      this.flashes.set(body, flash);
    }
    return flash ?? Texture.EMPTY;
  }

  /** Smoke off a faulted rack's roof: a few soft puffs, rising and spreading as they fade. */
  private puffSmoke(p: Piece, t: number): void {
    const puff = (this.puff ??= puffTexture());
    while (p.smoke.children.length < 5) {
      const s = new Sprite(puff);
      s.anchor.set(0.5);
      p.smoke.addChild(s);
    }
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    const [x, y] = p.piece.place.at;
    p.smoke.children.forEach((child, i) => {
      const life = ((t / 1000 + i * 0.7) % 3.5) / 3.5;
      const sx = Math.sin(i * 2.1 + t / 900) * 0.15 * life;
      const [px, py] = probe.screenOfWorld([x + sx, y, RACK.h + 0.3 + life * 2.2]);
      child.position.set(px, py);
      child.scale.set(0.45 + life * 0.9);
      child.alpha = Math.min(1, Math.sin(life * Math.PI) * 1.4);
    });
  }

  /** The cat, when it has slipped down here for a nap somewhere warm. */
  private stepCat(at: number, resolution: number): void {
    const pet = (this.pulse?.pets ?? []).find((p) => p.away?.floor === 'servers');
    if (!pet?.away) {
      if (this.cat) {
        this.cat.rig.destroy();
        this.cat.node.destroy({ children: true });
        this.cat = null;
        this.sortWanted = true;
      }
      return;
    }
    if (!this.cat) {
      const rig = new PetRig(pet.kind);
      const node = new Container();
      node.addChild(rig.view);
      this.layer.addChild(node);
      this.cat = { rig, node, box: emptyBox(), since: at };
    }
    const spot = CAT_SPOTS[pet.away.spot % CAT_SPOTS.length];
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    const [sx, sy] = probe.screenOfWorld(spot);
    this.cat.node.position.set(sx, sy);
    const napping: PetView = {
      ...pet,
      pos: { x: spot[0], y: spot[1] },
      z: spot[2],
      act: 'nap',
      phase: at - this.cat.since,
      dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    };
    this.cat.rig.update(napping, 1, 0, at / 1000, resolution);
    const size = PETS[pet.kind];
    const box: Box3 = [
      [spot[0] - size.half, spot[1] - size.half, spot[2]],
      [spot[0] + size.half, spot[1] + size.half, spot[2] + size.height * 0.5],
    ];
    if (!sameBox(box, this.cat.box)) {
      this.cat.box = box;
      this.sortWanted = true;
    }
  }

  /** Cold mist drifting up off the cold aisles' tiles, and a warm shimmer over the hot ones. */
  private stepAir(at: number): void {
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    const cold = (this.coldWisp ??= wispTexture('#bfe3f4'));
    const warm = (this.warmWisp ??= wispTexture('#f6c7a6'));
    const t = at / 1000;
    const busy = 0.6 + (0.4 * this.tempo) / 2.4;
    for (const air of this.air) {
      for (const w of air.wisps) {
        const period = air.cold ? 7 : 4.5;
        const life = (((t / period + w.seed) % 1) + 1) % 1;
        const z = air.cold ? 0.05 + life * 0.45 : 0.4 + life * 1.5;
        const dx = Math.sin(t * (air.cold ? 0.4 : 1.6) + w.seed * 9) * (air.cold ? 0.35 : 0.12);
        const [px, py] = probe.screenOfWorld([w.x + dx, w.y, z]);
        w.sprite.texture = air.cold ? cold : warm;
        w.sprite.position.set(px, py);
        const grow = air.cold ? 1 + life * 1.2 : 0.7 + life * 0.4;
        w.sprite.scale.set(grow * (air.cold ? 1.5 : 0.8), grow * (air.cold ? 0.7 : 1.6));
        w.sprite.alpha = Math.sin(life * Math.PI) * (air.cold ? 0.38 : 0.2) * busy;
      }
    }
  }

  /** The lights out for a second after the big red button, and coming back. */
  private stepDim(at: number): void {
    const since = this.dimAt === null ? Infinity : at - this.dimAt;
    const alpha =
      since < DIM_MS
        ? 0.55
        : since < DIM_MS + UNDIM_MS
          ? 0.55 * (1 - (since - DIM_MS) / UNDIM_MS)
          : 0;
    if (since >= DIM_MS + UNDIM_MS) {
      this.dimAt = null;
    }
    this.dim.visible = alpha > 0.001;
    if (this.dim.visible) {
      const b = this.sheet.getLocalBounds();
      this.dim.clear().rect(b.x, b.y, b.width, b.height).fill({ color: 0x0d1220, alpha });
    }
  }

  // ---- drawing -----------------------------------------------------------------------

  /** The sheet, with every piece's shadow as it stands. */
  private bakeSheet(resolution: number, yaw: number, draft: boolean): void {
    const old = this.sheet.texture;
    const into = draft ? (this.draftCanvas ??= document.createElement('canvas')) : undefined;
    const sheet = bakeServerSheet(resolution, yaw, {
      into,
      lettering: this.options.lettering,
      labels: this.options.labels,
      stateOf: (piece) => this.store.get(pieceKey(piece)),
    });
    if (draft && old !== Texture.EMPTY && old.source.resource === sheet) {
      old.source.update();
    } else {
      this.sheet.texture = textureOf(sheet, resolution);
      if (old !== Texture.EMPTY) {
        old.destroy(true);
      }
    }
  }

  /** Draw the sheet and every template, and stand every piece where it goes. */
  private bake(resolution: number, yaw: number, draft: boolean): void {
    this.bakedAt = resolution;
    this.bakedYaw = yaw;
    this.drafting = draft;
    this.wanted = 0;
    this.bakeSheet(resolution, yaw, draft);
    const stale = this.templates;
    this.templates = new Map();
    for (const p of this.pieces) {
      p.extraKey = '';
      this.showPiece(p);
      this.showExtra(p, this.blades.get(p.key) ?? []);
    }
    destroyTemplates(stale);
    for (const flash of this.flashes.values()) {
      flash.destroy(true);
    }
    this.flashes.clear();
    this.sort();
  }

  /** Sort every body, part and moving thing by its footprint, from the view as baked. */
  private sort(): void {
    const groups: Array<{ node: Container; box: Box3 }> = this.pieces.flatMap((p) => [
      p.body,
      ...p.parts,
    ]);
    groups.push(this.robotShown, ...this.air);
    if (this.cat) {
      groups.push(this.cat);
    }
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    const order = drawOrder(
      groups.map((g) => g.box),
      viewToward(this.bakedYaw),
      (w) => probe.screenOfWorld(w)
    );
    order.forEach((i, z) => {
      groups[i].node.zIndex = z;
    });
    this.sortedAt = this.now;
    this.sortWanted = false;
  }

  /** A piece's state for drawing: what the viewer set, and what it shows live. */
  private stateFor(p: Piece): PieceState {
    const live = this.liveOf(p);
    const state = this.store.get(p.key);
    return live ? { ...state, ...live } : state;
  }

  /** The shared drawing a piece's body shows, by kind, facing and how it stands; '' for its own. */
  private bodyKey(p: Piece): string {
    const { name, place } = p.piece;
    const base = `${name}|${place.facing ?? '+y'}`;
    if (isRack(name)) {
      return `${base}|body`;
    }
    if (name === 'statusBoard' || name === 'thermometer') {
      return '';
    }
    const state = this.store.get(p.key);
    if (name === 'epoButton') {
      const cover = rest(frac(state.cover, 0));
      const pressed = rest(frac(state.pressed, 0));
      return cover === null || pressed === null ? '' : `${base}|${cover}|${pressed}`;
    }
    if (floorInteraction(name, 'front')) {
      const at = rest(frac(state.open, 1));
      return at === null ? '' : `${base}|${at}`;
    }
    return base;
  }

  /** Draw a piece's body and parts as its state stands now, and refit their boxes. */
  private showPiece(p: Piece): void {
    const state = this.stateFor(p);
    const obj = OBJECTS[p.piece.name];
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    probe.place(p.piece.place.at, p.piece.place.facing);
    const parts = partsFor(obj, state);
    const key = this.bodyKey(p);
    this.show(p.body, p.piece, key || null, state, isRack(p.piece.name) ? 'body' : undefined);
    const print = parts?.find((part) => part.name === 'body')?.footprint ?? obj.footprint;
    p.body.box = worldBox(probe, print);
    const template = key ? this.templates.get(key) : undefined;
    p.motions.forEach((sprite) => {
      sprite.position.copyFrom(p.body.sprite.position);
      sprite.visible = template !== undefined;
    });
    for (const part of p.parts) {
      const value = part.part === 'drive' ? driveOut(state) : doorOpen(state, part.part);
      const at = rest(value);
      const facing = p.piece.place.facing ?? '+y';
      const shared =
        part.part === 'drive'
          ? `${p.piece.name}|${facing}|drive|${at}`
          : `rackDoor|${facing}|${part.part}|${at}`;
      if (part.part === 'drive' && value === 0) {
        // Nothing pulled out: nothing to draw.
        part.own?.destroy(true);
        part.own = null;
        part.sprite.texture = Texture.EMPTY;
        part.canvas = null;
      } else {
        this.show(part, p.piece, at === null ? null : shared, state, part.part);
      }
      const footprint = parts?.find((x) => x.name === part.part)?.footprint;
      if (footprint) {
        part.box = worldBox(probe, footprint);
      }
    }
  }

  /**
   * Stand one group: the shared drawing under `key`, moved to where this
   * piece stands, or (with no key) a drawing of this piece alone, as its
   * state stands now.
   */
  private show(
    group: Shown,
    piece: FloorPiece,
    key: string | null,
    state: PieceState,
    part: string | undefined
  ): void {
    const old = group.own;
    if (key !== null) {
      let template = this.templates.get(key);
      if (!template) {
        template = this.drawPiece(piece, state, part, part === undefined || part === 'body');
        this.templates.set(key, template);
      }
      // Projection is affine: a piece like the template's stands where its
      // anchor is, the template's drawing moved there.
      const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
      const [ax, ay] = probe.screenOfWorld(piece.place.at);
      group.sprite.texture = template.body;
      group.sprite.position.set(
        template.rect.x + ax - template.anchor[0],
        template.rect.y + ay - template.anchor[1]
      );
      group.canvas = template.canvas;
      group.own = null;
    } else {
      const drawn = this.drawPiece(piece, state, part, false);
      group.sprite.texture = drawn.body;
      group.sprite.position.set(drawn.rect.x, drawn.rect.y);
      group.canvas = drawn.canvas;
      group.own = drawn.body;
    }
    if (old && old !== group.own) {
      old.destroy(true);
    }
  }

  /**
   * A piece (or one part of it, or something drawn over it) drawn where it
   * stands, as its state stands, and its motions' stills when it has any and
   * `withMotions`. A draft draws each motion's first still only, and holds it.
   */
  private drawPiece(
    piece: FloorPiece,
    state: PieceState,
    part: string | undefined,
    withMotions: boolean,
    over?: (k: Iso) => void
  ): Template {
    const obj = OBJECTS[piece.name];
    const resolution = this.bakedAt;
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    const rect = measure(probe, obj, piece.place, false);
    const anchor = probe.screenOfWorld(piece.place.at);
    let last: HTMLCanvasElement | null = null;
    const canvasFor = (draw: (k: Iso) => void): Texture => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(rect.w * resolution));
      canvas.height = Math.max(1, Math.ceil(rect.h * resolution));
      const g = styled(canvas.getContext('2d') as CanvasRenderingContext2D);
      g.scale(resolution, resolution);
      const k = pen(g, this.bakedYaw, [ORIGIN[0] - rect.x, ORIGIN[1] - rect.y]);
      k.place(piece.place.at, piece.place.facing);
      draw(k);
      last = canvas;
      return textureOf(canvas, resolution);
    };
    const body = canvasFor((k) =>
      over ? over(k) : drawObject(k, obj, piece.place, false, state, part)
    );
    const canvas = last as unknown as HTMLCanvasElement;
    const motions = (withMotions ? (obj.motions ?? []) : []).map((motion) => {
      if (this.drafting) {
        const held = canvasFor((k) => motion.draw(k, 0));
        return Array.from({ length: motion.frames }, () => held);
      }
      return Array.from({ length: motion.frames }, (_, frame) =>
        canvasFor((k) => motion.draw(k, frame))
      );
    });
    return { rect, anchor, body, canvas, motions };
  }

  destroy(): void {
    destroyTemplates(this.templates);
    this.templates.clear();
    for (const p of this.pieces) {
      for (const group of [p.body, ...p.parts]) {
        group.own?.destroy(true);
        group.own = null;
      }
      if (p.extra.texture !== Texture.EMPTY) {
        p.extra.texture.destroy(true);
      }
    }
    this.cat?.rig.destroy();
    this.puff?.destroy(true);
    for (const flash of this.flashes.values()) {
      flash.destroy(true);
    }
    this.coldWisp?.destroy(true);
    this.warmWisp?.destroy(true);
    this.root.destroy({ children: true });
  }
}

/** A rack's glass swings its door; anything else on a rack, and the big red button, opens a card. */
function actOf(name: ObjectName, part: PartName | undefined, side: RackSide): Act | undefined {
  if (name === 'epoButton') {
    return 'card';
  }
  if (isRack(name)) {
    return part === 'front' || part === 'back' ? floorInteraction(name, side) : 'card';
  }
  return floorInteraction(name, side);
}

/** Which way someone at the end of a path stands: facing the rack the path ends at. */
function standHeading(path: readonly V2[]): Heading {
  const end = path[path.length - 1];
  const rack = SERVER_PIECES.find(
    (piece) =>
      isRack(piece.name) &&
      Math.abs(piece.place.at[0] - end[0]) < 1e-6 &&
      Math.abs(piece.place.at[1] - end[1]) < 1.3
  );
  if (!rack) {
    return '-y';
  }
  return rack.place.at[1] < end[1] ? '-y' : '+y';
}

/** Each drawing's alpha, read back once: a read per pointer move would stall the GPU. */
const alphas = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();

function alphaAt(canvas: HTMLCanvasElement, x: number, y: number): number {
  let data = alphas.get(canvas);
  if (!data) {
    const all = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    data = new Uint8ClampedArray(canvas.width * canvas.height);
    if (all) {
      for (let i = 0; i < data.length; i++) {
        data[i] = all[i * 4 + 3];
      }
    }
    alphas.set(canvas, data);
  }
  return data[y * canvas.width + x] ?? 0;
}

const emptyBox = (): Box3 => [
  [0, 0, 0],
  [0, 0, 0],
];

const sameBox = (a: Box3, b: Box3): boolean =>
  [0, 1].every((i) => [0, 1, 2].every((j) => Math.abs(a[i][j] - b[i][j]) < 1e-4));

/** A stored fraction, or its default. */
const frac = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);

/** A small deterministic hash in [0, 1). */
function hash01(a: number, b: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** A puff of smoke: a little inked cartoon cloud, pale grey, that reads over the racks and the floor alike. */
function puffTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 72;
  const g = styled(canvas.getContext('2d') as CanvasRenderingContext2D);
  g.scale(2, 2);
  const lobes: Array<[number, number, number]> = [
    [13, 21, 8],
    [21, 15, 9],
    [25, 23, 8],
  ];
  g.beginPath();
  for (const [x, y, r] of lobes) {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, Math.PI * 2);
  }
  g.lineWidth = 2.4;
  g.strokeStyle = SHEET.line;
  g.stroke();
  g.fillStyle = '#ebe7df';
  g.fill();
  g.beginPath();
  g.arc(18, 13, 3, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();
  return textureOf(canvas, 2);
}

/** A soft wisp of coloured air, for mist and shimmer. */
function wispTexture(color: string): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const g = styled(canvas.getContext('2d') as CanvasRenderingContext2D);
  const grad = g.createRadialGradient(24, 24, 1, 24, 24, 23);
  grad.addColorStop(0, color);
  grad.addColorStop(1, `${color}00`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 48, 48);
  return textureOf(canvas, 1);
}

/** Free every texture a set of templates holds, each once (a draft holds one still many times). */
function destroyTemplates(templates: Map<string, Template>): void {
  const all = new Set<Texture>();
  for (const template of templates.values()) {
    all.add(template.body);
    for (const stills of template.motions) {
      for (const still of stills) {
        all.add(still);
      }
    }
  }
  for (const texture of all) {
    texture.destroy(true);
  }
}
