import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { agentopiaHome, busPath, findPluginsRoot, pluginDirFor, sessionDir } from '../paths';

describe('agentopia home', () => {
  const original = process.env.AGENTOPIA_HOME;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AGENTOPIA_HOME;
    } else {
      process.env.AGENTOPIA_HOME = original;
    }
  });

  it('is overridable so throwaway runs never touch the real one', () => {
    process.env.AGENTOPIA_HOME = '/tmp/somewhere';

    expect(agentopiaHome()).toBe('/tmp/somewhere');
    expect(sessionDir('abc')).toBe('/tmp/somewhere/sessions/abc');
    expect(busPath('abc')).toBe('/tmp/somewhere/sessions/abc/bus.jsonl');
  });
});

describe('findPluginsRoot', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agentopia-paths-'));
    delete process.env.AGENTOPIA_PLUGINS_DIR;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.AGENTOPIA_PLUGINS_DIR;
  });

  it('walks up from the running bundle to find plugins/', () => {
    mkdirSync(join(root, 'plugins', 'claude'), { recursive: true });
    const deep = join(root, 'apps', 'cli', 'dist');
    mkdirSync(deep, { recursive: true });

    expect(findPluginsRoot(deep)).toBe(join(root, 'plugins'));
    expect(pluginDirFor('claude', deep)).toBe(join(root, 'plugins', 'claude'));
  });

  it('returns null for a harness with no plugin directory', () => {
    mkdirSync(join(root, 'plugins', 'claude'), { recursive: true });

    expect(pluginDirFor('codex', root)).toBeNull();
  });

  it('returns null when there is no plugins tree above it', () => {
    expect(findPluginsRoot(root)).toBeNull();
  });

  it('honours an explicit override', () => {
    process.env.AGENTOPIA_PLUGINS_DIR = '/explicit/plugins';

    expect(findPluginsRoot(root)).toBe('/explicit/plugins');
  });
});
