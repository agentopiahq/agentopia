import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { paint } from '../format';
import { Harness, installers } from '../harness';
import { PluginInstaller, Step } from '../install';
import { agentopiaHome, pluginDirFor } from '../paths';
import { binaryOnPath } from './doctor';

/**
 * `agentopia install` and `agentopia uninstall`: the standing install, so a
 * plain `claude` (and the desktop app) is recorded without the wrapper.
 */

function report(steps: Step[]): boolean {
  for (const item of steps) {
    const mark = item.ok ? paint.green('ok  ') : paint.red('fail');
    process.stdout.write(`${mark} ${item.label}\n`);
    if (!item.ok && item.detail) {
      process.stdout.write(`${paint.dim(item.detail.replace(/^/gm, '     '))}\n`);
    }
  }
  return steps.every((item) => item.ok);
}

/** Warn of anything that would record every event twice beside the plugin. */
function warnStray(harness: Harness, installer: PluginInstaller): void {
  const state = installer.state();
  if (state.installed && state.elsewhere.length > 0) {
    process.stdout.write(
      paint.amber(
        `note ${harness.label} also has agentopia installed as ${state.elsewhere.join(', ')}, ` +
          'so every event would be recorded twice.\n' +
          `     Keep one: ${paint.bold('agentopia uninstall')}, or ` +
          `${paint.bold(`${harness.bin} plugin uninstall ${state.elsewhere[0]}`)}.\n`
      )
    );
  }
  const stray = installer.strayHooks();
  if (stray.length > 0) {
    process.stdout.write(
      paint.amber(
        `note ${harness.label}'s own settings also run agentopia's emitter on ${stray.length} ` +
          `events (${stray.join(', ')}), so every event would be recorded twice.\n` +
          '     Remove those hooks from its settings.json; the plugin replaces them.\n'
      )
    );
  }
}

/** Install one harness's plugin, reporting each step. True when it is in. */
function installOne(harness: Harness, installer: PluginInstaller): boolean {
  const pluginDir = pluginDirFor(harness.id);
  if (!pluginDir) {
    process.stderr.write(`agentopia: could not find plugins/${harness.id}.\n`);
    return false;
  }
  process.stdout.write(`${paint.bold(harness.label)}\n`);
  const before = installer.state();
  if (!before.installed && before.elsewhere.length > 0) {
    // Installed from a marketplace already, which the agent keeps current;
    // a second copy would record every event twice.
    report([{ label: `${before.elsewhere.join(', ')} already installed`, ok: true }]);
    warnStray(harness, installer);
    setDeclined(harness.id, false);
    return true;
  }
  const done = report(installer.install(pluginDir, process.execPath));
  warnStray(harness, installer);
  if (done) {
    setDeclined(harness.id, false);
    process.stdout.write(
      `From now on its hooks can record every new ${harness.label} session, the desktop app's too. ` +
        `Restart the ${harness.app ?? harness.label} desktop app, and any ${harness.bin} ` +
        'sessions already running, so they load it.\n'
    );
  }
  return done;
}

export function runInstall(): number {
  let ok = true;
  for (const { harness, installer } of installers()) {
    ok = installOne(harness, installer) && ok;
  }
  if (ok) {
    process.stdout.write(`Run ${paint.bold('agentopia start')} to open the office.\n`);
  }
  return ok ? 0 : 1;
}

export function runUninstall(): number {
  let ok = true;
  for (const { harness, installer } of installers()) {
    process.stdout.write(`${paint.bold(harness.label)}\n`);
    const steps = installer.uninstall();
    // Taken out on purpose: `start` should not offer to put it back.
    setDeclined(harness.id, true);
    const { elsewhere } = installer.state();
    if (steps.length === 0 && elsewhere.length === 0) {
      process.stdout.write(paint.dim('     not installed\n'));
    }
    ok &&= report(steps);
    for (const id of elsewhere) {
      process.stdout.write(
        `${paint.amber('note')} ${id} came from a marketplace and still records every session; ` +
          `remove it with ${paint.bold(`${harness.bin} plugin uninstall ${id}`)}.\n`
      );
    }
  }
  if (ok) {
    process.stdout.write(
      'New sessions are no longer recorded. Recordings stay in the agentopia home until you delete them.\n'
    );
  }
  return ok ? 0 : 1;
}

/**
 * Bring a standing install up to date with this CLI, quietly: after an
 * upgrade the plugin (or the Node it runs on) may have changed. Only when it
 * did does this run the agent's CLI, so the usual cost is reading two files.
 * Returns whether the plugin is installed and on.
 */
export function refreshInstall(harness: Harness): boolean {
  const installer = harness.installer?.();
  const pluginDir = pluginDirFor(harness.id);
  if (!installer || !pluginDir) {
    return false;
  }
  const state = installer.state();
  if (!state.installed) {
    // Installed from a marketplace instead, which the agent keeps current.
    return state.elsewhere.length > 0;
  }
  if (state.version !== installer.desiredVersion(pluginDir, process.execPath)) {
    const steps = installer.install(pluginDir, process.execPath);
    if (!steps.every((item) => item.ok)) {
      process.stderr.write(
        paint.dim(
          `agentopia: could not update the ${harness.label} plugin; run agentopia install\n`
        )
      );
    }
  }
  return installer.state().enabled;
}

