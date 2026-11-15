# @agentopia/web

The agentopia.town marketing site (Next.js 16, Tailwind v4).

The home page is the real office viewer and nothing else, filling the window and playing a
looping demo session (`OfficeScene.tsx` mounts `@agentopia/viewer/hero`). The site's footer
lives in the office's own corners, drawn by the viewer (`apps/viewer/src/credits/`): the
makers' companies and the copyright bottom left, GitHub and the legal pages bottom right. The
terms and privacy pages keep the site's header and footer, from `app/(legal)/layout.tsx`.

```bash
yarn --cwd apps/web dev     # http://localhost:3000
```

No environment variables are required.
