import { Actor, DESKS, GRID, OfficeFrame, STATIONS } from '@cubicle/core';
import { Application, Container, Graphics, Text } from 'pixi.js';

import { THEME, TILE } from './theme';

/**
 * The cartoon renderer: an OfficeFrame in, pixels out.
 *
 * Styled after the meme — starburst Claude avatars, a dark-haired human in a
 * hoodie, a warm cream office. Characters are parametric vector "sprites":
 * drawn in code, animated frame-by-frame from the director's states, crisp at
 * any zoom, no asset pipeline. Real sprite sheets can replace this file
 * behind the same Renderer seam without touching core.
 */

interface ActorSprite {
  root: Container;
  body: Graphics;
  bubble: Container;
  bubbleText: Text;
  bubbleBelow?: boolean;
  nameplate: Text;
  zzz: Text;
}

const px = (tiles: number): number => tiles * TILE;

export class CartoonRenderer {
  private app = new Application();
  private world = new Container();
  private actorLayer = new Container();
  private actors = new Map<string, ActorSprite>();

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: px(GRID.width),
      height: px(GRID.height),
      background: THEME.outside,
      antialias: true,
      // Render at native device density; without this a retina display gets a
      // half-resolution canvas stretched by CSS.
      resolution: Math.max(1, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.style.maxWidth = '100vw';
    this.app.canvas.style.maxHeight = '100vh';
    this.app.canvas.style.objectFit = 'contain';
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';

    this.world.addChild(this.drawRoom());
    this.world.addChild(this.actorLayer);
    this.app.stage.addChild(this.world);
  }

