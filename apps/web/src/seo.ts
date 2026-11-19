import { type Metadata } from 'next';

import {
  CONTACT_EMAIL,
  COPYRIGHT_HOLDER,
  DESCRIPTION,
  FULL_WEBSITE_URL,
  GITHUB_URL,
  LINKEDIN_URL,
  NPM_URL,
  OFFICE_IMAGE_URL,
  TAGLINE,
  TITLE,
  X_HANDLE,
  X_URL,
} from '@/constants';

/** When the site first went up (the marketing site's first version, and its legal pages). */
const SITE_PUBLISHED = '2026-08-30';

export interface Page {
  /** The page's own title: the whole title for the home page, completed with the site's name elsewhere. */
  title: string;
  /** What `llms.txt` and the breadcrumbs call it. */
  name: string;
  description: string;
  /** What an agent finds there, for `llms.txt`. */
  summary: string;
  /** The page's markdown, from the app's root: the page itself, and its `.md` twin. */
  markdown: string;
  /** ISO dates. `modified` must move whenever the page's content does. */
  published: string;
  modified: string;
}

/** Every page the site serves: the sitemap, `llms.txt`, the markdown twins and the JSON-LD all read this. */
export const PAGES = {
  '/': {
    title: `${TITLE} | ${TAGLINE}`,
    name: 'Home',
    description: DESCRIPTION,
    summary: 'what Agentopia is, what the office shows, how it works, and how to get started',
    markdown: 'src/content/home.md',
    published: SITE_PUBLISHED,
    modified: '2026-11-19',
  },
  '/about': {
    title: 'About',
    name: 'About Agentopia',
    description: `What Agentopia is, how it works and who makes it. ${DESCRIPTION}`,
    summary: 'the home page overview as a plain page, with who makes Agentopia',
    markdown: 'src/content/home.md',
    published: '2026-11-16',
    modified: '2026-11-19',
  },
  '/docs': {
    title: 'Docs',
    name: 'Docs',
    description:
      'How to install Agentopia and use the agentopia command: start, status, stop, watch, install, uninstall and doctor, where recordings are kept, and troubleshooting.',
    summary:
      'installing Agentopia, every agentopia command and option, how sessions are recorded, where files are kept, and troubleshooting',
    markdown: 'src/content/docs.md',
    published: '2026-11-19',
    modified: '2026-11-19',
  },
  '/privacy': {
    title: 'Privacy Policy',
    name: 'Privacy Policy',
    description:
      'How Agentopia handles your information: what the website collects, and what the agentopia command keeps on your own machine.',
    summary: 'what the website collects, and what the agentopia command keeps on your machine',
    markdown: 'src/legal/privacy.md',
    published: SITE_PUBLISHED,
    // Keep with the policy's own "Last Updated" line (a test checks).
    modified: '2026-08-30',
  },
  '/terms': {
    title: 'Terms of Service',
    name: 'Terms of Service',
    description:
      'The terms for using the Agentopia website, the agentopia command-line tool and its plugins.',
    summary: 'the terms for the website, the agentopia command-line tool and its plugins',
    markdown: 'src/legal/terms.md',
    published: SITE_PUBLISHED,
    // Keep with the terms' own "Last Updated" line (a test checks).
    modified: '2026-08-30',
  },
} as const satisfies Record<string, Page>;

export type Route = keyof typeof PAGES;

export const ROUTES = Object.keys(PAGES) as Route[];

/** A path on the canonical origin, absolute. The home page is the bare origin. */
export const absoluteUrl = (path: string): string =>
  path === '/' ? FULL_WEBSITE_URL : `${FULL_WEBSITE_URL}${path}`;

/** Where a page's markdown twin lives: the page's path with `.md`, and `/index.md` for the home page. */
export const markdownPath = (route: Route): string => (route === '/' ? '/index.md' : `${route}.md`);

/** The social card (`app/opengraph-image.tsx`), for pages that set their own Open Graph. */
export const OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: `${TITLE}: ${TAGLINE.toLowerCase()}`,
};

/**
 * A page's metadata beyond the root layout's: its title, canonical URL,
 * markdown alternate, and the social card's title, description, URL and
 * image. Next replaces `openGraph` and `twitter` whole rather than merging
 * them (dropping the root's card image with them), so each page repeats the
 * shared fields through here.
 */
