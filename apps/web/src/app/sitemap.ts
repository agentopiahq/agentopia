import { type MetadataRoute } from 'next';

import { PAGES, ROUTES, absoluteUrl } from '@/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: absoluteUrl(route),
    lastModified: PAGES[route].modified,
    changeFrequency: route === '/' ? 'weekly' : 'yearly',
    priority: route === '/' ? 1 : route === '/about' ? 0.6 : 0.3,
  }));
}
