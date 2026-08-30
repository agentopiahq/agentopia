#!/usr/bin/env node
/**
 * Replay a bus file in the office viewer: `yarn replay <bus.jsonl> [speed] [watch args...]`.
 *
 * The viewer only knows sessions, so this copies the file into the sessions
 * directory under a stable `fixture-` id (re-running with the same file
 * overwrites it) and hands off to `agentopia watch --replay`.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const USAGE = `Usage: yarn replay <bus.jsonl> [speed] [agentopia watch args...]

Examples:
  yarn replay packages/core/fixtures/02-subagent.jsonl        Replay at 1x
  yarn replay packages/core/fixtures/02-subagent.jsonl 2      Replay at 2x
  yarn replay path/to/bus.jsonl 1 --no-open --port 7788       Extra args pass to watch
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

let speed = 1;
if (rest.length > 0 && !rest[0].startsWith('-')) {
  speed = Number(rest.shift());
  if (!Number.isFinite(speed) || speed <= 0) {
    process.stderr.write(`replay: speed must be a positive number\n${USAGE}`);
    process.exit(1);
  }
}

const sessionId = `fixture-${basename(busFile)
  .replace(/\.jsonl$/, '')
  .replace(/[^A-Za-z0-9-]/g, '-')}`;
const home = process.env.AGENTOPIA_HOME ?? join(homedir(), '.agentopia');
const sessionDir = join(home, 'sessions', sessionId);
mkdirSync(sessionDir, { recursive: true });
copyFileSync(busFile, join(sessionDir, 'bus.jsonl'));

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(repoRoot, 'apps', 'cli', 'dist', 'agentopia.mjs');
if (!existsSync(cli)) {
  process.stderr.write('replay: CLI not built. Run `yarn --cwd apps/cli build` first.\n');
  process.exit(1);
}

process.stderr.write(`replay: ${busFile} -> session ${sessionId} at ${speed}x\n`);
const child = spawn(
  process.execPath,
  [cli, 'watch', sessionId, '--replay', String(speed), ...rest],
  { stdio: 'inherit' }
);
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 0);
});
