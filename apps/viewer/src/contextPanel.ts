import type { ContextPart, ContextReport } from '@agentopia/core';
import { SETUP_PARTS } from '@agentopia/core';

import { PART_COLORS, contextFill, fillColor, gridOf, percent, windowLabel } from './context';
import { FONT } from './kit/iso';
import { MAT, SHEET } from './kit/palette';
import { tokens } from './usage';

/**
 * A desk's context, broken down: what opens when a desk's monitor or its
 * name is clicked.
 *
 * On the office's paper, like the usage ledger: how full the context is
 * against the model's window, a grid of squares with one per half percent
 * coloured by what fills it (after Claude Code's own `/context`), and the
 * parts listed, set-up first, then the conversation, then the room left.
 * The total is measured; the parts are worked out from the transcript.
 */

export interface ContextPanelOptions {
  /** Where "watch replay" goes, if this page offers it (the floor does). */
  onReplay?: (bus: string) => void;
  /** Whether it is offered now; always, if left out. */
  canReplay?: () => boolean;
}

/** What the panel shows for a desk while its report is on its way, or when there is none. */
export type ContextPanelState = ContextReport | 'reading' | 'none';

/** The grid: this many squares across, and down. One is half a percent of the window. */
const GRID_COLS = 25;
const GRID_ROWS = 8;

/** The faces, quoted for a `style` attribute (their names carry double quotes). */
const HAND = FONT.hand.replace(/"/g, "'");
const TITLE = FONT.title.replace(/"/g, "'");

const esc = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );

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
    `height:32px;padding:0 14px;border:1.5px solid ${SHEET.ink};border-radius:999px;` +
      `background:${SHEET.paper};color:${SHEET.ink};font:700 17px/1 ${FONT.hand};` +
      `cursor:pointer;box-shadow:0 2px 0 ${SHEET.ink};`
  );
  b.addEventListener('click', onClick);
  return b;
}

/** What a square of the grid stands for: its part's name, tokens and share of the window. */
export function cellTip(
  report: ContextReport,
  part: ContextPart | null
): { title: string; detail: string } {
  const slice = part ? report.slices.find((s) => s.part === part) : undefined;
  const n = part ? (slice?.tokens ?? 0) : Math.max(0, report.window - report.used);
  const share = report.window > 0 ? n / report.window : 0;
  return {
    title: part ? (slice?.label ?? part) : 'Free space',
    detail: `${tokens(n)} tokens, ${percent(share)} of the window`,
  };
}

/** A model's id as people say it: `opus-5-5` for `claude-opus-5-5`. */
const modelLabel = (model: string | undefined): string =>
  model ? model.replace(/^claude-/, '').replace(/\[1m\]$/i, '') : '';

