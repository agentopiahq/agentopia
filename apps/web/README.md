# @agentopia/web

The agentopia.town marketing site (Next.js 16, Tailwind v4).

The home page is the real office viewer and nothing else, filling the window and playing a
looping demo session (`OfficeScene.tsx` mounts `@agentopia/viewer/hero`). Open it with
`?pose` (`http://localhost:3000/?pose`) to freeze the office and pose everyone in it for
pictures and clips (see the viewer's README, "Posing it by hand"). The site's footer
lives in the office's own corners, drawn by the viewer (`apps/viewer/src/credits/`) as two
icons in its bottom-left corner that open on hover: the makers and the copyright, and
beside it GitHub and the legal pages (in new tabs). The
terms and privacy pages keep the site's header and footer, from `app/(legal)/layout.tsx`.

## SEO and agents

`FULL_WEBSITE_URL` in `src/constants.ts` is the canonical origin (`https://www.agentopia.town`),
and `PAGES` in `src/seo.ts` is every page the site serves: its title, description, markdown
file and dates. Everything below reads those two, so a new page is one `PAGES` entry plus
its `page.tsx`, its `<route>.md/route.ts` and its path in `src/proxy.ts`'s matcher.

- **Metadata**: `pageMetadata(route)` gives each page its title, canonical URL, markdown
  alternate and social card (Next replaces a page's `openGraph` whole, so it repeats the
  shared fields). The card is `app/opengraph-image.tsx`, built once at build time: the
  sheet's lettering beside the README's overview picture (`OFFICE_IMAGE_URL`), cropped by
  `CROP`.
- **JSON-LD**: `structuredData(route)`, rendered by `components/StructuredData.tsx`: a dated
  `WebPage` on every page, breadcrumbs below home, and the app, its maker and the site.
- **Words without JavaScript**: the office is a canvas, so the home page also renders
  `src/content/home.md` for screen readers and crawlers; `/about` shows the same file.
- **Markdown for agents**: every page has a twin at its path plus `.md` (`/index.md` for
  home), `/llms.txt` maps them and `/llms-full.txt` holds them all (`src/markdown.ts`).
  `src/proxy.ts` answers `Accept: text/markdown` with the twin and sends a `Link` header
  naming the sitemap, `llms.txt` and the twin.
- **Crawlers**: `/robots.txt` (`robotsTxt`) lets everyone in, training crawlers included on
  purpose, with a `Content-Signal` line; the sitemap dates each page by `PAGES`. When a page's
  content changes, move its `modified` date (the legal pages' must match their "Last
  Updated" line; a test checks).

```bash
yarn --cwd apps/web dev     # http://localhost:3000
```

No environment variables are required.
