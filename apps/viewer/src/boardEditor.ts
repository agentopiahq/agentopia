import {
  BoardContent,
  COLUMN_HEADS,
  DEFAULT_BOARD,
  INK_H,
  INK_W,
  addNote,
  editNote,
  moveNote,
  removeNote,
  wipeBoard,
} from './board';
import { FONT } from './kit/iso';
import { MAT, SHEET } from './kit/palette';

/**
 * The sprint board, up close. A click on the board in the office opens it
 * here, big enough to read and work on: edit the title and every sticky
 * note, add and tear off notes, drag them between columns, draw on it with
 * the tray's three markers, rub marker out with the eraser, or wipe it all.
 *
 * The board is laid out at the same proportions as the one in the room, so
 * marker drawn here lands in the same place there. Every change is handed to
 * `onChange` as it happens; the office redraws its board from that.
 */

type Tool = 'notes' | 'blue' | 'red' | 'green' | 'eraser';

const MARKERS: Record<Exclude<Tool, 'notes' | 'eraser'>, string> = {
  blue: '#2f5fb0',
  red: MAT.tomato.d,
  green: '#2f8a4a',
};

/** The ink canvas's backing store is this much finer than its layout size. */
const INK_DENSITY = 2;
/** The board's layout: the header band, and the column area under it. */
const HEAD_H = 81;
const MARGIN = 17;

export interface BoardEditorOptions {
  onChange: (board: BoardContent, ink: HTMLCanvasElement | null) => void;
  onClose: () => void;
}

const css = (el: HTMLElement, text: string): void => {
  el.style.cssText = text;
};

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  css(
    b,
    `height:32px;padding:0 12px;border:1.5px solid ${SHEET.ink};border-radius:999px;` +
      `background:${SHEET.paper};color:${SHEET.ink};font:700 17px/1 ${FONT.hand};` +
      `cursor:pointer;box-shadow:0 2px 0 ${SHEET.ink};`
  );
  b.addEventListener('click', onClick);
  return b;
}

