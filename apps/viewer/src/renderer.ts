import { Actor, DEFAULT_BUS, DeskView, OfficeFrame } from '@agentopia/core';
import {
  Application,
  CanvasSource,
  Container,
  Graphics,
  Matrix,
  Sprite,
  Text,
  TextStyleOptions,
  Texture,
} from 'pixi.js';

import {
  AgentRig,
  DESK_STANCE,
  KEY_OFFSETS,
  RIG_SCALE,
  Vec,
  airborneOf,
  shadowOutline,
} from './character';
import { Heading, headingView, nextHeading } from './heading';
import { fontsReady } from './kit/fonts';
import { Box3, FONT, Iso, V3, compareBoxes, hull, viewToward } from './kit/iso';
import { ACCENT, MAT, SHEET, hexNum } from './kit/palette';
import { MONITOR_SCREEN, OBJECTS } from './objects';
import { drawObject, measure, worldBox } from './objects/bake';
import {
  DESK_PIECES,
  ORIGIN,
  PIVOT,
  READOUT,
  ROOM_PIECES,
  RoomPiece,
  SHEET_H,
  SHEET_W,
  SPEAKER_AT,
  STATUS_LINE,
  TILE,
  bakeSheet,
  sheetPoint,
  speakerAlpha,
} from './room';
import { ZoomState, centreOn } from './zoom';

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
  rig: AgentRig;
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
}

/** A piece of furniture, baked once into a texture (and again on a big zoom). */
interface Baked extends Standing {
  piece: RoomPiece;
  sprite: Sprite;
  /** A canvas re-drawn in place while a drag turns the room, and its texture. */
  draft?: { canvas: HTMLCanvasElement; texture: Texture };
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
    return { label: 'the office is', state: 'empty', detail: 'waiting for a session to start' };
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
    label: 'the office has',
    state: `${desks.length} session${desks.length === 1 ? '' : 's'}`,
    detail: parts.join(' · '),
  };
}

/** A canvas as a Pixi texture at a device resolution. */
function textureOf(canvas: HTMLCanvasElement, resolution: number): Texture {
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution }) });
}

export class CartoonRenderer {
  private app = new Application();
  private host: HTMLElement | null = null;
  private hostW = 0;
  private hostH = 0;
  private world = new Container();
  private sheet = new Sprite();
  /** Every character's cast shadow, flat on the floor under the cast. */
  private shadows = new Graphics();
  /** The cast, the furniture and the desks together, depth-sorted each frame. */
  private actorLayer = new Container();
  /** Effects that nothing occludes: the speaker's sound. */
  private topLayer = new Container();
  private actors = new Map<string, ActorSprite>();
  private desks: DeskOverlay[] = [];
  private standing: Baked[] = [];
  private speakerWaves = new Graphics();
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
    this.zoom = new ZoomState(host, () => this.view());

    // The sheet's lettering is baked in, so give the faces a moment to land.
    await Promise.race([fontsReady(), new Promise((resolve) => setTimeout(resolve, 1500))]);

    // The sheet sits on the page with a soft drop shadow, like a print.
    const drop = new Graphics();
    drop.rect(6, 8, SHEET_W, SHEET_H).fill({ color: hexNum(SHEET.lead), alpha: 0.12 });
    this.world.addChild(drop, this.sheet, this.shadows, this.actorLayer, this.topLayer);

    for (const piece of ROOM_PIECES) {
      this.standing.push(this.makeStanding(piece));
    }
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
    this.topLayer.addChild(this.speakerWaves);
    this.bake(this.wantedResolution(1), 0);

    this.readout.label.anchor.set(1, 0);
    this.readout.state.anchor.set(1, 0);
    this.readout.detail.anchor.set(1, 0);
    this.readout.label.position.set(READOUT.x, READOUT.y);
    this.readout.state.position.set(READOUT.x, READOUT.y + 20);
    this.readout.detail.position.set(READOUT.x, READOUT.y + 66);
    this.topLayer.addChild(this.readout.label, this.readout.state, this.readout.detail);

