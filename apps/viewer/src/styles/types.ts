import { RGBA } from './color';

/**
 * A drawing style: how the office's drawings are rendered, never what they
 * are. Objects, characters and the room keep their geometry and materials;
 * a style only decides what each fill and line the canvas is asked for turns
 * into (`fill`, `stroke`, `text`), how the pen holds its line (`sheen`,
 * `wobble`, `ink`, `sketch`), and an optional finish laid over the whole
 * office on the GPU (`finish`).
 */
export interface RenderStyle {
  readonly id: string;
  /** As the settings card letters it. */
  readonly label: string;
  /** The sheet's paper, its construction grid, and the page round it. */
  readonly paper: string;
  readonly grid: string;
  /** Dark paper: page text (the title, the corners) is lettered light. */
  readonly dark?: boolean;
  /**
   * A style without colour: what the office shows on its screens (the cost
   * board's tally, like the monitors) keeps its own colours (see `plain`).
   */
  readonly mono?: boolean;
  /** Light lettering on dark paper, or dark on light: the page's text. */
  readonly text?: string;
  /** Multipliers on the pen: its sheen (graded light), its wobble, its line weight. */
  readonly sheen?: number;
  readonly wobble?: number;
  readonly ink?: number;
  /** A sketchy line: each run overshoots its ends, and a fainter ghost line rides beside it. */
  readonly sketch?: { overshoot: number; ghost: number };
  /** What a fill of colour `c` becomes. */
  fill?(c: RGBA, hint: Hint, paints: Paints): Paint;
  /** What a line of colour `c` becomes; null draws no line. */
  stroke?(c: RGBA, hint: Hint, paints: Paints): Paint | null;
  /** What lettering of colour `c` becomes. */
  letter?(c: RGBA): string;
  /** A plain colour for `c`, where only a colour will do: gradient stops, and what Pixi draws. */
  tint?(c: RGBA): string;
  /**
   * The ink a figure's face is drawn in (eyes, mouths, noses), so it reads on
   * the figure's body in this style; the style's lettering ink if unset.
   */
  readonly features?: string;
  /** A cast shadow's colour. */
  shadow?: string;
  /** The finish laid over the whole office: a GLSL `vec4 look(vec2 s)` (see `finish.ts`). */
  readonly finish?: string;
}

/** Anything a canvas can paint with. */
export type Paint = string | CanvasGradient | CanvasPattern;

/** What a style knows about the fill or line it is asked for. */
export interface Hint {
  /** Which way to lay hatching or strokes across the face, in screen degrees. */
  angle: number;
  /** A hairline drawn in the face's own colour to close seams between faces. */
  seam: boolean;
  /** The last fill's colour, as drawn: what an outline that follows it outlines. */
  last: RGBA | null;
  /** Drawn on a figure (an avatar, the human, a pet) rather than the room. */
  figure: boolean;
}

/** Patterns, made once per canvas and laid at an angle. */
export interface Paints {
  /** Parallel lines (crossed with `cross`), on a ground or on nothing. */
  hatch(o: {
    ground?: string;
    ink: string;
    gap: number;
    width: number;
    angle: number;
    cross?: boolean;
  }): Paint;
  /** A material made by hand: toothy paper. */
  texture(kind: TextureKind, base: string, angle: number, ground?: string): Paint;
}

export type TextureKind = 'tooth';
