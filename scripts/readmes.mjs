#!/usr/bin/env node
// Writes each alias package's README (see ALIASES in changelogs.mjs) from the
// README of the package it aliases, so the two never drift: `yarn readmes`
// writes them, `yarn readmes --check` (run by the Check workflow) fails if one
// is out of date, and `yarn version-packages` writes them before a release.
//
// The alias's README is its target's, with three changes:
//
// - A first line saying it is generated, and from where.
// - The block between `<!-- alias-note -->` and `<!-- /alias-note -->` (the
//   target's word on the alias) becomes the alias's word on its target.
// - `npm i -g <target>` and `npx <target>` install the alias instead.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALIASES, workspaces } from './changelogs.mjs';

const NOTE = /<!-- alias-note -->\n[\s\S]*?<!-- \/alias-note -->\n/;

/** The note an alias's README carries in place of its target's. */
export function aliasNote(alias, target) {
  return (
    `\`${alias}\` is an alias for [\`${target}\`](https://www.npmjs.com/package/${target}).\n` +
    `It installs the same \`agentopia\` command at the same version. Install one or the other,\n` +
    `not both.\n`
  );
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The whole README of an alias, made from its target's. */
export function aliasReadme(readme, alias, target, targetRel) {
  if (!NOTE.test(readme)) {
    throw new Error(`${targetRel}/README.md has no <!-- alias-note --> block for ${alias}`);
  }
  const header = `<!-- Generated from ${targetRel}/README.md by scripts/readmes.mjs: edit that file, then run \`yarn readmes\`. -->\n\n`;
  const grow = alias.length - target.length;
  const install = new RegExp(`\\b(npm i -g|npm install -g|npx) ${escape(target)}\\b( *)`, 'g');
  return (
    header +
    readme
      .replace(NOTE, aliasNote(alias, target))
      // Keep a trailing `# comment` in its column where there is room.
      .replace(install, (_, cmd, pad) => {
        const rest = pad.length === 0 ? '' : ' '.repeat(Math.max(1, pad.length - grow));
        return `${cmd} ${alias}${rest}`;
      })
  );
}

function main(check) {
  const all = workspaces();
  const byName = new Map(all.map((pkg) => [pkg.json.name, pkg]));
  let stale = 0;
  for (const [alias, target] of Object.entries(ALIASES)) {
    const from = byName.get(target);
    const to = byName.get(alias);
    const file = join(to.dir, 'README.md');
    const after = aliasReadme(
      readFileSync(join(from.dir, 'README.md'), 'utf8'),
      alias,
      target,
      from.rel
    );
    const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (after === before) {
      continue;
    }
    if (check) {
      console.error(
        `${to.rel}/README.md is out of date with ${from.rel}/README.md: run yarn readmes`
      );
      stale++;
    } else {
      writeFileSync(file, after);
      console.log(`Wrote ${to.rel}/README.md`);
    }
  }
  return stale === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.includes('--check'));
}
