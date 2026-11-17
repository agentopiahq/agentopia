import { CLAUDE_WINDOW_1M, ContextHints, claudeCodeContext } from '@agentopia/core';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { claudeProjectRoots } from '../usage/claude';
import { JsonlContextReader } from './reader';

/**
 * Claude Code's context, from a session's transcript: `<session>.jsonl` in
 * one of the project folders under its projects roots. A subagent's context
 * is its own transcript's and is not counted here: the desk's is the lead's.
 */

/** How long the configured model is trusted before the settings are read again. */
const SETTINGS_TTL_MS = 60_000;

export class ClaudeCodeContext extends JsonlContextReader {
  private settings: { at: number; hints: ContextHints } | null = null;

  constructor(private readonly roots: string[] = claudeProjectRoots()) {
    super(claudeCodeContext);
  }

  protected override async locate(session: string): Promise<string | null> {
    if (!/^[A-Za-z0-9-]{4,64}$/.test(session)) {
      return null;
    }
    for (const root of this.roots) {
      let projects: string[];
      try {
        projects = await readdir(root);
      } catch {
        continue;
      }
      for (const project of projects) {
        const path = join(root, project, `${session}.jsonl`);
        if (existsSync(path)) {
          return path;
        }
      }
    }
    return null;
  }

  /** A million-token window where the configured model asks for one (`opus[1m]`). */
  protected override async hints(): Promise<ContextHints> {
    const now = Date.now();
    if (this.settings && now - this.settings.at < SETTINGS_TTL_MS) {
      return this.settings.hints;
    }
    let hints: ContextHints = {};
    for (const root of this.roots) {
      try {
        const text = await readFile(join(dirname(root), 'settings.json'), 'utf8');
        const model = (JSON.parse(text) as { model?: unknown }).model;
        if (typeof model === 'string') {
          hints = /\[1m\]/i.test(model) ? { window: CLAUDE_WINDOW_1M } : {};
          break;
        }
      } catch {
        // No settings, or unreadable: the records decide alone.
      }
    }
    this.settings = { at: now, hints };
    return hints;
  }
}
