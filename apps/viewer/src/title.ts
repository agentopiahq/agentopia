/** Longest session name the tab title will carry before truncating. */
const MAX_NAME_CHARS = 48;

/**
 * The browser-tab title. A session name leads so parallel viewers are
 * tellable apart in a tab strip; harness names are free text, so they are
 * capped rather than trusted to be short.
 */
export function pageTitle(sessionName: string | null | undefined): string {
  const name = sessionName?.trim();
  if (!name) {
    return 'Agentopia';
  }
  const capped = name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 1)}…` : name;
  return `${capped} | Agentopia`;
}
