// Bundles the CLI to one ESM file. The banner records where the bundle itself
// lives, so the CLI finds the viewer and plugins shipped beside it however it
// was launched: from its own bin, through the agentopia-town alias, or via npx.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/agentopia.mjs',
  banner: {
    js: '#!/usr/bin/env node\nglobalThis.__agentopiaBundleUrl = import.meta.url;',
  },
  logLevel: 'warning',
});
