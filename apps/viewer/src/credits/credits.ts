import { Clock } from '@agentopia/core';

import { FONT } from '../kit/iso';
import { SHEET } from '../kit/palette';
import { COMPANY_LOGOS } from './logos';

/**
 * The office's small print, folded into two pill icons side by side in its
 * bottom-left corner so it never covers the office: a © that opens into who
 * made it and the copyright, and a link icon beside it that opens into GitHub
 * and the website's legal pages. Each opens
 * while hovered (or focused, or tapped on a touch screen). Plain DOM over the
 * canvas, lettered and inked like the sheet's own pills.
 */

export const SITE_URL = 'https://agentopia.town';
export const GITHUB_URL = 'https://github.com/tuliren/agentopia';
export const COPYRIGHT_HOLDER = 'Starfish Software LLC';

export interface CreditsOptions {
  /** Where the year comes from: the office never reads the wall clock itself. */
  clock: Clock;
  /**
   * The website the legal links go to: empty when the office is on that
   * website already (the marketing hero), a full origin elsewhere (the local
   * viewer). Every link opens in a new tab, so the office keeps playing.
   */
  site?: string;
}

export interface CreditLink {
  label: string;
  href: string;
  /** Drawn as the mark rather than lettered. */
  icon?: 'github';
}

/** The links icon's links, for an office on `site` (empty: on the website itself). */
export function creditLinks(site: string): CreditLink[] {
  return [
    { label: 'GitHub', href: GITHUB_URL, icon: 'github' },
    { label: 'Terms', href: `${site}/terms` },
    { label: 'Privacy', href: `${site}/privacy` },
  ];
}

export function copyrightLine(year: number): string {
  return `© ${year} ${COPYRIGHT_HOLDER}. All rights reserved.`;
}

/** How tall the logos stand, as a share of the heights in `logos.ts`. */
const LOGO_SCALE = 0.5;

const svgIcon = (size: number, inner: string, viewBox = '0 0 24 24'): string =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="${viewBox}" fill="none" ` +
  `stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

/** The GitHub mark (Octicons, MIT). */
const GITHUB_MARK = `<svg aria-hidden="true" width="17" height="17" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;
/** A chain link, the links' folded icon. */
const LINK_ICON = svgIcon(
  16,
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
);
/** The small arrow after a link that opens a new tab. */
const EXTERNAL_ICON = svgIcon(7, '<path d="M4 12L12 4M6 4h6v6"/>', '0 0 16 16');

const PILL =
  `box-sizing:border-box;border:1.5px solid ${SHEET.ink};background:${SHEET.paper};` +
  `box-shadow:0 2px 0 ${SHEET.ink};color:${SHEET.ink};`;

const STYLE = `
.agentopia-corner{position:absolute;z-index:2;user-select:none;font:400 14px/1.15 ${FONT.hand};}
.agentopia-corner-icon{${PILL}display:flex;align-items:center;justify-content:center;
  width:34px;height:32px;padding:0;border-radius:999px;cursor:pointer;font:700 19px/1 ${FONT.hand};}
.agentopia-corner-panel{position:absolute;left:0;bottom:100%;padding-bottom:8px;display:none;}
.agentopia-corner:focus-within .agentopia-corner-panel,
.agentopia-corner.open .agentopia-corner-panel{display:block;}
@media (hover:hover){.agentopia-corner:hover .agentopia-corner-panel{display:block;}}
.agentopia-corner-card{${PILL}border-radius:14px;padding:7px 12px 8px;color:${SHEET.lead};
  white-space:nowrap;animation:agentopia-corner-in 120ms ease-out;}
@keyframes agentopia-corner-in{from{opacity:0;transform:translateY(3px);}to{opacity:1;transform:none;}}
.agentopia-credits-link{display:inline-flex;align-items:center;gap:3px;color:${SHEET.ink};
  font-weight:700;font-size:15px;text-decoration:none;border-bottom:1.5px solid transparent;}
