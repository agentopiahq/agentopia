#!/usr/bin/env node
// Release notes from the dated changelogs. The Changesets action finds a
// version's entry by a heading that is exactly `## 0.2.0`, so with our dated
// headings (`## 0.2.0 - 2026-11-18`, scripts/changelogs.mjs) it would put
// the whole changelog in the GitHub release and the version pull request. The
// Release workflow turns its own releases off and uses this instead:
//
//   node scripts/release-notes.mjs releases '<published-packages JSON>'
//     creates a GitHub release (`name@version`) for each published package
//   node scripts/release-notes.mjs pr-body
//     prints the version pull request's description
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO, workspaces } from './changelogs.mjs';

/** The body of `version`'s entry: everything under its `## version` or
 * `## version - date` heading, up to the next heading as deep. Headings inside
 * code blocks don't count. Undefined when there is no such entry. */
export function changelogEntry(changelog, version) {
  const lines = changelog.split('\n');
  let start;
  let depth;
  let fence;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = /^(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && line.startsWith(fence)) {
        fence = undefined;
      }
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (!heading) {
      continue;
    }
    if (start === undefined) {
      const text = heading[2];
      if (text === version || text.startsWith(`${version} - `)) {
        start = i + 1;
        depth = heading[1].length;
      }
    } else if (heading[1].length <= depth) {
      return lines.slice(start, i).join('\n').trim();
    }
  }
  return start === undefined ? undefined : lines.slice(start).join('\n').trim();
}

/** Every public workspace package, with its directory. */
function packages() {
  return workspaces().filter(({ json }) => !json.private);
}

const releaseUrl = (name, version) =>
  `${REPO}/releases/tag/${encodeURIComponent(`${name}@${version}`)}`;

function entryOf(pkg, version = pkg.json.version) {
  const file = join(pkg.dir, 'CHANGELOG.md');
  const entry = existsSync(file) ? changelogEntry(readFileSync(file, 'utf8'), version) : undefined;
  if (entry === undefined) {
    throw new Error(`No changelog entry for ${pkg.json.name}@${version}`);
  }
  return entry;
}

function releases(published) {
  const byName = new Map(packages().map((pkg) => [pkg.json.name, pkg]));
  for (const { name, version } of JSON.parse(published)) {
    const pkg = byName.get(name);
    if (!pkg) {
      throw new Error(`Published ${name}, which is not a public workspace package`);
    }
    const tag = `${name}@${version}`;
    const args = ['release', 'create', tag, '--title', tag, '--notes-file', '-', '--verify-tag'];
    if (version.includes('-')) {
      args.push('--prerelease');
    }
    execFileSync('gh', args, {
      input: entryOf(pkg, version),
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  }
}

function prBody() {
  const header =
    'This PR was opened by the Release workflow. Merging it publishes these versions to npm, ' +
    'pushes their tags and creates their GitHub releases. Run the workflow again to fold in ' +
    'changesets merged since.';
  const sections = packages().map(
    (pkg) => `## ${pkg.json.name}@${pkg.json.version}\n\n${entryOf(pkg)}`
  );
  return [header, '# Releases', ...sections].join('\n\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  if (command === 'releases') {
    releases(arg ?? '[]');
  } else if (command === 'pr-body') {
    process.stdout.write(prBody());
  } else {
    console.error('usage: release-notes.mjs releases <published-packages JSON> | pr-body');
    process.exit(2);
  }
}
