import { AgentopiaEvent, RawRecord, normalizeClaudeCode } from '@agentopia/core';

import { claudeSessionName } from './sessionName';

/**
 * A supported agent. Adding one is a new entry here plus a sibling directory
 * under `plugins/` — nothing else in the pipeline changes.
 */
export interface Harness {
  /** Also the directory name under `plugins/`. */
  id: string;
  /** The binary users already have on their PATH. */
  bin: string;
  label: string;
  /** Wrap the user's arguments so the harness loads our plugin for this session. */
  launchArgs(pluginDir: string, userArgs: string[]): string[];
  normalize(record: RawRecord): AgentopiaEvent | null;
  /** The harness's own name for a session, if it keeps one on disk. */
  sessionName?(harnessSession: string): string | null;
}

export const CLAUDE_CODE: Harness = {
  id: 'claude',
  bin: 'claude',
  label: 'Claude Code',
  launchArgs: (pluginDir, userArgs) => ['--plugin-dir', pluginDir, ...userArgs],
  normalize: normalizeClaudeCode,
  sessionName: claudeSessionName,
};

export const HARNESSES: Record<string, Harness> = {
  [CLAUDE_CODE.id]: CLAUDE_CODE,
};

export function harnessFor(id: string): Harness | null {
  return HARNESSES[id] ?? null;
}

export function harnessIds(): string[] {
  return Object.keys(HARNESSES);
}
