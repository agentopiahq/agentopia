import {
  Actor,
  DEFAULT_BUS,
  DESKS,
  DeskView,
  FURNITURE,
  Furniture,
  GRID,
  OfficeFrame,
} from '@agentopia/core';
import { Application, Container, Graphics, Text } from 'pixi.js';

import { AgentRig } from './character';
import { THEME, TILE } from './theme';

/**
 * The cartoon renderer: an OfficeFrame in, pixels out.
 *
 * Styled after the meme — starburst Claude avatars in a warm cream office.
 * This file owns the room, the furniture, the desks and their monitors, and
 * the per-desk overlays (session name, phase badge, helper count, the
 * scrolling command on the screen); the Claude character is a posed rig of
 * its own (`character.ts`).
 *
 * Characters are parametric vector "sprites": drawn in code, posed
 * frame-by-frame from the director's states, crisp at any zoom, no asset
 * pipeline. Real sprite sheets can replace them behind the same Renderer seam
 * without touching core.
 */

interface ActorSprite {
  root: Container;
  rig: AgentRig;
  bubble: Container;
  bubbleBg: Graphics;
  bubbleText: Text;
  bubbleBelow?: boolean;
  nameplate: Text;
  zzz: Text;
  sweat: Graphics;
}

/** The dynamic part of a desk: everything that changes with its session. */
interface DeskOverlay {
  root: Container;
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
  shownScreen: string | null;
  shownBadge: string;
  shownTag: string;
}

const px = (tiles: number): number => tiles * TILE;

/** The desk monitor, relative to the seat: bezel and the screen inside it. */
const BEZEL = { x: -TILE * 0.88, y: -TILE * 2.6, w: TILE * 1.76, h: TILE * 1.2 };
/**
 * Where a desk sorts among the cast. Its overlay is drawn at the desk's own
 * depth, not the seat's, so whoever sits at the desk is in front of the
 * monitor (bubbles and thought dots stay visible) while whoever walks past
 * behind the desk is hidden by it.
 */
const DESK_DEPTH = TILE * 1.3;
const SCREEN = { x: BEZEL.x + 4, y: BEZEL.y + 4, w: BEZEL.w - 8, h: BEZEL.h - 8 };
/** Terminal type: tiny, dense, and fast — it should read as output, not as a caption. */
const SCREEN_FONT = 4.5;
const SCREEN_LINE_H = 5.5;
const SCREEN_LINES = 13;
/** How fast the terminal scrolls, in lines per second. Frenzied. */
const SCREEN_LINES_PER_SEC = 9;
/** Sweat drops: how many at full stress, and the slowest and fastest cycles. */
const SWEAT_DROPS = 3;
const SWEAT_SLOW_S = 2.6;
const SWEAT_FAST_S = 0.9;

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
  const lines = [`$ ${text.length > 24 ? `${text.slice(0, 23)}…` : text}`];
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
      return { text: 'waiting on you', color: THEME.badgeWaiting };
    case 'awaiting_approval':
      return { text: 'needs approval', color: THEME.badgeApproval };
    case 'compacting':
      return { text: 'compacting', color: THEME.badgeCompact };
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

