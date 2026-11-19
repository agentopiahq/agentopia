#!/usr/bin/env node
// Finishes the changelogs after `changeset version` (`yarn version-packages`
// runs it right after), in two ways Changesets has no hook for:
//
// - Dates each released version's heading: `## 0.2.0` becomes
//   `## 0.2.0 - 2026-11-18`. Only headings without a date are touched, so it
//   is safe to run again. The date is today's in the local time zone (`TZ`;
//   the Release workflow pins it).
// - Keeps an alias package's changelog (see ALIASES) as a link to the package
//   it aliases, instead of a second copy of the same entries.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = 'https://github.com/agentopiahq/agentopia';

/** Alias packages, each released with the package it names at the same version. */
export const ALIASES = { '@agentopia/cli': 'agentopiahq' };

const HEADING = /^## (\d+\.\d+\.\d+(?:-[\w.]+)?)[ \t]*$/gm;

/** Today's date as YYYY-MM-DD, in the local time zone. */
export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Adds ` - date` to every version heading that has none. */
export function dateHeadings(changelog, date) {
  return changelog.replace(HEADING, (_, version) => `## ${version} - ${date}`);
}

/** The whole changelog of an alias: a pointer to its target's. */
export function aliasChangelog(alias, target, targetDir) {
  return (
    `# ${alias}\n\n` +
    `\`${alias}\` is an alias for \`${target}\`, released with it at the same version every time. ` +
    `See the [${target} changelog](${REPO}/blob/main/${targetDir}/CHANGELOG.md).\n`
  );
}

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Every workspace package under apps/ and packages/, with its directory
 * relative to the repository root. */
export function workspaces() {
  return ['apps', 'packages'].flatMap((dir) => {
    const parent = join(root, dir);
    if (!existsSync(parent)) {
      return [];
    }
    return readdirSync(parent)
      .map((name) => `${dir}/${name}`)
      .filter((rel) => existsSync(join(root, rel, 'package.json')))
      .map((rel) => ({
        dir: join(root, rel),
        rel,
        json: JSON.parse(readFileSync(join(root, rel, 'package.json'), 'utf8')),
      }));
  });
}

function main() {
  const date = today();
  const all = workspaces();
  const byName = new Map(all.map((pkg) => [pkg.json.name, pkg]));
  for (const pkg of all) {
    const file = join(pkg.dir, 'CHANGELOG.md');
    if (!existsSync(file)) {
      continue;
    }
    const before = readFileSync(file, 'utf8');
    const target = ALIASES[pkg.json.name];
    const after = target
      ? aliasChangelog(pkg.json.name, target, byName.get(target).rel)
      : dateHeadings(before, date);
    if (after !== before) {
      writeFileSync(file, after);
      console.log(`Wrote ${pkg.rel}/CHANGELOG.md`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