export class ContextPanel {
  private readonly overlay: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly heading = document.createElement('div');
  private readonly subtitle = document.createElement('div');
  private readonly replay: HTMLButtonElement | null;
  private bus: string | null = null;
  private name = '';
  private state: ContextPanelState = 'reading';
  /** Whether the report is made up, for a demo. */
  private demo = false;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close();
    }
  };

  constructor(
    host: HTMLElement,
    private readonly options: ContextPanelOptions = {}
  ) {
    this.overlay = document.createElement('div');
    css(
      this.overlay,
      'position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;' +
        'padding:16px;box-sizing:border-box;' +
        'background:rgba(250,247,238,0.72);backdrop-filter:blur(1.5px);'
    );
    this.overlay.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === this.overlay) {
        this.close();
      }
    });
    this.overlay.addEventListener('wheel', (e) => e.stopPropagation());

    const card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Context breakdown');
    css(
      card,
      `width:min(760px,100%);max-height:100%;display:flex;flex-direction:column;` +
        `background:${SHEET.paper};border:2.5px solid ${SHEET.ink};border-radius:14px;` +
        `box-shadow:5px 6px 0 ${SHEET.ink};color:${SHEET.ink};font-family:${FONT.hand};` +
        'text-align:left;line-height:normal;overflow:hidden;box-sizing:border-box;'
    );

    const head = document.createElement('div');
    css(
      head,
      'display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;' +
        `padding:20px 24px 14px;border-bottom:2px solid ${SHEET.ink};`
    );
    const titles = document.createElement('div');
    css(titles, 'min-width:0;flex:1 1 280px;');
    css(
      this.heading,
      `font:400 34px/1.05 ${TITLE};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`
    );
    css(this.subtitle, `font:400 18px/1.3 ${FONT.hand};color:${SHEET.lead};margin-top:6px;`);
    titles.append(this.heading, this.subtitle);
    const controls = document.createElement('div');
    css(controls, 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;');
    this.replay = options.onReplay
      ? button('watch replay', "Watch this session's replay", () => {
          if (this.bus) {
            options.onReplay?.(this.bus);
          }
        })
      : null;
    if (this.replay) {
      controls.appendChild(this.replay);
    }
    controls.appendChild(button('done', 'Close the breakdown', () => this.close()));
    head.append(titles, controls);

    this.body = document.createElement('div');
    css(
      this.body,
      'overflow-y:auto;padding:18px 24px 22px;' +
        `scrollbar-width:thin;scrollbar-color:${SHEET.lead}80 transparent;`
    );
    card.append(head, this.body);
    this.overlay.appendChild(card);
    host.appendChild(this.overlay);
  }

  get isOpen(): boolean {
    return this.overlay.style.display !== 'none';
  }

  /** The desk whose context is open, if any. */
  get openBus(): string | null {
    return this.isOpen ? this.bus : null;
  }

  /** Open on a desk, its report still to come (`update`) unless it is given. */
  open(
    bus: string,
    name: string,
    state: ContextPanelState = 'reading',
    options: { demo?: boolean } = {}
  ): void {
    this.demo = options.demo === true;
    this.bus = bus;
    this.name = name;
    this.state = state;
    if (this.replay) {
      this.replay.style.display = (this.options.canReplay?.() ?? true) ? '' : 'none';
    }
    this.overlay.style.display = 'flex';
    window.addEventListener('keydown', this.onKey);
    this.render();
    this.body.scrollTop = 0;
  }

  /** A desk's report, or why there is none: drawn if that desk is the one open. */
  update(bus: string, state: ContextPanelState): void {
    if (bus !== this.bus) {
      return;
    }
    this.state = state;
    if (this.isOpen) {
      this.render();
    }
  }

  close(): void {
    if (!this.isOpen) {
      return;
    }
    this.overlay.style.display = 'none';
    window.removeEventListener('keydown', this.onKey);
  }

  private render(): void {
    this.heading.textContent = this.name || 'Context';
    const report = typeof this.state === 'object' ? this.state : null;
    const model = modelLabel(report?.model);
    this.subtitle.textContent = this.demo
      ? 'a made-up context for this demo desk: run agentopia to see your sessions'
      : `what this session's context holds${model ? `, on ${model}` : ''}` +
        ", read from Claude Code's transcript on this machine";
    if (!report) {
      const note =
        this.state === 'none'
          ? "No context to show for this desk: its transcript wasn't found, or it has no replies yet."
          : "Reading this session's transcript…";
      this.body.innerHTML = `<p style="font:400 22px/1.4 ${HAND};color:${SHEET.lead};margin:24px 0;">${esc(note)}</p>`;
      return;
    }
    this.body.replaceChildren(this.gauge(report), this.grid(report), this.legend(report));
    this.body.appendChild(this.foot(report));
  }

  /** The headline: tokens in context, of the window, and how full that is. */
  private gauge(report: ContextReport): HTMLElement {
    const fill = contextFill(report);
    const el = document.createElement('div');
    css(el, 'display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;margin-bottom:14px;');
    el.innerHTML =
      `<span style="font:400 44px/1 ${TITLE};">${esc(tokens(report.used))}</span>` +
      `<span style="font:400 22px/1 ${HAND};color:${SHEET.lead};">of ${esc(windowLabel(report.window))} tokens</span>` +
      `<span style="margin-left:auto;padding:4px 14px;border:1.5px solid ${SHEET.ink};border-radius:999px;` +
      `background:${fillColor(fill)};font:700 20px/1.1 ${HAND};box-shadow:0 2px 0 ${SHEET.ink};">` +
      `${esc(percent(fill))} full</span>`;
    return el;
  }

  /**
   * The window as a grid of squares, each a half percent, coloured by what
   * fills it. Hovering a square names its part, with its tokens and share,
   * and picks out every square of that part.
   */
  private grid(report: ContextReport): HTMLElement {
    const cells = gridOf(report, GRID_COLS * GRID_ROWS);
    const wrap = document.createElement('div');
    css(wrap, 'position:relative;margin-bottom:18px;');
    const el = document.createElement('div');
    css(
      el,
      `display:grid;grid-template-columns:repeat(${GRID_COLS},1fr);gap:3px;` +
        `padding:10px;border:2px solid ${SHEET.ink};border-radius:10px;background:${MAT.wall.l};`
    );
    el.innerHTML = cells
      .map((part) =>
        part
          ? `<span data-part="${part}" style="aspect-ratio:1;border-radius:3px;background:${PART_COLORS[part]};` +
            `border:1.2px solid ${SHEET.ink};transition:opacity 120ms;"></span>`
          : `<span data-part="free" style="aspect-ratio:1;border-radius:3px;` +
            `border:1.2px dashed ${SHEET.lead}66;transition:opacity 120ms;"></span>`
      )
      .join('');

    const tip = document.createElement('div');
    tip.setAttribute('role', 'tooltip');
    css(
      tip,
      'position:absolute;z-index:1;display:none;pointer-events:none;white-space:nowrap;' +
        `padding:6px 12px;border:1.5px solid ${SHEET.ink};border-radius:10px;background:${SHEET.paper};` +
        `box-shadow:0 2px 0 ${SHEET.ink};font:400 17px/1.25 ${HAND};color:${SHEET.ink};`
    );
    wrap.append(el, tip);

    let shown: string | null = null;
    const squares = [...el.children] as HTMLElement[];
    const pick = (part: string | null): void => {
      for (const square of squares) {
        square.style.opacity = part === null || square.dataset.part === part ? '1' : '0.3';
      }
    };
    el.addEventListener('pointermove', (e) => {
      const square = (e.target as HTMLElement).closest<HTMLElement>('[data-part]');
      if (!square || !el.contains(square)) {
        return;
      }
      const part = square.dataset.part ?? 'free';
      if (part !== shown) {
        shown = part;
        const t = cellTip(report, part === 'free' ? null : (part as ContextPart));
        tip.innerHTML =
          `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:7px;` +
          `vertical-align:-1px;${part === 'free' ? `border:1.2px dashed ${SHEET.lead};` : `background:${PART_COLORS[part as ContextPart]};border:1.2px solid ${SHEET.ink};`}"></span>` +
          `<b>${esc(t.title)}</b><span style="color:${SHEET.lead};"> · ${esc(t.detail)}</span>`;
        tip.style.display = 'block';
        pick(part);
      }
      // Over the square, kept inside the grid's width.
      const box = wrap.getBoundingClientRect();
      const at = square.getBoundingClientRect();
      const w = tip.offsetWidth;
      const left = Math.max(0, Math.min(box.width - w, at.left - box.left + at.width / 2 - w / 2));
      tip.style.left = `${left}px`;
      tip.style.top = `${at.top - box.top - tip.offsetHeight - 8}px`;
    });
    el.addEventListener('pointerleave', () => {
      shown = null;
      tip.style.display = 'none';
      pick(null);
    });
    return wrap;
  }

  /** Every part with its share, set-up first, then the conversation, then the room left. */
  private legend(report: ContextReport): HTMLElement {
    const el = document.createElement('div');
    css(el, 'display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:4px 28px;');
    const setup = report.slices.filter((s) => SETUP_PARTS.has(s.part));
    const talk = report.slices.filter((s) => !SETUP_PARTS.has(s.part));
    const free = Math.max(0, report.window - report.used);
    const column = (title: string, rows: string[]): string =>
      `<div><div style="font:700 19px/1.2 ${HAND};margin:4px 0 6px;">${esc(title)}</div>${rows.join('')}</div>`;
    const row = (part: ContextPart | null, label: string, n: number): string => {
      const share = report.window > 0 ? n / report.window : 0;
      const swatch = part
        ? `background:${PART_COLORS[part]};border:1.2px solid ${SHEET.ink};`
        : `border:1.2px dashed ${SHEET.lead};`;
      return (
        `<div style="display:flex;align-items:center;gap:10px;padding:3px 0;font:400 19px/1.25 ${HAND};">` +
        `<span style="flex:none;width:15px;height:15px;border-radius:3px;${swatch}"></span>` +
        `<span style="flex:1;min-width:0;">${esc(label)}</span>` +
        `<span style="font-weight:700;">${esc(tokens(n))}</span>` +
        `<span style="width:46px;text-align:right;color:${SHEET.lead};">${esc(percent(share))}</span></div>`
      );
    };
    const setupRows = setup.map((s) => row(s.part, s.label, s.tokens));
    const talkRows = talk.map((s) => row(s.part, s.label, s.tokens));
    talkRows.push(row(null, 'Free space', free));
    el.innerHTML =
      column('Set up before you type', setupRows.length ? setupRows : ['']) +
      column('The conversation', talkRows);
    return el;
  }

  private foot(report: ContextReport): HTMLElement {
    const el = document.createElement('div');
    css(
      el,
      `margin-top:16px;font:400 16px/1.4 ${HAND};color:${SHEET.lead};display:flex;` +
        'flex-wrap:wrap;gap:4px 18px;'
    );
    const at = report.at
      ? new Date(report.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '';
    const notes = [
      at ? `as of the reply at ${at}` : '',
      report.turns > 0 ? `${report.turns} ${report.turns === 1 ? 'prompt' : 'prompts'}` : '',
      `fullest ${tokens(report.peak)}`,
      report.compactions > 0
        ? `compacted ${report.compactions} ${report.compactions === 1 ? 'time' : 'times'}`
        : 'never compacted',
      'the total is measured; its parts are worked out from the transcript',
      report.estimated
        ? 'this transcript does not say what the system prompt and tools held, so they are one part'
        : '',
    ].filter(Boolean);
    el.innerHTML = notes.map((n) => `<span>${esc(n)}</span>`).join('');
    return el;
  }
}
