import { type NextRequest, NextResponse } from 'next/server';

import { type Route, acceptsMarkdown, discoveryLinks, markdownPath } from '@/seo';

/**
 * Content negotiation for agents: a page asked for with `Accept:
 * text/markdown` gets its markdown twin instead, and every page names its
 * sitemap, `llms.txt` and markdown in a `Link` header. `Vary: Accept` keeps
 * caches from handing one to the other.
 */
export function proxy(request: NextRequest) {
  const route = request.nextUrl.pathname as Route;
  if (acceptsMarkdown(request.headers.get('accept'))) {
    return NextResponse.rewrite(new URL(markdownPath(route), request.url), {
      headers: { Vary: 'Accept' },
    });
  }
  const response = NextResponse.next();
  response.headers.set('Vary', 'Accept');
  response.headers.set('Link', discoveryLinks(route));
  return response;
}

/** Every page in `PAGES` (a matcher must be a literal). */
export const config = { matcher: ['/', '/about', '/privacy', '/terms'] };
