import { activeStyle } from './active';
import { RGBA, css, hexOf, parseColor, same } from './color';
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
const MARK = Symbol('agentopia.styled');
/** Where marks go with no face to follow: along the floor's x axis. */
const DEFAULT_ANGLE = 30;

/** The sheet's own fixed colours, which every style names for itself. */
const PAPER = parseColor('#fffdf6');
const PAGE = parseColor('#e3dac6');
const GRID = parseColor('#ece5d4');
const SHADOW = parseColor('#8a7666');

type Faced = CanvasRenderingContext2D & { [FACE]?: number; [MARK]?: true };

const proto: CanvasRenderingContext2D | null =
  typeof CanvasRenderingContext2D === 'undefined' ? null : CanvasRenderingContext2D.prototype;

function descriptor(name: string): PropertyDescriptor | undefined {
  return proto ? Object.getOwnPropertyDescriptor(proto, name) : undefined;
}

/** A style's plain colour for `c`: its tint, or its fill if that is a colour. */
export function tintOf(style: RenderStyle, c: RGBA): string {
  if (same(c, PAPER) || same(c, PAGE)) {
    return style.paper;
  }
  if (same(c, GRID)) {
    return style.grid;
  }
  if (same(c, SHADOW) && style.shadow) {
    return style.shadow;
  }
  return style.tint ? style.tint(c) : css(c);
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
  if (same(c, PAPER) || same(c, PAGE)) {
    return style.paper;
  }
  if (same(c, GRID)) {
    return style.grid;
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
  return style.stroke(c, hint, paintsFor(ctx)) ?? 'rgba(0,0,0,0)';
}

/** Teach a 2D context to draw in the active style. Safe to call twice, and on anything. */
export function styled<T extends CanvasRenderingContext2D | null | undefined>(ctx: T): T {
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
  const stack: Array<[RGBA | null, RGBA | null, number]> = [];
  const hint = (seam: boolean): Hint => ({ angle: self[FACE] ?? DEFAULT_ANGLE, seam, last: fill });

  Object.defineProperty(self, 'fillStyle', {
    configurable: true,
    get(): unknown {
      return fillD.get?.call(this);
    },
    set(v: unknown) {
      const style = activeStyle();
      const c = typeof v === 'string' ? parseColor(v) : null;
      fill = c;
      fillD.set?.call(this, c && style.id !== 'cartoon' ? mapFill(self, style, c, hint(false)) : v);
    },
  });
  Object.defineProperty(self, 'strokeStyle', {
    configurable: true,
    get(): unknown {
      return strokeD.get?.call(this);
    },
    set(v: unknown) {
      const style = activeStyle();
      const c = typeof v === 'string' ? parseColor(v) : null;
      stroke = c;
      strokeD.set?.call(
        this,
        c && style.id !== 'cartoon' ? mapStroke(self, style, c, hint(same(c, fill))) : v
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
  const linear = proto.createLinearGradient;
  const radial = proto.createRadialGradient;
  self.save = function (): void {
    stack.push([fill, stroke, width]);
    save.call(this);
  };
  self.restore = function (): void {
    const top = stack.pop();
    if (top) {
      [fill, stroke, width] = top;
    }
    restore.call(this);
  };
  self.fillText = function (text: string, x: number, y: number, max?: number): void {
    const style = activeStyle();
    if (style.id === 'cartoon' || !style.letter || !fill) {
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
      const style = activeStyle();
      const c = parseColor(color);
      add(offset, c && style.id !== 'cartoon' ? tintOf(style, c) : color);
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