export function pageMetadata(route: Route): Metadata {
  const { title, description } = PAGES[route];
  const fullTitle = route === '/' ? title : `${title} | ${TITLE}`;
  return {
    title: route === '/' ? { absolute: title } : title,
    description,
    alternates: { canonical: route, types: { 'text/markdown': markdownPath(route) } },
    openGraph: {
      type: 'website',
      siteName: TITLE,
      locale: 'en_US',
      url: route,
      title: fullTitle,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      site: X_HANDLE,
      creator: X_HANDLE,
      title: fullTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}

/**
 * The HTTP `Link` header every page sends (RFC 8288): the sitemap, `llms.txt`
 * as what describes the site, and the page's own markdown twin.
 */
export function discoveryLinks(route: Route): string {
  return [
    `<${absoluteUrl('/sitemap.xml')}>; rel="sitemap"; type="application/xml"`,
    `<${absoluteUrl('/llms.txt')}>; rel="describedby"; type="text/plain"`,
    `<${absoluteUrl(markdownPath(route))}>; rel="alternate"; type="text/markdown"`,
  ].join(', ');
}

/** Whether a request's `Accept` header asks for markdown (and doesn't rule it out with `q=0`). */
export function acceptsMarkdown(accept: string | null): boolean {
  return (accept ?? '').split(',').some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return type.trim() === 'text/markdown' && (!q || Number(q.slice(2)) > 0);
  });
}

/**
 * The AI crawlers that gather training data, named so the choice to let them
 * in is on the record (they would match `*` anyway).
 */
export const TRAINING_CRAWLERS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot'];

/**
 * How AI systems may use the site (contentsignals.org): find it, quote it in
 * answers, and learn from it. A marketing site wants all three.
 */
export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes';

/** `robots.txt`: everyone in, `/api/` aside, with the content signal in each group. */
export function robotsTxt(): string {
  const group = (agents: string[]) =>
    [
      ...agents.map((agent) => `User-Agent: ${agent}`),
      `Content-Signal: ${CONTENT_SIGNAL}`,
      'Allow: /',
      'Disallow: /api/',
    ].join('\n');
  return [
    '# Agentopia welcomes search engines and AI systems, including for training.',
    group(['*']),
    '# AI training crawlers: allowed on purpose.',
    group(TRAINING_CRAWLERS),
    `Host: ${FULL_WEBSITE_URL}`,
    `Sitemap: ${absoluteUrl('/sitemap.xml')}\n`,
  ].join('\n\n');
}

const ORGANIZATION_ID = `${FULL_WEBSITE_URL}/#organization`;
const SOFTWARE_ID = `${FULL_WEBSITE_URL}/#software`;
const WEBSITE_ID = `${FULL_WEBSITE_URL}/#website`;

const SOFTWARE = {
  '@type': 'SoftwareApplication',
  '@id': SOFTWARE_ID,
  name: TITLE,
  url: FULL_WEBSITE_URL,
  description: DESCRIPTION,
  image: absoluteUrl('/opengraph-image'),
  screenshot: OFFICE_IMAGE_URL,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any (runs on Node.js)',
  softwareRequirements: 'Node.js 20 or later',
  isAccessibleForFree: true,
  license: 'https://opensource.org/license/mit',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@id': ORGANIZATION_ID },
  sameAs: [GITHUB_URL, NPM_URL],
};

const ORGANIZATION = {
  // The brand, as its LinkedIn page knows it; the company behind it is its legal name.
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: TITLE,
  legalName: COPYRIGHT_HOLDER,
  url: FULL_WEBSITE_URL,
  logo: absoluteUrl('/android-chrome-512x512.png'),
  description: `${TITLE} (${COPYRIGHT_HOLDER}) makes a companion app that shows coding agent sessions as a live cartoon office.`,
  sameAs: [X_URL, LINKEDIN_URL, GITHUB_URL],
  email: CONTACT_EMAIL,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: CONTACT_EMAIL,
    availableLanguage: 'en',
  },
};

const WEBSITE = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  url: FULL_WEBSITE_URL,
  name: TITLE,
  description: DESCRIPTION,
  publisher: { '@id': ORGANIZATION_ID },
  inLanguage: 'en-US',
};

/**
 * A page's JSON-LD: the page itself (with when it was published and last
 * changed), a breadcrumb for any page below home, and on the home and about
 * pages the app and who makes it (and on the home page, the site).
 */
export function structuredData(route: Route) {
  const page = PAGES[route];
  const url = absoluteUrl(route);
  const isOverview = route === '/' || route === '/about';
  const webPage = {
    '@type': route === '/about' ? 'AboutPage' : 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: route === '/' ? page.title : `${page.title} | ${TITLE}`,
    description: page.description,
    inLanguage: 'en-US',
    datePublished: page.published,
    dateModified: page.modified,
    isPartOf: { '@id': WEBSITE_ID },
    ...(isOverview ? { about: { '@id': SOFTWARE_ID } } : {}),
    ...(route === '/' ? {} : { breadcrumb: { '@id': `${url}#breadcrumb` } }),
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: TITLE, item: FULL_WEBSITE_URL },
      { '@type': 'ListItem', position: 2, name: page.name, item: url },
    ],
  };
  const graph =
    route === '/'
      ? [webPage, SOFTWARE, ORGANIZATION, WEBSITE]
      : [webPage, breadcrumb, ...(isOverview ? [SOFTWARE, ORGANIZATION] : [])];
  return { '@context': 'https://schema.org', '@graph': graph };
}
