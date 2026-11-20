import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  CLAUDE_PLUGIN_ID,
  ClaudeCodeInstaller,
  claudeConfigDir,
  pinNode,
  planStage,
} from '../install';
import { VERSION } from '../version';

const PLUGIN_DIR = resolve(__dirname, '../../../../plugins/claude');
const PLUGIN = { manifest: '.claude-plugin/plugin.json', hooks: 'hooks/hooks.json' };
const NODE = '/opt/node/bin/node';

function stage(nodePath = NODE) {
  return planStage({ from: PLUGIN_DIR, ...PLUGIN, nodePath, version: VERSION });
}

describe('pinNode', () => {
  it.each([
    [
      'node "${CLAUDE_PLUGIN_ROOT}/hooks/emit.mjs"',
      `"${NODE}" "\${CLAUDE_PLUGIN_ROOT}/hooks/emit.mjs"`,
    ],
    ['nodemon x.js', 'nodemon x.js'],
    ['bash -c "node x"', 'bash -c "node x"'],
  ])('rewrites %s', (command, expected) => {
    expect(pinNode({ hooks: [{ type: 'command', command }] }, NODE)).toEqual({
      hooks: [{ type: 'command', command: expected }],
    });
  });
});

describe('planStage', () => {
  it('pins every shipped hook to the given node', () => {
    const hooks = JSON.parse(stage().files.get(PLUGIN.hooks)!.toString()) as { hooks: object };
    const commands = JSON.stringify(hooks).match(/"command":"[^"\\]*(\\.[^"\\]*)*"/g) ?? [];

    expect(commands).toHaveLength(18);
    expect(commands.every((c) => c.includes(JSON.stringify(NODE).slice(1, -1)))).toBe(true);
  });

  it('stamps the CLI version plus a hash of what was staged', () => {
    const { files, version } = stage();
    const manifest = JSON.parse(files.get(PLUGIN.manifest)!.toString()) as {
      version: string;
      name: string;
    };

    expect(version).toMatch(new RegExp(`^${VERSION.replace(/\./g, '\\.')}\\+[0-9a-f]{8}$`));
    expect(manifest).toMatchObject({ name: 'agentopia', version });
  });

  it('copies the icon byte for byte', () => {
    const icon = '.claude-plugin/icon.png';

    expect(
      Buffer.compare(Buffer.from(stage().files.get(icon)!), readFileSync(join(PLUGIN_DIR, icon)))
    ).toBe(0);
  });

  it.each([
    ['the same inputs', NODE, true],
    ['another node', '/usr/local/bin/node', false],
  ])('stamps %s the same: %s', (_label, nodePath, same) => {
    expect(stage(nodePath).version === stage().version).toBe(same);
  });
});

describe('the shipped plugin', () => {
  it('carries the CLI version, so marketplace installs see each release', () => {
    const manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, PLUGIN.manifest), 'utf8')) as {
      version: string;
    };

    expect(manifest.version).toBe(VERSION);
  });
});

describe('claudeConfigDir', () => {
  it.each([
    [{ CLAUDE_CONFIG_DIR: '/a/claude' }, '/a/claude'],
    [{ CLAUDE_CONFIG_DIR: '/a, /b' }, '/a'],
  ])('reads %p', (env, expected) => {
    expect(claudeConfigDir(env)).toBe(expected);
  });
});

/**
 * A stand-in for `claude plugin ...` that keeps Claude Code's two files the
 * way the real one does, so the installer's own reads see its writes.
 */
function fakeClaude(config: string, home: string) {
  const calls: string[] = [];
  const write = (file: string, data: object) => {
    mkdirSync(join(config, file, '..'), { recursive: true });
    writeFileSync(join(config, file), JSON.stringify(data));
  };
  const read = (file: string) =>
    existsSync(join(config, file))
      ? (JSON.parse(readFileSync(join(config, file), 'utf8')) as Record<string, unknown>)
      : {};
  const stagedVersion = () =>
    (
      JSON.parse(readFileSync(join(home, 'plugins/claude/agentopia', PLUGIN.manifest), 'utf8')) as {
        version: string;
      }
    ).version;
  const setEnabled = (on: boolean) =>
    write('settings.json', {
      ...read('settings.json'),
      enabledPlugins: { [CLAUDE_PLUGIN_ID]: on },
    });

  const run = (args: string[]) => {
    calls.push(args.join(' '));
    const [, verb, sub] = args;
    if (verb === 'install' || verb === 'update') {
      write('plugins/installed_plugins.json', {
        plugins: { [CLAUDE_PLUGIN_ID]: [{ scope: 'user', version: stagedVersion() }] },
      });
      if (verb === 'install') {
        setEnabled(true);
      }
    } else if (verb === 'enable') {
      setEnabled(true);
    } else if (verb === 'uninstall') {
      write('plugins/installed_plugins.json', { plugins: {} });
    } else if (verb === 'marketplace' && sub === 'add') {
      write('plugins/known_marketplaces.json', { agentopia: {} });
    } else if (verb === 'marketplace' && sub === 'remove') {
      write('plugins/known_marketplaces.json', {});
    }
    return { ok: true, output: '' };
  };
  return { calls, run, setEnabled, write, read };
}

