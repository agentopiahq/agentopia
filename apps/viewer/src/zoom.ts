import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';

/**
 * The office's camera controls: zoom, pan and turn.
 *
 * At zoom 1 the camera frames the sheet itself (the whole office when the
 * window is wide enough). Dragging the office with the left button pans the
 * view; a right-button drag (or a middle or Shift drag, for a trackpad) turns
 * it round, like a model on a turntable; the wheel zooms about the cursor. A
 * press that never moves further than `TAP_SLOP` is a tap, not a drag: it
 * turns nothing, and goes to `onTap`, so the office can hand it to whatever
 * object is under it.
 *
 * Bottom right, one row for each of the three — a little mouse lighting the
 * part it uses, the words, and buttons that do the same by clicking: four
 * arrows that pan, two that turn an eighth of a turn, − and + that step the
 * zoom — and under them reset, which puts zoom, pan and turn all back. Keys
 * work too: `+`/`=` and `-` zoom, the arrow keys turn, `0` resets.
 */

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 4;
/** Each press multiplies or divides the zoom by this much. */
export const ZOOM_STEP = 1.25;
/** A turn button's step, and the arrow keys', in radians. */
const TURN_STEP = Math.PI / 4;
const KEY_TURN = Math.PI / 12;
/** How far a drag turns the office per pixel, in radians. */
const DRAG_TURN = 0.008;
/** Which part of the mouse a tip's icon lights: a button held, or the wheel. */
export type MousePart = 'left' | 'right' | 'wheel';

/**
 * The camera controls' rows: what each does, the part of a mouse that does it
 * (drawn beside the words when there is a mouse), and what touch says instead.
 */
export const CAMERA_TIPS = [
  { part: 'left', text: 'move', touch: 'move' },
  { part: 'right', text: 'rotate', touch: 'rotate' },
  { part: 'wheel', text: 'zoom', touch: 'zoom' },
] as ReadonlyArray<{ part: MousePart; text: string; touch: string }>;

/** How far a pan button moves the view, as a share of the view's own size. */
export const PAN_STEP = 0.2;

/** The sheet point to centre on after a pan button: `dx`, `dy` are −1, 0 or 1. */
export function panBy(
  centre: Point,
  dx: number,
  dy: number,
  view: { w: number; h: number },
  scale: number
): Point {
  return {
    x: centre.x + (dx * view.w * PAN_STEP) / scale,
    y: centre.y + (dy * view.h * PAN_STEP) / scale,
  };
}

/** How fast the wheel zooms: the zoom scales by e^(−deltaY × this), per pixel of scroll. */
const WHEEL_ZOOM = 0.0015;

/**
 * The zoom after a wheel turn of `deltaY` pixels (down zooms out), clamped,
 * so a mouse's notches and a trackpad's glide both zoom smoothly.
 */
export function wheelZoom(zoom: number, deltaY: number): number {
  const next = zoom * Math.exp(-deltaY * WHEEL_ZOOM);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

/**
 * Where a zoom from `scale` to `next` should centre, so the sheet point under
 * the cursor (`offset` from the view's middle, in screen pixels) stays put.
 */
export function zoomAbout(centre: Point, offset: Point, scale: number, next: number): Point {
  return {
    x: centre.x + offset.x / scale - offset.x / next,
    y: centre.y + offset.y / scale - offset.y / next,
  };
}

/**
 * Whether a press turns the office rather than panning the view: the right
 * button, or the middle one, or Shift with any (a trackpad has no right drag).
 */
export const turnsOffice = (e: { button: number; shiftKey: boolean }): boolean =>
  e.button === 2 || e.button === 1 || e.shiftKey;

/** How far a press may wander, in pixels, and still be a tap. */
export const TAP_SLOP = 5;

/** Whether a press that moved from `a` to `b` has become a drag. */
export const isDrag = (a: Point, b: Point): boolean => Math.hypot(b.x - a.x, b.y - a.y) > TAP_SLOP;

/** Whether a key press belongs to a text field rather than the office. */
export function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el &&
    (el.isContentEditable ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT')
  );
}

/** A yaw folded into (-π, π], with the home view exactly 0. */
export function normalizeYaw(yaw: number): number {
  let y = yaw % (Math.PI * 2);
  if (y > Math.PI) {
    y -= Math.PI * 2;
  } else if (y <= -Math.PI) {
    y += Math.PI * 2;
  }
  return Math.abs(y) < 1e-9 ? 0 : y;
}

export interface Point {
  x: number;
  y: number;
}

