import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  Fetch,
  FetchResponse,
  fetchLatest,
  matchesIntegrity,
  onRegistry,
} from '../update/registry';
import { compareVersions, isNewer, isRelease } from '../update/semver';
import { VersionStore } from '../update/store';
import { packagePath, readTarball } from '../update/tar';
import {
  CHECK_RETRY_MS,
  CHECK_TTL_MS,
  Updater,
  autoUpdateOff,
  registryUrl,
} from '../update/updater';

/** A file in a test tarball: `type` is the tar type flag ('0' a file, '2' a symlink, 'x' a pax header). */
interface Entry {
  path: string;
  body?: string | Buffer;
  type?: string;
}

function header(path: string, size: number, type: string): Buffer {
  const h = Buffer.alloc(512);
  h.write(path.slice(0, 100), 0, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  h.write('00000000000\0', 136);
  h.write('        ', 148);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  let sum = 0;
  for (const byte of h) {
    sum += byte;
  }
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
}

/** A gzipped tarball of `entries`, laid out as `npm pack` lays a package out. */
function tarball(entries: Entry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? '');
    blocks.push(header(entry.path, body.length, entry.type ?? '0'), body);
    const pad = (512 - (body.length % 512)) % 512;
    blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

/** A pax record: `<len> key=value\n`, its length counting itself. */
function paxRecord(key: string, value: string): string {
  const rest = ` ${key}=${value}\n`;
  let length = rest.length + 1;
  while (`${length}${rest}`.length !== length) {
    length++;
  }
  return `${length}${rest}`;
}

const REGISTRY = 'https://registry.example.test';

function integrity(bytes: Buffer): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

/** A release's package as npm packs it: the CLI bundle, its viewer and plugins. */
function release(version: string, bundle = `console.log('${version}')`): Buffer {
  return tarball([
    { path: 'package/package.json', body: JSON.stringify({ name: 'agentopiahq', version }) },
    { path: 'package/dist/agentopia.mjs', body: bundle },
    { path: 'package/viewer/index.html', body: `<!doctype html>${version}` },
    { path: 'package/plugins/claude/hooks/emit.mjs', body: '// emit' },
  ]);
}

function response(body: unknown, status = 200): FetchResponse {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(JSON.parse(bytes.toString('utf8')) as unknown),
    arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
  };
}

