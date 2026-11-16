import { type MetadataRoute } from 'next';

import { FULL_WEBSITE_URL } from '@/constants';
import { ROUTES } from '@/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: route === '/' ? FULL_WEBSITE_URL : `${FULL_WEBSITE_URL}${route}`,
    changeFrequency: route === '/' ? 'weekly' : 'yearly',
    priority: route === '/' ? 1 : 0.3,
  }));
}
