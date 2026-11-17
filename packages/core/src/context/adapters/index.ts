import { ContextAdapter } from '../entry';
import { claudeCodeContext } from './claude';

export * from './claude';

/**
 * Every harness's context adapter, by harness id. Adding one is an adapter
 * beside `claude.ts`, an entry here, and a reader in the CLI
 * (`apps/cli/src/context/`).
 */
export const CONTEXT_ADAPTERS: Readonly<Record<string, ContextAdapter>> = {
  [claudeCodeContext.harness]: claudeCodeContext,
};

export const contextAdapterFor = (harness: string): ContextAdapter | null =>
  CONTEXT_ADAPTERS[harness] ?? null;
