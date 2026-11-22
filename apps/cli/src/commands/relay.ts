import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { paint } from '../format';
import { pluginDirFor, sessionsDir } from '../paths';
import { HookSettings, REPO_PLUGIN_DIR, cloudHooks, pluginEvents } from '../relay/cloudHooks';
import {
  DEFAULT_RELAY_URL,
  clearRelayConfig,
  readRelayConfig,
  relayConfigPath,
  writeRelayConfig,
} from '../relay/config';
import { newToken, relayKeys } from '../relay/envelope';
import { RELAYED_PREFIX } from '../relay/pull';

/**
 * `agentopia relay`: put sessions that run somewhere else (a Claude Code
 * cloud session, a devbox) in this office, through a relay that only ever
 * holds sealed batches. See `src/relay/` and `plugins/claude/hooks/relay.mjs`.
 */

/** Where `stage` copies the plugin in a cloud environment. */
export const STAGE_DIR = '/opt/agentopia';

/** The managed settings file Claude Code reads on Linux. */
function managedSettingsPath(): string {
  return process.env.AGENTOPIA_MANAGED_SETTINGS ?? '/etc/claude-code/managed-settings.json';
}

const USAGE = `Usage:
  agentopia relay                 Say whether this office is paired, and with what
  agentopia relay pair [--new]    Pair this office (--new: a new token, unpairing the old)
                                  [--url <relay>] to use another relay than agentopia.town
  agentopia relay off             Unpair: stop pulling and forget the token
  agentopia relay hooks [--dir <plugin dir>]
                                  Print the hooks for a repository's .claude/settings.json
  agentopia relay stage [--dir <dir>] [--managed]
                                  For a cloud environment's setup script: copy the plugin
                                  to ${STAGE_DIR} (or --dir); --managed also writes its hooks
                                  into Claude Code's managed settings (experimental)
`;

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

function relayedBuses(): string[] {
  try {
    return readdirSync(sessionsDir()).filter((name) => name.startsWith(RELAYED_PREFIX));
  } catch {
    return [];
  }
}

function status(): number {
  const config = readRelayConfig();
  if (!config) {
    process.stdout.write(`Not paired. ${paint.bold('agentopia relay pair')} sets it up.\n`);
    return 0;
  }
  const { channel } = relayKeys(config.token);
  process.stdout.write(
    `${paint.green('Paired')} through ${config.url} (channel ${channel.slice(0, 8)}…).\n` +
      `The office pulls it while it runs; ${relayedBuses().length} relayed sessions so far.\n` +
      `${paint.dim(`Token in ${relayConfigPath()}.`)}\n`
  );
  return 0;
}

function pair(args: string[]): number {
  const existing = readRelayConfig();
  const url = (flag(args, '--url') ?? existing?.url ?? DEFAULT_RELAY_URL).replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) {
    process.stderr.write(`agentopia: --url needs an http(s) address\n`);
    return 1;
  }
  const token = existing && !args.includes('--new') ? existing.token : newToken();
  writeRelayConfig({ token, url });
  const host = new URL(url).host;
  process.stdout.write(
    `${paint.green('Paired.')} While it runs, your office pulls sessions relayed through ${host}.\n` +
      `Everything is sealed with the token before it leaves, so the relay cannot read it.\n\n` +
      `${paint.bold('Token')} (keep it secret, it is the key):\n  ${token}\n\n` +
      `${paint.bold('To bring in Claude Code cloud sessions')}, in the cloud environment's settings:\n` +
      `  1. Environment variables:  AGENTOPIA_RELAY=${token}\n` +
      (url === DEFAULT_RELAY_URL
        ? ''
        : `                            AGENTOPIA_RELAY_URL=${url}\n`) +
      `  2. Network access: Limited, with ${host} under Allowed domains\n` +
      `  3. The hooks: the agentopia repository has them in .claude/settings.json already.\n` +
      `     For another repository, add the setup script line\n` +
      `       npx -y agentopiahq relay stage\n` +
      `     and commit the output of ${paint.bold(`agentopia relay hooks --dir ${STAGE_DIR}/claude`)}\n` +
      `     to its .claude/settings.json.\n` +
      `${paint.dim('Project threads load no repository hooks; for those try `relay stage --managed`.')}\n`
  );
  return 0;
}

function off(): number {
  clearRelayConfig();
  process.stdout.write('Unpaired. The office stops pulling the relay.\n');
  return 0;
}

function hooksFor(dir: string): HookSettings | null {
  const plugin = pluginDirFor('claude');
  if (!plugin) {
    process.stderr.write('agentopia: plugins/claude not found\n');
    return null;
  }
  return cloudHooks(pluginEvents(plugin), dir);
}

function hooks(args: string[]): number {
  const settings = hooksFor(flag(args, '--dir') ?? REPO_PLUGIN_DIR);
  if (!settings) {
    return 1;
  }
  process.stdout.write(`${JSON.stringify(settings, null, 2)}\n`);
  return 0;
}

/** Our hooks merged into a settings object: others' kept, an old copy of ours replaced. */
export function mergeHooks(
  existing: Record<string, unknown>,
  ours: HookSettings
): Record<string, unknown> {
  const before = (existing.hooks ?? {}) as Record<string, unknown[]>;
  const hooks: Record<string, unknown[]> = {};
  for (const [event, groups] of Object.entries(before)) {
    hooks[event] = (Array.isArray(groups) ? groups : []).filter(
      (group) => !/hooks\/(emit|relay)\.mjs/.test(JSON.stringify(group))
    );
  }
  for (const [event, groups] of Object.entries(ours.hooks)) {
    hooks[event] = [...(hooks[event] ?? []), ...groups];
  }
  return { ...existing, hooks };
}

function stage(args: string[]): number {
  const plugin = pluginDirFor('claude');
  if (!plugin) {
    process.stderr.write('agentopia: plugins/claude not found\n');
    return 1;
  }
  const dir = join(resolve(flag(args, '--dir') ?? STAGE_DIR), 'claude');
  mkdirSync(dir, { recursive: true });
  cpSync(plugin, dir, { recursive: true });
  process.stdout.write(`staged the plugin in ${dir}\n`);
  if (args.includes('--managed')) {
    const path = managedSettingsPath();
    let existing: Record<string, unknown> = {};
    if (existsSync(path)) {
      try {
        existing = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      } catch {
        process.stderr.write(`agentopia: ${path} is not JSON; left alone\n`);
        return 1;
      }
    }
    mkdirSync(dirname(path), { recursive: true });
    const merged = mergeHooks(existing, cloudHooks(pluginEvents(plugin), dir));
    writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
    process.stdout.write(`wrote its hooks into ${path}\n`);
  }
  return 0;
}

export function runRelay(args: string[]): number {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case 'status':
      return status();
    case 'pair':
      return pair(rest);
    case 'off':
    case 'unpair':
      return off();
    case 'hooks':
      return hooks(rest);
    case 'stage':
      return stage(rest);
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(USAGE);
      return 0;
    default:
      process.stderr.write(`agentopia: unknown relay command "${sub}"\n${USAGE}`);
      return 1;
  }
}
