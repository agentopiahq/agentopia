# @agentopia/web

The getagentopia.com marketing site (Next.js 16, Tailwind v4).

The home page is the real office viewer and nothing else, filling the window and playing a
looping demo session (`OfficeScene.tsx` mounts `@agentopia/viewer/hero`). The site's footer
lives in the office's own corners, drawn by the viewer (`apps/viewer/src/credits/`) as two
icons in its bottom-left corner that open on hover: the makers and the copyright, and
beside it GitHub and the legal pages (in new tabs). The
terms and privacy pages keep the site's header and footer, from `app/(legal)/layout.tsx`.

## SEO

`FULL_WEBSITE_URL` in `src/constants.ts` is the canonical host (`getagentopia.com`): the
root layout's `metadataBase`, every canonical URL, `robots.txt`, `sitemap.xml` and the
JSON-LD all read it, so a domain change is one line. Each page gets its title, canonical
URL and social card from `pageMetadata` in `src/seo.ts` (Next replaces a page's
`openGraph` whole, so it repeats the shared fields and the card image); add a new page's
path to `ROUTES` there for the sitemap. The social card is `app/opengraph-image.tsx`,
rendered once at build time: the sheet's lettering (Young Serif and Gaegu, fetched from
Google Fonts) beside `app/og-office.jpg`, a picture of the office to retake when the office
changes much. The home page carries the JSON-LD (`STRUCTURED_DATA`).

```bash
yarn --cwd apps/web dev     # http://localhost:3000
```

No environment variables are required.
