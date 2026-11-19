import { CORNER_INSET, HOVER_GRACE_MS } from './corners';
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
 * Bottom right, a little mouse for each of the three, lighting the part it
 * uses, and under them the reset key, which puts zoom, pan and turn all back.
 * Hovered, each row opens out leftward into its words and the keys that do
 * the same by clicking: four arrows that pan, two that turn an eighth of a
 * turn, − and + that step the zoom. Keys work too: `+`/`=` and `-` zoom, the
 * arrow keys turn, `0` resets.
 *
 * On a touch screen one finger pans, and two pinch to zoom about the point
 * between them, drag to pan, and (once twisted past `TWIST_START`) twist to
 * turn the office round. There is no mouse to draw and no hover, so the
 * words and keys stay folded away behind a key of their own until it is tapped.
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

/** How far two fingers must twist, in radians, before the twist turns the office. */
export const TWIST_START = 0.3;

/** Two fingers on the glass: how far apart, at what angle, and the point between them. */
export interface Pinch {
  dist: number;
  angle: number;
  mid: Point;
}

/** The pinch two touch points make. */
export function pinchOf(a: Point, b: Point): Pinch {
  return {
    dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  };
}

/**
 * Where a pinch moving from `from` to `to` leaves the camera: the view
 * follows the point between the fingers, and zooms about it by how much
 * further apart they are. `offset` is where `to.mid` is from the view's
 * middle, in screen pixels; `scale` is the camera's scale at `zoom`.
 */
export function pinchView(
  from: Pinch,
  to: Pinch,
  view: { centre: Point; scale: number; zoom: number },
  offset: Point
): { centre: Point; zoom: number } {
  const panned = {
    x: view.centre.x - (to.mid.x - from.mid.x) / view.scale,
    y: view.centre.y - (to.mid.y - from.mid.y) / view.scale,
  };
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (view.zoom * to.dist) / from.dist));
  const next = (view.scale * zoom) / view.zoom;
  return { centre: zoomAbout(panned, offset, view.scale, next), zoom };
}

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