export class CartoonRenderer {
  private app = new Application();
  private host: HTMLElement | null = null;
  private hostW = 0;
  private hostH = 0;
  private world = new Container();
  /** The cast and the desk overlays together, painter-sorted by y. */
  private actorLayer = new Container();
  /** Effects that nothing occludes: the speaker's sound. */
  private topLayer = new Container();
  private actors = new Map<string, ActorSprite>();
  private desks: DeskOverlay[] = [];
  private speakerWaves = new Graphics();

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: host.clientWidth || 800,
      height: host.clientHeight || 600,
      background: THEME.outside,
      antialias: true,
      // We drive rendering ourselves from the frame loop. Pixi's own ticker
      // drawing on its own schedule races our in-loop resize — the buffer
      // resize lands between its paints and flashes black for a frame.
      autoStart: false,
      sharedTicker: false,
      // Render at native device density; without this a retina display gets a
      // half-resolution canvas stretched by CSS.
      resolution: Math.max(1, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.host = host;

    this.world.addChild(this.drawRoom());
    this.world.addChild(this.actorLayer);
    for (const desk of DESKS) {
      const overlay = this.makeDeskOverlay();
      overlay.root.position.set(px(desk.seat.x), px(desk.seat.y) - DESK_DEPTH);
      this.actorLayer.addChild(overlay.root);
      this.desks.push(overlay);
    }
    const speaker = FURNITURE.find((piece) => piece.kind === 'speaker');
    if (speaker) {
      this.speakerWaves.position.set(px(speaker.at.x), px(speaker.at.y));
    }
    this.topLayer.addChild(this.speakerWaves);
    this.world.addChild(this.topLayer);
    this.app.stage.addChild(this.world);

    // Console-debugging handle; also used by automated visual checks.
    (window as unknown as Record<string, unknown>).__agentopia = this;
  }

  /**
   * The camera. A wide-enough window sees the whole office; a narrow one fits
   * the office's height instead and pans a cropped view toward where the
   * actors actually are. Zoom never drops below a legible tile size just to
   * cram the full width in.
   */
  private placeCamera(frame: OfficeFrame): void {
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
    const worldW = px(GRID.width);
    const worldH = px(GRID.height);

    const fitAll = Math.min(vw / worldW, vh / worldH);
    // Only show the whole floor when its tiles stay comfortably legible;
    // otherwise crop and follow. 26px was chosen by eye: below it the
    // characters stop reading as characters.
    const MIN_TILE_PX = 26;
    let scale = fitAll;
    if (fitAll * TILE < MIN_TILE_PX) {
      // Camera mode: fill the height, but keep at least ~15 tiles visible
      // horizontally so portrait phones do not over-zoom.
      scale = Math.max(fitAll, Math.min(vh / worldH, vw / (15 * TILE)));
    }

    let targetX: number;
    let snap = false;
    if (worldW * scale <= vw) {
      // The room fits: center it, immediately — there is nothing to follow,
      // and easing here makes every resize end in a slow slide. (The
      // follow-clamp below also inverts when the view is wider than the
      // world and would pin the room to one edge.)
      targetX = (vw - worldW * scale) / 2;
      snap = true;
    } else {
      // Aim at the centroid of the cast, clamped to the room.
      let cx = worldW / 2;
      if (frame.actors.length > 0) {
        cx = frame.actors.reduce((sum, actor) => sum + px(actor.pos.x), 0) / frame.actors.length;
      }
      const halfView = vw / 2 / scale;
      const clampedCx = Math.min(worldW - halfView, Math.max(halfView, cx));
      targetX = vw / 2 - clampedCx * scale;
    }
    const targetY = (vh - worldH * scale) / 2;

    this.world.scale.set(scale);
    this.world.y = targetY;
    if (snap) {
      this.world.x = targetX;
      return;
    }
    // Camera-follow eases so pans glide instead of snapping.
    this.world.x += (targetX - this.world.x) * 0.08;
    if (Math.abs(targetX - this.world.x) < 0.5) {
      this.world.x = targetX;
    }
  }

  render(frame: OfficeFrame): void {
    this.placeCamera(frame);
    const seen = new Set<string>();
    for (const actor of frame.actors) {
      seen.add(actor.id);
      const sprite = this.actors.get(actor.id) ?? this.spawn(actor);
      this.update(sprite, actor, frame.at);
    }
    for (const [id, sprite] of [...this.actors]) {
      if (!seen.has(id)) {
        sprite.root.destroy({ children: true });
        this.actors.delete(id);
      }
    }
    // Painters order: lower on screen draws in front.
    this.actorLayer.children.sort((a, b) => a.y - b.y);

    const occupied = new Map(frame.desks.map((desk) => [desk.slot, desk]));
    this.desks.forEach((overlay, slot) => {
      this.updateDesk(overlay, occupied.get(slot), frame.at);
    });
    this.drawSpeakerWaves(frame.speaking, frame.at);

    // One loop: resize, update, and paint together so a resize can never sit
    // unpainted for a frame.
    this.app.render();
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }

