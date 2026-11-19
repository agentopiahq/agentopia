import { AgentopiaEvent, RawRecord, normalizeClaudeCode } from '@agentopia/core';

import { ClaudeCodeContext, ContextReader } from './context';
import { ClaudeCodeInstaller, PluginInstaller } from './install';
import { ClaudeCodeUsage, UsageReader } from './usage';

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
  /** Its desktop app's name, where that differs from `label`, for telling users to restart it. */
  app?: string;
  /**
   * Where the harness looks for the plugin's manifest and its hook wiring,
   * relative to `plugins/<id>`. What `agentopia doctor` checks. Every plugin
   * keeps its emitter at `hooks/emit.mjs`, whatever the harness.
   */
  plugin: { manifest: string; hooks: string };
  /** Wrap the user's arguments so the harness loads our plugin for this session. */
  launchArgs(pluginDir: string, userArgs: string[]): string[];
  normalize(record: RawRecord): AgentopiaEvent | null;
  /**
   * A reader for its token usage, for the office's usage board. Left out,
   * the harness's work is animated but not counted.
   */
  usage?(): UsageReader;
  /**
   * A reader for its sessions' context, for the desks' monitors and the
   * breakdown that opens from one. Left out, its desks show no context.
   */
  context?(): ContextReader;
  /**
   * Its standing install (`agentopia install`), which records plain runs of
   * the agent and its desktop app. Left out, only `agentopia <agent>` records.
   */
  installer?(): PluginInstaller;
}

const CLAUDE_PLUGIN = { manifest: '.claude-plugin/plugin.json', hooks: 'hooks/hooks.json' };

export const CLAUDE_CODE: Harness = {
  id: 'claude',
  bin: 'claude',
  label: 'Claude Code',
  app: 'Claude',
  plugin: CLAUDE_PLUGIN,
  launchArgs: (pluginDir, userArgs) => ['--plugin-dir', pluginDir, ...userArgs],
  normalize: normalizeClaudeCode,
  usage: () => new ClaudeCodeUsage(),
  context: () => new ClaudeCodeContext(),
  installer: () => new ClaudeCodeInstaller(CLAUDE_PLUGIN),
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

/** A usage reader for every harness that has one. */
export function usageReaders(): UsageReader[] {
  return Object.values(HARNESSES).flatMap((h) => (h.usage ? [h.usage()] : []));
}

/** A context reader for every harness that has one. */
export function contextReaders(): ContextReader[] {
  return Object.values(HARNESSES).flatMap((h) => (h.context ? [h.context()] : []));
}

/** An installer for every harness that has one. */
export function installers(): Array<{ harness: Harness; installer: PluginInstaller }> {
  return Object.values(HARNESSES).flatMap((harness) =>
    harness.installer ? [{ harness, installer: harness.installer() }] : []
  );
}