  render(frame: OfficeFrame): void {
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
    // A few plants make it an office.
    for (const [x, y] of [
      [1.6, 2.6],
      [46.4, 2.6],
      [1.6, 12.5],
      [46.4, 16.4],
    ] as const) {
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
    const body = new Graphics();
    root.addChild(body);

    const nameplate = new Text({
      text: actor.label,
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

    const sprite: ActorSprite = { root, body, bubble, bubbleText, nameplate, zzz };
    this.actors.set(actor.id, sprite);
    this.actorLayer.addChild(root);
    return sprite;
  }

  private update(sprite: ActorSprite, actor: Actor, at: number): void {
    sprite.root.x = px(actor.pos.x);
    sprite.root.y = px(actor.pos.y);
    sprite.nameplate.text = actor.label;

    const t = at / 1000;
    const walking = actor.state === 'walking' || actor.state === 'sprinting';
    const speed = actor.state === 'sprinting' ? 14 : 8;
    const bob = walking ? Math.abs(Math.sin(t * speed)) * 5 : 0;
    // Working reads as vigorous typing, visible at fit-to-window scale.
    const workPulse = actor.state === 'working' ? Math.abs(Math.sin(t * 9)) * 5 : 0;
    const thinkSway = actor.state === 'thinking' ? Math.sin(t * 1.8) * 1.5 : 0;

    // A jaunty wobble while moving; star tilts into the walk.
    sprite.body.rotation = walking ? Math.sin(t * speed) * 0.09 * actor.facing : 0;

    const atOwnComputer = actor.state === 'working' && actor.station === 'own_desk';
    if (actor.role === 'human') {
      this.drawHuman(sprite.body, actor, bob + workPulse, t);
    } else {
      // Typing at the own computer is seated work: no big hammer-bob.
      const lift = atOwnComputer ? Math.abs(Math.sin(t * 11)) * 1.5 : bob + workPulse + thinkSway;
      this.drawAgent(sprite.body, actor, lift, t, atOwnComputer);
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

  /** The Claude avatar: a fat orange starburst with a face. */
  private drawAgent(
    g: Graphics,
    actor: Actor,
    lift: number,
    t: number,
    atOwnComputer = false
  ): void {
    g.clear();
    const slumped = actor.state === 'slump';
    const napping = actor.state === 'napping';
    const thinking = actor.state === 'thinking';
    const determined = thinking || actor.state === 'working' || actor.state === 'sprinting';
    const r = 17;
    const cy = -r - 7 - lift;

    if (thinking) {
      for (let i = 0; i < 3; i++) {
        const phase = (t * 1.6 - i * 0.33) % 1;
        const alpha = phase < 0 ? 0 : Math.sin(Math.max(0, phase) * Math.PI);
        g.circle(14 + i * 9, cy - r - 8 - i * 7, 3.5 + i * 0.8)
          .fill({ color: THEME.bubbleBg, alpha: alpha * 0.95 })
          .stroke({ color: THEME.bubbleLine, alpha: alpha * 0.9, width: 1 });
      }
    }

    g.ellipse(0, -2, 14, 4.5).fill({ color: THEME.shadow, alpha: 0.16 });

    // The starburst: fat rounded spikes via a thick round-joined star stroke.
    const spin = actor.state === 'sprinting' ? Math.sin(t * 10) * 0.12 : 0;
    const squishY = slumped ? 0.88 : 1;
    const color = slumped ? THEME.slumpTint : THEME.worker;
    const starR = r * squishY;
    g.star(0, cy, 10, starR, starR * 0.62, spin)
      .fill(color)
      .stroke({ color, width: 9, join: 'round', cap: 'round' });
    // Center disc keeps the face readable over the spikes.
    g.circle(0, cy, r * 0.62).fill(color);

    this.drawFace(g, 0, cy, actor.facing, { napping, slumped, determined });

    // Shell work: a personal terminal in front of the agent, output scrolling.
    if (atOwnComputer) {
      this.drawTerminal(g, 0, cy + r * 0.55, t, actor.id);
    }
  }

  /**
   * A little terminal with pseudo-random output lines scrolling up. Widths are
   * hashed from the scroll position and actor id, so the output churns without
   * any real text (or any real randomness — replays stay identical).
   */
  private drawTerminal(g: Graphics, cx: number, cy: number, t: number, seed: string): void {
    const w = 34;
    const h = 24;
    const lineH = 4.5;
    g.roundRect(cx - w / 2, cy - h, w, h, 3).fill(THEME.laptop);
    g.roundRect(cx - w / 2 + 2, cy - h + 2, w - 4, h - 6, 2).fill(0x10131a);
    const scroll = t * 6;
    const offset = (scroll % 1) * lineH;
    const base = Math.floor(scroll);
    let seedHash = 0;
    for (let i = 0; i < seed.length; i++) {
      seedHash = (seedHash * 31 + seed.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < 4; i++) {
      const n = base + i;
      const hash = Math.abs((seedHash ^ (n * 2654435761)) % 1000) / 1000;
      const lineW = 6 + hash * (w - 14);
      const y = cy - h + 4 + i * lineH - offset;
      if (y < cy - h + 3 || y > cy - 7) {
        continue;
      }
      g.roundRect(cx - w / 2 + 4, y, lineW, 2, 1).fill({
        color: 0x7ec98f,
        alpha: 0.55 + hash * 0.4,
      });
    }
    // Keyboard base.
    g.roundRect(cx - w / 2 - 2, cy - 3, w + 4, 4, 2).fill(THEME.deskShade);
  }

  /** The human, after the meme: dark hair, black hoodie, small and round. */
  private drawHuman(g: Graphics, actor: Actor, lift: number, t: number): void {
    g.clear();
    const y = -14 - lift;

    g.ellipse(0, -2, 13, 4.5).fill({ color: THEME.shadow, alpha: 0.16 });
    // Hoodie body.
    g.roundRect(-12, y - 8, 24, 22, 10).fill(THEME.humanHoodie);
    // Head.
    g.circle(0, y - 16, 11).fill(THEME.humanSkin);
    // Mop of hair: a cap plus a fringe.
    g.arc(0, y - 17, 11.4, Math.PI * 0.95, Math.PI * 2.05).fill(THEME.humanHair);
    g.ellipse(0, y - 23.5, 11.2, 6.5).fill(THEME.humanHair);
    // Typing hands while working.
    if (actor.state === 'working') {
      const tap = Math.sin(t * 12) * 1.5;
      g.circle(-8, y + 12 + tap, 3).fill(THEME.humanSkin);
      g.circle(8, y + 12 - tap, 3).fill(THEME.humanSkin);
    }

    this.drawFace(g, 0, y - 15, actor.facing, {
      napping: false,
      slumped: false,
      determined: actor.state === 'working',
    });
  }

  private drawFace(
    g: Graphics,
    cx: number,
    cy: number,
    facing: 1 | -1,
    look: { napping: boolean; slumped: boolean; determined: boolean }
  ): void {
    const dx = facing >= 0 ? 1 : -1;
    const eyeY = cy - 1;
    if (look.napping) {
      g.rect(dx * 2 - 6, eyeY, 5, 1.8).fill(THEME.eye);
      g.rect(dx * 2 + 2, eyeY, 5, 1.8).fill(THEME.eye);
    } else {
      g.circle(dx * 2 - 4, eyeY, 2.2).fill(THEME.eye);
      g.circle(dx * 2 + 4, eyeY, 2.2).fill(THEME.eye);
    }
    // Brows: angled inward when determined.
    if (look.determined && !look.napping) {
      g.moveTo(dx * 2 - 7, eyeY - 6.5)
        .lineTo(dx * 2 - 1.5, eyeY - 4.5)
        .stroke({ color: THEME.eye, width: 1.8 });
      g.moveTo(dx * 2 + 7, eyeY - 6.5)
        .lineTo(dx * 2 + 1.5, eyeY - 4.5)
        .stroke({ color: THEME.eye, width: 1.8 });
    }
    // Mouth: smile at ease, a set line when determined, a frown when slumped.
    if (look.slumped) {
      g.moveTo(cx + dx * 2 - 3, eyeY + 8)
        .quadraticCurveTo(cx + dx * 2 + 0.5, eyeY + 5.5, cx + dx * 2 + 4, eyeY + 8)
        .stroke({ color: THEME.eye, width: 1.6 });
    } else if (look.determined) {
      g.moveTo(cx + dx * 2 - 2.5, eyeY + 7)
        .lineTo(cx + dx * 2 + 3.5, eyeY + 7)
        .stroke({ color: THEME.eye, width: 1.8 });
    } else {
      g.moveTo(cx + dx * 2 - 3, eyeY + 6)
        .quadraticCurveTo(cx + dx * 2 + 0.5, eyeY + 9, cx + dx * 2 + 4, eyeY + 6)
        .stroke({ color: THEME.eye, width: 1.6 });
    }
  }

  private setBubble(sprite: ActorSprite, text: string, below: boolean): void {
    if (sprite.bubbleText.text !== text || !sprite.bubble.visible || sprite.bubbleBelow !== below) {
      sprite.bubbleBelow = below;
      sprite.bubbleText.text = text;
      const pad = 8;
      const w = sprite.bubbleText.width + pad * 2;
      const h = sprite.bubbleText.height + pad * 2;
      const bg = new Graphics();
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
      sprite.bubble.removeChildren();
      sprite.bubble.addChild(bg);
      sprite.bubbleText.position.set(pad, pad);
      sprite.bubble.addChild(sprite.bubbleText);
      sprite.bubble.position.set(-10, below ? 28 : -h - 62);
      sprite.bubble.visible = true;
    }
  }
}
