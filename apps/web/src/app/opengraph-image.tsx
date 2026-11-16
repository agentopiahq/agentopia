import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DOMAIN, TAGLINE, TITLE } from '@/constants';
import { OG_IMAGE } from '@/seo';

/**
 * The social card: the title block lettered like the office's own sheet
 * (Young Serif title, Gaegu hand lettering, ink on paper) beside a picture of
 * the office itself. Rendered once at build time, since it takes no params.
 */

export const alt = OG_IMAGE.alt;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The office's title-block line, as the hero letters it. */
const SUBTITLE =
  "Watch your agents work, track every token they burn, and enjoy the view while you're still employed.";

/** The sheet's colours (`SHEET` in the viewer's `kit/palette.ts`). */
const PAPER = '#fffdf6';
const INK = '#2b2930';
const LEAD = '#6a6055';
const LINE = '#4a3a30';

const PANEL_WIDTH = 470;

/**
 * One Google Font, subset to `text`. The request names no browser on purpose:
 * Google then serves a TTF, which Satori reads, where a browser's user agent
 * gets woff2, which it cannot.
 */
async function loadGoogleFont(family: string, weight: number, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(url).then((res) => res.text());
  const match = css.match(/src: url\((https:\/\/[^)]+)\) format/);
  if (!match) {
    throw new Error(`Could not extract font URL for ${family} ${weight}`);
  }
  return fetch(match[1]).then((res) => res.arrayBuffer());
}

/** The card's fonts, or none (Satori's bundled sans) if Google Fonts is unreachable. */
async function loadFonts() {
  const glyphs = `${TITLE}${TAGLINE}${SUBTITLE}${DOMAIN}`;
  try {
    const [title, hand, handBold] = await Promise.all([
      loadGoogleFont('Young Serif', 400, glyphs),
      loadGoogleFont('Gaegu', 400, glyphs),
      loadGoogleFont('Gaegu', 700, glyphs),
    ]);
    return [
      { name: 'Young Serif', data: title, weight: 400 as const, style: 'normal' as const },
      { name: 'Gaegu', data: hand, weight: 400 as const, style: 'normal' as const },
      { name: 'Gaegu', data: handBold, weight: 700 as const, style: 'normal' as const },
    ];
  } catch {
    return [];
  }
}

const dataUrl = async (path: string, type: string) =>
  `data:${type};base64,${(await readFile(join(process.cwd(), path))).toString('base64')}`;

export default async function OpengraphImage() {
  const [fonts, office, badge] = await Promise.all([
    loadFonts(),
    dataUrl('src/app/og-office.jpg', 'image/jpeg'),
    dataUrl('public/android-chrome-192x192.png', 'image/png'),
  ]);

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        background: PAPER,
        fontFamily: 'Gaegu',
      }}
    >
      <div
        style={{
          width: PANEL_WIDTH,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '52px 36px 44px 48px',
          borderRight: `4px solid ${LINE}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src={badge} width={56} height={56} alt="" style={{ borderRadius: 14 }} />
            <div style={{ fontFamily: 'Young Serif', fontSize: 56, color: INK, letterSpacing: -1 }}>
              {TITLE}
            </div>
          </div>
          <div
            style={{
              marginTop: 34,
              fontSize: 46,
              fontWeight: 700,
              lineHeight: 1.05,
              color: INK,
            }}
          >
            {TAGLINE}
          </div>
          <div style={{ marginTop: 20, fontSize: 28, lineHeight: 1.2, color: LEAD }}>
            {SUBTITLE}
          </div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, color: INK }}>{DOMAIN}</div>
      </div>
      <img
        src={office}
        width={size.width - PANEL_WIDTH}
        height={size.height}
        alt=""
        style={{ objectFit: 'cover' }}
      />
    </div>,
    { ...size, fonts }
  );
}
