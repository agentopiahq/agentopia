import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { busPath } from '../paths';
import { createSession, liveSessions } from '../session';
import { SWITCH_WITHIN_MS, startAutoUpdate } from '../update/autoUpdate';
import { handOffTarget } from '../update/handoff';
import { BUSY_WITHIN_MS, busLeaves, isBusy, officeQuiet } from '../update/quiet';
import { Fetch } from '../update/registry';
import { VersionStore } from '../update/store';
import { Updater, isCheckout } from '../update/updater';

let root: string;
const savedHome = process.env.AGENTOPIA_HOME;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentopia-self-update-'));
  process.env.AGENTOPIA_HOME = root;
});
afterEach(() => {
  process.env.AGENTOPIA_HOME = savedHome;
  rmSync(root, { recursive: true, force: true });
});

/** A stored version: just enough of a package for the store to count it. */
function stored(store: VersionStore, version: string): void {
  store.install(version, new Map([['dist/agentopia.mjs', Buffer.from('// cli')]]));
}

describe('handOffTarget', () => {
  it.each([
    ['nothing is downloaded', [], null, {}, null],
    ['the download is older', ['0.2.0'], '0.2.0', {}, null],
    ['the download is this version', ['0.3.0'], '0.3.0', {}, null],
    ['the download is newer', ['0.4.0'], '0.4.0', {}, '0.4.0'],
    ['hand-off is off', ['0.4.0'], '0.4.0', { AGENTOPIA_NO_HANDOFF: '1' }, null],
  ])('when %s', (_, versions, current, env, expected) => {
    const store = new VersionStore(join(root, 'versions'));
    for (const v of versions) {
      stored(store, v);
    }
    store.setCurrent(current);
    expect(handOffTarget(store, '0.3.0', env, join(root, 'pkg', 'dist'))).toBe(
      expected ? store.bundle(expected) : null
    );
  });

  it('never hands a checkout of the repo to a download', () => {
    const store = new VersionStore(join(root, 'versions'));
    stored(store, '0.4.0');
    store.setCurrent('0.4.0');
    const checkout = join(root, 'repo', 'apps', 'cli');
    mkdirSync(join(checkout, 'src'), { recursive: true });
    writeFileSync(join(checkout, 'src', 'index.ts'), '');
    expect(isCheckout(join(checkout, 'dist'))).toBe(true);
    expect(handOffTarget(store, '0.3.0', {}, join(checkout, 'dist'))).toBeNull();
  });

  it('skips a download that failed to start', () => {
    const store = new VersionStore(join(root, 'versions'));
    stored(store, '0.4.0');
    store.setCurrent('0.4.0');
    store.markBad('0.4.0');
    expect(handOffTarget(store, '0.3.0', {}, join(root, 'pkg', 'dist'))).toBeNull();
  });
});

/** A bus whose agent got as far as `evs`, each one hook record. */
function bus(evs: Array<Record<string, unknown>>): string {
  const { id } = createSession('claude', []);
  for (const ev of evs) {
    appendFileSync(busPath(id), `${JSON.stringify({ ts: Date.now(), sid: 's1', ...ev })}\n`);
  }
  return id;
}

const START = { ev: 'SessionStart', src: 'startup' };
const PROMPT = { ev: 'UserPromptSubmit', prompt: 'hi' };
const TOOL = { ev: 'PreToolUse', tool: 'Bash', tuid: 't1' };
const TOOL_DONE = { ev: 'PostToolUse', tool: 'Bash', tuid: 't1' };
const STOP = { ev: 'Stop' };

