import { activeStyle } from './active';
import { RGBA, css, hexOf, lum, parseColor, same, toHsl } from './color';
import { paintsFor } from './paints';
import { Hint, Paint, RenderStyle } from './types';

/**
 * Where a style meets the drawings: a 2D context, taught to hand every colour
 * it is given to the style in force before it paints with it.
 *
 * The office's drawings set `fillStyle` and `strokeStyle` and call `fill`,
 * `stroke` and `fillText` as any canvas drawing does. `styled` replaces those
 * few properties on one context instance (its prototype is untouched), so a
 * colour set is mapped through the active style's `fill`, `stroke` or
 * `letter` on its way in, a line's weight is scaled by its `ink`, and a
 * gradient's stops are tinted. The drawing code never knows. In the house
 * style every mapping is the identity.
 *
 * The pen tells the context which way the face it is filling is turned
 * (`FACE`), so hatching and brush strokes can follow the faces.
 */

/** Set on a context by the pen while it fills a face: the angle, in screen degrees, to lay marks at. */
export const FACE = Symbol('agentopia.face');
/** Set on a context by the pen while it draws the ground everything stands on. */
export const GROUND = Symbol('agentopia.ground');
const MARK = Symbol('agentopia.styled');
/** Set while `plain` draws: colours pass through as asked. */
const PLAIN = Symbol('agentopia.plain');
/** Set while a face is drawn: its ink and catchlights take the style's face colours. */
const FEATURES = Symbol('agentopia.features');
/** Set while `solid` draws: lines stay whole in a style whose brush breaks them. */
const SOLID = Symbol('agentopia.solid');
/** Where marks go with no face to follow: along the floor's x axis. */
const DEFAULT_ANGLE = 30;

/** The sheet's own fixed colours, which every style names for itself. */
const PAPER = parseColor('#fffdf6');
const PAGE = parseColor('#e3dac6');
const GRID = parseColor('#ece5d4');
const SHADOW = parseColor('#8a7666');

type Faced = CanvasRenderingContext2D & {
  [FACE]?: number;
  [GROUND]?: true;
  [MARK]?: true;
  [PLAIN]?: true;
  [FEATURES]?: true;
  [SOLID]?: true;
};

const HOUSE_INK: RGBA = [43, 41, 48, 1];

const proto: CanvasRenderingContext2D | null =
  typeof CanvasRenderingContext2D === 'undefined' ? null : CanvasRenderingContext2D.prototype;

function descriptor(name: string): PropertyDescriptor | undefined {
  return proto ? Object.getOwnPropertyDescriptor(proto, name) : undefined;
}

/** A colour as drawn, carrying the alpha the drawing asked for. */
function withAlpha(color: string, alpha: number): string {
  if (alpha >= 1) {
    return color;
  }
  const c = parseColor(color);
  return c ? css([c[0], c[1], c[2], c[3] * alpha]) : color;
}

/** A style's plain colour for `c`, at `c`'s own alpha. */
export function tintOf(style: RenderStyle, c: RGBA): string {
  return withAlpha(plainOf(style, c), c[3]);
}

function plainOf(style: RenderStyle, c: RGBA): string {
  if (same(c, PAPER) || same(c, PAGE)) {
    return style.paper;
  }
  if (same(c, GRID)) {
    return style.grid;
  }
  if (same(c, SHADOW) && style.shadow) {
    return style.shadow;
  }
  const opaque: RGBA = [c[0], c[1], c[2], 1];
  return style.tint ? style.tint(opaque) : css(opaque);
}

/** A CSS colour as the active style would draw it, as a plain colour. */
export function styleColor(color: string): string {
  const style = activeStyle();
  const c = parseColor(color);
  return c && style.id !== 'cartoon' ? tintOf(style, c) : color;
}

/** A CSS colour as the active style would draw it, as a number for Pixi. */
export function styleHex(color: string): number {
  const c = parseColor(styleColor(color));
  return c ? hexOf(c) : 0;
}

function mapFill(ctx: CanvasRenderingContext2D, style: RenderStyle, c: RGBA, hint: Hint): Paint {
  // A see-through wash (light, shade, a glaze) stays a wash: a plain colour at its own alpha.
  if (c[3] < 1) {
    return tintOf(style, c);
  }
  if (same(c, PAPER) || same(c, PAGE)) {
    return style.paper;
  }
  if (same(c, GRID)) {
    return style.grid;
  }
  if (same(c, SHADOW) && style.shade) {
    return style.shade(paintsFor(ctx));
  }
  if (same(c, SHADOW) && style.shadow) {
    return style.shadow;
  }
  return style.fill ? style.fill(c, hint, paintsFor(ctx)) : css(c);
}

