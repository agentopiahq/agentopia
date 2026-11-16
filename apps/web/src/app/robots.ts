import { type MetadataRoute } from 'next';

import { FULL_WEBSITE_URL } from '@/constants';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    host: FULL_WEBSITE_URL,
    sitemap: `${FULL_WEBSITE_URL}/sitemap.xml`,
  };
}
