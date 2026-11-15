import { UsageAdapter } from '../entry';
import { claudeCodeUsage } from './claudeCode';

export * from './claudeCode';

/**
 * Every harness's usage adapter, by harness id. Adding a harness's usage is
 * an adapter beside `claudeCode.ts`, an entry here, and a reader for its
 * files in the CLI (`apps/cli/src/usage/`).
 */
export const USAGE_ADAPTERS: Readonly<Record<string, UsageAdapter>> = {
  [claudeCodeUsage.harness]: claudeCodeUsage,
};

export const usageAdapterFor = (harness: string): UsageAdapter | null =>
  USAGE_ADAPTERS[harness] ?? null;
