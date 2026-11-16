// Stages what the published package ships beside the CLI bundle, and removes it
// again after packing. Runs as prepack / postpack, so `yarn pack` and
// `yarn npm publish` (which Changesets drives) both get a complete package.
//
//   node scripts/stage.mjs         copy the viewer build, plugins and LICENSE in
//   node scripts/stage.mjs clean   remove them
//
// The copies are gitignored and live only while packing: left behind, they would
// shadow the repo's own plugins/ and viewer build for a CLI run from the repo.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(cliDir, '..', '..');

const STAGED = [
  { from: join(repoRoot, 'apps', 'viewer', 'dist'), to: join(cliDir, 'viewer') },
  { from: join(repoRoot, 'plugins'), to: join(cliDir, 'plugins') },
  { from: join(repoRoot, 'LICENSE'), to: join(cliDir, 'LICENSE') },
];

function clean() {
  for (const { to } of STAGED) {
    rmSync(to, { recursive: true, force: true });
  }
}

function stage() {
  const missing = [join(cliDir, 'dist', 'agentopia.mjs'), join(repoRoot, 'apps', 'viewer', 'dist', 'index.html')].filter(
    (path) => !existsSync(path)
  );
  if (missing.length > 0) {
    console.error(
      `agentopia: cannot pack without a build; missing ${missing.join(', ')}.\n` +
        'Run `yarn turbo build --filter=@agentopia/cli --filter=@agentopia/viewer` first.'
    );
    process.exit(1);
  }
  clean();
  for (const { from, to } of STAGED) {
    cpSync(from, to, { recursive: true });
  }
}

if (process.argv[2] === 'clean') {
  clean();
} else {
  stage();
}
