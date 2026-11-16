import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DESCRIPTION, DOMAIN, OFFICE_IMAGE_URL, TAGLINE, TITLE } from '@/constants';
import { OG_IMAGE } from '@/seo';

/**
 * The social card: the title block lettered like the office's own sheet
 * (Young Serif title, Gaegu hand lettering, ink on paper) beside a picture of
 * the office itself (the README's overview picture). Rendered once at build
 * time, since it takes no params.
 */

export const alt = OG_IMAGE.alt;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
  const glyphs = `${TITLE}${TAGLINE}${DESCRIPTION}${DOMAIN}`;
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

const dataUrl = async (file: Promise<Buffer>, type: string) =>
  `data:${type};base64,${(await file).toString('base64')}`;

/** The office picture's size, and the part of it the card shows: the floor, without its title block, readout or controls. */
const OFFICE = { width: 2000, height: 1296 };
const CROP = { x: 490, y: 170, width: 1305 };
const PICTURE_WIDTH = size.width - PANEL_WIDTH;
const SCALE = PICTURE_WIDTH / CROP.width;

export default async function OpengraphImage() {
  const [fonts, badge] = await Promise.all([
    loadFonts(),
    // A literal path, so the build traces just this file.
    dataUrl(readFile(join(process.cwd(), 'public/android-chrome-192x192.png')), 'image/png'),
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
            {DESCRIPTION}
          </div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, color: INK }}>{DOMAIN}</div>
      </div>
      <div
        style={{
          width: PICTURE_WIDTH,
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <img
          src={OFFICE_IMAGE_URL}
          width={OFFICE.width * SCALE}
          height={OFFICE.height * SCALE}
          alt=""
          style={{ position: 'absolute', left: -CROP.x * SCALE, top: -CROP.y * SCALE }}
        />
      </div>
    </div>,
    { ...size, fonts }
  );
}
