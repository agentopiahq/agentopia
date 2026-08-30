import { Actor, DESKS, GRID, OfficeFrame, STATIONS } from '@cubicle/core';
import { Application, Container, Graphics, Text } from 'pixi.js';

import { THEME, TILE } from './theme';

/**
 * The cartoon renderer: an OfficeFrame in, pixels out.
 *
 * Retained scene per actor id, everything else static. This file is a skin —
 * a pixel or HD-2D restyle replaces it without touching the director.
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
      background: THEME.wall,
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

    g.rect(0, 0, px(GRID.width), px(GRID.height)).fill(THEME.floor);
    for (let x = 0; x <= GRID.width; x += 2) {
      g.moveTo(px(x), 0)
        .lineTo(px(x), px(GRID.height))
        .stroke({ color: THEME.floorLine, width: 1 });
    }
    for (let y = 0; y <= GRID.height; y += 2) {
      g.moveTo(0, px(y)).lineTo(px(GRID.width), px(y)).stroke({ color: THEME.floorLine, width: 1 });
    }
    room.addChild(g);

    for (const station of Object.values(STATIONS)) {
      room.addChild(this.drawStation(station.spot.x, station.spot.y, station.label));
    }
    for (const desk of DESKS) {
      room.addChild(this.drawDesk(desk.x, desk.y));
    }
    return room;
  }

  private drawStation(x: number, y: number, label: string): Container {
    const c = new Container();
    const zone = new Graphics();
    zone.roundRect(-TILE * 1.4, -TILE * 1.1, TILE * 2.8, TILE * 1.8, 10).fill({
      color: THEME.stationZone,
      alpha: 0.85,
    });
    c.addChild(zone);
    const text = new Text({
      text: label,
      style: { fill: THEME.stationLabel, fontSize: 13, fontFamily: 'ui-rounded, system-ui' },
    });
    text.anchor.set(0.5, 0);
    text.y = -TILE * 1.05;
    c.addChild(text);
    c.x = px(x);
    c.y = px(y);
    return c;
  }

  private drawDesk(x: number, y: number): Container {
    const c = new Container();
    const g = new Graphics();
    // Desk sits one tile above the worker's standing spot.
    g.roundRect(-TILE * 0.9, -TILE * 1.5, TILE * 1.8, TILE * 0.7, 6).fill(THEME.deskTop);
    g.roundRect(-TILE * 0.45, -TILE * 1.95, TILE * 0.9, TILE * 0.55, 4).fill(THEME.monitor);
    g.roundRect(-TILE * 0.35, -TILE * 1.87, TILE * 0.7, TILE * 0.33, 2).fill({
      color: THEME.monitorGlow,
      alpha: 0.35,
    });
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
      style: { fill: THEME.nameplate, fontSize: 12, fontFamily: 'ui-rounded, system-ui' },
    });
    nameplate.anchor.set(0.5, 0);
    nameplate.y = 6;
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
    zzz.position.set(12, -34);
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
    const bob = walking ? Math.abs(Math.sin(t * speed)) * 4 : 0;
    // Working reads as vigorous hammering, not a tremble — big enough to see
    // at fit-to-window scale.
    const workPulse = actor.state === 'working' ? Math.abs(Math.sin(t * 9)) * 5 : 0;
    const thinkSway = actor.state === 'thinking' ? Math.sin(t * 1.8) * 1.5 : 0;

    this.drawBody(sprite.body, actor, bob + workPulse + thinkSway, t);

    sprite.zzz.visible = actor.state === 'napping';
    if (actor.bubble) {
      // Near the top wall the usual above-the-head spot is off-canvas, so the
      // bubble flips underneath.
      this.setBubble(sprite, actor.bubble, sprite.root.y < 150);
    } else {
      sprite.bubble.visible = false;
    }
  }

  private drawBody(g: Graphics, actor: Actor, lift: number, t: number): void {
    g.clear();
    const color = actor.role === 'human' ? THEME.human : THEME.worker;
    const slumped = actor.state === 'slump';
    const napping = actor.state === 'napping';
    const thinking = actor.state === 'thinking';
    // Focused states get the determined face: furrowed brows, set mouth.
    const determined = thinking || actor.state === 'working' || actor.state === 'sprinting';
    const h = slumped ? 20 : 26;
    const y = -h / 2 - 8 - lift;

    // Thought dots: three rising dots that pulse in sequence over the head.
    if (thinking) {
      for (let i = 0; i < 3; i++) {
        const phase = (t * 1.6 - i * 0.33) % 1;
        const alpha = phase < 0 ? 0 : Math.sin(Math.max(0, phase) * Math.PI);
        g.circle(12 + i * 9, y - h / 2 - 12 - i * 7, 3.5 + i * 0.8).fill({
          color: THEME.bubbleBg,
          alpha: alpha * 0.9,
        });
      }
    }

    // Shadow.
    g.ellipse(0, -2, 12, 4).fill({ color: 0x000000, alpha: 0.25 });
    // Body: a rounded blob.
    g.roundRect(-13, y - h / 2, 26, h + 12, 12).fill(color);
    if (slumped) {
      g.roundRect(-13, y - h / 2, 26, 6, 6).fill(THEME.slump);
    }
    // Face.
    const face = napping ? '-' : 'o';
    const eyeY = y - 2;
    const dx = actor.facing >= 0 ? 1 : -1;
    if (face === 'o') {
      g.circle(dx * 3 - 3, eyeY, 2).fill(THEME.eye);
      g.circle(dx * 3 + 4, eyeY, 2).fill(THEME.eye);
    } else {
      g.rect(dx * 3 - 5, eyeY, 5, 1.6).fill(THEME.eye);
      g.rect(dx * 3 + 2, eyeY, 5, 1.6).fill(THEME.eye);
    }
    // Brows: flat normally, angled inward when determined.
    if (determined && !napping) {
      g.moveTo(dx * 3 - 6, eyeY - 6)
        .lineTo(dx * 3 - 1, eyeY - 4)
        .stroke({ color: THEME.eye, width: 1.6 });
      g.moveTo(dx * 3 + 7, eyeY - 6)
        .lineTo(dx * 3 + 2, eyeY - 4)
        .stroke({ color: THEME.eye, width: 1.6 });
    }
    // Mouth: smile at ease, a set line when determined, a frown when slumped.
    if (slumped) {
      g.moveTo(dx * 3 - 3, eyeY + 8)
        .quadraticCurveTo(dx * 3 + 0.5, eyeY + 5.5, dx * 3 + 4, eyeY + 8)
        .stroke({ color: THEME.eye, width: 1.4 });
    } else if (determined) {
      g.moveTo(dx * 3 - 2.5, eyeY + 7)
        .lineTo(dx * 3 + 3.5, eyeY + 7)
        .stroke({ color: THEME.eye, width: 1.6 });
    } else {
      g.moveTo(dx * 3 - 3, eyeY + 6)
        .quadraticCurveTo(dx * 3 + 0.5, eyeY + 9, dx * 3 + 4, eyeY + 6)
        .stroke({ color: THEME.eye, width: 1.4 });
    }
  }

  private setBubble(sprite: ActorSprite, text: string, below: boolean): void {
    if (sprite.bubbleText.text !== text || !sprite.bubble.visible || sprite.bubbleBelow !== below) {
      sprite.bubbleBelow = below;
      sprite.bubbleText.text = text;
      const pad = 8;
      const w = sprite.bubbleText.width + pad * 2;
      const bg = new Graphics();
      bg.roundRect(0, 0, w, sprite.bubbleText.height + pad * 2, 8).fill(THEME.bubbleBg);
      if (below) {
        bg.moveTo(14, 0).lineTo(22, -7).lineTo(28, 0).fill(THEME.bubbleBg);
      } else {
        bg.moveTo(14, sprite.bubbleText.height + pad * 2)
          .lineTo(22, sprite.bubbleText.height + pad * 2 + 7)
          .lineTo(28, sprite.bubbleText.height + pad * 2)
          .fill(THEME.bubbleBg);
      }
      sprite.bubble.removeChildren();
      sprite.bubble.addChild(bg);
      sprite.bubbleText.position.set(pad, pad);
      sprite.bubble.addChild(sprite.bubbleText);
      sprite.bubble.position.set(-10, below ? 26 : -sprite.bubbleText.height - 78);
      sprite.bubble.visible = true;
    }
  }
}
