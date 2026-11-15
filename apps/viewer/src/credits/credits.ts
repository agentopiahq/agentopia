import { Clock } from '@agentopia/core';

import { FONT } from '../kit/iso';
import { SHEET } from '../kit/palette';
import { COMPANY_LOGOS } from './logos';

/**
 * The office's small print, in its two bottom corners: who made it and the
 * copyright on the left, links to the code and the website's legal pages on
 * the right, just above the camera controls. Plain DOM over the canvas,
 * lettered and inked like the sheet's own pills, so it reads as part of the
 * print rather than a page footer.
 */

export const SITE_URL = 'https://agentopia.town';
export const GITHUB_URL = 'https://github.com/tuliren/agentopia';
export const COPYRIGHT_HOLDER = 'Starfish Software LLC';

export interface CreditsOptions {
  /** Where the year comes from: the office never reads the wall clock itself. */
  clock: Clock;
  /**
   * The website the legal links go to. Empty when the office is on that
   * website already (the marketing hero), so the links stay on the site and
   * open in place; a full origin (the local viewer) opens them in a new tab.
   */
  site?: string;
}

export interface CreditLink {
  label: string;
  href: string;
  /** Off the page the office is on: opens in a new tab. */
  external: boolean;
}

/** The right corner's links, for a office on `site` (empty: on the website itself). */
export function creditLinks(site: string): CreditLink[] {
  const onSite = site === '';
  return [
    { label: 'GitHub', href: GITHUB_URL, external: true },
    { label: 'Terms', href: `${site}/terms`, external: !onSite },
    { label: 'Privacy', href: `${site}/privacy`, external: !onSite },
  ];
}

export function copyrightLine(year: number): string {
  return `© ${year} ${COPYRIGHT_HOLDER}. All rights reserved.`;
}

/** Below this host width the left corner drops the logos and keeps the copyright. */
export const COMPACT_W = 720;

/** How tall the logos stand, as a share of the heights in `logos.ts`. */
const LOGO_SCALE = 0.5;

/** The camera controls' row (zoom.ts) is 32px plus its 2px drop, 14px off the bottom. */
const ABOVE_CONTROLS = 14 + 34 + 8;

const CARD =
  `position:absolute;z-index:2;box-sizing:border-box;padding:7px 12px 8px;` +
  `border:1.5px solid ${SHEET.ink};border-radius:14px;background:${SHEET.paper};` +
  `box-shadow:0 2px 0 ${SHEET.ink};color:${SHEET.lead};font:400 14px/1.15 ${FONT.hand};` +
  `user-select:none;`;

const STYLE = `
.agentopia-credits-link{color:${SHEET.ink};font-weight:700;text-decoration:none;
  border-bottom:1.5px solid transparent;}
.agentopia-credits-link:hover,.agentopia-credits-link:focus-visible{border-bottom-color:${SHEET.ink};outline:none;}
.agentopia-credits-logo{display:block;width:auto;filter:grayscale(1) sepia(0.35);opacity:0.72;}
.agentopia-credits.compact .agentopia-credits-folks{display:none;}
`;

const svgSrc = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Mount the credits into `host` (the element holding the office's canvas). Returns an unmount. */
export function mountCredits(host: HTMLElement, options: CreditsOptions): () => void {
  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }
  const style = document.createElement('style');
  style.textContent = STYLE;

  // Left corner: the makers' companies, and the copyright under them.
  const left = document.createElement('div');
  left.className = 'agentopia-credits';
  left.setAttribute('role', 'contentinfo');
  left.style.cssText = `${CARD}left:14px;bottom:14px;max-width:calc(100% - 28px);`;
  const folks = document.createElement('div');
  folks.className = 'agentopia-credits-folks';
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
  folks.append(lede, logos);
  const copyright = document.createElement('div');
  copyright.textContent = copyrightLine(new Date(options.clock.now()).getFullYear());
  copyright.style.cssText = 'font-size:13px;';
  left.append(folks, copyright);

  // Right corner: the code and the legal pages, over the camera controls.
  const right = document.createElement('nav');
  right.setAttribute('aria-label', 'Agentopia links');
  right.style.cssText =
    `${CARD}right:14px;bottom:${ABOVE_CONTROLS}px;display:flex;gap:12px;padding:5px 12px 6px;` +
    'font-size:15px;';
  for (const link of creditLinks(options.site ?? SITE_URL)) {
    const a = document.createElement('a');
    a.className = 'agentopia-credits-link';
    a.href = link.href;
    a.textContent = link.external && link.label === 'GitHub' ? 'GitHub ↗' : link.label;
    if (link.external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    right.appendChild(a);
  }

  // Presses on the small print are its own: never a drag or a tap of the office under it.
  for (const el of [left, right]) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  const fit = (): void => {
    left.classList.toggle('compact', host.clientWidth < COMPACT_W);
  };
  fit();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
  observer?.observe(host);

  host.append(style, left, right);
  return (): void => {
    observer?.disconnect();
    style.remove();
    left.remove();
    right.remove();
  };
}
