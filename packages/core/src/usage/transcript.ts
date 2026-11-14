import { TokenCounts, costOf } from './prices';

/**
 * Token usage, read from Claude Code's own transcripts.
 *
 * The hooks that feed the office never see a token count, but Claude Code
 * writes one on every assistant message it records (`message.usage`), in the
 * JSONL transcripts under `~/.claude/projects` — the same files ccusage
 * reads. A subagent's messages are in a transcript of their own beside its
 * parent's (`<session>/subagents/agent-<id>.jsonl`), with a `.meta.json`
 * naming its type.
 *
 * One API response is written as several lines, one per content block, each
 * carrying the same usage; and a resumed session copies earlier lines into
 * its new transcript. So every entry has a key (message id and request id),
 * and whoever collects entries keeps one per key.
 */

/** Who did the work: the session's own agent, or a subagent of a type. */
export const LEAD_AGENT = 'lead';

export interface UsageEntry {
  /** One per API response: count each key once. */
  key: string;
  ts: number;
  /** The Claude Code session it belongs to (a subagent's is its parent's). */
  session: string;
  /** `lead`, or the subagent's type (`Explore`, `general-purpose`). */
  agent: string;
  model: string;
  tokens: TokenCounts;
  /** Dollars at API rates, 0 when the model is unpriced (see `priced`). */
  cost: number;
  priced: boolean;
  /** The directory the session ran in, when the line says. */
  cwd?: string;
}

/** What the file a line came from says about it. */
export interface TranscriptContext {
  /** The subagent type, for a subagent's own transcript. */
  agent?: string;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined;

/**
 * One transcript line's usage, or null for any line that has none: a user
 * turn, a tool result, a summary, a torn or foreign line. Never throws.
 */
export function usageFromLine(line: string, context: TranscriptContext = {}): UsageEntry | null {
  // Most lines carry no usage, and some are huge: skip them unparsed.
  if (!line.includes('"usage"') || !line.includes('"assistant"')) {
    return null;
  }
  let record: Json | undefined;
  try {
    record = obj(JSON.parse(line));
  } catch {
    return null;
  }
  if (!record || record.type !== 'assistant') {
    return null;
  }
  const message = obj(record.message);
  const usage = obj(message?.usage);
  const model = str(message?.model);
  const session = str(record.sessionId);
  const ts = Date.parse(str(record.timestamp) ?? '');
  // `<synthetic>` marks a message Claude Code wrote itself, not the API's.
  if (!message || !usage || !model || model === '<synthetic>' || !session || !Number.isFinite(ts)) {
    return null;
  }

  const written = num(usage.cache_creation_input_tokens);
  const split = obj(usage.cache_creation);
  const write1h = num(split?.ephemeral_1h_input_tokens);
  // Older transcripts do not split writes by TTL: count them all as 5-minute.
  const write5m = split ? num(split.ephemeral_5m_input_tokens) : written;
  const tokens: TokenCounts = {
    input: num(usage.input_tokens),
    output: num(usage.output_tokens),
    cacheWrite5m: write5m,
    cacheWrite1h: write1h,
    cacheRead: num(usage.cache_read_input_tokens),
  };
  const cost = costOf(model, tokens, usage.speed === 'fast');

  const id = str(message.id) ?? str(record.uuid) ?? `${session}@${ts}`;
  const sidechain = record.isSidechain === true;
  const agent = sidechain
    ? (context.agent ?? str(record.attributionAgent) ?? 'subagent')
    : LEAD_AGENT;

  return {
    key: `${id}:${str(record.requestId) ?? ''}`,
    ts,
    session,
    agent,
    model,
    tokens,
    cost: cost ?? 0,
    priced: cost !== null,
    cwd: str(record.cwd),
  };
}

/** A session title a transcript line sets (`/rename`, the desktop app's title), if it sets one. */
export function titleFromLine(line: string): { session: string; title: string } | null {
  if (!line.includes('"custom-title"')) {
    return null;
  }
  try {
    const record = obj(JSON.parse(line));
    const session = str(record?.sessionId);
    const title = str(record?.customTitle)?.trim();
    return record?.type === 'custom-title' && session && title ? { session, title } : null;
  } catch {
    return null;
  }
}

/** A subagent's type, from the `.meta.json` beside its transcript. */
export function agentTypeFromMeta(text: string): string | undefined {
  try {
    return str(obj(JSON.parse(text))?.agentType);
  } catch {
    return undefined;
  }
}

/** Every token an entry counts. */
export const totalTokens = (t: TokenCounts): number =>
  t.input + t.output + t.cacheWrite5m + t.cacheWrite1h + t.cacheRead;
