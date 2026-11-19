import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { paint } from '../format';
import { HARNESSES, harnessIds } from '../harness';
import { PluginInstaller } from '../install';
import { agentopiaHome, findPluginsRoot, pluginDirFor } from '../paths';

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

function check(label: string, ok: boolean, detail: string): Check {
  return { label, ok, detail };
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function binaryOnPath(bin: string): boolean {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
    stdio: 'ignore',
  });
  return probe.status === 0;
}

function checkHarness(id: string): Check[] {
  const harness = HARNESSES[id];
  const dir = pluginDirFor(id);
  if (!dir) {
    return [check(`plugins/${id}`, false, 'directory not found')];
  }

  const checks: Check[] = [check(`plugins/${id}`, true, dir)];

  const manifest = readJson(join(dir, harness.plugin.manifest));
  checks.push(
    check(
      `${id} manifest`,
      manifest !== null,
      manifest
        ? `version ${String(manifest.version)}`
        : `${harness.plugin.manifest} missing or invalid`
    )
  );

  const hooks = readJson(join(dir, harness.plugin.hooks));
  const hookMap = hooks?.hooks as Record<string, unknown> | undefined;
  checks.push(
    check(
      `${id} hooks`,
      hooks !== null,
      hooks === null
        ? `${harness.plugin.hooks} missing or invalid`
        : hookMap
          ? `${Object.keys(hookMap).length} events wired`
          : harness.plugin.hooks
    )
  );

  const emitter = join(dir, 'hooks', 'emit.mjs');
  if (!existsSync(emitter)) {
    checks.push(check(`${id} emitter`, false, 'emit.mjs missing'));
  } else {
    // The emitter has to run from a bare directory with no node_modules, so any
    // non-builtin import is a packaging bug rather than a style question.
    const source = readFileSync(emitter, 'utf8');
    const bad = [...source.matchAll(/^\s*import\s.*from\s+'([^']+)'/gm)]
      .map((m) => m[1])
      .filter((spec) => !spec.startsWith('node:'));
    checks.push(
      check(
        `${id} emitter`,
        bad.length === 0,
        bad.length === 0 ? 'no non-builtin imports' : `imports ${bad.join(', ')}`
      )
    );
  }

  checks.push(check(`${harness.bin} on PATH`, binaryOnPath(harness.bin), harness.bin));

  const installer = harness.installer?.();
  if (installer) {
    checks.push(...checkInstall(harness.bin, installer, dir));
  }

  return checks;
}

/**
 * The standing install: without it a plain run of the agent is never
 * recorded, which every other check passing says nothing about.
 */
function checkInstall(bin: string, installer: PluginInstaller, pluginDir: string): Check[] {
  const state = installer.state();
  const desired = installer.desiredVersion(pluginDir, process.execPath);
  const label = `${installer.harness} install`;
  const checks = [
    !state.installed
      ? check(label, false, `plain ${bin} sessions aren't recorded; run agentopia install`)
      : !state.enabled
        ? check(label, false, `switched off; run agentopia install to switch it on`)
        : state.version !== desired
          ? check(label, false, `${state.version} is out of date; run agentopia install`)
          : check(label, true, String(state.version)),
  ];
  const stray = installer.strayHooks();
  if (stray.length > 0) {
    checks.push(
      check(
        `${installer.harness} settings hooks`,
        false,
        `${stray.length} events also run the emitter from settings.json, so they record twice`
      )
    );
  }
  return checks;
}

export function runDoctor(): number {
  const major = Number(process.versions.node.split('.')[0]);
  const checks: Check[] = [
    check('node >= 20', major >= 20, process.versions.node),
    check('agentopia home', true, agentopiaHome()),
    check('plugins root', findPluginsRoot() !== null, findPluginsRoot() ?? 'not found'),
  ];

  for (const id of harnessIds()) {
    checks.push(...checkHarness(id));
  }

  for (const item of checks) {
    const mark = item.ok ? paint.green('ok  ') : paint.red('fail');
    process.stdout.write(`${mark} ${item.label.padEnd(22)} ${paint.dim(item.detail)}\n`);
  }

  return checks.every((item) => item.ok) ? 0 : 1;
}
