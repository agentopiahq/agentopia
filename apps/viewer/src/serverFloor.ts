import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';

import { Box3, Facing, Iso, V2, drawOrder, viewToward } from './kit/iso';
import { OBJECTS, ObjectName } from './objects';
import { Rect, drawObject, measure, worldBox } from './objects/bake';
import { ORIGIN, PIVOT, TILE } from './room';
import { FloorPiece, SERVER_PIECES, bakeServerSheet } from './serverRoom';
import { styled } from './styles';

/**
 * The server floor, drawn: its sheet, and every piece on it as a sprite of
 * its own, sorted by footprint once per view (nothing moves down here, so
 * the order only changes when the view turns).
 *
 * Every rack of a kind facing one way looks the same from a given view, and
 * an isometric view only moves a drawing about the page, so each kind is
 * drawn once per facing (a template) and every piece of it shows that one
 * drawing where it stands. The moving parts — blinking lights, spinning fans
 * — are each a loop of stills drawn the same way, and each piece plays its
 * loops from its own beat, so no two racks blink together. Time is the
 * renderer's clock, handed in.
 */

/** One kind of piece facing one way, drawn once for every piece like it. */
interface Template {
  /** Where its canvas sits on the sheet, drawn at `at`. */
  rect: Rect;
  /** The sheet point its anchor was drawn at. */
  anchor: V2;
  body: Texture;
  /** Each motion's stills. */
  motions: Texture[][];
}

/** One piece on the floor: its sprites, the template they show, and its footprint. */
interface Piece {
  piece: FloorPiece;
  key: string;
  node: Container;
  body: Sprite;
  motions: Sprite[];
  box: Box3;
}

const keyOf = (name: ObjectName, facing: Facing | undefined): string => `${name}|${facing ?? '+y'}`;

function textureOf(canvas: HTMLCanvasElement, resolution: number): Texture {
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution }) });
}

