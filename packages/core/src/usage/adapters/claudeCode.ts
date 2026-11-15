import { LEAD_AGENT, TokenCounts, UsageAdapter, UsageFact, UsageLineContext } from '../entry';
import { PriceTable, priced } from '../prices';

/**
 * Claude Code's usage adapter: one line of its JSONL transcripts to a fact.
 *
 * Claude Code writes `message.usage` on every assistant message it records,
 * in the transcripts under `~/.claude/projects` — the files ccusage reads
 * too. A subagent's messages are in a transcript of their own beside its
 * parent's (`<session>/subagents/agent-<id>.jsonl`), with a `.meta.json`
 * naming its type; a workflow's agents are a folder further down. The CLI's
 * reader finds and follows those files; this only reads lines.
 *
 * One API response is written as several lines, one per content block, each
 * carrying the same usage, and a resumed session copies earlier lines into
 * its new transcript: the key (message id and request id) counts it once.
 */

/**
 * Claude's first-party API prices, per million tokens, as of this writing;
 * fast mode at 2x where offered. models.dev's `anthropic` prices are laid
 * over it when the office can reach them.
 */
export const CLAUDE_PRICES: PriceTable = {
  prefix: 'claude-',
  models: {
    'fable-5-2': { ...priced(8, 40, 0.2), fast: 2 },
    'mythos-5-2': { ...priced(8, 40, 0.2), fast: 2 },
    'fable-5-1': priced(10, 50, 0.25),
    'mythos-5-1': priced(10, 50, 0.25),
    'fable-5': priced(10, 50, 1),
    'mythos-5': priced(10, 50, 1),
    'mythos-preview': priced(10, 50, 1),
    'opus-5-5': { ...priced(4, 20, 0.2), fast: 2 },
    'opus-5': { ...priced(5, 25), fast: 2 },
    'opus-4-8': { ...priced(5, 25), fast: 2 },
    'opus-4-7': priced(5, 25),
    'opus-4-6': priced(5, 25),
    'opus-4-5': priced(5, 25),
    'opus-4-1': priced(15, 75),
    'opus-4': priced(15, 75),
    'sonnet-5-5': priced(2, 10, 0.1),
    'sonnet-5': priced(2, 10),
    'sonnet-4-6': priced(3, 15),
    'sonnet-4-5': priced(3, 15),
    'sonnet-4': priced(3, 15),
    'haiku-5-5': { ...priced(0.1, 0.5), longAbove: 100_000, long: priced(0.5, 2.5) },
    'haiku-4-5': priced(1, 5),
    '3-7-sonnet': priced(3, 15),
    '3-5-sonnet': priced(3, 15),
    '3-5-haiku': priced(0.8, 4),
    '3-opus': priced(15, 75),
    '3-haiku': priced(0.25, 1.25),
  },
};

export const CLAUDE_HARNESS = 'claude';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined;

function parse(line: string): Json | undefined {
  try {
    return obj(JSON.parse(line));
  } catch {
    return undefined;
  }
}

/** An assistant line's usage. */
function usageFact(record: Json, context: UsageLineContext): UsageFact | null {
  const message = obj(record.message);
  const usage = obj(message?.usage);
  const model = str(message?.model);
  const session = str(record.sessionId);
  const ts = Date.parse(str(record.timestamp) ?? '');
  // `<synthetic>` marks a message Claude Code wrote itself, not the API's.
  if (!message || !usage || !model || model === '<synthetic>' || !session || !Number.isFinite(ts)) {
    return null;
  }

  const split = obj(usage.cache_creation);
  // Older transcripts do not split writes by TTL: count them all as 5-minute.
  const tokens: TokenCounts = {
    input: num(usage.input_tokens),
    output: num(usage.output_tokens),
    cacheWrite5m: split
      ? num(split.ephemeral_5m_input_tokens)
      : num(usage.cache_creation_input_tokens),
    cacheWrite1h: num(split?.ephemeral_1h_input_tokens),
    cacheRead: num(usage.cache_read_input_tokens),
  };
  const id = str(message.id) ?? str(record.uuid) ?? `${session}@${ts}`;
  const agent =
    record.isSidechain === true
      ? (context.agent ?? str(record.attributionAgent) ?? 'subagent')
      : LEAD_AGENT;

  return {
    kind: 'usage',
    entry: {
      harness: CLAUDE_HARNESS,
      key: `${id}:${str(record.requestId) ?? ''}`,
      ts,
      session,
      agent,
      model,
      tokens,
      fast: usage.speed === 'fast' || undefined,
      cwd: str(record.cwd),
    },
  };
}

export const claudeCodeUsage: UsageAdapter = {
  harness: CLAUDE_HARNESS,
  label: 'Claude Code',
  prices: CLAUDE_PRICES,
  modelsDev: { provider: 'anthropic' },
  modelLabel: (model) => model.replace(/^claude-/, ''),
  // A desktop worktree (`<repo>/.claude/worktrees/<name>`) is its repo's work.
  projectOf: (cwd) => cwd.replace(/[/\\]\.claude[/\\]worktrees[/\\][^/\\]+[/\\]?$/, ''),

  read(line, context = {}) {
    // Most lines are neither, and some are huge: skip them unparsed.
    if (line.includes('"usage"') && line.includes('"assistant"')) {
      const record = parse(line);
      return record?.type === 'assistant' ? usageFact(record, context) : null;
    }
    if (line.includes('"custom-title"')) {
      const record = parse(line);
      const session = str(record?.sessionId);
      const title = str(record?.customTitle)?.trim();
      return record?.type === 'custom-title' && session && title
        ? { kind: 'title', session, title }
        : null;
    }
    return null;
  },
};

/** A subagent's type, from the `.meta.json` beside its transcript. */
export function claudeAgentTypeFromMeta(text: string): string | undefined {
  return str(parse(text)?.agentType);
}
