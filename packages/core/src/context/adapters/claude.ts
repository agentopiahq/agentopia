import { CLAUDE_HARNESS } from '../../usage/adapters/claude';
import {
  CONTEXT_PARTS,
  CONTEXT_PART_LABELS,
  ContextAdapter,
  ContextFold,
  ContextHints,
  ContextPart,
  ContextReport,
  apportion,
} from '../entry';

/**
 * Claude Code's context, from a session's JSONL transcript
 * (`~/.claude/projects/<project>/<session>.jsonl`).
 *
 * The total is measured: every assistant line carries the API's `usage`, and
 * a response's prompt (fresh input plus cache reads and writes) is everything
 * in context when it was asked, so the latest one plus its reply is the
 * context now. The parts are worked out:
 *
 * - The set-up (system prompt, tool definitions) is not in the conversation.
 *   Recent Claude Code logs it as an `api-request-shape` line; the first
 *   response's prompt is that set-up plus whatever opened the conversation,
 *   so the two are told apart by their share of the text, and that ratio of
 *   text to tokens prices every later set-up too. Without a shape line
 *   (older versions), the first prompt less the opening text is the set-up,
 *   as one part.
 * - Replies, thinking and tool calls are the responses' own output tokens,
 *   split by their text.
 * - Everything else the conversation has brought in (typed prompts, tool
 *   results, memory files and skills listings, reminders) is what is left of
 *   the total, split by each part's share of the text.
 *
 * A compaction (`compact_boundary`) starts the conversation's parts again;
 * the set-up is kept.
 */

/** Tokens an image costs, roughly, wherever one is sent: its base64 says nothing useful. */
const IMAGE_TOKENS = 1600;
/** Text per token, for an image's share of the text and an older transcript's set-up. */
const CHARS_PER_TOKEN = 3;

/** The models whose window is a million tokens without saying so in their id. */
const MILLION_BY_DEFAULT: readonly RegExp[] = [];

export const CLAUDE_WINDOW = 200_000;
export const CLAUDE_WINDOW_1M = 1_000_000;

/**
 * A Claude model's context window: a million where the id asks for it
 * (`claude-opus-5-5[1m]`), the harness is configured for it, or the session
 * has already outgrown the standard window; otherwise the standard 200k.
 */
