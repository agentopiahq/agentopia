import { Actor, DESKS, GRID, OfficeFrame, STATIONS } from '@agentopia/core';
import { Application, Container, Graphics, Text } from 'pixi.js';

import { AgentRig } from './character';
import { THEME, TILE } from './theme';

/**
 * The cartoon renderer: an OfficeFrame in, pixels out.
 *
 * Styled after the meme — starburst Claude avatars, a dark-haired human in a
 * hoodie, a warm cream office. This file owns the room and the human; the
 * Claude character is a posed rig of its own (`character.ts`).
 *
 * Characters are parametric vector "sprites": drawn in code, posed
 * frame-by-frame from the director's states, crisp at any zoom, no asset
 * pipeline. Real sprite sheets can replace them behind the same Renderer seam
 * without touching core.
 */

interface ActorSprite {
  root: Container;
  /** Exactly one of these is set, by role. */
  rig?: AgentRig;
  human?: Graphics;
  bubble: Container;
  bubbleBg: Graphics;
  bubbleText: Text;
  bubbleBelow?: boolean;
  nameplate: Text;
  zzz: Text;
}

const px = (tiles: number): number => tiles * TILE;

/**
 * Nameplates read as names, not identifiers. Casing is a display concern, so
 * it happens here rather than in the labels core hands out — which mixes ones
 * the director invents (`lead`, `worker`) with whatever the harness supplies
 * for a subagent type.
 */
const nameplateFor = (label: string): string => label.charAt(0).toUpperCase() + label.slice(1);

export class CartoonRenderer {
  private app = new Application();
  private host: HTMLElement | null = null;
  private hostW = 0;
  private hostH = 0;
  private world = new Container();
  private actorLayer = new Container();
  private actors = new Map<string, ActorSprite>();

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
    for (let x = 2; x < GRID.width; x += 2) {
      g.moveTo(px(x), px(1.6))
        .lineTo(px(x), px(GRID.height - 0.5))
        .stroke({ color: THEME.floorLine, width: 1 });
    }
    for (let y = 3; y < GRID.height; y += 2) {
      g.moveTo(px(0.5), px(y))
        .lineTo(px(GRID.width - 0.5), px(y))
        .stroke({ color: THEME.floorLine, width: 1 });
    }
    room.addChild(g);

