import {
  CONTACT_EMAIL,
  COPYRIGHT_HOLDER,
  DESCRIPTION,
  GITHUB_URL,
  LINKEDIN_URL,
  NPM_URL,
  TITLE,
  X_URL,
} from '@/constants';
import { getFileContent } from '@/lib/file';
import { PAGES, ROUTES, type Route, absoluteUrl, markdownPath } from '@/seo';

/**
 * The site in markdown, for agents: each page's `.md` twin, `llms.txt` (the
 * map, after llmstxt.org) and `llms-full.txt` (every page in one file).
 */

/** Site-relative links (`](/privacy)`) made absolute, so the markdown reads anywhere. */
export const absolutizeLinks = (markdown: string): string =>
  markdown.replace(/\]\(\//g, `](${absoluteUrl('/')}/`);

export async function pageMarkdown(route: Route): Promise<string> {
  return absolutizeLinks(await getFileContent(PAGES[route].markdown));
}

export function llmsTxt(): string {
  const pages = ROUTES.map(
    (route) =>
      `- [${PAGES[route].name}](${absoluteUrl(markdownPath(route))}): ${PAGES[route].summary}`
  );
  return (
    [
      `# ${TITLE}`,
      `> ${DESCRIPTION}`,
      `${TITLE} is a free, open-source (MIT) companion app for terminal coding agents, starting with Claude Code. It records every session through the agent's own lifecycle hooks and animates it as an open-plan cartoon office in the browser: a desk per session, subagents as helpers, approvals asked in person, and a board of the tokens spent. It is made by ${COPYRIGHT_HOLDER}; write to ${CONTACT_EMAIL}.`,
      ['## Pages', ...pages].join('\n'),
      [
        '## Source',
        `- [GitHub repository](${GITHUB_URL}): the code, with its README, ARCHITECTURE.md and ROADMAP.md`,
        `- [npm package](${NPM_URL}): \`agentopia-town\`, the \`agentopia\` command (publishing soon)`,
        `- [X](${X_URL}): ${TITLE} on X (@agentopiahq)`,
        `- [LinkedIn](${LINKEDIN_URL}): ${TITLE}'s company page`,
      ].join('\n'),
      [
        '## Optional',
        `- [Everything in one file](${absoluteUrl('/llms-full.txt')}): every page above, in full`,
      ].join('\n'),
    ].join('\n\n') + '\n'
  );
}

export async function llmsFullTxt(): Promise<string> {
  // The about page shares the home page's markdown: include each file once.
  const routes = ROUTES.filter(
    (route, i) => ROUTES.findIndex((other) => PAGES[other].markdown === PAGES[route].markdown) === i
  );
  const sections = await Promise.all(
    routes.map(
      async (route) =>
        `<!-- ${absoluteUrl(route)} (updated ${PAGES[route].modified}) -->\n\n${(await pageMarkdown(route)).trim()}`
    )
  );
  return sections.join('\n\n---\n\n') + '\n';
}

/** A markdown or text response for agents, pointing back at the page it stands for. */
export function agentResponse(
  body: string,
  type: 'text/markdown' | 'text/plain',
  canonical?: string
) {
  const headers = new Headers({
    'Content-Type': `${type}; charset=utf-8`,
    Vary: 'Accept',
    'X-Robots-Tag': 'noindex',
  });
  if (canonical) {
    headers.set('Link', `<${canonical}>; rel="canonical"`);
  }
  return new Response(body, { headers });
}

export async function markdownResponse(route: Route) {
  return agentResponse(await pageMarkdown(route), 'text/markdown', absoluteUrl(route));
}