/** Which ways the view can still pan, before it would run off the sheet. */
export interface PanRoom {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/**
 * Which ways a view centred on `centre` can still move, given how `centreOn`
 * clamps it: none along an axis where the sheet fits, and none toward an edge
 * the view already stands at.
 */
export function panRoom(
  centre: Point,
  sheet: { w: number; h: number },
  view: { w: number; h: number },
  scale: number
): PanRoom {
  // Within a hair of the edge is at it: the camera's arithmetic is not exact.
  const EPS = 0.5 / scale;
  const room = (at: number, size: number, seen: number): [boolean, boolean] => {
    if (size * scale <= seen) {
      return [false, false];
    }
    const half = seen / 2 / scale;
    return [at > half + EPS, at < size - half - EPS];
  };
  const [left, right] = room(centre.x, sheet.w, view.w);
  const [up, down] = room(centre.y, sheet.h, view.h);
  return { left, right, up, down };
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
  /** The bottom-right corner: the camera's panel, and any keys stacked above it. */
  private readonly corner: HTMLElement;
  private readonly host: HTMLElement;
  private readonly minus: HTMLButtonElement;
  private readonly plus: HTMLButtonElement;
  private readonly reset: HTMLButtonElement;
  private readonly left: HTMLButtonElement;
  private readonly right: HTMLButtonElement;
  /** The four pan buttons, each disabled once the view can go no further that way. */
  private readonly pans: Record<keyof PanRoom, HTMLButtonElement>;
  private panKey = '';

  /**
   * @param host the element the office's canvas lives in
   * @param view the camera right now: its scale and the sheet point at the
   *   middle of the view, so zooming keeps that point in place
   * @param turned where the floor at sheet point `centre` from yaw `from` is on
   *   the sheet from yaw `to`, so a turn keeps what is in the middle of a
   *   panned or zoomed view there; without it the sheet point itself stays put
   */
  constructor(
    host: HTMLElement,
    private readonly view: () => { scale: number; centre: Point },
    private readonly turned?: (centre: Point, from: number, to: number) => Point
  ) {
    this.host = host;
    const pan = (label: string, icon: string, dx: number, dy: number): HTMLButtonElement =>
      controlButton(icon, label, () => this.pan(dx, dy));
    this.pans = {
      left: pan('Move left', ICON.left, -1, 0),
      right: pan('Move right', ICON.right, 1, 0),
      up: pan('Move up', ICON.up, 0, -1),
      down: pan('Move down', ICON.down, 0, 1),
    };
    const rows: HTMLElement[][] = [
      [
        this.pans.left,
        // Up and down share one key, split across the middle.
        splitKey(this.pans.up, this.pans.down),
        this.pans.right,
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
    this.reset = controlButton(ICON.reset, 'Reset view', () => this.resetView());
    this.corner = document.createElement('div');
    // On a touch screen the corner's words show only while the camera's are unfolded.
    this.corner.className = 'agentopia-camera-corner';
    this.el = makePanel(rows, this.reset, this.corner, (open) =>
      this.corner.classList.toggle('tips', open)
    );
    this.corner.style.cssText =
      `position:absolute;right:${CORNER_INSET}px;bottom:${CORNER_INSET}px;z-index:2;` +
      'display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none;';
    this.corner.append(this.el);
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    host.append(this.corner);
    this.listen(host);
    this.refresh();
  }

  /**
   * Stack `row` above the camera's panel (under it, on a touch screen), its
   * right end centred over the column of mice (and the reset key), so a key at
   * the row's right end lines up with them. The row holds the pointer itself;
   * the gap round it does not.
   */
  addAbove(row: HTMLElement): void {
    row.style.marginRight = `${(this.mouseColumn() - KEY_W) / 2}px`;
    if (this.el.classList.contains('coarse')) {
      // On a touch screen the camera's keys come first and the rest follow
      // under them, in the same order as above them elsewhere: one tight column.
      this.el.after(row);
      return;
    }
    this.corner.prepend(row);
  }

  /** How wide the panel's right column is: a mouse, or the reset key where there is no mouse. */
  private mouseColumn(): number {
    return this.el.classList.contains('coarse') ? KEY_W : MOUSE_W;
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
    this.turnTo(this.yaw + by);
    this.refresh();
  }

  /**
   * Turn the office to `yaw` about the floor in the middle of the view: a
   * panned or zoomed view then centres where that spot has turned to. (Left to
   * itself, the camera frames the office, or follows the cast, from any yaw.)
   */
  private turnTo(yaw: number): void {
    const next = normalizeYaw(yaw);
    if (this.focus && this.turned && next !== this.yaw) {
      this.focus = this.turned(this.focus, this.yaw, next);
    }
    this.yaw = next;
  }

  resetView(): void {
    this.zoom = 1;
    this.focus = null;
    this.yaw = 0;
    this.refresh();
  }

  /**
   * Disable each pan button the view has no room left to go (`panRoom`); the
   * camera calls this every frame, so it only touches the buttons on a change.
   */
  setPanRoom(room: PanRoom): void {
    const key = `${room.left}${room.right}${room.up}${room.down}`;
    if (key === this.panKey) {
      return;
    }
    this.panKey = key;
    for (const way of ['left', 'right', 'up', 'down'] as const) {
      this.pans[way].disabled = !room[way];
    }
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
    // Fingers down on the office, and while two are, the pinch they made last.
    const touches = new Map<number, Point>();
    let pinch: (Pinch & { twist: number; scale: number; zoom: number }) | null = null;
    const twoFingers = (): Pinch => {
      const [a, b] = [...touches.values()];
      return pinchOf(a, b);
    };
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
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size >= 2) {
          // A second finger: no tap now, and no one-finger pan; a pinch.
          (e.target as Element).setPointerCapture(e.pointerId);
          if (touches.size === 2) {
            const { scale } = this.view();
            pinch = { ...twoFingers(), twist: 0, scale, zoom: this.zoom };
            down = null;
            last = null;
            if (!this.dragging) {
              this.dragging = true;
              this.onHover?.(null);
              this.onDragStart?.();
            }
          }
          return;
        }
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
      if (touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pinch && touches.size >= 2) {
        this.pinchTo(pinch, twoFingers(), host);
        return;
      }
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
        this.turnTo(this.yaw - rawX * DRAG_TURN);
      }
      this.refresh();
    });
    const end = (e: PointerEvent): void => {
      touches.delete(e.pointerId);
      if (pinch) {
        if (touches.size >= 2) {
          // Three fingers down to two: carry on from the two left.
          Object.assign(pinch, twoFingers());
          return;
        }
        pinch = null;
        this.turning = false;
        const left = [...touches.values()][0];
        if (left) {
          // One finger left on the glass pans on from where it is.
          down = left;
          last = left;
          panning = true;
          return;
        }
      }
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

  /** Follow two fingers from the pinch they made last to `now`, and keep `now` as the last. */
  private pinchTo(
    last: Pinch & { twist: number; scale: number; zoom: number },
    now: Pinch,
    host: HTMLElement
  ): void {
    // The camera catches up a frame later, so work from what has been asked of
    // it: the scale the zoom will give, and the centre last set.
    const scale = (last.scale * this.zoom) / last.zoom;
    const centre = this.focus ?? this.view().centre;
    const box = host.getBoundingClientRect();
    const offset = {
      x: now.mid.x - box.left - box.width / 2,
      y: now.mid.y - box.top - box.height / 2,
    };
    const next = pinchView(last, now, { centre, scale, zoom: this.zoom }, offset);
    this.focus = next.centre;
    this.zoom = next.zoom;
    // A twist turns the office, once it is plainly a twist and not a wobble.
    const by = normalizeYaw(now.angle - last.angle);
    if (Math.abs(last.twist) >= TWIST_START) {
      this.turning = true;
      this.turnTo(this.yaw + by);
    }
    last.twist += by;
    last.dist = now.dist;
    last.angle = now.angle;
    last.mid = now.mid;
    this.refresh();
  }

  destroy(): void {
    this.corner.remove();
  }
}

/** How wide a control key is, in CSS pixels (its `min-width`). */
export const KEY_W = 26;
/** How wide a camera tip's little mouse is drawn, in CSS pixels. */
const MOUSE_W = 31;

/** The lit colour of the controls: the Claude orange, as the mouse's lit part. */
export const LIT = '#d97757';

const CONTROL_STYLE = `
.agentopia-control{box-sizing:border-box;display:flex;align-items:center;justify-content:center;
  min-width:${KEY_W}px;height:24px;padding:0;border:1.5px solid ${SHEET.ink};border-radius:7px;
  background:${SHEET.paper};color:${SHEET.ink};cursor:pointer;pointer-events:auto;
  font:400 15px/1 ${FONT.hand};}
.agentopia-control:hover:not(:disabled),.agentopia-control:focus-visible{border-color:${LIT};color:${LIT};outline:none;}
.agentopia-control:active:not(:disabled){background:${LIT};border-color:${LIT};color:${SHEET.paper};}
.agentopia-control:disabled{opacity:0.4;cursor:default;}
.agentopia-control svg{display:block;}
.agentopia-split{box-sizing:border-box;display:flex;flex-direction:column;width:26px;height:24px;
  border:1.5px solid ${SHEET.ink};border-radius:7px;overflow:hidden;background:${SHEET.paper};
  pointer-events:auto;}
.agentopia-split .agentopia-control{flex:1;min-width:0;height:auto;border:none;border-radius:0;}
.agentopia-split .agentopia-control + .agentopia-control{border-top:1.5px solid ${SHEET.ink};}
.agentopia-camera{pointer-events:none;}
.agentopia-camera.open{pointer-events:auto;}
.agentopia-camera-mouse{pointer-events:auto;justify-self:center;}
.agentopia-camera-more{justify-self:end;opacity:0;visibility:hidden;
  transition:opacity 140ms ease,visibility 0s linear 140ms;}
.agentopia-camera.open .agentopia-camera-more{opacity:1;visibility:visible;transition:opacity 140ms ease;}
.agentopia-camera.coarse:not(.open) .agentopia-camera-more{display:none;}
`;

export const stroke = (d: string, size = 12): string =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 12 12" fill="none" ` +
  `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

/** The controls' glyphs, drawn in the same line as the mouse. */
export const ICON = {
  left: stroke('M7.5 2.5L4 6l3.5 3.5'),
  right: stroke('M4.5 2.5L8 6l-3.5 3.5'),
  // Squat, for the halves of the up-and-down key.
  up: stroke('M3 8L6 5l3 3', 11),
  down: stroke('M3 4L6 7l3-3', 11),
  turnLeft: stroke('M3.2 4.6A3.6 3.6 0 1 1 2.6 7.2M3.2 1.8v2.8h2.8', 13),
  turnRight: stroke('M8.8 4.6A3.6 3.6 0 1 0 9.4 7.2M8.8 1.8v2.8H6', 13),
  // Four arrows out from the middle: the camera's moves, folded away.
  moves: stroke(
    'M6 1.2v9.6M1.2 6h9.6M4.6 2.6L6 1.2l1.4 1.4M4.6 9.4L6 10.8l1.4-1.4M2.6 4.6L1.2 6l1.4 1.4M9.4 4.6L10.8 6l-1.4 1.4',
    13
  ),
  minus: stroke('M3 6h6'),
  plus: stroke('M3 6h6M6 3v6'),
  // Two arrows chasing round a circle: everything back where it started.
  reset: stroke(
    'M2.2 6A3.8 3.8 0 0 1 9.2 4M9.6 1.6v2.6H7M9.8 6A3.8 3.8 0 0 1 2.8 8M2.4 10.4V7.8H5',
    13
  ),
} as const;

/** One control: a small line-drawn key, an icon or a word in it. */
export function controlButton(
  content: string,
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'agentopia-control';
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

/** One key split across the middle into two: `top` over `bottom`. */
function splitKey(top: HTMLButtonElement, bottom: HTMLButtonElement): HTMLDivElement {
  const key = document.createElement('div');
  key.className = 'agentopia-split';
  key.append(top, bottom);
  return key;
}

/**
 * The bottom-right corner: a mouse for each of the camera's three moves, and
 * the reset key under them. Hovering (or focusing) any of it opens each row
 * out leftward: the words just left of the mouse, and left of them the keys
 * that do it too. It stays open `HOVER_GRACE_MS` after the pointer leaves, and
 * while open the whole panel holds the pointer, so a move from a mouse to its
 * keys never closes it. A touch screen has no mouse to show and no hover, so
 * there the rows fold away behind a key of their own, over the reset key, and
 * the keys added to the corner line up under the reset key in one tight
 * column. A tap on any key in the corner unfolds the rows with their touch
 * words (and the other keys' words); a tap on the fold key again, or on the
 * office, folds them back, so they never sit over the office on a small
 * screen. The words are lettered small in the sheet's hand with a paper halo.
 * `onOpen` hears each open and close.
 */
function makePanel(
  rows: HTMLElement[][],
  reset: HTMLButtonElement,
  region: HTMLElement,
  onOpen: (open: boolean) => void = () => {}
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'agentopia-camera';
  panel.style.cssText =
    'display:grid;grid-template-columns:auto auto auto;align-items:center;column-gap:7px;' +
    'row-gap:5px;user-select:none;';
  const style = document.createElement('style');
  style.textContent = CONTROL_STYLE;
  panel.appendChild(style);
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const halo = `0 0 2px ${SHEET.paper},0 0 2px ${SHEET.paper},0 0 4px ${SHEET.paper}`;
  const name = (text: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.className = 'agentopia-camera-more';
    el.textContent = text;
    el.style.cssText = `font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};text-shadow:${halo};`;
    return el;
  };
  // On a touch screen the move row goes last, beside the key that unfolds it all.
  const moveRow: HTMLElement[] = [];
  CAMERA_TIPS.forEach((tip, i) => {
    const buttons = document.createElement('div');
    buttons.className = 'agentopia-camera-more';
    buttons.style.cssText = 'display:flex;gap:4px;';
    buttons.append(...rows[i]);
    const words = name(coarse ? tip.touch : tip.text);
    if (coarse) {
      // No mouse to draw: the row is its keys and its words, and folds away whole.
      buttons.style.gridColumn = '1';
      words.style.gridColumn = '2';
      if (tip.part === 'left') {
        moveRow.push(buttons, words);
      } else {
        panel.append(buttons, words);
      }
      return;
    }
    const icon = document.createElement('div');
    icon.className = 'agentopia-camera-mouse';
    icon.innerHTML = mouseIcon(tip.part);
    panel.append(buttons, words, icon);
  });
  const resetWords = name('reset');
  resetWords.style.gridColumn = '2';
  resetWords.style.marginTop = '3px';
  reset.classList.add('agentopia-camera-mouse');
  reset.style.gridColumn = '3';
  reset.style.marginTop = '3px';
  panel.append(resetWords, reset);
  if (coarse) {
    panel.classList.add('coarse');
    const toggle = (open: boolean): void => {
      panel.classList.toggle('open', open);
      moves.setAttribute('aria-expanded', String(open));
      onOpen(open);
      if (open) {
        document.addEventListener('pointerdown', outside, true);
      } else {
        document.removeEventListener('pointerdown', outside, true);
      }
    };
    // Anywhere off the corner's keys folds them back.
    const outside = (e: PointerEvent): void => {
      if (!region.contains(e.target as Node)) {
        toggle(false);
      }
    };
    const moves = controlButton(ICON.moves, 'Camera controls', () =>
      toggle(!panel.classList.contains('open'))
    );
    // Touching any other key in the corner unfolds them too, as it does what it does.
    region.addEventListener('pointerdown', (e) => {
      const key = (e.target as Element).closest('.agentopia-control');
      if (key && key !== moves && !panel.classList.contains('open')) {
        toggle(true);
      }
    });
    moves.setAttribute('aria-expanded', 'false');
    moves.classList.add('agentopia-camera-mouse');
    moves.style.gridColumn = '3';
    moves.style.marginTop = '3px';
    // Above the reset key, in the column the mice would be in: folded, the
    // two of them are all there is of the panel.
    // Unfolded, the move row's words name it.
    for (const el of [...moveRow, moves]) {
      panel.insertBefore(el, resetWords);
    }
    return panel;
  }
  let leaving: ReturnType<typeof setTimeout> | null = null;
  const stay = (): void => {
    if (leaving) {
      clearTimeout(leaving);
      leaving = null;
    }
  };
  // Keys reached by the keyboard hold the panel open; a key that only has
  // focus because it was clicked does not.
  const keyboardFocus = (): boolean => panel.querySelector(':focus-visible') !== null;
  const close = (): void => {
    stay();
    if (!keyboardFocus()) {
      panel.classList.remove('open');
    }
  };
  panel.addEventListener('pointerenter', () => {
    stay();
    panel.classList.add('open');
  });
  panel.addEventListener('pointerleave', () => {
    stay();
    leaving = setTimeout(close, HOVER_GRACE_MS);
  });
  panel.addEventListener('focusin', () => {
    if (keyboardFocus()) {
      panel.classList.add('open');
    }
  });
  panel.addEventListener('focusout', (e) => {
    if (!panel.contains(e.relatedTarget as Node | null) && !panel.matches(':hover')) {
      panel.classList.remove('open');
    }
  });
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
    `<svg aria-hidden="true" width="${MOUSE_W}" height="26" viewBox="0 0 26 22" style="display:block;flex:none">` +
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
