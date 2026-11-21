/**
 * What a desk is called. The harness's own name for the session wins; until
 * there is one, the desk is named after the first thing asked, cut down to a
 * few words, so no desk reads as a placeholder.
 */

/**
 * Names that name no session: the desktop app's title before it has a real
 * one ("Local session (from a project)"), and the live-session registry's
 * derived name, the folder plus two hex digits ("agentopia-a9"). Older
 * emitters recorded both, so they are discarded here as well as at the hook.
 */
const PLACEHOLDER_NAMES = [
  /^(?:untitled|new session|(?:local|remote|cloud) session(?: \([^)]*\))?)$/i,
  /^[\w.-]+-[0-9a-f]{2}$/,
];

export function isPlaceholderName(name: string): boolean {
  const flat = name.trim();
  return !flat || PLACEHOLDER_NAMES.some((pattern) => pattern.test(flat));
}

/** A prompt-made name keeps at most this many words... */
const PROMPT_NAME_WORDS = 5;

/** ...and this many characters, so it fits the desk's nameplate whole. */
const PROMPT_NAME_CHARS = 24;

/**
 * A prompt cut down to a desk name: its first few words, with an ellipsis
 * when there were more. Markup (a host's wrapper, or one clipped mid-tag by
 * an older emitter) is dropped; a prompt with no words left names nothing.
 */
export function promptName(prompt: unknown): string | undefined {
  if (typeof prompt !== 'string') {
    return undefined;
  }
  const text = prompt
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/, ' ')
    .replace(/…$/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return undefined;
  }
  const words = text.split(' ');
  let name = '';
  let used = 0;
  for (const word of words) {
    const next = name ? `${name} ${word}` : word;
    if (used === PROMPT_NAME_WORDS || next.length > PROMPT_NAME_CHARS) {
      break;
    }
    name = next;
    used++;
  }
  if (!name) {
    // One word longer than the nameplate.
    return `${text.slice(0, PROMPT_NAME_CHARS - 1)}…`;
  }
  if (used === words.length) {
    return name;
  }
  return `${name.replace(/[\s,;:.!?—–-]+$/, '')}…`;
}
