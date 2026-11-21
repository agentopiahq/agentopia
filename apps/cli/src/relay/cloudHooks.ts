import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The hooks that record a Claude Code cloud session and relay it, for a
 * repository's `.claude/settings.json` (cloud sessions run a repository's
 * settings hooks but install no plugins) or a managed settings file.
 *
 * Every event runs the emitter, but only in the cloud (`CLAUDE_CODE_REMOTE`)
 * and only once paired (`AGENTOPIA_RELAY`): on your own machine the plugin
 * already records the session, and a second emitter would record it twice.
 * The session's start and each prompt also make sure the forwarder is
 * running. Each hook exits 0 whatever happens, like the plugin's own.
 */

interface CommandHook {
  type: 'command';
  command: string;
  timeout: number;
}

export interface HookSettings {
  hooks: Record<string, { hooks: CommandHook[] }[]>;
}

/** The events that (re)start the forwarder: a new or resumed session, and every prompt. */
const ENSURE_EVENTS = ['SessionStart', 'UserPromptSubmit'];

/** The events the plugin wires, in its own order. */
export function pluginEvents(pluginDir: string): string[] {
  const hooks = JSON.parse(readFileSync(join(pluginDir, 'hooks', 'hooks.json'), 'utf8')) as {
    hooks: Record<string, unknown>;
  };
  return Object.keys(hooks.hooks);
}

/**
 * The settings, with `dir` (where the plugin's files are, as the hook's
 * shell sees it: `$CLAUDE_PROJECT_DIR/plugins/claude` in this repository).
 */
export function cloudHooks(events: string[], dir: string): HookSettings {
  const emit: CommandHook = {
    type: 'command',
    command: `[ "$CLAUDE_CODE_REMOTE" = true ] && [ -n "$AGENTOPIA_RELAY" ] && node "${dir}/hooks/emit.mjs"; exit 0`,
    timeout: 5,
  };
  const ensure: CommandHook = {
    type: 'command',
    command: `[ -n "$AGENTOPIA_RELAY" ] && node "${dir}/hooks/relay.mjs" ensure; exit 0`,
    timeout: 5,
  };
  const hooks: HookSettings['hooks'] = {};
  for (const event of events) {
    hooks[event] = [{ hooks: ENSURE_EVENTS.includes(event) ? [emit, ensure] : [emit] }];
  }
  return { hooks };
}

/** The plugin's files as this repository's cloud sessions see them. */
export const REPO_PLUGIN_DIR = '$CLAUDE_PROJECT_DIR/plugins/claude';