export function claudeContextWindow(
  model: string | undefined,
  peak: number,
  hint?: number
): number {
  if (model && (/\[1m\]$/i.test(model) || MILLION_BY_DEFAULT.some((re) => re.test(model)))) {
    return CLAUDE_WINDOW_1M;
  }
  if (peak > CLAUDE_WINDOW) {
    return CLAUDE_WINDOW_1M;
  }
  return hint ?? CLAUDE_WINDOW;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

function parse(line: string): Json | undefined {
  try {
    return obj(JSON.parse(line));
  } catch {
    return undefined;
  }
}

/** Text length of a message's content, images at their rough token cost. */
function textOf(content: unknown): number {
  if (typeof content === 'string') {
    return content.length;
  }
  if (!Array.isArray(content)) {
    return 0;
  }
  let n = 0;
  for (const raw of content) {
    const block = obj(raw);
    if (!block) {
      continue;
    }
    switch (block.type) {
      case 'text':
        n += str(block.text)?.length ?? 0;
        break;
      case 'thinking':
        n += str(block.thinking)?.length ?? 0;
        break;
      case 'tool_use':
        n += JSON.stringify(block.input ?? {}).length;
        break;
      case 'tool_result':
        n += textOf(block.content);
        break;
      case 'image':
      case 'document':
        n += IMAGE_TOKENS * CHARS_PER_TOKEN;
        break;
      default:
        break;
    }
  }
  return n;
}

/** Which part an attachment's text counts towards. */
function attachmentPart(type: string | undefined): ContextPart {
  switch (type) {
    case 'instructions':
    case 'nested_memory':
    case 'memory':
      return 'memory';
    case 'skill_listing':
    case 'invoked_skills':
      return 'skills';
    case 'mcp_instructions_delta':
    case 'mcp_resource':
      return 'mcp';
    case 'deferred_tools_delta':
    case 'agent_listing_delta':
      return 'tools';
    default:
      return 'reminders';
  }
}

const REMINDER = /^\s*<(system-reminder|local-command|command-)/;

type Weights = Map<ContextPart, number>;
const add = (w: Weights, part: ContextPart, n: number): void => {
  if (n > 0) {
    w.set(part, (w.get(part) ?? 0) + n);
  }
};

class ClaudeContextFold implements ContextFold {
  /** The latest set-up's text, by part, and the text it was first priced at. */
  private setup: Weights | null = null;
  /** Text per token, from the first response; null until then. */
  private ratio: number | null = null;
  /** The first response's whole prompt, and the conversation's text before it. */
  private firstPrompt = 0;
  private openingText = 0;
  /** The conversation's brought-in text (since the last compaction), by part. */
  private brought: Weights = new Map();
  /** Responses' output tokens and their text, by part. */
  private outTokens = 0;
  private outText: Weights = new Map();
  private seenResponses = new Set<string>();
  private seenLines = new Set<string>();
  private last: { prompt: number; output: number; model?: string; at: number } | null = null;
  private peak = 0;
  private turns = 0;
  private compactions = 0;

  constructor(private readonly session: string) {}

  take(line: string): void {
    const record = parse(line);
    if (!record || record.isSidechain === true) {
      return;
    }
    const uuid = str(record.uuid);
    if (uuid) {
      if (this.seenLines.has(uuid)) {
        return;
      }
      this.seenLines.add(uuid);
    }
    switch (record.type) {
      case 'api-request-shape':
        this.takeShape(obj(record.shape));
        break;
      case 'assistant':
        this.takeAssistant(record);
        break;
      case 'user':
        this.takeUser(record);
        break;
      case 'attachment':
        this.takeAttachment(record);
        break;
      case 'system':
        if (record.subtype === 'compact_boundary') {
          this.compactions += 1;
          this.brought = new Map();
          this.outTokens = 0;
          this.outText = new Map();
          this.turns = 0;
        }
        break;
      default:
        break;
    }
  }

  private takeShape(shape: Json | undefined): void {
    if (!shape) {
      return;
    }
    const setup: Weights = new Map();
    for (const block of Array.isArray(shape.system) ? shape.system : []) {
      add(setup, 'system', str(obj(block)?.text)?.length ?? JSON.stringify(block).length);
    }
    for (const tool of Array.isArray(shape.tools) ? shape.tools : []) {
      const name = str(obj(tool)?.name) ?? '';
      add(setup, name.startsWith('mcp__') ? 'mcp' : 'tools', JSON.stringify(tool).length);
    }
    this.setup = setup;
  }

  private takeAssistant(record: Json): void {
    const message = obj(record.message);
    const usage = obj(message?.usage);
    const model = str(message?.model);
    if (!message || !usage || model === '<synthetic>') {
      return;
    }
    const prompt =
      num(usage.input_tokens) +
      num(usage.cache_read_input_tokens) +
      num(usage.cache_creation_input_tokens);
    const output = num(usage.output_tokens);
    const ts = Date.parse(str(record.timestamp) ?? '');

    // Claude Code writes a response once per content block, each line with the same usage.
    for (const raw of Array.isArray(message.content) ? message.content : []) {
      const block = obj(raw);
      add(this.outText, block?.type === 'tool_use' ? 'calls' : 'replies', textOf([raw]));
    }
    const id = str(message.id) ?? str(record.uuid) ?? '';
    if (this.seenResponses.has(id)) {
      if (this.last) {
        this.last.output = Math.max(this.last.output, output);
      }
      return;
    }
    this.seenResponses.add(id);
    if (prompt <= 0) {
      return;
    }
    if (this.ratio === null) {
      this.firstPrompt = prompt;
      this.openingText = sum(this.brought);
      const text = sum(this.setup) + this.openingText;
      this.ratio = text > 0 ? text / prompt : CHARS_PER_TOKEN;
    }
    this.outTokens += output;
    this.last = { prompt, output, model, at: Number.isFinite(ts) ? ts : (this.last?.at ?? 0) };
    this.peak = Math.max(this.peak, prompt + output);
  }

  private takeUser(record: Json): void {
    const message = obj(record.message);
    const content = message?.content;
    if (record.isCompactSummary === true) {
      add(this.brought, 'summary', textOf(content));
      return;
    }
    if (typeof content === 'string') {
      if (record.isMeta === true || REMINDER.test(content)) {
        add(this.brought, 'reminders', content.length);
      } else {
        add(this.brought, 'prompts', content.length);
        this.turns += 1;
      }
      return;
    }
    if (!Array.isArray(content)) {
      return;
    }
    let typed = false;
    for (const raw of content) {
      const block = obj(raw);
      if (block?.type === 'tool_result') {
        add(this.brought, 'results', textOf([raw]));
      } else if (block?.type === 'text' && REMINDER.test(str(block.text) ?? '')) {
        add(this.brought, 'reminders', textOf([raw]));
      } else {
        add(this.brought, record.isMeta === true ? 'reminders' : 'prompts', textOf([raw]));
        typed ||= block?.type === 'text' && record.isMeta !== true;
      }
    }
    if (typed) {
      this.turns += 1;
    }
  }

  private takeAttachment(record: Json): void {
    const attachment = obj(record.attachment);
    const rendered = Array.isArray(record.rendered) ? record.rendered : [];
    let n = 0;
    for (const r of rendered) {
      n += textOf(obj(r)?.content);
    }
    add(this.brought, attachmentPart(str(attachment?.type)), n);
  }

  report(hints: ContextHints = {}): ContextReport | null {
    const last = this.last;
    if (!last || this.ratio === null) {
      return null;
    }
    const used = last.prompt + last.output;
    const estimated = this.setup === null;
    // The set-up: priced at the session's own ratio, or the first prompt less its opening.
    const ratio = this.ratio;
    const setup: Weights = this.setup
      ? new Map([...this.setup].map(([part, text]) => [part, text / ratio] as const))
      : new Map([['system', this.firstPrompt - this.openingText / CHARS_PER_TOKEN] as const]);
    const setupTokens = Math.max(0, Math.min(used, sum(setup)));
    const outputTokens = Math.min(used - setupTokens, this.outTokens);
    const broughtTokens = used - setupTokens - outputTokens;

    const parts = new Map<ContextPart, number>();
    const merge = (m: Map<ContextPart, number>): void => {
      for (const [k, v] of m) {
        parts.set(k, (parts.get(k) ?? 0) + v);
      }
    };
    merge(apportion(setupTokens, [...setup]));
    merge(apportion(outputTokens, [...this.outText]));
    // Nothing brought in yet to split by: it is the opening's reminders.
    merge(
      this.brought.size > 0
        ? apportion(broughtTokens, [...this.brought])
        : apportion(broughtTokens, [['reminders', 1]])
    );
    // Whole-token rounding in three splits: settle any difference on the biggest part.
    const drift = used - sum(parts);
    if (drift !== 0 && parts.size > 0) {
      const [biggest] = [...parts].sort((a, b) => b[1] - a[1])[0];
      parts.set(biggest, Math.max(0, (parts.get(biggest) ?? 0) + drift));
    }

    return {
      harness: CLAUDE_HARNESS,
      session: this.session,
      model: last.model,
      used,
      window: claudeContextWindow(last.model, this.peak, hints.window),
      slices: CONTEXT_PARTS.filter((part) => (parts.get(part) ?? 0) > 0).map((part) => ({
        part,
        label: estimated && part === 'system' ? 'System prompt & tools' : CONTEXT_PART_LABELS[part],
        tokens: parts.get(part) ?? 0,
      })),
      estimated,
      at: last.at,
      turns: this.turns,
      compactions: this.compactions,
      peak: this.peak,
    };
  }
}

function sum(w: ReadonlyMap<unknown, number> | null): number {
  let n = 0;
  for (const v of w?.values() ?? []) {
    n += v;
  }
  return n;
}

export const claudeCodeContext: ContextAdapter = {
  harness: CLAUDE_HARNESS,
  fold: (session) => new ClaudeContextFold(session),
};
