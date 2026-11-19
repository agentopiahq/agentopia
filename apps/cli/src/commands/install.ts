import { paint } from '../format';
import { Harness, installers } from '../harness';
import { PluginInstaller, Step } from '../install';
import { pluginDirFor } from '../paths';

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

function warnStray(harness: Harness, installer: PluginInstaller): void {
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

export function runInstall(): number {
  let ok = true;
  for (const { harness, installer } of installers()) {
    const pluginDir = pluginDirFor(harness.id);
    if (!pluginDir) {
      process.stderr.write(`agentopia: could not find plugins/${harness.id}.\n`);
      ok = false;
      continue;
    }
    process.stdout.write(`${paint.bold(harness.label)}\n`);
    const done = report(installer.install(pluginDir, process.execPath));
    warnStray(harness, installer);
    if (done) {
      process.stdout.write(
        `From now on its hooks can record every new ${harness.label} session, the desktop app's too. ` +
          `Restart the ${harness.app ?? harness.label} desktop app, and any ${harness.bin} ` +
          'sessions already running, so they load it.\n'
      );
    }
    ok &&= done;
  }
  if (ok) {
    process.stdout.write(`Run ${paint.bold('agentopia watch')} to open the office.\n`);
  }
  return ok ? 0 : 1;
}

export function runUninstall(): number {
  let ok = true;
  for (const { harness, installer } of installers()) {
    process.stdout.write(`${paint.bold(harness.label)}\n`);
    const steps = installer.uninstall();
    if (steps.length === 0) {
      process.stdout.write(paint.dim('     not installed\n'));
    }
    ok &&= report(steps);
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
    return false;
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

/**
 * For the floor: refresh every standing install, and say how to make one
 * where there is none, since without it only wrapped runs reach the office.
 */
export function noteInstalls(): void {
  for (const { harness } of installers()) {
    if (!refreshInstall(harness)) {
      process.stdout.write(
        paint.dim(
          `Plain ${harness.bin} sessions aren't recorded yet. Run agentopia install to install ` +
            `the plugin whose hooks record every ${harness.label} session, the desktop app's too.\n`
        )
      );
    }
  }
}
