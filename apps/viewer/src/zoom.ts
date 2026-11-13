import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';

/**
 * The office's zoom: a multiplier on the camera's own fit, and where a
 * zoomed-in view is looking.
 *
 * At zoom 1 the camera frames the sheet itself (the whole office when the
 * window is wide enough). The + and − buttons step the zoom; dragging the
 * office pans it once it no longer fits; reset puts both back. Keys work too:
 * `+`/`=` and `-` step, `0` resets.
 */

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 4;
/** Each press multiplies or divides the zoom by this much. */
export const ZOOM_STEP = 1.25;

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
  /** True while a drag is moving the view, so the camera follows it exactly. */
  dragging = false;
  private readonly el: HTMLElement;
  private readonly minus: HTMLButtonElement;
  private readonly plus: HTMLButtonElement;
  private readonly reset: HTMLButtonElement;

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
    this.minus = button('−', 'Zoom out', () => this.step(-1));
    this.plus = button('+', 'Zoom in', () => this.step(1));
    this.reset = button('reset', 'Reset zoom', () => this.resetView());
    this.el.append(this.minus, this.plus, this.reset);
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

  resetView(): void {
    this.zoom = 1;
    this.focus = null;
    this.refresh();
  }

  private refresh(): void {
    this.minus.disabled = this.zoom <= ZOOM_MIN;
    this.plus.disabled = this.zoom >= ZOOM_MAX;
    this.reset.disabled = this.zoom === 1 && this.focus === null;
    for (const b of [this.minus, this.plus, this.reset]) {
      b.style.opacity = b.disabled ? '0.45' : '1';
      b.style.cursor = b.disabled ? 'default' : 'pointer';
    }
  }

  /** Drag to pan, and the keyboard shortcuts. */
  private listen(host: HTMLElement): void {
    let last: Point | null = null;
    host.addEventListener('pointerdown', (e) => {
      if (e.target !== host && !(e.target instanceof HTMLCanvasElement)) {
        return;
      }
      last = { x: e.clientX, y: e.clientY };
      this.dragging = true;
      host.setPointerCapture(e.pointerId);
    });
    host.addEventListener('pointermove', (e) => {
      if (!last) {
        return;
      }
      const { scale, centre } = this.view();
      const dx = (e.clientX - last.x) / scale;
      const dy = (e.clientY - last.y) / scale;
      last = { x: e.clientX, y: e.clientY };
      if (dx !== 0 || dy !== 0) {
        this.focus = { x: centre.x - dx, y: centre.y - dy };
        this.refresh();
      }
    });
    const end = (e: PointerEvent): void => {
      last = null;
      this.dragging = false;
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
      } else if (e.key === '0') {
        this.resetView();
      }
    });
  }

  destroy(): void {
    this.el.remove();
  }
}
