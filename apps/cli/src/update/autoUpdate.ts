import { VERSION } from '../version';
import { handOffTarget } from './handoff';
import { Updater, autoUpdateOff } from './updater';

/**
 * The floor server's updater: every so often it asks npm for a newer
 * release and downloads it; once one is ready, a server in the background
 * switches to it as soon as the office is quiet (or a day on at most, so a
 * session that never says it is done cannot hold an update back forever).
 * A server in the foreground only says so: it belongs to its terminal, and
 * takes the new version the next time it is started.
 */

/** The first check waits this long, so starting the office stays quick. */
export const FIRST_CHECK_MS = 10_000;
/** How often to look again. `Updater.check` asks npm only once its answer is stale. */
export const CHECK_EVERY_MS = 60 * 60 * 1000;
/** With a version ready, how often to see whether the office is quiet. */
export const QUIET_EVERY_MS = 60_000;
/** Switch after this long with a version ready, quiet or not. */
export const SWITCH_WITHIN_MS = 24 * 60 * 60 * 1000;

export interface AutoUpdateOptions {
  updater?: Updater;
  /** Started by `agentopia start`: it may switch itself over. */
  detached: boolean;
  /** Is the office quiet enough to switch now? */
  quiet(): boolean;
  /**
   * Replace this server with `bundle`. Resolves true once the new server is
   * up (this one then exits), false if it failed (this one carries on).
   */
  switchTo(bundle: string, version: string): Promise<boolean>;
  log(line: string): void;
  now?: () => number;
  env?: Record<string, string | undefined>;
}

export interface AutoUpdate {
  stop(): void;
  /** One round, as the timers run it: for tests. */
  tick(): Promise<void>;
}

export function startAutoUpdate(options: AutoUpdateOptions): AutoUpdate {
  const updater = options.updater ?? new Updater();
  const now = options.now ?? Date.now;
  const env = options.env ?? process.env;
  let readyAt: number | null = null;
  let told: string | null = null;
  let busy = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** A newer version this server should become, if one is downloaded. */
  const target = (): { bundle: string; version: string } | null => {
    const bundle = handOffTarget(updater.store, updater.version, env);
    const version = updater.store.current();
    return bundle && version ? { bundle, version } : null;
  };

  const download = async (): Promise<void> => {
    if (autoUpdateOff(env)) {
      return;
    }
    const result = await updater.check(now());
    if (result.kind === 'failed') {
      options.log(`update check failed: ${result.error}`);
    } else if (result.kind === 'available') {
      options.log(`downloading agentopia ${result.release.version}`);
      try {
        await updater.prepare(result.release);
        options.log(`agentopia ${result.release.version} is ready`);
      } catch (err) {
        options.log(
          `could not download agentopia ${result.release.version}: ${(err as Error).message}`
        );
      }
    }
  };

  const tick = async (): Promise<void> => {
    if (busy || stopped) {
      return;
    }
    busy = true;
    try {
      if (!target()) {
        readyAt = null;
        await download();
      }
      const ready = target();
      if (!ready) {
        return;
      }
      readyAt ??= now();
      if (!options.detached) {
        if (told !== ready.version) {
          told = ready.version;
          options.log(
            `agentopia ${ready.version} is ready; it takes over the next time the office starts ` +
              '(agentopia start runs it in the background, where it updates itself)'
          );
        }
        return;
      }
      if (options.quiet() || now() - readyAt >= SWITCH_WITHIN_MS) {
        options.log(`switching the office from agentopia ${VERSION} to ${ready.version}`);
        if (await options.switchTo(ready.bundle, ready.version)) {
          stopped = true;
        } else {
          readyAt = null;
        }
      }
    } catch (err) {
      options.log(`update failed: ${(err as Error).message}`);
    } finally {
      busy = false;
    }
  };

  const schedule = (ms: number): void => {
    if (stopped) {
      return;
    }
    timer = setTimeout(() => {
      void tick().then(() => schedule(readyAt !== null ? QUIET_EVERY_MS : CHECK_EVERY_MS));
    }, ms);
    timer.unref?.();
  };
  schedule(FIRST_CHECK_MS);

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    },
    tick,
  };
}