    for (const station of Object.values(STATIONS)) {
      room.addChild(this.drawStation(station.spot.x, station.spot.y, station.label));
    }
    for (const desk of DESKS) {
      room.addChild(this.drawDesk(desk.x, desk.y));
    }
    // A few plants make it an office; corners scale with the floor plan.
    const plantSpots: Array<[number, number]> = [
      [1.5, GRID.height * 0.32],
      [GRID.width - 1.5, 5.4],
      [1.5, GRID.height - 1.8],
      [GRID.width - 1.5, GRID.height * 0.78],
    ];
    for (const [x, y] of plantSpots) {
      room.addChild(this.drawPlant(x, y));
    }
    return room;
  }

  private drawStation(x: number, y: number, label: string): Container {
    const c = new Container();
    const zone = new Graphics();
    zone
      .roundRect(-TILE * 1.4, -TILE * 1.05, TILE * 2.8, TILE * 1.7, 12)
      .fill(THEME.stationZone)
      .stroke({ color: THEME.floorLine, width: 2 });
    c.addChild(zone);
    const text = new Text({
      text: label,
      style: {
        fill: THEME.stationLabel,
        fontSize: 13,
        fontFamily: 'ui-rounded, system-ui',
        fontWeight: '600',
      },
    });
    text.anchor.set(0.5, 0);
    text.y = -TILE * 1;
    c.addChild(text);
    c.x = px(x);
    c.y = px(y);
    return c;
  }

  private drawDesk(x: number, y: number): Container {
    const c = new Container();
    const g = new Graphics();
    // Wooden desk one tile above the sitting spot, with laptop and mug.
    g.roundRect(-TILE * 1.05, -TILE * 1.52, TILE * 2.1, TILE * 0.78, 8).fill(THEME.deskTop);
    g.roundRect(-TILE * 1.05, -TILE * 0.86, TILE * 2.1, TILE * 0.12, 4).fill(THEME.deskShade);
    // Laptop: base + tilted screen with a glow.
    g.roundRect(-TILE * 0.52, -TILE * 1.62, TILE * 0.95, TILE * 0.5, 4).fill(THEME.laptop);
    g.roundRect(-TILE * 0.44, -TILE * 1.55, TILE * 0.79, TILE * 0.34, 2).fill(THEME.laptopGlow);
    g.roundRect(-TILE * 0.58, -TILE * 1.14, TILE * 1.06, TILE * 0.1, 3).fill(THEME.laptop);
    // Mug.
    g.roundRect(TILE * 0.62, -TILE * 1.32, TILE * 0.22, TILE * 0.24, 4).fill(THEME.mug);
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

  // ---- actors --------------------------------------------------------------

  private spawn(actor: Actor): ActorSprite {
    const root = new Container();
    let rig: AgentRig | undefined;
    let human: Graphics | undefined;
    if (actor.role === 'human') {
      human = new Graphics();
      root.addChild(human);
    } else {
      rig = new AgentRig();
      root.addChild(rig.view);
    }

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

    const sprite: ActorSprite = { root, rig, human, bubble, bubbleBg, bubbleText, nameplate, zzz };
    this.actors.set(actor.id, sprite);
    this.actorLayer.addChild(root);
    return sprite;
  }

  private update(sprite: ActorSprite, actor: Actor, at: number): void {
    sprite.root.x = px(actor.pos.x);
    sprite.root.y = px(actor.pos.y);
    sprite.nameplate.text = nameplateFor(actor.label);

    const t = at / 1000;
    if (sprite.human) {
      // The human sits still — typing shows in the hands, not the torso. A
      // barely-there breathing sway is the only body motion.
      this.drawHuman(sprite.human, actor, Math.sin(t * 1.6) * 0.7, t);
    } else if (sprite.rig) {
      // Typing at the own computer is seated work, not a station performance.
      sprite.rig.update(actor, t, actor.state === 'working' && actor.station === 'own_desk');
    }

    sprite.zzz.visible = actor.state === 'napping';
    if (actor.bubble) {
      // Near the top wall the usual above-the-head spot is off-canvas, so the
      // bubble flips underneath.
      this.setBubble(sprite, actor.bubble, sprite.root.y < 150);
    } else {
      sprite.bubble.visible = false;
    }
  }

  /** The human, after the meme: dark hair, black hoodie, small and round. */
  private drawHuman(g: Graphics, actor: Actor, lift: number, t: number): void {
    g.clear();
    const y = -14 - lift;

    void t;
    void actor;
    // All fills first, the stroke last: Pixi Graphics accumulates paths, and a
    // stroked curve followed by a filled circle fills their connection too —
    // the mystery blob on the cheek. Same family as the arc-beard.
    g.ellipse(0, -2, 13, 4.5).fill({ color: THEME.shadow, alpha: 0.16 });
    // Hoodie body: a soft rounded shape, chin tucked over the top.
    g.roundRect(-11.5, y - 4, 23, 18, 9).fill(THEME.humanHoodie);
    // Chibi head, meme proportions: hair dominates; the face is a small pale
    // area low on the front, fully inside the hair silhouette.
    const hy = y - 16;
    g.circle(0, hy, 11.5).fill(THEME.humanHair);
    g.circle(0, hy + 3, 7.2).fill(THEME.humanSkin);
    g.ellipse(0, hy - 6.5, 10.4, 5.6).fill(THEME.humanHair);
    // Centered, friendly features.
    g.circle(-3.2, hy + 3.2, 1.8).fill(THEME.eye);
    g.circle(3.2, hy + 3.2, 1.8).fill(THEME.eye);
    g.moveTo(-2.2, hy + 6.8)
      .quadraticCurveTo(0, hy + 8.6, 2.2, hy + 6.8)
      .stroke({ color: THEME.eye, width: 1.5 });
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
