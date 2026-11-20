import { existsSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { agentopiaHome } from '../paths';
import { VERSION } from '../version';
import { InstallState, PluginInstaller, Step, runAgent } from './installer';
import { planStage, writeStage } from './stage';

/** The marketplace's name, the plugin's, and so the id Claude Code knows it by. */
const MARKETPLACE = 'agentopia';
const PLUGIN = 'agentopia';
export const CLAUDE_PLUGIN_ID = `${PLUGIN}@${MARKETPLACE}`;

/** Where Claude Code keeps its settings: `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export function claudeConfigDir(env: Record<string, string | undefined> = process.env): string {
  const configured = env.CLAUDE_CONFIG_DIR?.split(',')[0]?.trim();
  return configured || join(homedir(), '.claude');
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** `claude <args>`, injectable so tests never touch the real Claude Code. */
export type AgentRunner = (args: string[]) => { ok: boolean; output: string };

/**
 * Installs the plugin into Claude Code as a plugin from a local marketplace:
 * Claude Code's own mechanism, so the plugin shows (and can be switched off)
 * in `/plugin`, loads in the CLI and the desktop app alike, and never needs
 * `~/.claude/settings.json` edited by hand.
 *
 * The marketplace is a directory under the agentopia home holding
 * `.claude-plugin/marketplace.json` and the staged plugin beside it. Claude
 * Code copies the plugin into its cache on install and on every update, and
 * updates only when the manifest's version changes, which staging sees to.
 */
export class ClaudeCodeInstaller implements PluginInstaller {
  readonly harness = 'claude';

  constructor(
    private readonly plugin: { manifest: string; hooks: string },
    private readonly run: AgentRunner = (args) => runAgent('claude', args),
    private readonly configDir: () => string = () => claudeConfigDir()
  ) {}

  /** The marketplace directory agentopia owns. */
  marketplaceDir(): string {
    return join(agentopiaHome(), 'plugins', this.harness);
  }

  private stage(pluginDir: string, nodePath: string) {
    return planStage({
      from: pluginDir,
      manifest: this.plugin.manifest,
      hooks: this.plugin.hooks,
      nodePath,
      version: VERSION,
    });
  }

  desiredVersion(pluginDir: string, nodePath: string): string {
    return this.stage(pluginDir, nodePath).version;
  }

  state(): InstallState {
    const dir = this.configDir();
    const installed = readJson(join(dir, 'plugins', 'installed_plugins.json'));
    const plugins = (installed?.plugins as Record<string, unknown> | undefined) ?? {};
    const userEntry = (id: string) => {
      const entries = plugins[id];
      return Array.isArray(entries)
        ? (entries as Array<{ scope?: string; version?: string }>).find((e) => e.scope === 'user')
        : undefined;
    };
    const settings = readJson(join(dir, 'settings.json'));
    const enabledPlugins = (settings?.enabledPlugins as Record<string, unknown> | undefined) ?? {};
    const entry = userEntry(CLAUDE_PLUGIN_ID);
    return {
      installed: entry !== undefined,
      enabled: entry !== undefined && enabledPlugins[CLAUDE_PLUGIN_ID] === true,
      version: entry?.version ?? null,
      elsewhere: Object.keys(plugins)
        .filter((id) => id.startsWith(`${PLUGIN}@`) && id !== CLAUDE_PLUGIN_ID)
        .filter((id) => userEntry(id) !== undefined && enabledPlugins[id] === true)
        .sort(),
    };
  }

  strayHooks(): string[] {
    const settings = readJson(join(this.configDir(), 'settings.json'));
    const hooks = settings?.hooks as Record<string, unknown> | undefined;
    if (!hooks) {
      return [];
    }
    return Object.entries(hooks)
      .filter(([, groups]) =>
        /agentopia[^"]*emit\.mjs|emit\.mjs[^"]*agentopia/.test(JSON.stringify(groups))
      )
      .map(([event]) => event);
  }

  install(pluginDir: string, nodePath: string): Step[] {
    const { files, version } = this.stage(pluginDir, nodePath);
    const before = this.state();
    if (before.installed && before.version === version) {
      return this.enable(before, [
        { label: `${CLAUDE_PLUGIN_ID} ${version} already installed`, ok: true },
      ]);
    }

    const root = this.marketplaceDir();
    writeStage(join(root, PLUGIN), files);
    writeStage(
      join(root, '.claude-plugin'),
      new Map([['marketplace.json', `${JSON.stringify(marketplaceManifest(), null, 2)}\n`]])
    );

    const steps: Step[] = [];
    const add = this.run(['plugin', 'marketplace', 'add', root]);
    steps.push(step(`marketplace ${MARKETPLACE} at ${root}`, add));
    if (!add.ok) {
      return steps;
    }

    const verb = before.installed ? 'update' : 'install';
    const result = this.run(['plugin', verb, CLAUDE_PLUGIN_ID]);
    steps.push(step(`${verb} ${CLAUDE_PLUGIN_ID} ${version}`, result));
    return result.ok ? this.enable(this.state(), steps) : steps;
  }

  /** An install the user switched off in `/plugin` is switched back on. */
  private enable(state: InstallState, steps: Step[]): Step[] {
    if (!state.installed || state.enabled) {
      return steps;
    }
    return [
      ...steps,
      step(`enable ${CLAUDE_PLUGIN_ID}`, this.run(['plugin', 'enable', CLAUDE_PLUGIN_ID])),
    ];
  }

  uninstall(): Step[] {
    const steps: Step[] = [];
    if (this.state().installed) {
      steps.push(
        step(`uninstall ${CLAUDE_PLUGIN_ID}`, this.run(['plugin', 'uninstall', CLAUDE_PLUGIN_ID]))
      );
    }
    const root = this.marketplaceDir();
    if (this.knowsMarketplace()) {
      steps.push(
        step(
          `remove marketplace ${MARKETPLACE}`,
          this.run(['plugin', 'marketplace', 'remove', MARKETPLACE])
        )
      );
    }
    if (existsSync(root)) {
      rmSync(root, { recursive: true, force: true });
      steps.push({ label: `removed ${root}`, ok: true });
    }
    // The staging root is agentopia's alone; leave no empty folder behind.
    try {
      rmdirSync(dirname(root));
    } catch {
      // Not empty, or already gone.
    }
    return steps;
  }

  private knowsMarketplace(): boolean {
    const known = readJson(join(this.configDir(), 'plugins', 'known_marketplaces.json'));
    return known !== null && MARKETPLACE in known;
  }
}

function marketplaceManifest() {
  return {
    name: MARKETPLACE,
    description: 'agentopia, staged by `agentopia install`. Remove it with `agentopia uninstall`.',
    owner: { name: 'agentopia', email: 'contact@agentopia.town' },
    plugins: [
      {
        name: PLUGIN,
        source: `./${PLUGIN}`,
        description: 'Records every session for the agentopia office.',
      },
    ],
  };
}

function step(label: string, result: { ok: boolean; output: string }): Step {
  return result.ok ? { label, ok: true } : { label, ok: false, detail: result.output };
}