/** The next zoom after a press, clamped, snapping to 1 when it passes through it. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const next = direction > 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP;
  if (Math.abs(next - 1) < 0.02) {
    return 1;
  }
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

/**
 * Where to centre along one axis: the sheet's middle when it fits, otherwise
 * `want` clamped so the view never runs off the sheet's edge.
 */
export function centreOn(want: number, sheet: number, view: number, scale: number): number {
  const half = view / 2 / scale;
  if (sheet * scale <= view) {
    return sheet / 2;
  }
  return Math.min(sheet - half, Math.max(half, want));
}

export class ZoomState {
  zoom = 1;
  /** The sheet point a panned view centres on; null lets the camera choose. */
  focus: Point | null = null;
  /** How far the office is turned from its home view, in radians. */
  yaw = 0;
  /** True while a drag is moving the view, so the camera follows it exactly. */
  dragging = false;
  /** True while a drag is turning the office: the art redraws quickly, then properly. */
  turning = false;
  /** A press that stayed put: the office's objects get first refusal. */
  onTap: ((e: PointerEvent) => void) | null = null;
  /** The pointer moving with no press down (null when it leaves): for hover hints. */
  onHover: ((e: PointerEvent | null) => void) | null = null;
  /** A press has just become a drag. */
  onDragStart: (() => void) | null = null;
  private readonly el: HTMLElement;
  private readonly host: HTMLElement;
  private readonly minus: HTMLButtonElement;
  private readonly plus: HTMLButtonElement;
  private readonly reset: HTMLButtonElement;
  private readonly left: HTMLButtonElement;
  private readonly right: HTMLButtonElement;

  /**
   * @param host the element the office's canvas lives in
   * @param view the camera right now: its scale and the sheet point at the
   *   middle of the view, so zooming keeps that point in place
   */
  constructor(
    host: HTMLElement,
    private readonly view: () => { scale: number; centre: Point }
  ) {
    this.host = host;
    const pan = (label: string, icon: string, dx: number, dy: number): HTMLButtonElement =>
      controlButton(icon, label, () => this.pan(dx, dy));
    const rows: HTMLButtonElement[][] = [
      [
        pan('Move left', ICON.left, -1, 0),
        pan('Move up', ICON.up, 0, -1),
        pan('Move down', ICON.down, 0, 1),
        pan('Move right', ICON.right, 1, 0),
      ],
      [
        (this.left = controlButton(ICON.turnLeft, 'Turn left', () => this.turn(TURN_STEP))),
        (this.right = controlButton(ICON.turnRight, 'Turn right', () => this.turn(-TURN_STEP))),
      ],
      [
        (this.minus = controlButton(ICON.minus, 'Zoom out', () => this.step(-1))),
        (this.plus = controlButton(ICON.plus, 'Zoom in', () => this.step(1))),
      ],
    ];
    this.reset = controlButton('reset', 'Reset view', () => this.resetView(), true);
    this.el = makePanel(rows, this.reset);
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    host.append(this.el);
    this.listen(host);
    this.refresh();
  }

  /** Pan the view by a pan button's step: `dx`, `dy` are −1, 0 or 1. */
  pan(dx: number, dy: number): void {
    const { scale, centre } = this.view();
    this.focus = panBy(
      centre,
      dx,
      dy,
      { w: this.host.clientWidth, h: this.host.clientHeight },
      scale
    );
    this.refresh();
  }

  step(direction: 1 | -1): void {
    const next = stepZoom(this.zoom, direction);
    if (next === this.zoom) {
      return;
    }
    // Hold the middle of the view still while the zoom changes.
    this.focus = { ...this.view().centre };
    this.zoom = next;
    if (this.zoom === 1) {
      this.focus = null;
    }
    this.refresh();
  }

  /** Turn the office by `by` radians, counter-clockwise seen from above. */
  turn(by: number): void {
    this.yaw = normalizeYaw(this.yaw + by);
    this.refresh();
  }

  resetView(): void {
    this.zoom = 1;
    this.focus = null;
    this.yaw = 0;
    this.refresh();
  }

  private refresh(): void {
    this.minus.disabled = this.zoom <= ZOOM_MIN;
    this.plus.disabled = this.zoom >= ZOOM_MAX;
    this.reset.disabled = this.zoom === 1 && this.focus === null && this.yaw === 0;
  }