describe('officeQuiet', () => {
  it.each([
    ['just opened', [START], false],
    ['answering a prompt', [START, PROMPT], true],
    ['running a tool', [START, PROMPT, TOOL], true],
    ['between tools', [START, PROMPT, TOOL, TOOL_DONE], true],
    ['done with its turn', [START, PROMPT, TOOL, TOOL_DONE, STOP], false],
    ['asking for approval', [START, PROMPT, { ev: 'PermissionRequest', tool: 'Bash' }], true],
    ['compacting', [START, PROMPT, STOP, { ev: 'PreCompact', src: 'auto' }], true],
    ['gone', [START, PROMPT, { ev: 'SessionEnd' }], false],
  ])('a session %s is busy: %s', (_, evs: Array<Record<string, unknown>>, busy) => {
    bus(evs);
    const [summary] = liveSessions();
    const leaves = summary ? busLeaves(summary) : null;
    expect(Boolean(leaves && isBusy(leaves))).toBe(busy);
    expect(officeQuiet()).toBe(!busy);
  });

  it('is quiet with no sessions at all', () => {
    expect(officeQuiet()).toBe(true);
  });

  it('lets a session quiet for an hour go, whatever it last said', () => {
    const id = bus([START, PROMPT, TOOL]);
    const when = (Date.now() - BUSY_WITHIN_MS - 1000) / 1000;
    utimesSync(busPath(id), when, when);
    expect(officeQuiet()).toBe(true);
  });

  it('waits for every session', () => {
    bus([START, PROMPT, STOP]);
    bus([START, PROMPT]);
    expect(officeQuiet()).toBe(false);
  });
});

describe('startAutoUpdate', () => {
  const REGISTRY = 'https://registry.example.test';
  /** A registry that says 0.4.0 is out; the download is faked by `prepare`. */
  const registry: Fetch = (url) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          version: '0.4.0',
          dist: { tarball: `${url}.tgz`, integrity: 'sha512-x' },
        }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

  function setUp(options: { detached: boolean; quiet?: boolean; switchOk?: boolean }) {
    let now = 1_000_000;
    let quiet = options.quiet ?? true;
    const store = new VersionStore(join(root, 'versions'));
    const updater = new Updater({
      store,
      fetch: registry,
      registry: REGISTRY,
      cachePath: join(root, 'cache.json'),
      version: '0.3.0',
    });
    jest.spyOn(updater, 'prepare').mockImplementation((release) => {
      stored(store, release.version);
      store.setCurrent(release.version);
      return Promise.resolve();
    });
    const switches: string[] = [];
    const lines: string[] = [];
    const auto = startAutoUpdate({
      updater,
      detached: options.detached,
      quiet: () => quiet,
      switchTo: (_bundle, version) => {
        switches.push(version);
        return Promise.resolve(options.switchOk ?? true);
      },
      log: (line) => lines.push(line),
      now: () => now,
      env: {},
    });
    return {
      auto,
      store,
      switches,
      lines,
      advance: (ms: number) => {
        now += ms;
      },
      setQuiet: (q: boolean) => {
        quiet = q;
      },
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('downloads a new release and switches to it once the office is quiet', async () => {
    const t = setUp({ detached: true, quiet: false });
    await t.auto.tick();
    expect(t.store.current()).toBe('0.4.0');
    expect(t.switches).toEqual([]);
    t.setQuiet(true);
    await t.auto.tick();
    expect(t.switches).toEqual(['0.4.0']);
    t.auto.stop();
  });

  it('switches within a day even if the office never goes quiet', async () => {
    const t = setUp({ detached: true, quiet: false });
    await t.auto.tick();
    t.advance(SWITCH_WITHIN_MS - 1);
    await t.auto.tick();
    expect(t.switches).toEqual([]);
    t.advance(1);
    await t.auto.tick();
    expect(t.switches).toEqual(['0.4.0']);
    t.auto.stop();
  });

  it('in the foreground, only says the new version is ready, once', async () => {
    const t = setUp({ detached: false });
    await t.auto.tick();
    await t.auto.tick();
    expect(t.switches).toEqual([]);
    expect(t.lines.filter((line) => line.includes('takes over the next time'))).toHaveLength(1);
    t.auto.stop();
  });

  it('does not download when auto-update is off, but still switches to a download', async () => {
    const store = new VersionStore(join(root, 'versions'));
    const updater = new Updater({ store, fetch: registry, registry: REGISTRY, version: '0.3.0' });
    const prepare = jest.spyOn(updater, 'prepare');
    const switches: string[] = [];
    const auto = startAutoUpdate({
      updater,
      detached: true,
      quiet: () => true,
      switchTo: (_b, v) => {
        switches.push(v);
        return Promise.resolve(true);
      },
      log: () => undefined,
      env: { AGENTOPIA_AUTO_UPDATE: '0' },
    });
    await auto.tick();
    expect(prepare).not.toHaveBeenCalled();
    expect(switches).toEqual([]);
    stored(store, '0.5.0');
    store.setCurrent('0.5.0');
    await auto.tick();
    expect(switches).toEqual(['0.5.0']);
    auto.stop();
  });
});
