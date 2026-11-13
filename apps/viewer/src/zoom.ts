import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';

/**
 * The office's camera controls: zoom, pan and turn.
 *
 * At zoom 1 the camera frames the sheet itself (the whole office when the
 * window is wide enough). The + and − buttons step the zoom. Dragging the
 * office turns it round, like a model on a turntable; Shift-drag (or a right
 * or middle drag) pans a zoomed-in view. The turn buttons step a quarter of a
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
  private readonly el: HTMLElement;
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
    host.appendChild(this.el);
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

  /** Drag to turn (Shift, right or middle drag to pan), and the keyboard shortcuts. */
  private listen(host: HTMLElement): void {
    let last: Point | null = null;
    let panning = false;
    host.addEventListener('contextmenu', (e) => e.preventDefault());
    host.addEventListener('pointerdown', (e) => {
      if (e.target !== host && !(e.target instanceof HTMLCanvasElement)) {
        return;
      }
      last = { x: e.clientX, y: e.clientY };
      panning = e.shiftKey || e.button === 1 || e.button === 2;
      this.dragging = true;
      this.turning = !panning;
      host.setPointerCapture(e.pointerId);
    });
    host.addEventListener('pointermove', (e) => {
      if (!last) {
        return;
      }
      const rawX = e.clientX - last.x;
      const rawY = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
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
      last = null;
      this.dragging = false;
      this.turning = false;
      if (host.hasPointerCapture(e.pointerId)) {
        host.releasePointerCapture(e.pointerId);
      }
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) {
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