  /** Drag to pan (right, middle or Shift drag to turn), the wheel, taps, and the keys. */
  private listen(host: HTMLElement): void {
    let down: Point | null = null;
    let last: Point | null = null;
    let panning = false;
    let captured: Element | null = null;
    host.addEventListener('contextmenu', (e) => e.preventDefault());
    // The wheel (and a trackpad's pinch, which arrives as a wheel) zooms about the cursor.
    host.addEventListener(
      'wheel',
      (e) => {
        if (e.target !== host && !(e.target instanceof HTMLCanvasElement)) {
          return;
        }
        e.preventDefault();
        // Lines and pages (some mice) count as a notch's worth of pixels.
        const deltaY = e.deltaMode === 0 ? e.deltaY : e.deltaY * 40;
        const next = wheelZoom(this.zoom, deltaY);
        if (next === this.zoom) {
          return;
        }
        const { scale, centre } = this.view();
        const box = host.getBoundingClientRect();
        const offset = {
          x: e.clientX - box.left - box.width / 2,
          y: e.clientY - box.top - box.height / 2,
        };
        this.focus = zoomAbout(centre, offset, scale, (scale * next) / this.zoom);
        this.zoom = next;
        this.refresh();
      },
      { passive: false }
    );
    // A middle press would start the browser's autoscroll; it turns the office instead.
    host.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    });
    host.addEventListener('pointerdown', (e) => {
      if (e.target !== host && !(e.target instanceof HTMLCanvasElement)) {
        return;
      }
      down = { x: e.clientX, y: e.clientY };
      last = down;
      panning = !turnsOffice(e);
      // Capture on the canvas itself, so the office still sees its own taps
      // (a desk's name) while the drag is followed here.
      (e.target as Element).setPointerCapture(e.pointerId);
      captured = e.target as Element;
    });
    host.addEventListener('pointermove', (e) => {
      if (!down || !last) {
        // Over the office itself, or over a control on top of it (no hint there).
        this.onHover?.(e.target === host || e.target instanceof HTMLCanvasElement ? e : null);
        return;
      }
      const at = { x: e.clientX, y: e.clientY };
      if (!this.dragging) {
        // Still a tap until it wanders far enough; then the drag starts from
        // here, so it does not jump by the slop.
        if (!isDrag(down, at)) {
          return;
        }
        this.dragging = true;
        this.turning = !panning;
        last = at;
        this.onHover?.(null);
        this.onDragStart?.();
        return;
      }
      const rawX = at.x - last.x;
      const rawY = at.y - last.y;
      last = at;
      if (rawX === 0 && rawY === 0) {
        return;
      }
      if (panning) {
        const { scale, centre } = this.view();
        this.focus = { x: centre.x - rawX / scale, y: centre.y - rawY / scale };
      } else {
        // Dragging right spins the near side of the office to the right.
        this.yaw = normalizeYaw(this.yaw - rawX * DRAG_TURN);
      }
      this.refresh();
    });
    const end = (e: PointerEvent): void => {
      const tapped = down !== null && !this.dragging && e.type === 'pointerup' && e.button === 0;
      down = null;
      last = null;
      this.dragging = false;
      this.turning = false;
      if (captured?.hasPointerCapture(e.pointerId)) {
        captured.releasePointerCapture(e.pointerId);
      }
      captured = null;
      if (tapped) {
        this.onTap?.(e);
      }
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    host.addEventListener('pointerleave', () => {
      if (!down) {
        this.onHover?.(null);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) {
        return;
      }
      if (e.key === '+' || e.key === '=') {
        this.step(1);
      } else if (e.key === '-' || e.key === '_') {
        this.step(-1);
      } else if (e.key === 'ArrowLeft') {
        this.turn(KEY_TURN);
      } else if (e.key === 'ArrowRight') {
        this.turn(-KEY_TURN);
      } else if (e.key === '0') {
        this.resetView();
      }
    });
  }

  destroy(): void {
    this.el.remove();
  }
}

/** The lit colour of the controls: the Claude orange, as the mouse's lit part. */
const LIT = '#d97757';

const CONTROL_STYLE = `
.agentopia-control{box-sizing:border-box;display:flex;align-items:center;justify-content:center;
  min-width:26px;height:24px;padding:0;border:1.5px solid ${SHEET.ink};border-radius:7px;
  background:${SHEET.paper};color:${SHEET.ink};cursor:pointer;pointer-events:auto;
  font:400 15px/1 ${FONT.hand};}
.agentopia-control.wide{padding:0 9px;}
.agentopia-control:hover:not(:disabled),.agentopia-control:focus-visible{border-color:${LIT};color:${LIT};outline:none;}
.agentopia-control:active:not(:disabled){background:${LIT};border-color:${LIT};color:${SHEET.paper};}
.agentopia-control:disabled{opacity:0.4;cursor:default;}
.agentopia-control svg{display:block;}
`;

