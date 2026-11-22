import { Normalizer } from '../reader';
import { normalizeClaudeCode } from './claude';

export * from './claude';
export * from './claudePrompt';

/**
 * Every harness's event adapter, by harness id: one bus record in, one
 * normalized event (or nothing) out. Adding a harness is an adapter beside
 * `claude.ts` and an entry here; the CLI's `HARNESSES` points at it.
 */
export const EVENT_ADAPTERS: Readonly<Record<string, Normalizer>> = {
  claude: normalizeClaudeCode,
};

export const eventAdapterFor = (harness: string): Normalizer | null =>
  EVENT_ADAPTERS[harness] ?? null;