    this.status.text.anchor.set(0.5, 0.5);
    this.status.label.anchor.set(0, 0.5);
    this.topLayer.addChild(this.status.pill, this.status.text, this.status.label);
    this.back.anchor.set(0, 0.5);
    this.back.position.set(STATUS_LINE.x, STATUS_LINE.y + 30);
    this.back.eventMode = 'static';
    this.back.cursor = 'pointer';
    this.back.visible = false;
    this.back.on('pointertap', () => this.onOpenFloor?.());
    this.topLayer.addChild(this.back);

    this.app.stage.addChild(this.world);

    // Console-debugging handle; also used by automated visual checks.
    (window as unknown as Record<string, unknown>).__agentopia = this;
  }

  private dpr(): number {
    return Math.max(1, window.devicePixelRatio || 1);
  }

  /** The device resolution static art wants at a camera zoom, in coarse steps. */
  private wantedResolution(scale: number): number {
    return Math.max(1, Math.min(3, Math.ceil(scale * this.dpr() * 2) / 2));
  }

  // ---- static art ----------------------------------------------------------

  private makeStanding(piece: RoomPiece): Baked {
    const node = new Container();
    const sprite = new Sprite();
    node.addChild(sprite);
    const probe = this.pen({} as CanvasRenderingContext2D, this.yaw);
    probe.place(piece.place.at, piece.place.facing);
    return { node, sprite, piece, box: worldBox(probe, OBJECTS[piece.name].footprint) };
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
    const oldSheet = this.sheet.texture;
    this.sheet.texture = textureOf(bakeSheet(resolution, yaw), resolution);
    if (oldSheet !== Texture.EMPTY && oldSheet !== this.draftTexture) {
      oldSheet.destroy(true);
    }
    const probe = this.pen({} as CanvasRenderingContext2D, yaw);
    for (const baked of this.standing) {
      const obj = OBJECTS[baked.piece.name];
      const rect = measure(probe, obj, baked.piece.place, false);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(rect.w * resolution);
      canvas.height = Math.ceil(rect.h * resolution);
      const g = canvas.getContext('2d') as CanvasRenderingContext2D;
      g.scale(resolution, resolution);
      // Shift the sheet so this piece's corner is the canvas's corner.
      const k = this.pen(g, yaw, [ORIGIN[0] - rect.x, ORIGIN[1] - rect.y]);
      drawObject(k, obj, baked.piece.place, false);
      const old = baked.sprite.texture;
      baked.sprite.texture = textureOf(canvas, resolution);
      // The drag's canvas is kept for the next turn.
      if (old !== Texture.EMPTY && old !== baked.draft?.texture) {
        old.destroy(true);
      }
      baked.sprite.position.set(rect.x, rect.y);
    }
    DESK_PIECES.forEach((piece, i) => this.layoutDesk(this.desks[i], piece, yaw, resolution));
    const [sx, sy] = sheetPoint(SPEAKER_AT, yaw);
    this.speakerWaves.position.set(sx, sy);
    this.speakerWaves.alpha = speakerAlpha(yaw);
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
    const canvas = bakeSheet(1, yaw, { into: this.draftCanvas });
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
        false
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
    const [sx, sy] = sheetPoint(SPEAKER_AT, yaw);
    this.speakerWaves.position.set(sx, sy);
    this.speakerWaves.alpha = speakerAlpha(yaw);
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
    if (fitAll < MIN_SCALE) {
      base = Math.max(fitAll, Math.min(vh / SHEET_H, MIN_SCALE));
    }
    const zoom = this.zoom?.zoom ?? 1;
    const scale = base * zoom;

    // Where to look: wherever the viewer panned to; otherwise, once the sheet
    // no longer fits across, the centroid of the cast.
    const focus = this.zoom?.focus;
    let wantX = SHEET_W / 2;
    let wantY = SHEET_H / 2;
    if (focus) {
      wantX = focus.x;
      wantY = focus.y;
    } else if (frame.actors.length > 0 && SHEET_W * scale > vw) {
      const pts = frame.actors.map((actor) => sheetPoint([actor.pos.x, actor.pos.y, 0], this.yaw));
      wantX = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
      if (zoom > 1) {
        wantY = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
      }
    }
    const cx = centreOn(wantX, SHEET_W, vw, scale);
    const cy = centreOn(wantY, SHEET_H, vh, scale);
    const targetX = vw / 2 - cx * scale;
    const targetY = vh / 2 - cy * scale;

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
      this.host.style.cursor = SHEET_W * scale > vw || SHEET_H * scale > vh ? 'grab' : '';
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
    this.maybeRebake(scale, frame.at);
    const rigResolution = scale * this.dpr();

    const seen = new Set<string>();
    const cast: Standing[] = [];
    this.shadows.clear();
    for (const actor of frame.actors) {
      seen.add(actor.id);
      const sprite = this.actors.get(actor.id) ?? this.spawn(actor);
      this.update(sprite, actor, frame.at, rigResolution, frame.actors);
      const { x, y } = actor.pos;
      cast.push({
        node: sprite.root,
        box: [
          [x - ACTOR_HALF, y - ACTOR_HALF, 0],
          [x + ACTOR_HALF, y + ACTOR_HALF, ACTOR_HEIGHT],
        ],
      });
    }
    for (const [id, sprite] of [...this.actors]) {
      if (!seen.has(id)) {
        sprite.rig.destroy();
        sprite.bubble.destroy({ children: true });
        sprite.root.destroy({ children: true });
        this.actors.delete(id);
      }
    }
    this.sortCast(cast);

    const occupied = new Map(frame.desks.map((desk) => [desk.slot, desk]));
    this.desks.forEach((overlay, slot) => {
      this.updateDesk(overlay, occupied.get(slot), frame.at);
    });
    this.drawSpeakerWaves(frame.speaking, frame.at);
    this.updateReadout(frame.desks);
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
   */
  private sortCast(cast: Standing[]): void {
    const all: Standing[] = [...this.standing, ...cast];
    const view = viewToward(this.yaw);
    all.sort((p, q) => compareBoxes(p.box, q.box, view));
    all.forEach((item, i) => {
      item.node.zIndex = i;
    });
    this.actorLayer.sortableChildren = true;
  }

  destroy(): void {
    this.zoom?.destroy();
    for (const sprite of this.actors.values()) {
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

  /** Sound rings out of the speaker while a prompt is landing. */
  private drawSpeakerWaves(speaking: boolean, at: number): void {
    const g = this.speakerWaves;
    g.clear();
    if (!speaking) {
      return;
    }
    const t = at / 1000;
    for (let i = 0; i < 3; i++) {
      const phase = (t * 1.4 + i / 3) % 1;
      const r = 14 + phase * 34;
      // Out from the speaker's face, into the room: down and to the left.
      g.arc(0, 0, r, Math.PI * 0.35, Math.PI * 0.95).stroke({
        color: RED,
        width: 2.2,
        alpha: (1 - phase) * 0.9,
        cap: 'round',
      });
    }
  }

  // ---- actors --------------------------------------------------------------

  private spawn(actor: Actor): ActorSprite {
    const root = new Container();
    const rig = new AgentRig();
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
    };
    this.actors.set(actor.id, sprite);
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
    // Typing at its own desk, a lead steps up to the keyboard and turns to
    // face its monitor; everywhere else it stands where core puts it. Helpers
    // work standing beside the desk, so theirs is a station performance.
    const own = actor.state === 'working' && actor.station === 'own_desk' && actor.role === 'lead';
    const stance = own ? DESK_STANCE : { x: 0, y: 0 };
    const root: V3 = [actor.pos.x + stance.x, actor.pos.y + stance.y, 0];
    const [x, y] = sheetPoint(root, this.yaw);
    sprite.root.position.set(x, y);
    // Face where it is going, or what it is standing at — never the viewer
    // for its own sake.
    sprite.heading = nextHeading(actor, sprite.last, sprite.heading, others);
    sprite.last = { ...actor.pos };
    const view = headingView(sprite.heading, this.yaw);
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
    sprite.rig.update(shown, t, own, resolution, { back: view.back, keys });
    this.drawShadow(x, y, airborneOf(shown, t, own));

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