export class BoardEditor {
  private readonly overlay: HTMLDivElement;
  private readonly frame: HTMLDivElement;
  private readonly board: HTMLDivElement;
  private readonly ink: HTMLCanvasElement;
  private readonly columns: HTMLDivElement[] = [];
  private readonly title: HTMLDivElement;
  private readonly tag: HTMLDivElement;
  private readonly chart: HTMLDivElement;
  private readonly tools = new Map<Tool, HTMLButtonElement>();
  private content: BoardContent = DEFAULT_BOARD;
  private tool: Tool = 'notes';
  private dragging: { column: number; index: number } | null = null;
  private inkDirty = false;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close();
    }
  };
  private readonly onResize = (): void => this.fit();

  constructor(
    private readonly host: HTMLElement,
    private readonly options: BoardEditorOptions
  ) {
    this.overlay = document.createElement('div');
    css(
      this.overlay,
      'position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;' +
        'background:rgba(250,247,238,0.72);backdrop-filter:blur(1.5px);'
    );
    this.overlay.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // The aluminium frame, the board in it, and the marker tray under it.
    this.frame = document.createElement('div');
    css(
      this.frame,
      'display:flex;flex-direction:column;align-items:center;gap:10px;transform-origin:center;'
    );
    const rim = document.createElement('div');
    css(
      rim,
      `padding:9px;border:2.5px solid ${SHEET.ink};border-radius:6px;background:${MAT.alu.m};` +
        `box-shadow:4px 5px 0 ${SHEET.ink};`
    );
    this.board = document.createElement('div');
    css(
      this.board,
      `position:relative;width:${INK_W}px;height:${INK_H}px;background:#fbfcfa;` +
        `border:1px solid ${SHEET.lead};overflow:hidden;font-family:${FONT.hand};`
    );
    rim.appendChild(this.board);

    this.title = this.editable(28, MARKERS.blue, 'left', 'Title', (text) => {
      this.content = { ...this.content, title: text.slice(0, 40) };
      this.changed();
    });
    this.tag = this.editable(20, MAT.tomato.d, 'right', 'Aside', (text) => {
      this.content = { ...this.content, tag: text.slice(0, 24) };
      this.changed();
    });
    this.board.append(this.title, this.tag);

    // The ruled columns.
    const colW = (INK_W - MARGIN * 2) / COLUMN_HEADS.length;
    const rule = document.createElement('div');
    css(
      rule,
      `position:absolute;left:${MARGIN}px;right:${MARGIN}px;top:${HEAD_H}px;height:0;` +
        `border-top:2px solid ${MARKERS.blue};`
    );
    this.board.appendChild(rule);
    COLUMN_HEADS.forEach((head, c) => {
      const col = document.createElement('div');
      css(
        col,
        `position:absolute;top:${HEAD_H + 4}px;bottom:10px;left:${MARGIN + c * colW}px;width:${colW}px;` +
          'display:flex;flex-direction:column;align-items:center;' +
          (c > 0 ? `border-left:2px solid ${MARKERS.blue};` : '')
      );
      const label = document.createElement('div');
      label.textContent = head;
      css(label, `font:700 17px/1.4 ${FONT.hand};color:${MAT.graphite.d};letter-spacing:1px;`);
      const notes = document.createElement('div');
      css(
        notes,
        'flex:1;width:100%;display:grid;grid-template-columns:1fr 1fr;align-content:start;' +
          'justify-items:center;gap:8px 4px;padding:4px 8px;overflow-y:auto;'
      );
      notes.addEventListener('dragover', (e) => {
        if (this.dragging) {
          e.preventDefault();
        }
      });
      notes.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropAt(c, notes, e);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = '+ note';
      add.title = `Add a note to ${head.toLowerCase()}`;
      css(
        add,
        `margin-top:4px;border:1.5px dashed ${SHEET.lead};border-radius:8px;background:transparent;` +
          `color:${SHEET.lead};font:700 15px/1 ${FONT.hand};padding:4px 10px;cursor:pointer;`
      );
      add.addEventListener('click', () => {
        this.content = addNote(this.content, c);
        this.changed();
        this.renderNotes();
        // Straight into typing on the new note.
        const last =
          this.columns[c].lastElementChild?.querySelector<HTMLElement>('[contenteditable]');
        last?.focus();
      });
      col.append(label, notes, add);
      this.board.appendChild(col);
      this.columns.push(notes);
    });

    // The burndown, where the room's board has it, and a tab to rub it out.
    this.chart = document.createElement('div');
    const cx = MARGIN + 2 * colW + 18;
    css(this.chart, `position:absolute;left:${cx}px;bottom:30px;width:${colW - 36}px;height:84px;`);
    this.chart.innerHTML =
      `<svg viewBox="0 0 100 50" width="100%" height="100%" preserveAspectRatio="none" aria-label="Burndown chart">` +
      `<polyline points="2,2 2,48 98,48" fill="none" stroke="${MAT.graphite.d}" stroke-width="1.6"/>` +
      `<polyline points="5,6 25,14 45,30 65,34 95,44" fill="none" stroke="${MAT.tomato.d}" stroke-width="2.2"/></svg>`;
    const rub = button('×', 'Rub out the burndown', () => {
      this.content = { ...this.content, chart: false };
      this.changed();
      this.renderChart();
    });
    css(
      rub,
      `position:absolute;right:-10px;top:-10px;width:22px;height:22px;padding:0;border-radius:50%;` +
        `border:1.5px solid ${SHEET.ink};background:${SHEET.paper};font:700 14px/1 ${FONT.hand};cursor:pointer;`
    );
    this.chart.appendChild(rub);
    this.board.appendChild(this.chart);

    // The marker layer over everything, live only while a marker is in hand.
    this.ink = document.createElement('canvas');
    this.ink.width = INK_W * INK_DENSITY;
    this.ink.height = INK_H * INK_DENSITY;
    css(this.ink, 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;');
    this.listenInk();
    this.board.appendChild(this.ink);

    const tray = document.createElement('div');
    css(tray, 'display:flex;flex-wrap:wrap;justify-content:center;gap:6px;max-width:980px;');
    const tool = (t: Tool, label: string, title: string, color?: string): HTMLButtonElement => {
      const b = button(label, title, () => this.setTool(t));
      if (color) {
        b.style.color = color;
      }
      this.tools.set(t, b);
      return b;
    };
    tray.append(
      tool('notes', '✎ notes', 'Edit and move the notes'),
      tool('blue', '● blue', 'Draw in blue marker', MARKERS.blue),
      tool('red', '● red', 'Draw in red marker', MARKERS.red),
      tool('green', '● green', 'Draw in green marker', MARKERS.green),
      tool('eraser', '▭ eraser', 'Rub out marker'),
      button('wipe marker', 'Rub out every marker stroke', () => {
        this.clearInk();
        this.content = { ...this.content, ink: null };
        this.changed();
      }),
      button('wipe board', 'Wipe the whole board clean', () => this.load(wipeBoard())),
      button('sprint 14', 'Put the board back as it was', () => this.load(DEFAULT_BOARD)),
      button('done', 'Close the board', () => this.close())
    );
    this.frame.append(rim, tray);
    this.overlay.appendChild(this.frame);
    host.appendChild(this.overlay);
  }

  get isOpen(): boolean {
    return this.overlay.style.display !== 'none';
  }

  open(content: BoardContent): void {
    this.overlay.style.display = 'flex';
    this.load(content, false);
    this.setTool('notes');
    this.fit();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
  }

  close(): void {
    if (!this.isOpen) {
      return;
    }
    this.flushInk();
    this.overlay.style.display = 'none';
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.options.onClose();
  }

  /** Show a board; `announce` hands it to the office too (a wipe, a reset). */
  private load(content: BoardContent, announce = true): void {
    this.content = content;
    this.title.textContent = content.title;
    this.tag.textContent = content.tag;
    this.renderNotes();
    this.renderChart();
    this.clearInk();
    if (content.ink) {
      const img = new Image();
      img.onload = (): void => {
        const g = this.ink.getContext('2d');
        g?.drawImage(img, 0, 0, this.ink.width, this.ink.height);
      };
      img.src = content.ink;
    }
    if (announce) {
      this.changed(content.ink ? undefined : null);
    }
  }

  /** Scale the board to the window, never past its own size. */
  private fit(): void {
    const w = this.host.clientWidth - 32;
    const h = this.host.clientHeight - 32;
    const scale = Math.min(1.25, w / (INK_W + 30), h / (INK_H + 80));
    this.frame.style.transform = `scale(${Math.max(0.3, scale)})`;
  }

  private changed(ink?: HTMLCanvasElement | null): void {
    this.options.onChange(
      this.content,
      ink === undefined ? (this.content.ink ? this.ink : null) : ink
    );
  }

  private editable(
    size: number,
    color: string,
    align: 'left' | 'right',
    label: string,
    onInput: (text: string) => void
  ): HTMLDivElement {
    const el = document.createElement('div');
    el.contentEditable = 'plaintext-only';
    el.setAttribute('aria-label', label);
    el.spellcheck = false;
    css(
      el,
      `position:absolute;top:14px;${align}:${MARGIN + 6}px;max-width:45%;min-width:40px;` +
        `font:700 ${size}px/1.2 ${FONT.hand};color:${color};outline:none;white-space:nowrap;overflow:hidden;`
    );
    el.addEventListener('input', () => onInput(el.textContent ?? ''));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      }
    });
    return el;
  }

  private renderNotes(): void {
    this.content.columns.forEach((notes, c) => {
      const box = this.columns[c];
      box.replaceChildren(
        ...notes.map((n, i) => {
          const card = document.createElement('div');
          const tilt = (((c * 7 + i * 3) % 5) - 2) * 1.2;
          css(
            card,
            `position:relative;width:96px;height:72px;background:${n.color};` +
              `box-shadow:1px 3px 4px rgba(31,29,26,0.25);transform:rotate(${tilt}deg);` +
              'display:flex;flex-direction:column;'
          );
          // The gummed strip along the top: what you grab to move it.
          const strip = document.createElement('div');
          strip.draggable = true;
          strip.title = 'Drag to move';
          css(strip, 'height:12px;cursor:grab;background:rgba(0,0,0,0.07);flex:none;');
          strip.addEventListener('dragstart', (e) => {
            this.dragging = { column: c, index: i };
            e.dataTransfer?.setData('text/plain', n.text);
            e.dataTransfer?.setDragImage(card, 48, 6);
          });
          strip.addEventListener('dragend', () => {
            this.dragging = null;
          });
          const text = document.createElement('div');
          text.contentEditable = 'plaintext-only';
          text.spellcheck = false;
          text.textContent = n.text;
          text.setAttribute('aria-label', `Note in ${COLUMN_HEADS[c].toLowerCase()}`);
          css(
            text,
            `flex:1;padding:2px 6px;font:700 15px/1.05 ${FONT.hand};color:${MAT.graphite.d};` +
              'outline:none;overflow:hidden;word-break:break-word;' +
              (c === 3 ? 'text-decoration:line-through;text-decoration-color:#2f8a4a;' : '')
          );
          text.addEventListener('input', () => {
            this.content = editNote(this.content, c, i, text.textContent ?? '');
            this.changed();
          });
          const tear = document.createElement('button');
          tear.type = 'button';
          tear.textContent = '×';
          tear.title = 'Tear this note off';
          css(
            tear,
            'position:absolute;right:1px;top:-1px;border:none;background:transparent;cursor:pointer;' +
              `font:700 15px/1 ${FONT.hand};color:${MAT.graphite.d};padding:0 3px;`
          );
          tear.addEventListener('click', () => {
            this.content = removeNote(this.content, c, i);
            this.changed();
            this.renderNotes();
          });
          card.append(strip, text, tear);
          card.dataset.index = String(i);
          return card;
        })
      );
    });
  }

  private renderChart(): void {
    this.chart.style.display = this.content.chart ? 'block' : 'none';
  }

  /** Drop the dragged note into column `c`, before whichever note it landed on. */
  private dropAt(c: number, box: HTMLDivElement, e: DragEvent): void {
    if (!this.dragging) {
      return;
    }
    const cards = [...box.children] as HTMLElement[];
    const hit = cards.find((card) => card.contains(e.target as Node));
    const index = hit ? Number(hit.dataset.index) : cards.length;
    this.content = moveNote(this.content, this.dragging, { column: c, index });
    this.dragging = null;
    this.changed();
    this.renderNotes();
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.ink.style.pointerEvents = t === 'notes' ? 'none' : 'auto';
    this.ink.style.cursor = t === 'notes' ? 'default' : 'crosshair';
    for (const [k, b] of this.tools) {
      const on = k === t;
      b.style.background = on ? SHEET.ink : SHEET.paper;
      b.style.color = on
        ? SHEET.paper
        : k in MARKERS
          ? MARKERS[k as keyof typeof MARKERS]
          : SHEET.ink;
    }
  }

  private clearInk(): void {
    this.ink.getContext('2d')?.clearRect(0, 0, this.ink.width, this.ink.height);
  }

  private listenInk(): void {
    let last: [number, number] | null = null;
    const at = (e: PointerEvent): [number, number] => {
      const r = this.ink.getBoundingClientRect();
      return [
        ((e.clientX - r.left) / r.width) * this.ink.width,
        ((e.clientY - r.top) / r.height) * this.ink.height,
      ];
    };
    const stroke = (to: [number, number]): void => {
      const g = this.ink.getContext('2d');
      if (!g || !last) {
        return;
      }
      const erase = this.tool === 'eraser';
      g.save();
      g.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
      g.strokeStyle = erase ? '#000' : MARKERS[this.tool as keyof typeof MARKERS];
      g.lineWidth = (erase ? 24 : 4.5) * INK_DENSITY;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(last[0], last[1]);
      g.lineTo(to[0] + (to[0] === last[0] && to[1] === last[1] ? 0.01 : 0), to[1]);
      g.stroke();
      g.restore();
      last = to;
      this.inkDirty = true;
      // The office's board follows the pen live; the stored copy waits for the lift.
      this.options.onChange(this.content, this.ink);
    };
    this.ink.addEventListener('pointerdown', (e) => {
      if (this.tool === 'notes') {
        return;
      }
      this.ink.setPointerCapture(e.pointerId);
      last = at(e);
      stroke(last);
    });
    this.ink.addEventListener('pointermove', (e) => {
      if (last) {
        stroke(at(e));
      }
    });
    const end = (): void => {
      last = null;
      this.flushInk();
    };
    this.ink.addEventListener('pointerup', end);
    this.ink.addEventListener('pointercancel', end);
  }

  /** Keep the drawing: as a PNG on the board, or nothing if it is all rubbed out. */
  private flushInk(): void {
    if (!this.inkDirty) {
      return;
    }
    this.inkDirty = false;
    const g = this.ink.getContext('2d');
    const data = g?.getImageData(0, 0, this.ink.width, this.ink.height).data;
    let any = false;
    if (data) {
      for (let i = 3; i < data.length; i += 16) {
        if (data[i] > 0) {
          any = true;
          break;
        }
      }
    }
    this.content = { ...this.content, ink: any ? this.ink.toDataURL('image/png') : null };
    this.changed(any ? this.ink : null);
  }
}
