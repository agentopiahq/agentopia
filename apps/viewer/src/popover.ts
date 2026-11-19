import { Annotation, Control } from './interact';
import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';

/**
 * A clicked part's annotation — its label, and the controls of one that does
 * more than one thing — and the hint that follows the pointer over one that
 * can be clicked. Both are plain DOM over the office's canvas, lettered and
 * inked like the sheet itself.
 */

/** How large an annotation's description is lettered, in CSS pixels. */
export const NOTE_PX = 18;

const PILL =
  `border:1.5px solid ${SHEET.ink};border-radius:999px;background:${SHEET.paper};` +
  `color:${SHEET.ink};font:700 16px/1 ${FONT.hand};`;

/** A rectangle in the host's pixels. */
export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Which side of the part the card stands on. */
export type PopupSide = 'right' | 'left' | 'below' | 'above';

export interface PopupPlace {
  /** The card's top-left corner, in the host's pixels. */
  left: number;
  top: number;
  side: PopupSide;
  /** How far along its edge facing the part the card's notch points, in pixels. */
  tip: number;
}

/** How far the card stands off the part, and in from the view's edges, in pixels. */
export const POPUP_GAP = 10;
export const POPUP_PAD = 8;
/** How near the card's corners its notch may come, in pixels. */
const TIP_INSET = 16;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Where a `w` by `h` card goes beside a part drawn over `anchor`, in a view
 * `view.w` by `view.h`: just off whichever side has room for it — the side it
 * stood on last (`prefer`) while that still fits, so it never flips back and
 * forth as the camera moves, else right, left, below, above — slid along
 * that side to stay in the view, its notch pointing at the part's middle.
 * With no side free (a part that fills the view) it stands over the part,
 * inside the view. Null while the part is wholly out of the view, so the
 * card waits for it to come back rather than pointing at nothing.
 */
export function popupSpot(
  anchor: ScreenRect,
  w: number,
  h: number,
  view: { w: number; h: number },
  prefer: PopupSide | null = null,
  gap = POPUP_GAP,
  pad = POPUP_PAD
): PopupPlace | null {
  if (anchor.x1 < 0 || anchor.y1 < 0 || anchor.x0 > view.w || anchor.y0 > view.h) {
    return null;
  }
  // Only the part of the part that shows counts: a notch at the middle of
  // what is off the screen points at nothing.
  const a = {
    x0: Math.max(anchor.x0, 0),
    y0: Math.max(anchor.y0, 0),
    x1: Math.min(anchor.x1, view.w),
    y1: Math.min(anchor.y1, view.h),
  };
  const cx = (a.x0 + a.x1) / 2;
  const cy = (a.y0 + a.y1) / 2;
  // Centred on the part along the side it stands on, slid to stay in the view.
  const across = (size: number, limit: number, mid: number): number =>
    clamp(mid - size / 2, pad, Math.max(pad, limit - pad - size));
  const tipAt = (start: number, size: number, mid: number): number =>
    clamp(mid - start, Math.min(TIP_INSET, size / 2), Math.max(size - TIP_INSET, size / 2));
  const spots: Record<PopupSide, () => PopupPlace | null> = {
    right: () => {
      const left = a.x1 + gap;
      const top = across(h, view.h, cy);
      return left + w <= view.w - pad ? { left, top, side: 'right', tip: tipAt(top, h, cy) } : null;
    },
    left: () => {
      const left = a.x0 - gap - w;
      const top = across(h, view.h, cy);
      return left >= pad ? { left, top, side: 'left', tip: tipAt(top, h, cy) } : null;
    },
    below: () => {
      const top = a.y1 + gap;
      const left = across(w, view.w, cx);
      return top + h <= view.h - pad ? { left, top, side: 'below', tip: tipAt(left, w, cx) } : null;
    },
    above: () => {
      const top = a.y0 - gap - h;
      const left = across(w, view.w, cx);
      return top >= pad ? { left, top, side: 'above', tip: tipAt(left, w, cx) } : null;
    },
  };
  const order: PopupSide[] = ['right', 'left', 'below', 'above'];
  for (const side of prefer ? [prefer, ...order.filter((s) => s !== prefer)] : order) {
    const place = spots[side]();
    if (place) {
      return place;
    }
  }
  // Nowhere beside it: over the part, kept in the view, notch on its left.
  const left = clamp(a.x1 - w - gap, pad, Math.max(pad, view.w - pad - w));
  const top = across(h, view.h, cy);
  return { left, top, side: 'right', tip: tipAt(top, h, cy) };
}

/**
 * A part's annotation, on a card of the sheet's paper stood right beside the
 * part — spaced capitals, a note under them, and the part's controls under the
 * note (its own on one line, the whole wall's on the next) — with a notch pointing at it. It is held at its own size in the
 * view, so it reads at any zoom, and the office moves it with the part as
 * the camera pans, zooms and turns.
 */
export class Popover {
  readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly note: HTMLDivElement;
  private readonly row: HTMLDivElement;
  private readonly notch: HTMLDivElement;
  /** The key of the piece it is open on, or null when closed. */
  key: string | null = null;
  /** The side it stood on last, kept while it still fits. */
  private side: PopupSide | null = null;

