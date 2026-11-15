import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';

/**
 * The office's camera controls: zoom, pan and turn.
 *
 * At zoom 1 the camera frames the sheet itself (the whole office when the
 * window is wide enough). The + and − buttons step the zoom. Dragging the
 * office pans the view; a middle-button drag (or Shift-drag, for a trackpad
 * with no middle button) turns it round, like a model on a turntable; the
 * wheel zooms about the cursor. Tips over the buttons say so. A press that never moves further
 * than `TAP_SLOP` is a tap, not a drag: it turns nothing, and goes to
 * `onTap`, so the office can hand it to whatever object is under it. The turn buttons step a quarter of a
 * quarter turn either way, and reset puts zoom, pan and turn all back. Keys
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
/** What the tips over the camera controls say, for a mouse and for a touch screen. */
export const CAMERA_TIPS = {
  mouse: ['scroll to zoom', 'drag to move around', 'middle-drag (or shift-drag) to turn'],
  touch: ['drag to move around', 'turn with the arrows below'],
} as const;

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

/** Whether a press turns the office rather than panning the view. */
export const turnsOffice = (e: { button: number; shiftKey: boolean }): boolean =>
  e.button === 1 || e.shiftKey;

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
  private readonly minus: HTMLButtonElement;
  private readonly plus: HTMLButtonElement;
  private readonly reset: HTMLButtonElement;
  private readonly left: HTMLButtonElement;
  private readonly right: HTMLButtonElement;
  private readonly tips: HTMLDivElement;

  /**
   * @param host the element the office's canvas lives in
   * @param view the camera right now: its scale and the sheet point at the
   *   middle of the view, so zooming keeps that point in place
   */
  constructor(
    host: HTMLElement,
    private readonly view: () => { scale: number; centre: Point }
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;right:14px;bottom:14px;display:flex;gap:6px;z-index:2;user-select:none;';
    const button = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.style.cssText =
        `min-width:34px;height:32px;padding:0 11px;border:1.5px solid ${SHEET.ink};` +
        `border-radius:999px;background:${SHEET.paper};color:${SHEET.ink};` +
        `font:700 19px/1 ${FONT.hand};cursor:pointer;box-shadow:0 2px 0 ${SHEET.ink};`;
      b.addEventListener('click', onClick);
      return b;
    };
    this.left = button('⟲', 'Turn left', () => this.turn(TURN_STEP));
    this.right = button('⟳', 'Turn right', () => this.turn(-TURN_STEP));
    this.minus = button('−', 'Zoom out', () => this.step(-1));
    this.plus = button('+', 'Zoom in', () => this.step(1));
    this.reset = button('reset', 'Reset view', () => this.resetView());
    this.el.append(this.left, this.right, this.minus, this.plus, this.reset);
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    this.tips = makeTips();
    host.append(this.el, this.tips);
    this.listen(host);
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
    for (const b of [this.left, this.right, this.minus, this.plus, this.reset]) {
      b.style.opacity = b.disabled ? '0.45' : '1';
      b.style.cursor = b.disabled ? 'default' : 'pointer';
    }
  }

  /** Drag to pan (middle or Shift drag to turn), taps, and the keyboard shortcuts. */
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
    this.tips.remove();
  }
}

/**
 * The two tips over the camera controls: how to move round the office and
 * how to turn it, lettered small in the sheet's hand with a paper halo.
 */
function makeTips(): HTMLDivElement {
  const tips = document.createElement('div');
  tips.style.cssText =
    'position:absolute;right:16px;bottom:56px;z-index:2;display:flex;flex-direction:column;' +
    'align-items:flex-end;gap:2px;pointer-events:none;user-select:none;';
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const halo = `0 0 2px ${SHEET.paper},0 0 2px ${SHEET.paper},0 0 4px ${SHEET.paper}`;
  for (const text of coarse ? CAMERA_TIPS.touch : CAMERA_TIPS.mouse) {
    const tip = document.createElement('div');
    tip.textContent = text;
    tip.style.cssText = `font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};text-shadow:${halo};`;
    tips.appendChild(tip);
  }
  return tips;
}
