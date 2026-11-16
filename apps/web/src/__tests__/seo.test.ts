import fs from 'fs';
import path from 'path';

import sitemap from '@/app/sitemap';
import { FULL_WEBSITE_URL, TITLE } from '@/constants';
import { absolutizeLinks, llmsFullTxt, llmsTxt } from '@/markdown';
import {
  OG_IMAGE,
  PAGES,
  ROUTES,
  absoluteUrl,
  acceptsMarkdown,
  discoveryLinks,
  markdownPath,
  pageMetadata,
  robotsTxt,
  structuredData,
} from '@/seo';

describe('pageMetadata', () => {
  it.each([
    ['/', { absolute: PAGES['/'].title }, PAGES['/'].title, '/index.md'],
    ['/privacy', 'Privacy Policy', `Privacy Policy | ${TITLE}`, '/privacy.md'],
  ] as const)('titles, canonicalizes and links the markdown of %s', (route, title, card, md) => {
    const metadata = pageMetadata(route);
    expect(metadata.title).toEqual(title);
    expect(metadata.alternates).toEqual({ canonical: route, types: { 'text/markdown': md } });
    expect(metadata.openGraph).toMatchObject({ url: route, title: card, images: [OG_IMAGE] });
    expect(metadata.twitter).toMatchObject({ title: card, images: [OG_IMAGE] });
  });
});

describe('PAGES', () => {
  it.each(['/privacy', '/terms'] as const)(
    "dates %s's last change by its own Last Updated line",
    (route) => {
      const text = fs.readFileSync(path.join(process.cwd(), PAGES[route].markdown), 'utf8');
      const stated = text.match(/Last Updated: (\w+) (\d+)\w*, (\d{4})/);
      expect(stated).not.toBeNull();
      const [, month, day, year] = stated!;
      const date = new Date(`${month} ${day}, ${year} UTC`).toISOString().slice(0, 10);
      expect(PAGES[route].modified).toBe(date);
    }
  );
});

describe('sitemap', () => {
  it('lists every page on the canonical host with its last change', () => {
    expect(sitemap().map(({ url, lastModified }) => [url, lastModified])).toEqual(
      ROUTES.map((route) => [absoluteUrl(route), PAGES[route].modified])
    );
  });
});

describe('robotsTxt', () => {
  it.each(['User-Agent: *', 'User-Agent: GPTBot', 'User-Agent: ClaudeBot'])(
    'has a %s group',
    (line) => {
      expect(robotsTxt()).toContain(line);
    }
  );

  it('signals content use in every group and points at the sitemap', () => {
    const text = robotsTxt();
    expect(text.match(/^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/gm)).toHaveLength(
      2
    );
    expect(text).toContain(`Sitemap: ${FULL_WEBSITE_URL}/sitemap.xml`);
  });
});

describe('acceptsMarkdown', () => {
  it.each([
    ['text/markdown', true],
    ['text/markdown, text/html;q=0.9', true],
    ['text/html, text/markdown;q=0.5', true],
    ['text/markdown;q=0', false],
    ['text/html,application/xhtml+xml,*/*;q=0.8', false],
    [null, false],
  ])('reads %p as %p', (accept, expected) => {
    expect(acceptsMarkdown(accept)).toBe(expected);
  });
});

describe('discoveryLinks', () => {
  it('names the sitemap, llms.txt and the markdown twin', () => {
    expect(discoveryLinks('/terms')).toBe(
      `<${FULL_WEBSITE_URL}/sitemap.xml>; rel="sitemap"; type="application/xml", ` +
        `<${FULL_WEBSITE_URL}/llms.txt>; rel="describedby"; type="text/plain", ` +
        `<${FULL_WEBSITE_URL}/terms.md>; rel="alternate"; type="text/markdown"`
    );
  });
});

describe('markdown', () => {
  it('makes site links absolute and leaves others', () => {
    expect(absolutizeLinks('[Privacy](/privacy) and [GitHub](https://github.com)')).toBe(
      `[Privacy](${FULL_WEBSITE_URL}/privacy) and [GitHub](https://github.com)`
    );
  });

  it('maps every page in llms.txt, under an H1 and a summary', () => {
    const text = llmsTxt();
    expect(text.startsWith(`# ${TITLE}\n\n> `)).toBe(true);
    for (const route of ROUTES) {
      expect(text).toContain(`(${absoluteUrl(markdownPath(route))})`);
    }
  });

  it('puts each markdown file in llms-full.txt once', async () => {
    const text = await llmsFullTxt();
    expect(text.match(/^# Agentopia$/gm)).toHaveLength(1);
    expect(text).toContain('# Privacy Policy');
    expect(text).toContain('# Terms');
  });
});

describe('structuredData', () => {
  it.each(ROUTES)('dates the page at %s', (route) => {
    const [page] = structuredData(route)['@graph'] as Record<string, unknown>[];
    expect(page).toMatchObject({
      url: absoluteUrl(route),
      datePublished: PAGES[route].published,
      dateModified: PAGES[route].modified,
    });
  });

  it('gives the organization a description and a contact point', () => {
    const organization = structuredData('/')['@graph'].find(
      (node) => node['@type'] === 'Organization'
    );
    expect(organization).toMatchObject({
      description: expect.any(String),
      contactPoint: { '@type': 'ContactPoint' },
    });
  });
});