function mapStroke(ctx: CanvasRenderingContext2D, style: RenderStyle, c: RGBA, hint: Hint): Paint {
  if (same(c, GRID)) {
    return style.grid;
  }
  if (hint.seam) {
    return mapFill(ctx, style, c, hint);
  }
  if (!style.stroke) {
    return css(c);
  }
  const out = style.stroke([c[0], c[1], c[2], 1], hint, paintsFor(ctx));
  if (out === null) {
    return 'rgba(0,0,0,0)';
  }
  return typeof out === 'string' ? withAlpha(out, c[3]) : out;
}

/**
 * Draw `fn` with its colours as asked, in a style without colour: what a
 * screen shows (the cost board's tally) stays in colour, like the monitors.
 */
export function plain<T>(ctx: CanvasRenderingContext2D, fn: () => T): T {
  const self = ctx as Faced;
  if (!activeStyle().mono || self[PLAIN]) {
    return fn();
  }
  self[PLAIN] = true;
  try {
    return fn();
  } finally {
    delete self[PLAIN];
  }
}

/**
 * Draw a face with `fn`: its near-black ink (eyes, mouths, noses) takes the
 * style's face ink and its near-white catchlights the opposite, so the
 * features read on the body whatever the style made of it. Its other
 * colours (cheeks, tongues, lids in the body's colour) map as usual.
 */
export function features<T>(ctx: CanvasRenderingContext2D, fn: () => T): T {
  const self = ctx as Faced;
  if (self[FEATURES]) {
    return fn();
  }
  self[FEATURES] = true;
  try {
    return fn();
  } finally {
    delete self[FEATURES];
  }
}

/**
 * Draw `fn` with whole lines, in a style whose brush breaks lines into dashes:
 * for marks that are already a brush's own (the pen's blots of ink).
 */
export function solid<T>(ctx: CanvasRenderingContext2D, fn: () => T): T {
  const self = ctx as Faced;
  if (self[SOLID]) {
    return fn();
  }
  self[SOLID] = true;
  try {
    return fn();
  } finally {
    delete self[SOLID];
  }
}

/** A face's ink or catchlight in a style, or null for a colour that maps as usual. */
function featureOf(style: RenderStyle, c: RGBA): string | null {
  if (c[3] < 1) {
    return null;
  }
  const l = lum(c);
  const [, s] = toHsl(c);
  if (l >= 0.3 && !(l > 0.9 && s < 0.3)) {
    return null;
  }
  const ink = style.features ?? (style.letter ? style.letter(HOUSE_INK) : css(HOUSE_INK));
  if (l < 0.3) {
    return ink;
  }
  const inkC = parseColor(ink);
  return inkC && lum(inkC) > 0.5 ? style.paper : '#fffdf6';
}

/**
 * Teach a 2D context to draw in the active style. Safe to call twice, and on
 * anything. `figure` marks a canvas a figure is drawn on (an avatar, the
 * human, a pet), which some styles treat apart from the room.
 */