const stroke = (d: string, size = 12): string =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 12 12" fill="none" ` +
  `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

/** The controls' glyphs, drawn in the same line as the mouse. */
const ICON = {
  left: stroke('M7.5 2.5L4 6l3.5 3.5'),
  right: stroke('M4.5 2.5L8 6l-3.5 3.5'),
  up: stroke('M2.5 7.5L6 4l3.5 3.5'),
  down: stroke('M2.5 4.5L6 8l3.5-3.5'),
  turnLeft: stroke('M3.2 4.6A3.6 3.6 0 1 1 2.6 7.2M3.2 1.8v2.8h2.8', 13),
  turnRight: stroke('M8.8 4.6A3.6 3.6 0 1 0 9.4 7.2M8.8 1.8v2.8H6', 13),
  minus: stroke('M3 6h6'),
  plus: stroke('M3 6h6M6 3v6'),
} as const;

/** One control: a small line-drawn key, an icon or a word in it. */
function controlButton(
  content: string,
  label: string,
  onClick: () => void,
  wide = false
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = wide ? 'agentopia-control wide' : 'agentopia-control';
  if (content.startsWith('<svg')) {
    b.innerHTML = content;
  } else {
    b.textContent = content;
  }
  b.title = label;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

/**
 * The bottom-right corner: a row for each of the camera's three moves (the
 * mouse that does it, the words, the buttons that do it too), and reset under
 * them. The words are lettered small in the sheet's hand with a paper halo.
 */
function makePanel(rows: HTMLButtonElement[][], reset: HTMLButtonElement): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;right:14px;bottom:14px;z-index:2;display:grid;' +
    'grid-template-columns:auto auto auto;align-items:center;column-gap:7px;row-gap:5px;' +
    'pointer-events:none;user-select:none;';
  const style = document.createElement('style');
  style.textContent = CONTROL_STYLE;
  panel.appendChild(style);
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const halo = `0 0 2px ${SHEET.paper},0 0 2px ${SHEET.paper},0 0 4px ${SHEET.paper}`;
  CAMERA_TIPS.forEach((tip, i) => {
    const icon = document.createElement('div');
    if (!coarse) {
      icon.innerHTML = mouseIcon(tip.part);
    }
    const words = document.createElement('div');
    words.textContent = coarse ? tip.touch : tip.text;
    words.style.cssText = `font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};text-shadow:${halo};`;
    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:4px;';
    buttons.append(...rows[i]);
    panel.append(icon, words, buttons);
  });
  reset.style.gridColumn = '1 / -1';
  reset.style.justifySelf = 'end';
  reset.style.marginTop = '3px';
  panel.appendChild(reset);
  return panel;
}

/**
 * A little mouse in the sheet's ink: two buttons and a wheel, with the part a
 * tip is about lit in the Claude orange (and the wheel given arrows).
 */
export function mouseIcon(part: MousePart): string {
  const ink = SHEET.ink;
  const lit = '#d97757';
  const paper = SHEET.paper;
  const left = part === 'left' ? lit : paper;
  const right = part === 'right' ? lit : paper;
  const wheel = part === 'wheel' ? lit : ink;
  const arrows =
    part === 'wheel'
      ? `<path d="M21 4.5l2-2.2 2 2.2M21 13.5l2 2.2 2-2.2" fill="none" stroke="${lit}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
      : '';
  return (
    `<svg aria-hidden="true" width="31" height="26" viewBox="0 0 26 22" style="display:block;flex:none">` +
    // The two buttons, then the body under them, outlined together.
    `<path d="M3 9V7a6 6 0 0 1 6-6v8z" fill="${left}"/>` +
    `<path d="M9 1a6 6 0 0 1 6 6v2H9z" fill="${right}"/>` +
    `<rect x="3" y="1" width="12" height="20" rx="6" fill="none" stroke="${ink}" stroke-width="1.5"/>` +
    `<path d="M3 9h12M9 1v8" stroke="${ink}" stroke-width="1.3"/>` +
    `<rect x="7.6" y="3" width="2.8" height="4.4" rx="1.4" fill="${wheel}" stroke="${ink}" stroke-width="0.9"/>` +
    arrows +
    `</svg>`
  );
}
