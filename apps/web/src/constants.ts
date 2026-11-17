/**
 * Brand pair, also the logo gradient (public/logo.svg mirrors these values):
 * periwinkle indigo into a warm coral — kin to the workers' clay orange
 * (#d97757) but deliberately not the same shade.
 */
export const MAIN_COLOR = '#6c6ce5';
export const MINOR_COLOR = '#ec8a5c';

export const TITLE = 'Agentopia';
/** The office's title-block line, as the hero letters it; also the site's description. */
export const DESCRIPTION =
  "Watch your agents work, track every token they burn, and enjoy the view while you're still employed.";
/** A one-line pitch, for the home page's title and the social card. */
export const TAGLINE = 'A live office for your coding agents';
export const DOMAIN = 'agentopia.town';
/**
 * The canonical origin: every canonical URL, the sitemap and the social cards
 * use it. The www host, because Vercel redirects the bare domain (and
 * getagentopia.com) there.
 */
export const FULL_WEBSITE_URL = `https://www.${DOMAIN}`;
export const CONTACT_EMAIL = `contact@${DOMAIN}`;

export const GITHUB_URL = 'https://github.com/agentopiahq/agentopia';
/** The office, pictured: the README's overview, also the social card's picture. */
export const OFFICE_IMAGE_URL =
  'https://aju9yvogcxlz4gql.public.blob.vercel-storage.com/agentopia-overview.png';
export const X_HANDLE = '@agentopiahq';
export const X_URL = 'https://x.com/agentopiahq';
export const LINKEDIN_URL = 'https://www.linkedin.com/company/agentopiahq';
export const NPM_URL = 'https://www.npmjs.com/package/@agentopia/cli';
export const COPYRIGHT_HOLDER = 'Starfish Software LLC';
