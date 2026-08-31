#!/usr/bin/env node
/**
 * Replay a bus file in the office viewer: `yarn replay <bus.jsonl> [watch args...]`.
 *
 * Thin wrapper over `agentopia watch --bus --replay`, which streams the file
 * from wherever it lives — nothing is copied into the sessions directory.
 * Playback speed is the speed control on the office's scrubber, not a flag.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `Usage: yarn replay <bus.jsonl> [agentopia watch args...]

Examples:
  yarn replay packages/core/fixtures/02-subagent.jsonl
  yarn replay path/to/bus.jsonl --no-open --port 7788    Extra args pass to watch

Playback speed is set in the office itself, with the speed control on the scrubber.
`;

const [fileArg, ...rest] = process.argv.slice(2);
if (!fileArg || fileArg === '--help' || fileArg === '-h') {
  process.stderr.write(USAGE);
  process.exit(fileArg ? 0 : 1);
}

const busFile = resolve(fileArg);
if (!existsSync(busFile)) {
  process.stderr.write(`replay: no such file: ${busFile}\n`);
  process.exit(1);
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(repoRoot, 'apps', 'cli', 'dist', 'agentopia.mjs');
if (!existsSync(cli)) {
  process.stderr.write('replay: CLI not built. Run `yarn --cwd apps/cli build` first.\n');
  process.exit(1);
}

process.stderr.write(`replay: ${busFile}\n`);
const child = spawn(process.execPath, [cli, 'watch', '--bus', busFile, '--replay', ...rest], {
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 0);
});
