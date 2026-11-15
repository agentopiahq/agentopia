import type { UsagePeriod, UsageProjectRow, UsageReport, UsageRow } from '@agentopia/core';

import { FONT } from './kit/iso';
import { MAT, SHEET } from './kit/palette';
import { UsageDimension, UsageView, money, tokens } from './usage';

/**
 * The usage ledger: what opens when the usage board on the wall is clicked.
 *
 * Laid out like ccusage's reports, on the office's paper: daily, weekly or
 * monthly bars across the top (click one to read it), and under them the
 * period picked, its tokens by kind, and its spend broken down by agent, by
 * project (each opening to its sessions) and by model. Every cost is the API-rate equivalent, which is what
 * a transcript can tell; a subscription bills nothing per token.
 */

export interface UsagePanelOptions {
  onClose: () => void;
}

const VIEWS: Array<{ view: UsageView; label: string; noun: string }> = [
  { view: 'days', label: 'Daily', noun: 'day' },
  { view: 'weeks', label: 'Weekly', noun: 'week' },
  { view: 'months', label: 'Monthly', noun: 'month' },
];

const BREAKDOWNS: Array<{ by: UsageDimension; title: string }> = [
  { by: 'harnesses', title: 'By harness' },
  { by: 'agents', title: 'By agent' },
  { by: 'projects', title: 'By project' },
  { by: 'models', title: 'By model' },
];

const BLUE = '#2f5fb0';

/** The narrowest a period's bar slot gets before the chart scrolls instead, in px. */
const MIN_SLOT: Record<UsageView, number> = { days: 26, weeks: 48, months: 64 };

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

/** A period's heading: `Saturday, Nov 14`, `Week of Nov 10`, `November 2026`. */
export function periodTitle(view: UsageView, period: UsagePeriod): string {
  const [y, m, d] = period.key.split('-').map(Number);
  if (view === 'months') {
    const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
      month: 'long',
      timeZone: 'UTC',
    });
    return `${month} ${y}`;
  }
  if (view === 'weeks') {
    return `Week of ${period.label}`;
  }
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return `${weekday}, ${period.label}`;
}

