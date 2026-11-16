import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { FULL_WEBSITE_URL, TITLE } from '@/constants';
import { OG_IMAGE, ROUTES, pageMetadata } from '@/seo';

describe('pageMetadata', () => {
  it.each([
    [
      '/',
      'Agentopia | A live office',
      { absolute: 'Agentopia | A live office' },
      'Agentopia | A live office',
    ],
    ['/privacy', 'Privacy Policy', 'Privacy Policy', `Privacy Policy | ${TITLE}`],
  ] as const)('titles and canonicalizes %s', (path, title, documentTitle, cardTitle) => {
    const metadata = pageMetadata({ path, title });
    expect(metadata.title).toEqual(documentTitle);
    expect(metadata.alternates?.canonical).toBe(path);
    expect(metadata.openGraph).toMatchObject({ url: path, title: cardTitle, images: [OG_IMAGE] });
    expect(metadata.twitter).toMatchObject({ title: cardTitle, images: [OG_IMAGE] });
  });
});

describe('sitemap', () => {
  it('lists every route on the canonical host', () => {
    expect(sitemap().map((entry) => entry.url)).toEqual(
      ROUTES.map((route) => (route === '/' ? FULL_WEBSITE_URL : `${FULL_WEBSITE_URL}${route}`))
    );
  });
});

describe('robots', () => {
  it('points crawlers at the sitemap on the canonical host', () => {
    expect(robots()).toMatchObject({
      host: FULL_WEBSITE_URL,
      sitemap: `${FULL_WEBSITE_URL}/sitemap.xml`,
    });
  });
});