  constructor(
    host: HTMLElement,
    private readonly onPick: (control: Control) => void
  ) {
    this.el = document.createElement('div');
    this.el.setAttribute('role', 'dialog');
    this.el.style.cssText =
      // Over the hint, which may follow the pointer onto a part beside it.
      'position:absolute;left:0;top:0;z-index:4;display:none;flex-direction:column;gap:3px;' +
      `box-sizing:border-box;max-width:290px;padding:10px 14px 12px;user-select:none;` +
      `background:${SHEET.paper};color:${SHEET.ink};border:1.5px solid ${SHEET.ink};` +
      `border-radius:12px;box-shadow:0 3px 0 ${SHEET.ink};`;
    this.title = document.createElement('div');
    this.title.style.cssText = `font:400 19px/1 ${FONT.hand};letter-spacing:2px;white-space:nowrap;`;
    this.note = document.createElement('div');
    this.note.style.cssText = `font:400 16px/1.2 ${FONT.hand};color:${SHEET.lead};`;
    this.row = document.createElement('div');
    this.row.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:7px;';
    // A square of the card's own paper, turned and half tucked under its
    // edge, so two of its sides make the point.
    this.notch = document.createElement('div');
    this.notch.style.cssText =
      'position:absolute;width:12px;height:12px;box-sizing:border-box;pointer-events:none;' +
      `background:${SHEET.paper};border:1.5px solid ${SHEET.ink};`;
    this.el.append(this.notch, this.title, this.note, this.row);
    // Presses on the card are the card's: never a drag of the office under it.
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.key !== null;
  }

  open(key: string, label: Annotation, controls: Control[]): void {
    if (key !== this.key) {
      this.side = null;
    }
    this.key = key;
    this.title.textContent = label.title;
    this.note.textContent = label.note;
    this.row.style.display = controls.length > 0 ? 'flex' : 'none';
    // This piece's own controls on the first line, the whole wall's on the next.
    const lines = [
      controls.filter((c) => c.scope !== 'wall'),
      controls.filter((c) => c.scope === 'wall'),
    ].filter((line) => line.length > 0);
    this.row.replaceChildren(
      ...lines.map((line) => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
        div.append(...line.map((control) => this.button(control)));
        return div;
      })
    );
    this.el.style.display = 'flex';
  }

  private button(control: Control): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = control.label;
    b.style.cssText =
      PILL +
      'padding:4px 10px;cursor:pointer;' +
      (control.active
        ? `background:${SHEET.ink};color:${SHEET.paper};`
        : `box-shadow:0 2px 0 ${SHEET.ink};`);
    b.addEventListener('click', () => this.onPick(control));
    return b;
  }

  /** Re-letter the controls in place, after one was pressed. */
  refresh(label: Annotation, controls: Control[]): void {
    if (this.key) {
      this.open(this.key, label, controls);
    }
  }

  /**
   * Stand the card beside a part drawn over `anchor` (the host's pixels) in a
   * view `w` by `h`; hidden while the part is out of the view.
   */
  place(anchor: ScreenRect, view: { w: number; h: number }): void {
    if (!this.key) {
      return;
    }
    // Measured as laid out, before it is moved: the transform does not change its size.
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const spot = popupSpot(anchor, w, h, view, this.side);
    if (!spot) {
      this.el.style.visibility = 'hidden';
      return;
    }
    this.side = spot.side;
    this.el.style.visibility = 'visible';
    this.el.style.transform = `translate(${Math.round(spot.left)}px, ${Math.round(spot.top)}px)`;
    this.placeNotch(spot);
  }

  private placeNotch({ side, tip }: PopupPlace): void {
    const n = this.notch.style;
    // The notch's centre sits on the card's border, 1.5px out; the turn hides
    // the half inside under the card's paper, all but its two outer sides.
    const edge = '-7.5px';
    const along = `${Math.round(tip - 6)}px`;
    n.left = side === 'left' ? 'auto' : side === 'right' ? edge : along;
    n.right = side === 'left' ? edge : 'auto';
    n.top = side === 'above' ? 'auto' : side === 'below' ? edge : along;
    n.bottom = side === 'above' ? edge : 'auto';
    const turn = { right: 45, below: 135, left: 225, above: 315 }[side];
    n.transform = `rotate(${turn}deg)`;
    n.borderColor = `transparent transparent ${SHEET.ink} ${SHEET.ink}`;
  }

  close(): void {
    this.key = null;
    this.side = null;
    this.el.style.display = 'none';
  }
}

export class Hint {
  private readonly el: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      `position:absolute;z-index:3;display:none;pointer-events:none;padding:3px 9px;` +
      PILL +
      `font-size:14px;box-shadow:0 2px 0 ${SHEET.ink};transform:translate(14px,14px);`;
    host.appendChild(this.el);
  }

  show(text: string, x: number, y: number): void {
    this.el.textContent = text;
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y)}px`;
    this.el.style.display = 'block';
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