/** A registry serving `latest` (and its tarball), counting the requests. */
function fakeRegistry(latest: string, tgz = release(latest), overrides: object = {}) {
  const calls: string[] = [];
  const fetch: Fetch = (url) => {
    calls.push(url);
    if (url === `${REGISTRY}/agentopiahq/latest`) {
      return Promise.resolve(
        response({
          version: latest,
          dist: {
            tarball: `${REGISTRY}/agentopiahq/-/agentopiahq-${latest}.tgz`,
            integrity: integrity(tgz),
          },
          ...overrides,
        })
      );
    }
    if (url === `${REGISTRY}/agentopiahq/-/agentopiahq-${latest}.tgz`) {
      return Promise.resolve(response(tgz));
    }
    return Promise.resolve(response({}, 404));
  };
  return { fetch, calls };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentopia-update-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function updater(fetch: Fetch, version = '0.3.0'): Updater {
  return new Updater({
    store: new VersionStore(join(root, 'versions')),
    fetch,
    registry: REGISTRY,
    cachePath: join(root, 'cache', 'update.json'),
    version,
  });
}

describe('semver', () => {
  it.each([
    ['0.3.0', '0.2.9', 1],
    ['0.10.0', '0.9.0', 1],
    ['1.0.0', '0.99.99', 1],
    ['0.3.0', '0.3.0', 0],
    ['0.2.0', '0.3.0', -1],
    ['0.4.0-next.1', '0.3.0', -1],
  ])('compares %s with %s', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });

  it.each([
    ['0.4.0', '0.3.0', true],
    ['0.3.0', '0.3.0', false],
    ['0.4.0-next.1', '0.3.0', false],
    ['garbage', '0.3.0', false],
  ])('takes %s as newer than %s: %s', (a, b, newer) => {
    expect(isNewer(a, b)).toBe(newer);
  });

  it('knows a release from anything else', () => {
    expect(['1.2.3', '1.2', 'v1.2.3', '1.2.3-rc.1'].map(isRelease)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('readTarball', () => {
  it("reads a package's files, without npm's top folder", () => {
    const files = readTarball(release('0.4.0'));
    expect([...files.keys()].sort()).toEqual([
      'dist/agentopia.mjs',
      'package.json',
      'plugins/claude/hooks/emit.mjs',
      'viewer/index.html',
    ]);
    expect(files.get('dist/agentopia.mjs')?.toString()).toBe("console.log('0.4.0')");
  });

  it('takes a long path from a pax header', () => {
    const long = `package/viewer/assets/${'a'.repeat(120)}.js`;
    const files = readTarball(
      tarball([
        { path: 'PaxHeader', type: 'x', body: paxRecord('path', long) },
        { path: 'package/short-name-that-is-wrong.js', body: 'x' },
      ])
    );
    expect([...files.keys()]).toEqual([`viewer/assets/${'a'.repeat(120)}.js`]);
  });

  it('skips links and folders', () => {
    const files = readTarball(
      tarball([
        { path: 'package/dist/', type: '5' },
        { path: 'package/evil', type: '2' },
        { path: 'package/dist/agentopia.mjs', body: 'ok' },
      ])
    );
    expect([...files.keys()]).toEqual(['dist/agentopia.mjs']);
  });

  it.each(['package/../../etc/passwd', '/etc/passwd', 'package\\..\\x', 'C:/x'])(
    'refuses %s',
    (path) => {
      expect(() => packagePath(path)).toThrow(/unsafe path/);
    }
  );

  it('refuses a cut-short tarball', () => {
    const tar = gunzipSync(
      tarball([{ path: 'package/dist/agentopia.mjs', body: 'x'.repeat(2000) }])
    );
    expect(() => readTarball(gzipSync(tar.subarray(0, 1024)))).toThrow(/ends early/);
  });
});

describe('VersionStore', () => {
  it('installs a version whole and points current at it', () => {
    const store = new VersionStore(join(root, 'versions'));
    expect(store.current()).toBeNull();
    store.install('0.4.0', readTarball(release('0.4.0')));
    expect(store.has('0.4.0')).toBe(true);
    expect(store.current()).toBeNull();
    store.setCurrent('0.4.0');
    expect(store.current()).toBe('0.4.0');
    expect(store.bundle('0.4.0')).toBe(join(root, 'versions', '0.4.0', 'dist', 'agentopia.mjs'));
  });

  it('refuses a package with no CLI bundle', () => {
    const store = new VersionStore(join(root, 'versions'));
    expect(() => store.install('0.4.0', new Map([['package.json', Buffer.from('{}')]]))).toThrow(
      /no dist/
    );
    expect(store.has('0.4.0')).toBe(false);
  });

  it('never runs a version marked bad', () => {
    const store = new VersionStore(join(root, 'versions'));
    store.install('0.4.0', readTarball(release('0.4.0')));
    store.setCurrent('0.4.0');
    store.markBad('0.4.0');
    expect(store.current()).toBeNull();
    expect(store.isBad('0.4.0')).toBe(true);
  });

  it('keeps the current version and the one before it when pruning', () => {
    const store = new VersionStore(join(root, 'versions'));
    for (const v of ['0.3.0', '0.4.0', '0.5.0', '0.6.0']) {
      store.install(v, readTarball(release(v)));
    }
    store.setCurrent('0.6.0');
    store.prune([]);
    expect(store.versions().sort()).toEqual(['0.5.0', '0.6.0']);
  });
});

describe('registry', () => {
  it.each([
    [`${REGISTRY}/agentopiahq/-/a.tgz`, true],
    ['http://registry.example.test/agentopiahq/-/a.tgz', false],
    ['https://evil.example.test/agentopiahq/-/a.tgz', false],
    ['not a url', false],
  ])('takes %s as on the registry: %s', (url, ok) => {
    expect(onRegistry(url, REGISTRY)).toBe(ok);
  });

  it('refuses a latest whose tarball lives elsewhere', async () => {
    const { fetch } = fakeRegistry('0.4.0', release('0.4.0'), {
      dist: { tarball: 'https://evil.example.test/x.tgz', integrity: 'sha512-x' },
    });
    await expect(fetchLatest(fetch, REGISTRY)).rejects.toThrow(/outside the registry/);
  });

  it('checks bytes against their integrity hash', () => {
    const bytes = Buffer.from('agentopia');
    expect(matchesIntegrity(bytes, integrity(bytes))).toBe(true);
    expect(matchesIntegrity(Buffer.from('agentopiA'), integrity(bytes))).toBe(false);
    expect(matchesIntegrity(bytes, 'sha1-abc')).toBe(false);
  });
});

describe('Updater', () => {
  it('finds, downloads and installs a newer release', async () => {
    const { fetch } = fakeRegistry('0.4.0');
    const u = updater(fetch);
    const result = await u.check(1000);
    expect(result).toMatchObject({ kind: 'available', release: { version: '0.4.0' } });
    if (result.kind !== 'available') {
      throw new Error('no release');
    }
    await u.prepare(result.release);
    expect(u.store.current()).toBe('0.4.0');
    expect(readFileSync(u.store.bundle('0.4.0') ?? '', 'utf8')).toBe("console.log('0.4.0')");
    expect(u.newestHeld()).toBe('0.4.0');
    expect(await u.check(2000)).toEqual({ kind: 'latest', version: '0.4.0' });
  });

  it('says it is the latest when npm has nothing newer', async () => {
    const { fetch } = fakeRegistry('0.3.0');
    expect(await updater(fetch).check(1000)).toEqual({ kind: 'latest', version: '0.3.0' });
  });

  it('asks npm again only once its answer is stale, unless forced', async () => {
    const { fetch, calls } = fakeRegistry('0.4.0');
    const u = updater(fetch);
    await u.check(0);
    await u.check(CHECK_TTL_MS - 1);
    expect(calls).toHaveLength(1);
    await u.check(CHECK_TTL_MS - 1, true);
    await u.check(2 * CHECK_TTL_MS);
    expect(calls).toHaveLength(3);
  });

  it('retries a failed check after an hour', async () => {
    const calls: string[] = [];
    const down: Fetch = (url) => {
      calls.push(url);
      return Promise.reject(new Error('offline'));
    };
    const u = updater(down);
    expect(await u.check(0)).toEqual({ kind: 'failed', error: 'offline' });
    expect(await u.check(CHECK_RETRY_MS - 1)).toMatchObject({ kind: 'failed' });
    expect(calls).toHaveLength(1);
    await u.check(CHECK_RETRY_MS);
    expect(calls).toHaveLength(2);
  });

  it('installs nothing when the tarball does not match its hash', async () => {
    const good = release('0.4.0');
    const { fetch } = fakeRegistry('0.4.0', good, {
      dist: {
        tarball: `${REGISTRY}/agentopiahq/-/agentopiahq-0.4.0.tgz`,
        integrity: integrity(Buffer.from('something else')),
      },
    });
    const u = updater(fetch);
    const result = await u.check(0);
    if (result.kind !== 'available') {
      throw new Error('no release');
    }
    await expect(u.prepare(result.release)).rejects.toThrow(/integrity/);
    expect(u.store.has('0.4.0')).toBe(false);
    expect(u.store.current()).toBeNull();
  });

  it('passes over a release that failed to start before', async () => {
    const { fetch } = fakeRegistry('0.4.0');
    const u = updater(fetch);
    u.store.markBad('0.4.0');
    expect(await u.check(0)).toEqual({ kind: 'latest', version: '0.3.0' });
  });

  it('remembers its answer on disk', async () => {
    const { fetch } = fakeRegistry('0.4.0');
    await updater(fetch).check(0);
    const kept = JSON.parse(readFileSync(join(root, 'cache', 'update.json'), 'utf8')) as {
      latest: { version: string };
    };
    expect(kept.latest.version).toBe('0.4.0');
  });

  it('reads a cache it cannot parse as no cache', async () => {
    const { fetch, calls } = fakeRegistry('0.4.0');
    const u = updater(fetch);
    await u.check(0);
    writeFileSync(join(root, 'cache', 'update.json'), 'not json');
    await u.check(1);
    expect(calls).toHaveLength(2);
    expect(existsSync(join(root, 'cache', 'update.json'))).toBe(true);
  });
});

describe('settings', () => {
  it.each([
    [{}, null],
    [{ AGENTOPIA_AUTO_UPDATE: '0' }, 'AGENTOPIA_AUTO_UPDATE is off'],
    [{ AGENTOPIA_AUTO_UPDATE: 'off' }, 'AGENTOPIA_AUTO_UPDATE is off'],
    [{ AGENTOPIA_AUTO_UPDATE: '1' }, null],
    [{ CI: 'true' }, 'running in CI'],
    [{ CI: 'false' }, null],
  ])('auto-update with %j: %s', (env, off) => {
    expect(autoUpdateOff(env)).toBe(off);
  });

  it('asks npm unless told to ask a mirror', () => {
    expect(registryUrl({})).toBe('https://registry.npmjs.org');
    expect(registryUrl({ AGENTOPIA_REGISTRY: 'http://localhost:4873/' })).toBe(
      'http://localhost:4873'
    );
  });
});
