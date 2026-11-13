import { Control } from './interact';
import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';

/**
 * The little card of controls that opens beside an object that does more
 * than one thing, and the hint that follows the pointer over one that can
 * be clicked. Both are plain DOM over the office's canvas, lettered and
 * inked like the sheet's own pills.
 */

const PILL =
  `border:1.5px solid ${SHEET.ink};border-radius:999px;background:${SHEET.paper};` +
  `color:${SHEET.ink};font:700 16px/1 ${FONT.hand};`;

export class Popover {
  readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly row: HTMLDivElement;
  /** The key of the piece it is open on, or null when closed. */
  key: string | null = null;

  constructor(
    host: HTMLElement,
    private readonly onPick: (control: Control) => void
  ) {
    this.el = document.createElement('div');
    this.el.setAttribute('role', 'dialog');
    this.el.style.cssText =
      'position:absolute;z-index:3;display:none;flex-direction:column;gap:6px;' +
      `padding:8px 10px 10px;border:1.5px solid ${SHEET.ink};border-radius:14px;` +
      `background:${SHEET.paper};box-shadow:2px 3px 0 ${SHEET.ink};` +
      'transform:translate(-50%,-100%);user-select:none;white-space:nowrap;';
    this.title = document.createElement('div');
    this.title.style.cssText = `font:700 15px/1 ${FONT.hand};color:${SHEET.lead};`;
    this.row = document.createElement('div');
    this.row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;max-width:240px;';
    this.el.append(this.title, this.row);
    // Presses on the card are the card's: never a drag of the office under it.
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.appendChild(this.el);
  }

  open(key: string, title: string, controls: Control[]): void {
    this.key = key;
    this.title.textContent = title;
    this.row.replaceChildren(
      ...controls.map((control) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = control.label;
        b.style.cssText =
          PILL +
          'padding:5px 10px;cursor:pointer;' +
          (control.active
            ? `background:${SHEET.ink};color:${SHEET.paper};`
            : `box-shadow:0 2px 0 ${SHEET.ink};`);
        b.addEventListener('click', () => this.onPick(control));
        return b;
      })
    );
    this.el.style.display = 'flex';
  }

  /** Re-letter the controls in place, after one was pressed. */
  refresh(title: string, controls: Control[]): void {
    if (this.key) {
      this.open(this.key, title, controls);
    }
  }

  /** Keep the card over its object as the camera moves: x, y in the host's pixels. */
  place(x: number, y: number): void {
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y - 10)}px`;
  }

  close(): void {
    this.key = null;
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