  // ---- static scenery ------------------------------------------------------

  private drawRoom(): Container {
    const room = new Container();
    const g = new Graphics();

    // Floor with a soft wall band along the top.
    g.roundRect(px(0.4), px(0.4), px(GRID.width - 0.8), px(GRID.height - 0.8), 24).fill(
      THEME.floor
    );
    g.roundRect(px(0.4), px(0.4), px(GRID.width - 0.8), px(1.4), 24).fill(THEME.wallBand);
    g.moveTo(px(0.6), px(1.8))
      .lineTo(px(GRID.width - 0.6), px(1.8))
      .stroke({ color: THEME.wallLine, width: 2 });
    for (let x = 2; x < GRID.width; x += 2) {
      g.moveTo(px(x), px(1.9))
        .lineTo(px(x), px(GRID.height - 0.5))
        .stroke({ color: THEME.floorLine, width: 1 });
    }
    for (let y = 3; y < GRID.height; y += 2) {
      g.moveTo(px(0.5), px(y))
        .lineTo(px(GRID.width - 0.5), px(y))
        .stroke({ color: THEME.floorLine, width: 1 });
    }
    room.addChild(g);

    for (const piece of FURNITURE) {
      room.addChild(this.drawFurniture(piece));
    }
    for (const desk of DESKS) {
      room.addChild(this.drawDesk(desk.seat.x, desk.seat.y));
    }
    // A few plants make it an office, tucked where nobody walks.
    const plantSpots: Array<[number, number]> = [
      [13.2, 2.9],
      [1.4, 16.4],
      [GRID.width - 1.4, 16.4],
      [GRID.width - 1.4, 19.6],
    ];
    for (const [x, y] of plantSpots) {
      room.addChild(this.drawPlant(x, y));
    }
    return room;
  }

  private drawFurniture(piece: Furniture): Container {
    const c = new Container();
    const g = new Graphics();
    switch (piece.kind) {
      case 'speaker':
        this.drawSpeaker(g);
        break;
      case 'printer':
        this.drawPrinter(g);
        break;
      case 'copier':
        this.drawCopier(g);
        break;
      case 'shutter':
        this.drawShutter(g);
        break;
      case 'cabinet':
        this.drawCabinet(g);
        break;
      case 'door':
        this.drawDoor(g);
        break;
    }
    c.addChild(g);
    c.x = px(piece.at.x);
    c.y = px(piece.at.y);
    return c;
  }

