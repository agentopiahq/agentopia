#!/usr/bin/env node
// Finishes the changelogs after `changeset version` (`yarn version-packages`
// runs it right after), which Changesets has no hook for: it dates each
// released version's heading, so `## 0.2.0` becomes `## 0.2.0 - 2026-11-18`.
// Only headings without a date are touched, so it is safe to run again. The
// date is today's in the local time zone (`TZ`; the Release workflow pins it).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = 'https://github.com/agentopiahq/agentopia';

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
  for (const pkg of workspaces()) {
    const file = join(pkg.dir, 'CHANGELOG.md');
    if (!existsSync(file)) {
      continue;
    }
    const before = readFileSync(file, 'utf8');
    const after = dateHeadings(before, date);
    if (after !== before) {
      writeFileSync(file, after);
      console.log(`Wrote ${pkg.rel}/CHANGELOG.md`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
