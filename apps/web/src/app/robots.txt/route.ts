import { robotsTxt } from '@/seo';

export const dynamic = 'force-static';

/** A route rather than `robots.ts`, whose rules have no room for a `Content-Signal` line. */
export const GET = () =>
  new Response(robotsTxt(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
