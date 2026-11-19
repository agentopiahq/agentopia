#!/usr/bin/env node
// Dates each released version's changelog heading: `## 0.2.0` becomes
// `## 0.2.0 - 2026-11-18`. Changesets writes the heading itself and has no
// hook for it, so `yarn version-packages` runs this right after
// `changeset version`. Only headings without a date are touched, so it is
// safe to run again. The date is today's in the local time zone (`TZ`; the
// Release workflow pins it).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Every CHANGELOG.md of a workspace under apps/ and packages/. */
function changelogs(root) {
  return ['apps', 'packages'].flatMap((dir) => {
    const parent = join(root, dir);
    if (!existsSync(parent)) {
      return [];
    }
    return readdirSync(parent)
      .map((name) => join(parent, name, 'CHANGELOG.md'))
      .filter((file) => existsSync(file));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const date = today();
  for (const file of changelogs(root)) {
    const before = readFileSync(file, 'utf8');
    const after = dateHeadings(before, date);
    if (after !== before) {
      writeFileSync(file, after);
      console.log(`Dated ${file.slice(root.length + 1)} (${date})`);
    }
  }
}
