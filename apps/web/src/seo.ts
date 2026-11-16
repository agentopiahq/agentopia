import { type Metadata } from 'next';

import {
  COPYRIGHT_HOLDER,
  DESCRIPTION,
  FULL_WEBSITE_URL,
  GITHUB_URL,
  NPM_URL,
  TITLE,
} from '@/constants';

/** Every route the site serves, for the sitemap. */
export const ROUTES = ['/', '/privacy', '/terms'] as const;

export type Route = (typeof ROUTES)[number];

/**
 * The per-page metadata that differs from the root layout's: its canonical
 * URL, and the social card's title, description and URL. Next replaces
 * `openGraph` and `twitter` whole rather than merging them, so each page
 * repeats the shared fields through here instead of losing them.
 */
export function pageMetadata({
  path,
  title,
  description = DESCRIPTION,
}: {
  path: Route;
  title: string;
  description?: string;
}): Metadata {
  return {
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: TITLE,
      locale: 'en_US',
      url: path,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

const ORGANIZATION_ID = `${FULL_WEBSITE_URL}/#organization`;

/** The home page's JSON-LD: the app, who makes it, and the site. */
export const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${FULL_WEBSITE_URL}/#software`,
      name: TITLE,
      url: FULL_WEBSITE_URL,
      description: DESCRIPTION,
      image: `${FULL_WEBSITE_URL}/opengraph-image`,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any (runs on Node.js)',
      softwareRequirements: 'Node.js 20 or later',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': ORGANIZATION_ID },
      sameAs: [GITHUB_URL, NPM_URL],
    },
    {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: COPYRIGHT_HOLDER,
      url: FULL_WEBSITE_URL,
      logo: `${FULL_WEBSITE_URL}/android-chrome-512x512.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${FULL_WEBSITE_URL}/#website`,
      url: FULL_WEBSITE_URL,
      name: TITLE,
      description: DESCRIPTION,
      publisher: { '@id': ORGANIZATION_ID },
      inLanguage: 'en-US',
    },
  ],
};