function pen(ctx: CanvasRenderingContext2D, yaw: number, origin: V2 = ORIGIN): Iso {
  return new Iso(ctx, { unit: TILE, origin, yaw, pivot: PIVOT });
}

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
  private readonly pieces: Piece[];
  private templates = new Map<string, Template>();
  private bakedAt = 0;
  private bakedYaw = NaN;
  /** Whether the art is the quick kind a drag's turn draws. */
  private drafting = false;
  private draftCanvas: HTMLCanvasElement | null = null;
  private wanted = 0;
  private wantedSince = 0;

  constructor(private readonly options: ServerFloorOptions) {
    this.layer.sortableChildren = true;
    this.root.addChild(this.sheet, this.layer);
    this.pieces = SERVER_PIECES.map((piece) => {
      const node = new Container();
      const body = new Sprite();
      node.addChild(body);
      const motions = (OBJECTS[piece.name].motions ?? []).map(() => {
        const sprite = new Sprite();
        node.addChild(sprite);
        return sprite;
      });
      this.layer.addChild(node);
      return {
        piece,
        key: keyOf(piece.name, piece.place.facing),
        node,
        body,
        motions,
        box: [
          [0, 0, 0],
          [0, 0, 0],
        ],
      };
    });
  }

  /**
   * Bring the floor up to date for this frame: redraw it if the view has
   * turned (quickly while a drag turns it, properly when it stops) or the
   * zoom has settled at a new resolution, and step every moving part to its
   * still for `at`. Says whether it was drawn afresh, which takes a moment.
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
    this.step(at);
    return baked;
  }

  /** Draw it all again at once, as it is: a new drawing style. */
  redraw(): void {
    if (this.bakedAt > 0) {
      this.bake(this.bakedAt, this.bakedYaw, false);
    }
  }

  /** Show each piece's moving parts at their stills for `at`. */
  private step(at: number): void {
    for (const p of this.pieces) {
      const template = this.templates.get(p.key);
      if (!template) {
        continue;
      }
      const motions = OBJECTS[p.piece.name].motions ?? [];
      motions.forEach((motion, i) => {
        const stills = template.motions[i];
        const frame = Math.floor((at / 1000) * motion.fps + p.piece.phase * 1.7) % motion.frames;
        const texture = stills[(frame + motion.frames) % motion.frames];
        if (p.motions[i].texture !== texture) {
          p.motions[i].texture = texture;
        }
      });
    }
  }

  /** Draw the sheet and every template, and stand every piece where it goes. */
  private bake(resolution: number, yaw: number, draft: boolean): void {
    this.bakedAt = resolution;
    this.bakedYaw = yaw;
    this.drafting = draft;
    this.wanted = 0;
    const old = this.sheet.texture;
    const into = draft ? (this.draftCanvas ??= document.createElement('canvas')) : undefined;
    const sheet = bakeServerSheet(resolution, yaw, {
      into,
      lettering: this.options.lettering,
      labels: this.options.labels,
    });
    if (draft && old !== Texture.EMPTY && old.source.resource === sheet) {
      old.source.update();
    } else {
      this.sheet.texture = textureOf(sheet, resolution);
      if (old !== Texture.EMPTY) {
        old.destroy(true);
      }
    }
    const probe = pen({} as CanvasRenderingContext2D, yaw);
    const stale = this.templates;
    this.templates = new Map();
    for (const p of this.pieces) {
      let template = this.templates.get(p.key);
      if (!template) {
        template = this.drawTemplate(p.piece, resolution, yaw, draft);
        this.templates.set(p.key, template);
      }
      // Projection is affine: a piece like the template's stands where its
      // anchor is, the template's drawing moved there.
      const [ax, ay] = probe.screenOfWorld(p.piece.place.at);
      const dx = ax - template.anchor[0];
      const dy = ay - template.anchor[1];
      p.body.texture = template.body;
      p.body.position.set(template.rect.x + dx, template.rect.y + dy);
      p.motions.forEach((sprite) =>
        sprite.position.set(template.rect.x + dx, template.rect.y + dy)
      );
      probe.place(p.piece.place.at, p.piece.place.facing);
      p.box = worldBox(probe, OBJECTS[p.piece.name].footprint);
    }
    destroyTemplates(stale);
    const order = drawOrder(
      this.pieces.map((p) => p.box),
      viewToward(yaw),
      (w) => probe.screenOfWorld(w)
    );
    order.forEach((i, z) => {
      this.pieces[i].node.zIndex = z;
    });
  }

  /**
   * One kind of piece facing one way, and its motions' stills, at a
   * resolution. A draft draws each motion's first still only, and holds it.
   */
  private drawTemplate(
    piece: FloorPiece,
    resolution: number,
    yaw: number,
    draft: boolean
  ): Template {
    const obj = OBJECTS[piece.name];
    const probe = pen({} as CanvasRenderingContext2D, yaw);
    const rect = measure(probe, obj, piece.place, false);
    const anchor = probe.screenOfWorld(piece.place.at);
    const canvasFor = (draw: (k: Iso) => void): Texture => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(rect.w * resolution));
      canvas.height = Math.max(1, Math.ceil(rect.h * resolution));
      const g = styled(canvas.getContext('2d') as CanvasRenderingContext2D);
      g.scale(resolution, resolution);
      const k = pen(g, yaw, [ORIGIN[0] - rect.x, ORIGIN[1] - rect.y]);
      k.place(piece.place.at, piece.place.facing);
      draw(k);
      return textureOf(canvas, resolution);
    };
    const body = canvasFor((k) => drawObject(k, obj, piece.place, false));
    const motions = (obj.motions ?? []).map((motion) => {
      if (draft) {
        const held = canvasFor((k) => motion.draw(k, 0));
        return Array.from({ length: motion.frames }, () => held);
      }
      return Array.from({ length: motion.frames }, (_, frame) =>
        canvasFor((k) => motion.draw(k, frame))
      );
    });
    return { rect, anchor, body, motions };
  }

  destroy(): void {
    destroyTemplates(this.templates);
    this.templates.clear();
    this.root.destroy({ children: true });
  }
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
