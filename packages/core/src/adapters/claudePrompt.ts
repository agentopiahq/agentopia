/**
 * What a Claude Code prompt says, in words a person would read.
 *
 * A prompt is not always typed. Hosts hand the agent messages in markup of
 * their own: a project's `<wake>` around the person's message, a
 * coordinator's `<relay>` around its note, a `<task-notification>` when a
 * background command ends, `<system-reminder>`s prepended to what was typed.
 * The human's bubble and a desk's name want the words inside, so this finds
 * them, or names the message when there are none (a CI event, a subagent's
 * report, or one an older emitter clipped mid-tag).
 *
 * The hook emitter (`plugins/claude/hooks/emit.mjs`) carries a copy of this,
 * since it shares no code: it unwraps the whole prompt before clipping it,
 * and this unwraps what older emitters recorded raw. Both run the cases in
 * `fixtures/prompts.json`, so the copies cannot drift.
 */

/** Notes a host adds for the agent: never anyone's words, dropped wherever they are. */
const NOTES =
  /<(system-reminder|system-note)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<(?:system-reminder|system-note)\b[^>]*$/g;

/** What to call a message whose words are not in it. */
const LABELS: Readonly<Record<string, string>> = {
  wake: 'New message',
  relay: 'Message from the coordinator',
  project_claude_message: 'Message from the coordinator',
  'cross-session-message': 'Message from another session',
  'agent-message': 'A subagent reported back',
  'task-notification': 'Background task finished',
  'ci-monitor-event': 'CI update',
};

/** Messages whose words are the host's, not anyone's: always shown by label. */
const LABEL_ONLY = new Set(['agent-message', 'ci-monitor-event']);

/**
 * Markup a host wraps a message in, as opposed to markup typed in a prompt
 * (`<Button>`, `<div>`): the names above, or any with a `-` or `_`, which
 * HTML's and JSX's names never have.
 */
const isWrapper = (name: string): boolean => name in LABELS || /[-_]/.test(name);

/** The text inside each `<name>` element, in order; an unclosed one runs to the end. */
function elements(text: string, name: string, attrs?: RegExp): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`<${name}(\\s[^>]*)?>([\\s\\S]*?)(?:</${name}\\b[^>]*>|$)`, 'g');
  for (const match of text.matchAll(pattern)) {
    if (!attrs || attrs.test(match[1] ?? '')) {
      out.push(match[2]);
    }
  }
  return out;
}

const ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  amp: '&',
};

/** Hosts escape what they wrap; the bubble wants it back as typed. */
function unescape(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();

function label(name: string): string {
  if (name.endsWith('-command')) {
    return `/${name.slice(0, -'-command'.length)}`;
  }
  return LABELS[name] ?? name.replace(/[-_]+/g, ' ');
}

/** The words of a message that opens with markup, or a label for it. */
function unwrap(text: string): string {
  const open = /^<([A-Za-z][\w-]*)/.exec(text);
  const name = open?.[1];
  if (!name || !isWrapper(name) || name === 'pasted_content') {
    // Typed words. A paste among them reads as what was pasted.
    return flat(text.replace(/<\/?pasted_content\b[^>]*>/g, ' '));
  }
  const head = /^<[A-Za-z][\w-]*(?:\s[^>]*)?>/.exec(text);
  if (!head || LABEL_ONLY.has(name)) {
    // Clipped mid-tag by an older emitter, or a host's own words.
    return label(name);
  }
  const body = elements(text, name)[0] ?? '';
  let said: string | undefined;
  switch (name) {
    case 'wake': {
      const asked = elements(body, 'message', /\btrigger="true"/);
      said = asked[0] ?? elements(body, 'message').pop();
      break;
    }
    case 'relay':
    case 'project_claude_message':
      // The person's own words when the coordinator passes them on, else its note.
      said = elements(text, 'cited', /\bauthor="user"/).pop() ?? elements(text, 'note')[0];
      break;
    case 'task-notification':
      said = elements(body, 'summary')[0];
      break;
    case 'bash-input':
      said = body.trim() ? `! ${body}` : undefined;
      break;
    case 'command-name':
    case 'command-message':
      said = [elements(text, 'command-name')[0], elements(text, 'command-args')[0]]
        .filter(Boolean)
        .join(' ');
      break;
    default:
      said = name.endsWith('-command') ? undefined : unwrap(body.trim());
  }
  return flat(unescape(said ?? '')) || label(name);
}

/**
 * A prompt as words to show, or nothing when it holds none (only a host's
 * notes). Typed prompts come back as typed, whitespace collapsed.
 */
export function readablePrompt(prompt: unknown): string | undefined {
  if (typeof prompt !== 'string') {
    return undefined;
  }
  return unwrap(prompt.replace(NOTES, ' ').trim()) || undefined;
}