  /** A wall speaker: a dark box, a grille of holes, one red light. */
  private drawSpeaker(g: Graphics): void {
    g.roundRect(-TILE * 0.36, -TILE * 0.3, TILE * 0.72, TILE * 0.6, 5).fill(THEME.speaker);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        g.circle(-TILE * 0.22 + col * TILE * 0.146, -TILE * 0.1 + row * TILE * 0.2, 2.2).fill(
          THEME.speakerGrille
        );
      }
    }
    g.roundRect(-TILE * 0.36, TILE * 0.2, TILE * 0.72, TILE * 0.1, 2).fill(THEME.speakerGrille);
    g.circle(TILE * 0.27, -TILE * 0.2, 1.8).fill(THEME.ledRed);
  }

  /** A printer: a squat body, a paper tray behind, a page coming out the front. */
  private drawPrinter(g: Graphics): void {
    // The sheet in the feed tray, standing up behind the body.
    g.roundRect(-TILE * 0.3, -TILE * 0.72, TILE * 0.6, TILE * 0.44, 2).fill(THEME.paper);
    g.roundRect(-TILE * 0.4, -TILE * 0.5, TILE * 0.8, TILE * 0.16, 3).fill(THEME.printerDark);
    g.roundRect(-TILE * 0.62, -TILE * 0.38, TILE * 1.24, TILE * 0.7, 6).fill(THEME.printer);
    g.roundRect(-TILE * 0.62, TILE * 0.2, TILE * 1.24, TILE * 0.12, 3).fill(THEME.printerDark);
    // The page coming out the front slot.
    g.roundRect(-TILE * 0.42, TILE * 0.06, TILE * 0.84, TILE * 0.05, 1).fill(THEME.printerDark);
    g.roundRect(-TILE * 0.3, TILE * 0.1, TILE * 0.6, TILE * 0.3, 2).fill(THEME.paper);
    g.moveTo(-TILE * 0.2, TILE * 0.2)
      .lineTo(TILE * 0.2, TILE * 0.2)
      .moveTo(-TILE * 0.2, TILE * 0.3)
      .lineTo(TILE * 0.1, TILE * 0.3)
      .stroke({ color: THEME.floorLine, width: 1.5 });
    // Control light and a button.
    g.circle(TILE * 0.44, -TILE * 0.22, 2).fill(THEME.led);
    g.roundRect(TILE * 0.3, -TILE * 0.26, TILE * 0.08, TILE * 0.08, 1).fill(THEME.printerDark);
  }

  /** A copier: taller, a dark lid, a control panel with coloured buttons. */
  private drawCopier(g: Graphics): void {
    g.roundRect(-TILE * 0.7, -TILE * 0.5, TILE * 1.4, TILE * 1.1, 6).fill(THEME.copier);
    g.roundRect(-TILE * 0.7, TILE * 0.48, TILE * 1.4, TILE * 0.12, 3).fill(THEME.printerDark);
    // The lid, propped a little open over the glass.
    g.roundRect(-TILE * 0.66, -TILE * 0.74, TILE * 1.32, TILE * 0.3, 4).fill(THEME.copierLid);
    g.roundRect(-TILE * 0.6, -TILE * 0.46, TILE * 1.2, TILE * 0.06, 1).fill(THEME.monitorIdle);
    // Control panel.
    g.roundRect(-TILE * 0.55, -TILE * 0.28, TILE * 1.1, TILE * 0.24, 3).fill(THEME.printerDark);
    g.circle(-TILE * 0.38, -TILE * 0.16, 2.4).fill(THEME.ledBlue);
    g.circle(-TILE * 0.2, -TILE * 0.16, 2.4).fill(THEME.led);
    g.circle(-TILE * 0.02, -TILE * 0.16, 2.4).fill(THEME.ledRed);
    g.roundRect(TILE * 0.14, -TILE * 0.22, TILE * 0.32, TILE * 0.12, 2).fill(THEME.monitorIdle);
    // Paper drawers.
    for (let i = 0; i < 2; i++) {
      const y = TILE * 0.06 + i * TILE * 0.2;
      g.roundRect(-TILE * 0.58, y, TILE * 1.16, TILE * 0.16, 2).fill(THEME.printer);
      g.roundRect(-TILE * 0.12, y + TILE * 0.05, TILE * 0.24, TILE * 0.05, 1).fill(
        THEME.printerDark
      );
    }
  }

  /** A rolling shutter on the wall: a roller box and horizontal slats. */
  private drawShutter(g: Graphics): void {
    const w = TILE * 1.5;
    const top = -TILE * 0.62;
    const h = TILE * 1.25;
    g.roundRect(-w / 2 - 3, top - 2, w + 6, h + 4, 4).fill(THEME.shutterBox);
    for (let i = 0; i < 7; i++) {
      const y = top + TILE * 0.18 + i * (TILE * 0.15);
      g.rect(-w / 2, y, w, TILE * 0.13).fill(i % 2 === 0 ? THEME.shutter : THEME.shutterDark);
    }
    // The roller box across the top, with its lift cord.
    g.roundRect(-w / 2 - 3, top - 2, w + 6, TILE * 0.2, 4).fill(THEME.shutterBox);
    g.moveTo(w / 2 - 4, top + TILE * 0.18)
      .lineTo(w / 2 - 4, top + h - 4)
      .stroke({ color: THEME.shutterBox, width: 1.5 });
    g.circle(w / 2 - 4, top + h - 4, 2).fill(THEME.doorHandle);
  }

  /** A filing cabinet: three drawers, each with a handle and a label. */
  private drawCabinet(g: Graphics): void {
    const w = TILE * 0.9;
    const h = TILE * 1.7;
    g.ellipse(0, h / 2 + 2, w * 0.55, 4).fill({ color: THEME.shadow, alpha: 0.12 });
    g.roundRect(-w / 2, -h / 2, w, h, 4).fill(THEME.cabinet);
    g.roundRect(-w / 2, h / 2 - 5, w, 5, 2).fill(THEME.cabinetDark);
    for (let i = 0; i < 3; i++) {
      const y = -h / 2 + 4 + i * ((h - 8) / 3);
      const dh = (h - 8) / 3 - 3;
      g.roundRect(-w / 2 + 3, y, w - 6, dh, 3)
        .fill(THEME.cabinet)
        .stroke({ color: THEME.cabinetDark, width: 1.5 });
      g.roundRect(-w * 0.18, y + dh * 0.55, w * 0.36, 3, 1.5).fill(THEME.cabinetDark);
      g.roundRect(-w * 0.22, y + dh * 0.18, w * 0.44, 4, 1).fill(THEME.cabinetLabel);
    }
  }

  /**
   * The door, standing upright in the corner and seen face on like the rest
   * of the furniture: a frame, a tall panelled leaf, a handle, and a mat at
   * its foot. The anchor is the bottom centre, on the floor.
   */
  private drawDoor(g: Graphics): void {
    const w = TILE * 1.25;
    const h = TILE * 2.05;
    // Mat at the foot of the door.
    g.roundRect(-w * 0.62, -3, w * 1.24, TILE * 0.36, 4).fill(THEME.mat);
    for (let i = 0; i < 3; i++) {
      g.rect(-w * 0.62 + 4, 1 + i * 3.4, w * 1.24 - 8, 1.4).fill(THEME.matStripe);
    }
    // Frame, then the leaf inside it.
    g.roundRect(-w / 2 - 4, -h - 4, w + 8, h + 4, 3).fill(THEME.doorFrame);
    g.roundRect(-w / 2, -h, w, h, 2).fill(THEME.door);
    // Two panels, one above the other.
    const inset = 6;
    const panelH = h * 0.4;
    g.roundRect(-w / 2 + inset, -h + inset, w - inset * 2, panelH, 2).stroke({
      color: THEME.doorFrame,
      width: 1.5,
    });
    g.roundRect(-w / 2 + inset, -h * 0.5 + 2, w - inset * 2, panelH, 2).stroke({
      color: THEME.doorFrame,
      width: 1.5,
    });
    g.circle(w / 2 - 7, -h * 0.5, 2.6).fill(THEME.doorHandle);
  }

  /** A desk with a big monitor, a keyboard and a mug; the seat is one tile below. */
  private drawDesk(x: number, y: number): Container {
    const c = new Container();
    const g = new Graphics();
    g.roundRect(-TILE * 1.15, -TILE * 1.55, TILE * 2.3, TILE * 0.78, 8).fill(THEME.deskTop);
    g.roundRect(-TILE * 1.15, -TILE * 0.89, TILE * 2.3, TILE * 0.12, 4).fill(THEME.deskShade);
    // Monitor: stand, then bezel. The screen itself lives on the overlay.
    g.roundRect(-TILE * 0.18, BEZEL.y + BEZEL.h - 2, TILE * 0.36, TILE * 0.28, 2).fill(
      THEME.monitor
    );
    g.roundRect(-TILE * 0.36, -TILE * 1.2, TILE * 0.72, TILE * 0.08, 2).fill(THEME.monitor);
    g.roundRect(BEZEL.x, BEZEL.y, BEZEL.w, BEZEL.h, 5).fill(THEME.monitor);
    // Keyboard and mug on the desk.
    g.roundRect(-TILE * 0.5, -TILE * 1.14, TILE * 1, TILE * 0.2, 3).fill(THEME.keyboard);
    for (let i = 0; i < 6; i++) {
      g.rect(-TILE * 0.44 + i * TILE * 0.15, -TILE * 1.09, TILE * 0.1, TILE * 0.1).fill(
        THEME.floorLine
      );
    }
    g.roundRect(TILE * 0.72, -TILE * 1.34, TILE * 0.22, TILE * 0.24, 4).fill(THEME.mug);
    c.addChild(g);
    c.x = px(x);
    c.y = px(y);
    return c;
  }

  private drawPlant(x: number, y: number): Container {
    const c = new Container();
    const g = new Graphics();
    g.ellipse(0, -2, 12, 4).fill({ color: THEME.shadow, alpha: 0.12 });
    g.roundRect(-8, -16, 16, 14, 4).fill(THEME.plantPot);
    for (const [dx, dy, r] of [
      [-6, -24, 7],
      [0, -30, 8],
      [6, -23, 7],
      [0, -20, 7],
    ] as const) {
      g.circle(dx, dy, r).fill(THEME.plant);
    }
    c.addChild(g);
    c.x = px(x);
    c.y = px(y);
    return c;
  }

  // ---- desks ---------------------------------------------------------------

  private makeDeskOverlay(): DeskOverlay {
    const root = new Container();
    // The parts are laid out relative to the seat; the root sits at the
    // desk's depth for sorting, so shift them back down by the difference.
    const parts = new Container();
    parts.y = DESK_DEPTH;
    root.addChild(parts);

    const screenBg = new Graphics();
    parts.addChild(screenBg);

    const screenMask = new Graphics();
    screenMask.roundRect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 3).fill(0xffffff);
    parts.addChild(screenMask);
    const screenText = new Text({
      text: '',
      style: {
        fill: THEME.monitorText,
        fontSize: SCREEN_FONT,
        lineHeight: SCREEN_LINE_H,
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      },
    });
    screenText.mask = screenMask;
    screenText.position.set(SCREEN.x + 3, SCREEN.y);
    parts.addChild(screenText);

    const nameplate = new Text({
      text: '',
      style: {
        fill: THEME.tag,
        fontSize: 12,
        fontFamily: 'ui-rounded, system-ui',
        fontWeight: '600',
      },
    });
    nameplate.anchor.set(0.5, 1);
    nameplate.position.set(0, BEZEL.y - 4);
    parts.addChild(nameplate);

    const badge = new Container();
    const badgeBg = new Graphics();
    const badgeText = new Text({
      text: '',
      style: {
        fill: THEME.badgeText,
        fontSize: 10,
        fontFamily: 'ui-rounded, system-ui',
        fontWeight: '700',
      },
    });
    badgeText.anchor.set(0.5, 0.5);
    badge.addChild(badgeBg, badgeText);
    badge.position.set(0, BEZEL.y - 28);
    badge.visible = false;
    parts.addChild(badge);

    const tag = new Container();
    const tagBg = new Graphics();
    const tagText = new Text({
      text: '',
      style: {
        fill: THEME.badgeText,
        fontSize: 10,
        fontFamily: 'ui-rounded, system-ui',
        fontWeight: '700',
      },
    });
    tagText.anchor.set(0.5, 0.5);
    tag.addChild(tagBg, tagText);
    tag.position.set(BEZEL.x + BEZEL.w, BEZEL.y);
    tag.visible = false;
    parts.addChild(tag);

    const overlay: DeskOverlay = {
      root,
      screenBg,
      screenText,
      nameplate,
      badge,
      badgeBg,
      badgeText,
      tag,
      tagBg,
      tagText,
      shownScreen: null,
      shownBadge: '',
      shownTag: '',
    };
    this.paintScreen(overlay, false);
    return overlay;
  }

  private paintScreen(overlay: DeskOverlay, running: boolean): void {
    overlay.screenBg.clear();
    overlay.screenBg
      .roundRect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 3)
      .fill(running ? THEME.monitorRun : THEME.monitorIdle);
    if (!running) {
      // An idle desktop: a couple of window shapes, nothing to read.
      overlay.screenBg
        .roundRect(SCREEN.x + 6, SCREEN.y + 6, SCREEN.w * 0.5, SCREEN.h * 0.45, 2)
        .fill(THEME.laptopGlow);
      overlay.screenBg
        .roundRect(SCREEN.x + SCREEN.w * 0.58, SCREEN.y + 10, SCREEN.w * 0.3, SCREEN.h * 0.6, 2)
        .fill(THEME.keyboard);
    }
  }

  private updateDesk(overlay: DeskOverlay, desk: DeskView | undefined, at: number): void {
    if (!desk) {
      if (overlay.shownScreen !== null || overlay.nameplate.visible) {
        overlay.shownScreen = null;
        overlay.screenText.text = '';
        this.paintScreen(overlay, false);
      }
      overlay.nameplate.visible = false;
      overlay.badge.visible = false;
      overlay.tag.visible = false;
      return;
    }

    overlay.nameplate.visible = true;
    overlay.nameplate.text = deskTitle(desk);

    // The screen: a terminal scrolling the command while one runs.
    const screen = desk.screen ?? null;
    if (screen !== overlay.shownScreen) {
      overlay.shownScreen = screen;
      this.paintScreen(overlay, screen !== null);
      if (screen === null) {
        overlay.screenText.text = '';
      } else {
        const lines = screenLines(screen);
        // Doubled, so the scroll wraps seamlessly.
        overlay.screenText.text = [...lines, ...lines].join('\n');
      }
    }
    if (screen !== null) {
      const block = SCREEN_LINES * SCREEN_LINE_H;
      const elapsed = Math.max(0, at - desk.screenSince) / 1000;
      overlay.screenText.y =
        SCREEN.y + 2 - ((elapsed * SCREEN_LINES_PER_SEC * SCREEN_LINE_H) % block);
    }

    const badge = badgeFor(desk.phase);
    const badgeKey = badge ? badge.text : '';
    if (badgeKey !== overlay.shownBadge) {
      overlay.shownBadge = badgeKey;
      overlay.badge.visible = badge !== null;
      if (badge) {
        overlay.badgeText.text = badge.text;
        const w = overlay.badgeText.width + 14;
        const h = overlay.badgeText.height + 6;
        overlay.badgeBg.clear();
        overlay.badgeBg.roundRect(-w / 2, -h / 2, w, h, h / 2).fill(badge.color);
      }
    }

    const tagKey = desk.subagents > 0 ? `+${desk.subagents}` : '';
    if (tagKey !== overlay.shownTag) {
      overlay.shownTag = tagKey;
      overlay.tag.visible = tagKey !== '';
      if (tagKey) {
        overlay.tagText.text = tagKey;
        const w = Math.max(20, overlay.tagText.width + 10);
        const h = overlay.tagText.height + 4;
        overlay.tagBg.clear();
        overlay.tagBg
          .roundRect(-w / 2, -h / 2, w, h, h / 2)
          .fill(THEME.tag)
          .stroke({ color: THEME.floor, width: 2 });
      }
    }
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
      const r = TILE * 0.45 + phase * TILE * 0.9;
      g.arc(TILE * 0.2, 0, r, -0.9, 0.9).stroke({
        color: THEME.speakerWave,
        width: 2.5,
        alpha: (1 - phase) * 0.9,
      });
    }
  }

  // ---- actors --------------------------------------------------------------

  private spawn(actor: Actor): ActorSprite {
    const root = new Container();
    const rig = new AgentRig();
    root.addChild(rig.view);

    const nameplate = new Text({
      text: nameplateFor(actor.label),
      style: {
        fill: THEME.nameplate,
        fontSize: 12,
        fontFamily: 'ui-rounded, system-ui',
        fontWeight: '600',
      },
    });
    nameplate.anchor.set(0.5, 0);
    nameplate.y = 7;
    root.addChild(nameplate);

    const bubble = new Container();
    const bubbleBg = new Graphics();
    bubble.addChild(bubbleBg);
    const bubbleText = new Text({
      text: '',
      style: {
        fill: THEME.bubbleText,
        fontSize: 12,
        fontFamily: 'ui-rounded, system-ui',
        wordWrap: true,
        wordWrapWidth: 180,
      },
    });
    bubble.addChild(bubbleText);
    bubble.visible = false;
    root.addChild(bubble);

    const zzz = new Text({
      text: 'z z z',
      style: { fill: THEME.nameplate, fontSize: 13, fontFamily: 'ui-rounded, system-ui' },
    });
    zzz.anchor.set(0, 1);
    zzz.position.set(14, -40);
    zzz.visible = false;
    root.addChild(zzz);

    const sweat = new Graphics();
    root.addChild(sweat);

    const sprite: ActorSprite = { root, rig, bubble, bubbleBg, bubbleText, nameplate, zzz, sweat };
    this.actors.set(actor.id, sprite);
    this.actorLayer.addChild(root);
    return sprite;
  }

  private update(sprite: ActorSprite, actor: Actor, at: number): void {
    sprite.root.x = px(actor.pos.x);
    sprite.root.y = px(actor.pos.y);
    // The desk carries the session name; a lead's own plate would repeat it.
    sprite.nameplate.visible = actor.role === 'helper';
    sprite.nameplate.text = nameplateFor(actor.label);

    const t = at / 1000;
    // Typing at the own computer is seated work, not a station performance.
    sprite.rig.update(actor, t, actor.state === 'working' && actor.station === 'own_desk');

    sprite.zzz.visible = actor.state === 'napping';
    this.drawSweat(sprite.sweat, actor.stress, t);
    if (actor.bubble) {
      // Near the top wall the usual above-the-head spot is off-canvas, so the
      // bubble flips underneath.
      this.setBubble(sprite, actor.bubble, sprite.root.y < 150);
    } else {
      sprite.bubble.visible = false;
    }
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
      const x = 18 + i * 5;
      const y = -46 + i * 4 + phase * 8;
      const alpha = (1 - phase) * (0.55 + 0.45 * stress);
      g.moveTo(x, y - 3.5)
        .quadraticCurveTo(x + 2.6, y + 1.5, x, y + 3)
        .quadraticCurveTo(x - 2.6, y + 1.5, x, y - 3.5)
        .fill({ color: THEME.sweat, alpha });
    }
  }

  private setBubble(sprite: ActorSprite, text: string, below: boolean): void {
    if (sprite.bubbleText.text !== text || !sprite.bubble.visible || sprite.bubbleBelow !== below) {
      sprite.bubbleBelow = below;
      sprite.bubbleText.text = text;
      const pad = 8;
      const w = sprite.bubbleText.width + pad * 2;
      const h = sprite.bubbleText.height + pad * 2;
      // Redraw the one persistent Graphics rather than allocating a fresh one
      // per change — dropped Graphics keep their GPU geometry alive.
      const bg = sprite.bubbleBg;
      bg.clear();
      bg.roundRect(0, 0, w, h, 9)
        .fill(THEME.bubbleBg)
        .stroke({ color: THEME.bubbleLine, width: 1.5 });
      if (below) {
        bg.moveTo(14, 0).lineTo(22, -7).lineTo(28, 0).fill(THEME.bubbleBg);
      } else {
        bg.moveTo(14, h)
          .lineTo(22, h + 7)
          .lineTo(28, h)
          .fill(THEME.bubbleBg);
      }
      sprite.bubbleText.position.set(pad, pad);
      sprite.bubble.position.set(-10, below ? 28 : -h - 62);
      sprite.bubble.visible = true;
    }
  }
}
