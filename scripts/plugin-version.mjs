#!/usr/bin/env node
// Stamps the CLI's version on every plugin manifest under plugins/, so a
// marketplace install (agentopia's own on GitHub, or Anthropic's directory)
// sees each release as a new version: Claude Code updates an installed plugin
// only when its manifest's version changes. `yarn version-packages` runs it
// after `changeset version`. `agentopia install` stamps its own staged copy
// (the CLI's version plus a hash), so it never reads this one.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'apps/cli/package.json'), 'utf8'));

for (const harness of readdirSync(join(root, 'plugins'), { withFileTypes: true })) {
  const path = join(root, 'plugins', harness.name, '.claude-plugin', 'plugin.json');
  if (!harness.isDirectory() || !existsSync(path)) {
    continue;
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.version !== version) {
    writeFileSync(path, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
    process.stdout.write(`plugins/${harness.name}: ${manifest.version} -> ${version}\n`);
  }
}