describe('ClaudeCodeInstaller', () => {
  let root: string;
  let config: string;
  let home: string;
  const before = process.env.AGENTOPIA_HOME;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agentopia-install-'));
    config = join(root, 'claude');
    home = join(root, 'agentopia');
    process.env.AGENTOPIA_HOME = home;
  });

  afterEach(() => {
    if (before === undefined) {
      delete process.env.AGENTOPIA_HOME;
    } else {
      process.env.AGENTOPIA_HOME = before;
    }
    rmSync(root, { recursive: true, force: true });
  });

  function installer() {
    const claude = fakeClaude(config, home);
    return { claude, installer: new ClaudeCodeInstaller(PLUGIN, claude.run, () => config) };
  }

  it('stages a marketplace and installs from it the first time', () => {
    const { claude, installer: inst } = installer();

    expect(inst.install(PLUGIN_DIR, NODE).every((s) => s.ok)).toBe(true);
    expect(claude.calls).toEqual([
      `plugin marketplace add ${join(home, 'plugins', 'claude')}`,
      `plugin install ${CLAUDE_PLUGIN_ID}`,
    ]);
    expect(existsSync(join(home, 'plugins/claude/.claude-plugin/marketplace.json'))).toBe(true);
    expect(existsSync(join(home, 'plugins/claude/agentopia/hooks/emit.mjs'))).toBe(true);
    expect(inst.state()).toEqual({
      installed: true,
      enabled: true,
      version: inst.desiredVersion(PLUGIN_DIR, NODE),
      elsewhere: [],
    });
  });

  it('leaves an up-to-date install alone', () => {
    const { claude, installer: inst } = installer();
    inst.install(PLUGIN_DIR, NODE);
    claude.calls.length = 0;

    expect(inst.install(PLUGIN_DIR, NODE)).toEqual([expect.objectContaining({ ok: true })]);
    expect(claude.calls).toEqual([]);
  });

  it('updates when what it would stage changed', () => {
    const { claude, installer: inst } = installer();
    inst.install(PLUGIN_DIR, NODE);
    claude.calls.length = 0;

    inst.install(PLUGIN_DIR, '/elsewhere/node');

    expect(claude.calls).toContain(`plugin update ${CLAUDE_PLUGIN_ID}`);
    expect(inst.state().version).toBe(inst.desiredVersion(PLUGIN_DIR, '/elsewhere/node'));
  });

  it('switches a disabled install back on', () => {
    const { claude, installer: inst } = installer();
    inst.install(PLUGIN_DIR, NODE);
    claude.setEnabled(false);
    claude.calls.length = 0;

    expect(inst.state().enabled).toBe(false);
    inst.install(PLUGIN_DIR, NODE);

    expect(claude.calls).toEqual([`plugin enable ${CLAUDE_PLUGIN_ID}`]);
    expect(inst.state().enabled).toBe(true);
  });

  it('uninstalls, drops its marketplace and removes what it staged', () => {
    const { claude, installer: inst } = installer();
    inst.install(PLUGIN_DIR, NODE);
    claude.calls.length = 0;

    expect(inst.uninstall().every((s) => s.ok)).toBe(true);
    expect(claude.calls).toEqual([
      `plugin uninstall ${CLAUDE_PLUGIN_ID}`,
      'plugin marketplace remove agentopia',
    ]);
    expect(existsSync(join(home, 'plugins', 'claude'))).toBe(false);
    expect(inst.state().installed).toBe(false);
  });

  it('has nothing to uninstall when nothing was installed', () => {
    const { claude, installer: inst } = installer();

    expect(inst.uninstall()).toEqual([]);
    expect(claude.calls).toEqual([]);
  });

  it('stops at a failed step and reports what the agent said', () => {
    const inst = new ClaudeCodeInstaller(
      PLUGIN,
      () => ({ ok: false, output: 'boom' }),
      () => config
    );

    expect(inst.install(PLUGIN_DIR, NODE)).toEqual([
      expect.objectContaining({ ok: false, detail: 'boom' }),
    ]);
  });

  it.each([
    ['from another marketplace', 'agentopia@agentopiahq', 'user', true, ['agentopia@agentopiahq']],
    ['switched off', 'agentopia@agentopiahq', 'user', false, []],
    ['for one project only', 'agentopia@agentopiahq', 'project', true, []],
    ['under another name', 'agentopia-extra@agentopiahq', 'user', true, []],
  ])('reports the plugin installed %s', (_label, id, scope, on, elsewhere) => {
    const { claude, installer: inst } = installer();
    claude.write('plugins/installed_plugins.json', {
      plugins: { [id]: [{ scope, version: '0.4.0' }] },
    });
    claude.write('settings.json', { enabledPlugins: { [id]: on } });

    expect(inst.state()).toEqual({ installed: false, enabled: false, version: null, elsewhere });
  });

  it('finds hooks that already run an agentopia emitter from settings', () => {
    const { claude, installer: inst } = installer();
    const emit = {
      hooks: [{ type: 'command', command: 'node ~/git/agentopia/plugins/claude/hooks/emit.mjs' }],
    };
    claude.write('settings.json', {
      hooks: {
        Stop: [emit],
        PreToolUse: [emit],
        Notification: [{ hooks: [{ command: 'say hi' }] }],
      },
    });

    expect(inst.strayHooks()).toEqual(['Stop', 'PreToolUse']);
  });
});
