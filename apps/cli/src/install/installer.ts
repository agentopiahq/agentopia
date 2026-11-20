import { spawnSync } from 'node:child_process';

/**
 * A standing install of a harness's plugin: what lets a plain run of the
 * agent (or its desktop app, which no wrapper can launch) be recorded.
 *
 * Each harness registers plugins its own way, so each has an installer; the
 * `install`, `uninstall` and `doctor` commands, and the refresh `watch` and
 * the wrapper run, only ever go through this interface.
 */
export interface PluginInstaller {
  harness: string;
  /** What the agent has installed now, read from its own files: no subprocess. */
  state(): InstallState;
  /**
   * Hooks the agent's own settings already run an agentopia emitter from: a
   * standing install made by hand. With the plugin installed too, every event
   * is recorded twice.
   */
  strayHooks(): string[];
  /**
   * Stage the plugin and register it with the agent: install it the first
   * time, update it when what was staged changed, leave it be otherwise.
   */
  install(pluginDir: string, nodePath: string): Step[];
  /** Unregister the plugin and remove what was staged. */
  uninstall(): Step[];
  /** The version a fresh stage would stamp, to tell whether a refresh is due. */
  desiredVersion(pluginDir: string, nodePath: string): string;
}

export interface InstallState {
  /** The agent has the plugin installed (at user scope). */
  installed: boolean;
  /** And it is switched on: a user can turn it off in the agent's own UI. */
  enabled: boolean;
  /** The installed version, as stamped at staging. */
  version: string | null;
  /**
   * The same plugin installed (for the user) and switched on from another
   * marketplace: agentopia's own on GitHub, or Anthropic's directory. Ids as
   * the agent knows them, such as `agentopia@agentopiahq`. The agent keeps
   * those copies current itself, and one beside agentopia's own install
   * records every event twice.
   */
  elsewhere: string[];
}

/** One thing an install or uninstall did, for the command to report. */
export interface Step {
  label: string;
  ok: boolean;
  /** Output worth showing: the agent's own message when it failed. */
  detail?: string;
}

/**
 * Run the agent's own CLI. Windows installs the binary as a `.cmd` shim,
 * which only a shell can launch.
 */
export function runAgent(bin: string, args: string[]): { ok: boolean; output: string } {
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    return { ok: false, output: result.error.message };
  }
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}
