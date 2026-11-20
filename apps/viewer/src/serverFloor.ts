import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';

import {
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
import { Box3, Iso, V2, drawOrder, viewToward } from './kit/iso';
import { OBJECTS } from './objects';
import { Rect, drawObject, measure, partsFor, worldBox } from './objects/bake';
import { RACK_SIDES, RackSide, doorOpen, rackParts } from './objects/serverRack';
import { PieceState } from './objects/types';
import { ORIGIN, PIVOT, TILE } from './room';
import { FloorPiece, SERVER_PIECES, bakeServerSheet, sideToward } from './serverRoom';
import { styled } from './styles';

/**
 * The server floor, drawn: its sheet, and every piece on it as a sprite of
 * its own, sorted by footprint (again whenever a door swings, since an open
 * door stands out in its aisle).
 *
 * Every rack of a kind facing one way looks the same from a given view, and
 * an isometric view only moves a drawing about the page, so each kind is
 * drawn once per facing (a template) and every piece of it shows that one
 * drawing where it stands. The moving parts — blinking lights, spinning fans
 * — are each a loop of stills drawn the same way, and each piece plays its
 * loops from its own beat, so no two racks blink together. Time is the
 * renderer's clock, handed in.
 *
 * A rack's two glass doors are parts of their own, so its body stays shared:
 * a door at rest, shut or open, is a template too, and only a door mid-swing
 * is drawn for its rack alone, frame by frame. The stairwell door is drawn
 * for itself, as it stands. A click swings a door (`tap`), eased and kept in
 * the viewer's browser apart from the office's pieces.
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

/** One separately sorted group of sprites: a piece's body, or one of a rack's doors. */
interface Shown {
  node: Container;
  sprite: Sprite;
  box: Box3;
  /** What it shows, for hit tests, and where that canvas's corner is on the sheet. */
  canvas: HTMLCanvasElement | null;
  /** A drawing this group owns (mid-swing), rather than a shared template: freed when replaced. */
  own: Texture | null;
}

interface Door extends Shown {
  side: RackSide;
}

/** One piece on the floor: its body and its moving parts, and a rack's doors. */
interface Piece {
  piece: FloorPiece;
  /** Its state's key, by kind and spot. */
  key: string;
  body: Shown;
  motions: Sprite[];
  doors: Door[];
}

/** A piece of the floor under a point, and which of a rack's doors that is. */
export interface FloorHit {
  piece: FloorPiece;
  key: string;
  side: RackSide;
  interaction: Toggle | undefined;
}

function textureOf(canvas: HTMLCanvasElement, resolution: number): Texture {
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution }) });
}

function pen(ctx: CanvasRenderingContext2D, yaw: number, origin: V2 = ORIGIN): Iso {
  return new Iso(ctx, { unit: TILE, origin, yaw, pivot: PIVOT });
}