/** Where the ledger's prices came from: models.dev on a date, or the tables built in. */
export function pricesNote(prices: UsageReport['prices'] | undefined): string {
  if (prices?.source === 'models.dev' && prices.at !== undefined) {
    const day = new Date(prices.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `API prices from models.dev, ${day}`;
  }
  return 'API prices built in (models.dev not reached)';
}

/** A round step for the chart's grid: 1, 2 or 5 times a power of ten. */
export function niceStep(max: number, lines = 4): number {
  const raw = Math.max(max, 0.01) / lines;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
}

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

export class UsagePanel {
  private readonly overlay: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly subtitle = document.createElement('div');
  private readonly tabs = new Map<UsageView, HTMLButtonElement>();
  private report: UsageReport | null = null;
  /** Whether the report is made up, for a demo. */
  private demo = false;
  private status: 'reading' | 'none' = 'reading';
  private view: UsageView = 'days';
  /** The period picked, by key; the newest when none is. */
  private picked: string | null = null;
  /** How far the chart is scrolled, kept across redraws; null opens it on the newest. */
  private scrolled: number | null = null;
  /** The projects opened to show their sessions, by id; all closed when the ledger opens. */
  private expanded = new Set<string>();
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close();
    }
  };
  private readonly onResize = (): void => this.render();

  constructor(
    host: HTMLElement,
    private readonly options: UsagePanelOptions
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
    card.setAttribute('aria-label', 'Usage ledger');
    css(
      card,
      `width:min(1040px,100%);max-height:100%;display:flex;flex-direction:column;` +
        `background:${SHEET.paper};border:2.5px solid ${SHEET.ink};border-radius:14px;` +
        `box-shadow:5px 6px 0 ${SHEET.ink};color:${SHEET.ink};font-family:${FONT.hand};` +
        // Whatever page it is mounted in (the marketing site centres its text), it reads as a ledger.
        'text-align:left;line-height:normal;' +
        'overflow:hidden;box-sizing:border-box;'
    );

    const head = document.createElement('div');
    css(
      head,
      'display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;' +
        `padding:20px 24px 14px;border-bottom:2px solid ${SHEET.ink};`
    );
    const titles = document.createElement('div');
    titles.innerHTML = `<div style="font:400 34px/1 ${TITLE};">Usage</div>`;
    css(this.subtitle, `font:400 18px/1.3 ${FONT.hand};color:${SHEET.lead};margin-top:6px;`);
    titles.appendChild(this.subtitle);
    const controls = document.createElement('div');
    css(controls, 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;');
    for (const { view, label } of VIEWS) {
      const tab = button(label, `${label} usage`, () => this.show(view));
      this.tabs.set(view, tab);
      controls.appendChild(tab);
    }
    controls.appendChild(button('done', 'Close the ledger', () => this.close()));
    head.append(titles, controls);

    this.body = document.createElement('div');
    // The scrollbar's room is kept whether or not a period's rows overflow, so
    // nothing shifts between periods; it is a thumb on no track.
    css(
      this.body,
      'overflow-y:auto;scrollbar-gutter:stable;padding:18px 24px 22px;' +
        `scrollbar-width:thin;scrollbar-color:${SHEET.lead}80 transparent;`
    );
    card.append(head, this.body);
    this.overlay.appendChild(card);
    host.appendChild(this.overlay);
  }

  get isOpen(): boolean {
    return this.overlay.style.display !== 'none';
  }

  open(): void {
    this.overlay.style.display = 'flex';
    this.picked = null;
    this.scrolled = null;
    this.expanded.clear();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    this.render();
    this.body.scrollTop = 0;
  }

  close(): void {
    if (!this.isOpen) {
      return;
    }
    this.overlay.style.display = 'none';
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.options.onClose();
  }

  /**
   * A new report, or why there is none; redrawn at once if open. A `demo`
   * report is made up (the marketing site's office), and says so.
   */
  update(report: UsageReport | 'reading' | 'none', options: { demo?: boolean } = {}): void {
    if (typeof report === 'object') {
      this.report = report;
      this.demo = options.demo === true;
    } else {
      this.status = report;
    }
    if (this.isOpen) {
      this.render();
    }
  }

  private show(view: UsageView): void {
    this.view = view;
    this.picked = null;
    this.scrolled = null;
    this.render();
  }

  private periods(): UsagePeriod[] {
    return this.report?.[this.view] ?? [];
  }

  private render(): void {
    for (const [view, tab] of this.tabs) {
      const on = view === this.view;
      tab.style.background = on ? MAT.mustard.l : SHEET.paper;
      tab.setAttribute('aria-pressed', String(on));
    }
    // Whose records these are: every harness with usage, by name.
    const names = this.report?.harnesses.map((h) => `${h.label}'s`) ?? [];
    this.subtitle.textContent = this.demo
      ? 'a made-up few months of Claude Code work, priced at API rates: run agentopia to see yours'
      : 'what the work cost at API rates, read from ' +
        (names.length ? `${names.join(' and ')} own records` : "your agents' own records") +
        ' on this machine';
    const periods = this.periods();
    if (!this.report || periods.length === 0) {
      const note =
        this.status === 'none'
          ? 'This office has no usage to show: it is not reading any transcripts.'
          : "Adding up your agents' usage… the first read takes a few seconds.";
      this.body.innerHTML = `<p style="font:400 22px/1.4 ${HAND};color:${SHEET.lead};margin:24px 0;">${note}</p>`;
      return;
    }
    const period = periods.find((p) => p.key === this.picked) ?? periods[periods.length - 1];
    // A redraw (a project opened, a bar picked, a fresh report) keeps the
    // reader where they were scrolled to; only opening the ledger starts at the top.
    const top = this.body.scrollTop;
    this.body.replaceChildren(
      this.chart(periods, period),
      this.summary(period),
      this.breakdowns(period)
    );
    const foot = document.createElement('div');
    css(
      foot,
      `margin-top:16px;font:400 16px/1.4 ${FONT.hand};color:${SHEET.lead};display:flex;` +
        'flex-wrap:wrap;gap:4px 18px;'
    );
    const at = new Date(this.report.at).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const all = this.report.allTime;
    foot.innerHTML =
      `<span>all time ${esc(money(all.cost))} · ${esc(tokens(all.tokens))} tokens</span>` +
      `<span>added up at ${esc(at)}</span>` +
      (this.demo ? '' : `<span>${esc(pricesNote(this.report.prices))}</span>`) +
      (this.report.unpriced.length
        ? `<span style="color:${MAT.tomato.d};">no price for ${esc(this.report.unpriced.join(', '))}, counted at $0</span>`
        : '');
    this.body.appendChild(foot);
    this.body.scrollTop = top;
  }

  /**
   * The periods as bars, the picked one in red; click one to read it. Every
   * period is drawn at a readable width, so a long history scrolls sideways
   * under a fixed money axis, opening on the newest.
   */
  private chart(periods: UsagePeriod[], picked: UsagePeriod): HTMLElement {
    const shown = Math.max(320, Math.min(960, (this.body.clientWidth || 1008) - 48));
    const H = shown < 600 ? 160 : 190;
    const axis = 84;
    const bottom = 26;
    const top = 10;
    const peak = Math.max(...periods.map((p) => p.cost), 0.01);
    const step = niceStep(peak);
    const ceil = Math.ceil(peak / step) * step;
    // As wide as the view when the periods fit; wider, and scrolled, when not.
    const slot = Math.max(MIN_SLOT[this.view], (shown - axis - 48) / periods.length);
    // Room either end for the first and last labels, centred under their bars.
    const pad = 24;
    const W = Math.ceil(slot * periods.length + pad * 2);
    const yOf = (v: number): number => top + (1 - v / ceil) * (H - top - bottom);
    // Every label when they fit; otherwise every few, always the newest.
    const every = Math.ceil(58 / slot);
    const ticks: string[] = [];
    const lines: string[] = [];
    for (let v = 0; v <= ceil + 1e-9; v += step) {
      const y = yOf(v);
      ticks.push(
        `<text x="${axis - 8}" y="${y + 5}" text-anchor="end" font-size="15" fill="${SHEET.lead}">${esc(money(v))}</text>`
      );
      lines.push(
        `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${SHEET.grid}" stroke-width="1.5"/>`
      );
    }
    const bars = periods.map((p, i) => {
      const x = pad + i * slot + slot * 0.15;
      const w = slot * 0.7;
      const y = yOf(p.cost);
      const on = p.key === picked.key;
      const fill = on ? MAT.tomato.m : MAT.cobalt.m;
      const show = (periods.length - 1 - i) % every === 0;
      return (
        `<g data-key="${esc(p.key)}" style="cursor:pointer">` +
        `<rect x="${x - slot * 0.15}" y="${top}" width="${slot}" height="${H - top}" fill="transparent"/>` +
        (p.cost > 0
          ? `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(1, H - bottom - y)}" rx="2" fill="${fill}" stroke="${SHEET.ink}" stroke-width="1.6"/>`
          : '') +
        (show
          ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" font-size="15" fill="${on ? MAT.tomato.d : SHEET.ink}">${esc(p.label)}</text>`
          : '') +
        `<title>${esc(p.label)}: ${esc(money(p.cost))}, ${esc(tokens(p.tokens))} tokens</title></g>`
      );
    });
    const font = `font-family:${HAND};font-weight:700;`;
    const noun = VIEWS.find((v) => v.view === this.view)?.noun;
    const wrap = document.createElement('div');
    css(wrap, 'display:flex;align-items:stretch;');
    wrap.innerHTML =
      `<svg width="${axis}" height="${H}" aria-hidden="true" style="flex:none;display:block;${font}">${ticks.join('')}</svg>` +
      `<div data-scroll style="flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;` +
      `scrollbar-width:thin;scrollbar-color:${SHEET.lead}80 transparent;">` +
      `<svg width="${W}" height="${H}" role="img" aria-label="Cost per ${noun}" style="display:block;${font}">` +
      `${lines.join('')}<line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" stroke="${SHEET.ink}" stroke-width="2"/>` +
      `${bars.join('')}</svg></div>`;
    const scroller = wrap.querySelector<HTMLDivElement>('[data-scroll]');
    if (scroller) {
      scroller.addEventListener('scroll', () => {
        this.scrolled = scroller.scrollLeft;
      });
      // Keep the view where it was across a redraw; a new view opens on the newest.
      requestAnimationFrame(() => {
        scroller.scrollLeft = this.scrolled ?? scroller.scrollWidth;
      });
    }
    wrap.querySelectorAll('g[data-key]').forEach((g) => {
      g.addEventListener('click', () => {
        this.picked = g.getAttribute('data-key');
        this.render();
      });
    });
    return wrap;
  }

  /** The picked period: its cost, and its tokens by kind. */
  private summary(period: UsagePeriod): HTMLElement {
    const el = document.createElement('div');
    css(
      el,
      'display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 22px;margin:16px 0 14px;' +
        `padding-top:14px;border-top:1.5px dashed ${SHEET.lead};`
    );
    const chip = (label: string, value: string): string =>
      `<span style="display:inline-flex;align-items:baseline;gap:6px;">` +
      `<span style="font:400 16px/1 ${HAND};color:${SHEET.lead};">${label}</span>` +
      `<span style="font:700 20px/1 ${HAND};">${esc(value)}</span></span>`;
    el.innerHTML =
      `<span style="font:400 20px/1 ${HAND};color:${SHEET.lead};width:100%;">${esc(periodTitle(this.view, period))}</span>` +
      `<span style="font:400 44px/1 ${TITLE};color:${BLUE};">${esc(money(period.cost))}</span>` +
      chip('tokens', tokens(period.tokens)) +
      chip('input', tokens(period.input)) +
      chip('output', tokens(period.output)) +
      chip('cache write', tokens(period.cacheWrite)) +
      chip('cache read', tokens(period.cacheRead)) +
      chip('requests', period.requests.toLocaleString('en-US'));
    return el;
  }

  /**
   * The period's spend by agent, by project and by model, side by side.
   * A project opens to show its sessions under it.
   */
  private breakdowns(period: UsagePeriod): HTMLElement {
    const grid = document.createElement('div');
    css(grid, 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;');
    // By harness only says something once there is more than one.
    const several = (this.report?.harnesses.length ?? 0) > 1;
    const noun = VIEWS.find((v) => v.view === this.view)?.noun;
    for (const { by, title } of BREAKDOWNS.filter((b) => b.by !== 'harnesses' || several)) {
      const col = document.createElement('section');
      const body =
        by === 'projects'
          ? period.projects.map((r) => this.project(r, period.cost)).join('')
          : period[by].map((r) => this.row(r, period.cost)).join('');
      col.innerHTML =
        `<h3 style="margin:0 0 8px;font:700 19px/1 ${HAND};letter-spacing:0.5px;` +
        `border-bottom:2px solid ${BLUE};padding-bottom:6px;color:${BLUE};">${title}</h3>` +
        (body ||
          `<div style="font:400 17px/1.4 ${HAND};color:${SHEET.lead};">nothing this ${noun}</div>`);
      col.querySelectorAll<HTMLButtonElement>('button[data-project]').forEach((b) => {
        b.addEventListener('click', () => {
          const id = b.dataset.project ?? '';
          if (this.expanded.has(id)) {
            this.expanded.delete(id);
          } else {
            this.expanded.add(id);
          }
          this.render();
        });
      });
      grid.appendChild(col);
    }
    return grid;
  }

  /** A project: a row that opens to its sessions, each a row of its own under it. */
  private project(r: UsageProjectRow, total: number): string {
    const open = this.expanded.has(r.id);
    const count = `${r.sessionCount} session${r.sessionCount === 1 ? '' : 's'}`;
    const head = this.row(r, total, {
      note: r.detail ? `${count} · ${r.detail}` : count,
      caret: open ? '▾' : '▸',
    });
    const more = r.sessionCount - r.sessions.length;
    const sessions = open
      ? `<div style="padding-left:18px;border-left:2px solid ${SHEET.grid};margin-left:5px;">` +
        r.sessions.map((s) => this.row(s, r.cost, { note: '', small: true })).join('') +
        (more > 0
          ? `<div style="font:400 14px/1.4 ${HAND};color:${SHEET.lead};padding:4px 0;">and ${more} more</div>`
          : '') +
        `</div>`
      : '';
    return (
      `<button type="button" data-project="${esc(r.id)}" aria-expanded="${open}" ` +
      `title="${open ? 'Hide' : 'Show'} its sessions" ` +
      `style="all:unset;display:block;width:100%;box-sizing:border-box;cursor:pointer;">` +
      `${head}</button>${sessions}`
    );
  }

  /**
   * One line of a breakdown: its name, its share of `total` as a marker bar,
   * its tokens and cost, and a note after the tokens (its `detail` unless
   * told otherwise). A caret marks a row that opens; a small one sits under it.
   */
  private row(
    r: UsageRow,
    total: number,
    options: { note?: string; caret?: string; small?: boolean } = {}
  ): string {
    const share = total > 0 ? Math.max(0.02, r.cost / total) : 0;
    const note = options.note ?? (r.detail && r.detail !== r.label ? r.detail : '');
    const caret = options.caret
      ? `<span style="display:inline-block;width:16px;color:${BLUE};">${options.caret}</span>`
      : '';
    return (
      `<div style="padding:6px 0;border-bottom:1px solid ${SHEET.grid};">` +
      `<div style="display:flex;justify-content:space-between;gap:10px;font:700 ${options.small ? 15 : 17}px/1.2 ${HAND};">` +
      `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.label)}">${caret}${esc(r.label)}</span>` +
      `<span style="flex:none;">${esc(money(r.cost))}</span></div>` +
      `<div style="display:flex;align-items:center;gap:8px;margin-top:4px;font:400 14px/1 ${HAND};color:${SHEET.lead};">` +
      `<span style="flex:1;height:7px;border-radius:4px;background:${SHEET.grid};overflow:hidden;">` +
      `<span style="display:block;height:100%;width:${(share * 100).toFixed(1)}%;background:${MAT.mustard.m};"></span></span>` +
      `<span style="flex:none;">${esc(tokens(r.tokens))} tok${note ? ` · ${esc(note)}` : ''}</span>` +
      `</div></div>`
    );
  }
}
