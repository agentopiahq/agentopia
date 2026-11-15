import { Annotation, Control } from './interact';
import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';

/**
 * A clicked part's annotation in the margin — its label, and the controls of
 * one that does more than one thing — and the hint that follows the pointer
 * over one that can be clicked. Both are plain DOM over the office's canvas,
 * lettered and inked like the sheet itself.
 */

/** How large an annotation's description is lettered, in CSS pixels. */
export const NOTE_PX = 18;

const PILL =
  `border:1.5px solid ${SHEET.ink};border-radius:999px;background:${SHEET.paper};` +
  `color:${SHEET.ink};font:700 16px/1 ${FONT.hand};`;

/**
 * A part's annotation, lettered in the white margin round the office the way
 * the sheet's own labels were — spaced capitals, a note under them — with a
 * part's controls under the note, and a leader line back to where you
 * clicked (drawn by the office, which knows where that is). It lives in
 * sheet units and is scaled with the camera, so it reads as part of the print.
 */
export class Popover {
  readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly note: HTMLDivElement;
  private readonly row: HTMLDivElement;
  /** The key of the piece it is open on, or null when closed. */
  key: string | null = null;
  private align: 'left' | 'right' = 'left';

  constructor(
    host: HTMLElement,
    private readonly onPick: (control: Control) => void
  ) {
    this.el = document.createElement('div');
    this.el.setAttribute('role', 'dialog');
    // A halo of paper round the lettering, as the sheet's labels have, so it
    // reads over whatever the room turns under it.
    const halo = `0 0 3px ${SHEET.paper},0 0 3px ${SHEET.paper},0 0 6px ${SHEET.paper}`;
    this.el.style.cssText =
      'position:absolute;left:0;top:0;z-index:3;display:none;flex-direction:column;gap:2px;' +
      `user-select:none;white-space:nowrap;text-shadow:${halo};`;
    this.title = document.createElement('div');
    this.title.style.cssText = `font:400 21px/1 ${FONT.hand};letter-spacing:2.2px;color:${SHEET.ink};`;
    this.note = document.createElement('div');
    // A long description wraps, so it stays in the margin.
    this.note.style.cssText = `font:400 ${NOTE_PX}px/1.2 ${FONT.hand};color:${SHEET.lead};white-space:normal;max-width:250px;`;
    this.row = document.createElement('div');
    this.row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;max-width:270px;';
    this.el.append(this.title, this.note, this.row);
    // Presses on the note are the note's: never a drag of the office under it.
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.appendChild(this.el);
  }

  open(key: string, label: Annotation, controls: Control[]): void {
    this.key = key;
    this.title.textContent = label.title;
    this.note.textContent = label.note;
    this.row.style.display = controls.length > 0 ? 'flex' : 'none';
    this.row.replaceChildren(
      ...controls.map((control) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = control.label;
        b.style.cssText =
          PILL +
          'padding:4px 10px;cursor:pointer;text-shadow:none;' +
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
  refresh(label: Annotation, controls: Control[]): void {
    if (this.key) {
      this.open(this.key, label, controls);
    }
  }

  /** The note's size in sheet units, for finding it room in the margin. */
  size(): { w: number; h: number } {
    return { w: Math.max(this.el.offsetWidth, 40), h: Math.max(this.el.offsetHeight, 30) };
  }

  /** The title's width in sheet units, for where the leader line leaves it. */
  titleWidth(): number {
    return this.title.offsetWidth;
  }

  /**
   * Stand the note in the margin: `x, y` is where the title's baseline
   * starts (its end, right-aligned) in the host's pixels, at camera scale `s`.
   */
  place(x: number, y: number, s: number, align: 'left' | 'right'): void {
    if (align !== this.align) {
      this.align = align;
      this.el.style.alignItems = align === 'left' ? 'flex-start' : 'flex-end';
      this.row.style.justifyContent = align === 'left' ? 'flex-start' : 'flex-end';
      this.el.style.textAlign = align;
    }
    // The title's baseline sits about 17px below the block's top at 21px type.
    const shift = align === 'left' ? '0' : '-100%';
    this.el.style.transformOrigin = align === 'left' ? 'top left' : 'top right';
    this.el.style.transform = `translate(${x}px, ${y - 17 * s}px) translateX(${shift}) scale(${s})`;
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