/** A field's value at rest, or null while it eases between. */
const rest = (v: number): string | null => (v === 0 || v === 1 ? String(v) : null);

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
  /** Pieces whose shadow on the sheet waits for them to come to rest. */
  private settling = new Set<string>();

  constructor(private readonly options: ServerFloorOptions) {
    this.layer.sortableChildren = true;
    this.root.addChild(this.sheet, this.layer);
    const group = (): Shown => {
      const node = new Container();
      const sprite = new Sprite();
      node.addChild(sprite);
      this.layer.addChild(node);
      return { node, sprite, box: emptyBox(), canvas: null, own: null };
    };
    this.pieces = SERVER_PIECES.map((piece) => {
      const body = group();
      const motions = (OBJECTS[piece.name].motions ?? []).map(() => {
        const sprite = new Sprite();
        body.node.addChild(sprite);
        return sprite;
      });
      const doors = isRack(piece.name) ? RACK_SIDES.map((side) => ({ ...group(), side })) : [];
      return { piece, key: pieceKey(piece), body, motions, doors };
    });
  }

  /**
   * Bring the floor up to date for this frame: redraw it if the view has
   * turned (quickly while a drag turns it, properly when it stops) or the
   * zoom has settled at a new resolution, swing whatever doors are on the
   * move, and step every moving part to its still for `at`. Says whether it
   * was drawn afresh, which takes a moment.
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
    this.swing(at);
    this.step(at);
    return baked;
  }

  /** Draw it all again at once, as it is: a new drawing style. */
  redraw(): void {
    if (this.bakedAt > 0) {
      this.bake(this.bakedAt, this.bakedYaw, false);
    }
  }

  /** The piece drawn on top at a sheet point, if any, and the door a click there would swing. */
  pieceAt(x: number, y: number): FloorHit | null {
    if (this.drafting || this.bakedAt === 0) {
      return null;
    }
    const groups: Array<{ shown: Shown; piece: Piece; side?: RackSide }> = [];
    for (const piece of this.pieces) {
      groups.push({ shown: piece.body, piece });
      for (const door of piece.doors) {
        groups.push({ shown: door, piece, side: door.side });
      }
    }
    groups.sort((a, b) => b.shown.node.zIndex - a.shown.node.zIndex);
    for (const { shown, piece, side } of groups) {
      const canvas = shown.canvas;
      if (!canvas) {
        continue;
      }
      const px = Math.floor((x - shown.sprite.x) * this.bakedAt);
      const py = Math.floor((y - shown.sprite.y) * this.bakedAt);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
        continue;
      }
      const facing = side ?? sideToward(piece.piece, this.bakedYaw);
      const interaction = floorInteraction(piece.piece.name, facing);
      const alpha = alphaAt(canvas, px, py);
      // A door is hit wherever it shows, its glass included; scenery only where it is solid.
      if (alpha > (interaction ? 40 : 200)) {
        return { piece: piece.piece, key: piece.key, side: facing, interaction };
      }
    }
    return null;
  }

  /** What a click at a sheet point would do, said on hover; null over nothing to do. */
  hintAt(x: number, y: number): string | null {
    const hit = this.pieceAt(x, y);
    if (!hit?.interaction) {
      return null;
    }
    return hit.interaction.hint(isOn(this.stateNow(hit.key), hit.interaction));
  }

  /** A click at a sheet point: swing the door there, if there is one. Says whether it did. */
  tap(x: number, y: number): boolean {
    const hit = this.pieceAt(x, y);
    if (!hit?.interaction) {
      return false;
    }
    this.store.set(hit.key, toggled(this.stateNow(hit.key), hit.interaction));
    if (hit.interaction.sheet) {
      this.settling.add(hit.key);
    }
    return true;
  }

  /** A piece's state as set, over how it is drawn now. */
  private stateNow(key: string): PieceState {
    return { ...this.store.get(key), ...this.store.wanted(key) };
  }

  /** Ease every door toward where it was set, and redraw the ones that moved. */
  private swing(at: number): void {
    const dt = this.lastAt === null ? 0 : Math.min(100, Math.max(0, at - this.lastAt));
    this.lastAt = at;
    const moved = new Set(
      this.store.step(dt, new Map(), (_key, field) => (field === 'open' ? 1 : 0))
    );
    if (moved.size > 0 && this.bakedAt > 0) {
      for (const p of this.pieces) {
        if (moved.has(p.key)) {
          this.showPiece(p);
        }
      }
      this.sort();
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

  /** Show each piece's moving parts at their stills for `at`. */
  private step(at: number): void {
    for (const p of this.pieces) {
      const template = this.templates.get(this.bodyKey(p));
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
      this.showPiece(p);
    }
    destroyTemplates(stale);
    this.sort();
  }

  /** Sort every body and door by its footprint, from the view as baked. */
  private sort(): void {
    const groups = this.pieces.flatMap((p) => [p.body, ...p.doors]);
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    const order = drawOrder(
      groups.map((g) => g.box),
      viewToward(this.bakedYaw),
      (w) => probe.screenOfWorld(w)
    );
    order.forEach((i, z) => {
      groups[i].node.zIndex = z;
    });
  }

  /** The shared drawing a piece's body shows, by kind, facing and (for the stairwell door) how open. */
  private bodyKey(p: Piece): string {
    const { name, place } = p.piece;
    const base = `${name}|${place.facing ?? '+y'}`;
    if (isRack(name)) {
      return `${base}|body`;
    }
    if (floorInteraction(name, 'front')) {
      const at = rest(frac(this.store.get(p.key).open, 1));
      return at === null ? '' : `${base}|${at}`;
    }
    return base;
  }

  /** Draw a piece's body and doors as its state stands now, and refit their boxes. */
  private showPiece(p: Piece): void {
    const state = this.store.get(p.key);
    const obj = OBJECTS[p.piece.name];
    const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
    probe.place(p.piece.place.at, p.piece.place.facing);
    const parts = isRack(p.piece.name) ? rackParts(state) : partsFor(obj, state);
    this.show(p.body, p, this.bodyKey(p) || null, state, isRack(p.piece.name) ? 'body' : undefined);
    const print = parts?.find((part) => part.name === 'body')?.footprint ?? obj.footprint;
    p.body.box = worldBox(probe, print);
    const template = this.templates.get(this.bodyKey(p));
    p.motions.forEach((sprite) => {
      sprite.position.copyFrom(p.body.sprite.position);
      sprite.visible = template !== undefined;
    });
    for (const door of p.doors) {
      const open = doorOpen(state, door.side);
      const at = rest(open);
      const key =
        at === null ? null : `rackDoor|${p.piece.place.facing ?? '+y'}|${door.side}|${at}`;
      this.show(door, p, key, state, door.side);
      const footprint = parts?.find((part) => part.name === door.side)?.footprint;
      if (footprint) {
        door.box = worldBox(probe, footprint);
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
    p: Piece,
    key: string | null,
    state: PieceState,
    part: string | undefined
  ): void {
    const old = group.own;
    if (key !== null) {
      let template = this.templates.get(key);
      if (!template) {
        template = this.drawTemplate(p.piece, state, part, part === undefined || part === 'body');
        this.templates.set(key, template);
      }
      // Projection is affine: a piece like the template's stands where its
      // anchor is, the template's drawing moved there.
      const probe = pen({} as CanvasRenderingContext2D, this.bakedYaw);
      const [ax, ay] = probe.screenOfWorld(p.piece.place.at);
      group.sprite.texture = template.body;
      group.sprite.position.set(
        template.rect.x + ax - template.anchor[0],
        template.rect.y + ay - template.anchor[1]
      );
      group.canvas = template.canvas;
      group.own = null;
    } else {
      const drawn = this.drawTemplate(p.piece, state, part, false);
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
   * A piece (or one part of it) drawn where it stands, as its state stands,
   * and its motions' stills when it has any and `withMotions`. A draft draws
   * each motion's first still only, and holds it.
   */
  private drawTemplate(
    piece: FloorPiece,
    state: PieceState,
    part: string | undefined,
    withMotions: boolean
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
    const body = canvasFor((k) => drawObject(k, obj, piece.place, false, state, part));
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
      for (const group of [p.body, ...p.doors]) {
        group.own?.destroy(true);
        group.own = null;
      }
    }
    this.root.destroy({ children: true });
  }
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

/** A stored fraction, or its default. */
const frac = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);

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