/** What `start` does about one harness's plugin. */
export type SetupAction =
  /** Installed and on (and refreshed if it was out of date): nothing to say. */
  | 'ready'
  /** The agent isn't on PATH, so there is nothing to install into. */
  | 'no-agent'
  /** Install it without asking: `--yes`. */
  | 'install'
  /** Ask first. */
  | 'ask'
  /** Say how to install it: no one to ask, or they said no before. */
  | 'note';

export function setupAction(facts: {
  ready: boolean;
  agentOnPath: boolean;
  yes: boolean;
  declined: boolean;
  interactive: boolean;
}): SetupAction {
  if (facts.ready) {
    return 'ready';
  }
  if (!facts.agentOnPath) {
    return 'no-agent';
  }
  if (facts.yes) {
    return 'install';
  }
  return facts.interactive && !facts.declined ? 'ask' : 'note';
}

/** Where `start` remembers a "no" to installing, so it asks once, not every time. */
function prefsPath(): string {
  return join(agentopiaHome(), 'prefs.json');
}

function readDeclined(): Record<string, boolean> {
  try {
    const prefs = JSON.parse(readFileSync(prefsPath(), 'utf8')) as {
      declinedInstall?: Record<string, boolean>;
    };
    return prefs.declinedInstall ?? {};
  } catch {
    return {};
  }
}

export function isDeclined(harnessId: string): boolean {
  return readDeclined()[harnessId] === true;
}

export function setDeclined(harnessId: string, declined: boolean): void {
  const current = readDeclined();
  if (Boolean(current[harnessId]) === declined) {
    return;
  }
  const next = { ...current };
  if (declined) {
    next[harnessId] = true;
  } else {
    delete next[harnessId];
  }
  mkdirSync(agentopiaHome(), { recursive: true });
  writeFileSync(prefsPath(), `${JSON.stringify({ declinedInstall: next }, null, 2)}\n`);
}

/**
 * Yes unless they say no: Enter alone is yes. Null when no answer came (the
 * input ended). Ctrl-C at the question stops agentopia, as it would anywhere.
 */
async function confirm(question: string): Promise<boolean | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => {
    process.stdout.write('\n');
    process.exit(130);
  });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === '' || answer === 'y' || answer === 'yes';
  } catch {
    process.stdout.write('\n');
    return null;
  } finally {
    rl.close();
  }
}

function notInstalledNote(harness: Harness): string {
  return (
    `Plain ${harness.bin} sessions aren't recorded yet. Run agentopia install to install ` +
    `the plugin whose hooks record every ${harness.label} session, the desktop app's too.\n`
  );
}

/**
 * `start`'s setup, so one command gets everything going: every standing
 * install refreshed, and where there is none, the plugin installed once the
 * user says yes. It only asks at a terminal, and only once: a "no" (or an
 * uninstall) is remembered, and from then on it just says how.
 */
export async function setUpInstalls(options: { yes: boolean }): Promise<void> {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  for (const { harness, installer } of installers()) {
    const ready = refreshInstall(harness);
    const action = setupAction({
      ready,
      agentOnPath: ready || binaryOnPath(harness.bin),
      yes: options.yes,
      declined: isDeclined(harness.id),
      interactive,
    });
    if (action === 'ready') {
      warnStray(harness, installer);
    } else if (action === 'no-agent') {
      process.stdout.write(
        paint.dim(`${harness.bin} isn't on your PATH, so there is no ${harness.label} to record.\n`)
      );
    } else if (action === 'note') {
      process.stdout.write(paint.dim(notInstalledNote(harness)));
    } else {
      const yes =
        action === 'install' ||
        (await confirm(
          `Install the agentopia plugin into ${harness.label}, so every session is recorded, ` +
            `the desktop app's too? ${paint.dim('[Y/n]')} `
        ));
      if (yes) {
        installOne(harness, installer);
      } else if (yes === false) {
        setDeclined(harness.id, true);
        process.stdout.write(
          paint.dim(
            "Not installed. agentopia start won't ask again; run agentopia install whenever you want it.\n"
          )
        );
      } else {
        process.stdout.write(paint.dim(notInstalledNote(harness)));
      }
    }
  }
}

/**
 * For the floor in the foreground: refresh every standing install, and say
 * how to make one where there is none, since without it only wrapped runs
 * reach the office.
 */
export function noteInstalls(): void {
  for (const { harness } of installers()) {
    if (!refreshInstall(harness)) {
      process.stdout.write(paint.dim(notInstalledNote(harness)));
    }
  }
}

/** Bring every standing install up to date with this CLI, quietly. */
export function refreshInstalls(): void {
  for (const { harness } of installers()) {
    refreshInstall(harness);
  }
}