export function styled<T extends CanvasRenderingContext2D | null | undefined>(
  ctx: T,
  options: { figure?: boolean } = {}
): T {
  if (!ctx || !proto || !(ctx instanceof CanvasRenderingContext2D) || (ctx as Faced)[MARK]) {
    return ctx;
  }
  const fillD = descriptor('fillStyle');
  const strokeD = descriptor('strokeStyle');
  const widthD = descriptor('lineWidth');
  if (!fillD?.set || !fillD.get || !strokeD?.set || !strokeD.get || !widthD?.set) {
    return ctx;
  }
  const self = ctx as Faced;
  // What the drawing asked for, before the style had its say.
  let fill: RGBA | null = null;
  let stroke: RGBA | null = null;
  let width = 1;
  /** Whether the line set now closes a seam (a face's own colour), which a dry brush leaves whole. */
  let seamLine = false;
  const stack: Array<[RGBA | null, RGBA | null, number, boolean]> = [];
  const figure = options.figure === true;
  const hint = (seam: boolean): Hint => ({
    angle: self[FACE] ?? DEFAULT_ANGLE,
    seam,
    last: fill,
    figure,
    ground: self[GROUND] === true,
  });
  /** The style to draw in now: none while `plain` draws. */
  const styleNow = (): RenderStyle | null => {
    const style = activeStyle();
    return style.id === 'cartoon' || self[PLAIN] ? null : style;
  };

  Object.defineProperty(self, 'fillStyle', {
    configurable: true,
    get(): unknown {
      return fillD.get?.call(this);
    },
    set(v: unknown) {
      const style = styleNow();
      const c = typeof v === 'string' ? parseColor(v) : null;
      fill = c;
      const face = c && style && self[FEATURES] ? featureOf(style, c) : null;
      fillD.set?.call(this, face ?? (c && style ? mapFill(self, style, c, hint(false)) : v));
    },
  });
  Object.defineProperty(self, 'strokeStyle', {
    configurable: true,
    get(): unknown {
      return strokeD.get?.call(this);
    },
    set(v: unknown) {
      const style = styleNow();
      const c = typeof v === 'string' ? parseColor(v) : null;
      stroke = c;
      // A pattern or gradient set as a line is a face's own paint, closing its seam.
      seamLine = typeof v !== 'string' || same(c, fill);
      const face = c && style && self[FEATURES] ? featureOf(style, c) : null;
      strokeD.set?.call(
        this,
        face ?? (c && style ? mapStroke(self, style, c, hint(same(c, fill))) : v)
      );
    },
  });
  Object.defineProperty(self, 'lineWidth', {
    configurable: true,
    get(): number {
      return width;
    },
    set(v: number) {
      width = v;
      widthD.set?.call(this, v * (activeStyle().ink ?? 1));
    },
  });
  const save = proto.save;
  const restore = proto.restore;
  const fillText = proto.fillText;
  const strokePath = proto.stroke as (this: CanvasRenderingContext2D, path: Path2D) => void;
  const strokeNow = proto.stroke as (this: CanvasRenderingContext2D) => void;
  const draw = (c: CanvasRenderingContext2D, path?: Path2D): void =>
    path ? strokePath.call(c, path) : strokeNow.call(c);
  self.stroke = function (path?: Path2D): void {
    const brush = styleNow()?.brush;
    // A figure keeps its lines whole: it is small, redrawn every frame, and has to read.
    if (!brush || figure || seamLine || self[SOLID] || typeof this.setLineDash !== 'function') {
      draw(this, path);
      return;
    }
    // A dry brush: the line breaks where the ink ran out, in lengths of its own weight.
    const w = Math.max(0.5, this.lineWidth * (activeStyle().ink ?? 1));
    const was = this.getLineDash();
    const offset = this.lineDashOffset;
    this.setLineDash(brush.dash.map((d) => d * w));
    this.lineDashOffset = w * 1.7;
    draw(this, path);
    this.setLineDash(was);
    this.lineDashOffset = offset;
  };
  const linear = proto.createLinearGradient;
  const radial = proto.createRadialGradient;
  self.save = function (): void {
    stack.push([fill, stroke, width, seamLine]);
    save.call(this);
  };
  self.restore = function (): void {
    const top = stack.pop();
    if (top) {
      [fill, stroke, width, seamLine] = top;
    }
    restore.call(this);
  };
  self.fillText = function (text: string, x: number, y: number, max?: number): void {
    const style = styleNow();
    if (!style?.letter || !fill) {
      fillText.call(this, text, x, y, max);
      return;
    }
    const was = fillD.get?.call(this);
    fillD.set?.call(this, style.letter(fill));
    fillText.call(this, text, x, y, max);
    fillD.set?.call(this, was);
  };
  const tinted = (g: CanvasGradient): CanvasGradient => {
    const add = g.addColorStop.bind(g);
    g.addColorStop = (offset: number, color: string): void => {
      const style = styleNow();
      const c = parseColor(color);
      add(offset, c && style ? tintOf(style, c) : color);
    };
    return g;
  };
  self.createLinearGradient = function (
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): CanvasGradient {
    return tinted(linear.call(this, x0, y0, x1, y1));
  };
  self.createRadialGradient = function (
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): CanvasGradient {
    return tinted(radial.call(this, x0, y0, r0, x1, y1, r1));
  };
  self[MARK] = true;
  return ctx;
}