.agentopia-credits-link:hover,.agentopia-credits-link:focus-visible{border-bottom-color:${SHEET.ink};outline:none;}
.agentopia-credits-link svg{display:block;}
.agentopia-credits-logo{display:block;width:auto;filter:grayscale(1) sepia(0.35);opacity:0.72;}
`;

const svgSrc = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * One pill icon that opens a card while hovered or focused. A tap
 * toggles it too, for touch screens, and a press anywhere else closes it.
 */
function corner(label: string, icon: string, card: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'agentopia-corner';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'agentopia-corner-icon';
  button.innerHTML = icon;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = 'agentopia-corner-panel';
  card.classList.add('agentopia-corner-card');
  panel.appendChild(card);
  el.append(panel, button);
  const setOpen = (open: boolean): void => {
    el.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    if (!open && el.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  };
  button.addEventListener('click', () => setOpen(!el.classList.contains('open')));
  // Presses on the small print are its own: never a drag or a tap of the office under it.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const outside = (e: PointerEvent): void => {
    if (!el.contains(e.target as Node)) {
      setOpen(false);
    }
  };
  document.addEventListener('pointerdown', outside);
  return { el, dispose: (): void => document.removeEventListener('pointerdown', outside) };
}

/** Mount the credits into `host` (the element holding the office's canvas). Returns an unmount. */
export function mountCredits(host: HTMLElement, options: CreditsOptions): () => void {
  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }
  const style = document.createElement('style');
  style.textContent = STYLE;

  // The makers' companies, and the copyright under them.
  const credits = document.createElement('div');
  credits.setAttribute('role', 'contentinfo');
  const lede = document.createElement('div');
  lede.textContent = 'Brought to you by folks from';
  lede.style.cssText = `font-size:15px;color:${SHEET.ink};`;
  const logos = document.createElement('ul');
  logos.setAttribute('role', 'list');
  logos.style.cssText =
    'display:flex;align-items:center;gap:12px;margin:6px 0 7px;padding:0;list-style:none;';
  for (const logo of COMPANY_LOGOS) {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.className = 'agentopia-credits-logo';
    img.src = svgSrc(logo.svg);
    img.alt = logo.name;
    img.title = logo.name;
    img.style.height = `${Math.round(logo.height * LOGO_SCALE)}px`;
    img.draggable = false;
    li.appendChild(img);
    logos.appendChild(li);
  }
  const copyright = document.createElement('div');
  copyright.textContent = copyrightLine(new Date(options.clock.now()).getFullYear());
  copyright.style.cssText = 'font-size:13px;';
  credits.append(lede, logos, copyright);
  const left = corner('Credits', '©', credits);
  left.el.style.cssText = 'left:14px;bottom:14px;';

  // The code and the legal pages.
  const links = document.createElement('nav');
  links.setAttribute('aria-label', 'Agentopia links');
  links.style.cssText = 'display:flex;align-items:center;gap:12px;padding:6px 12px;';
  for (const link of creditLinks(options.site ?? SITE_URL)) {
    const a = document.createElement('a');
    a.className = 'agentopia-credits-link';
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (link.icon === 'github') {
      a.innerHTML = GITHUB_MARK;
      a.title = link.label;
      a.setAttribute('aria-label', `${link.label} (opens in a new tab)`);
    } else {
      a.textContent = link.label;
      a.insertAdjacentHTML('beforeend', EXTERNAL_ICON);
      a.setAttribute('aria-label', `${link.label} (opens in a new tab)`);
    }
    links.appendChild(a);
  }
  // Beside the © (its 34px pill and a gap), opening upward the same way.
  const right = corner('Links', LINK_ICON, links);
  right.el.style.cssText = `left:${14 + 34 + 8}px;bottom:14px;`;

  host.append(style, left.el, right.el);
  return (): void => {
    left.dispose();
    right.dispose();
    style.remove();
    left.el.remove();
    right.el.remove();
  };
}
