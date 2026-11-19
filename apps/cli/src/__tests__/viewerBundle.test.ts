import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RunningServer, startOfficeServer } from '../server';
import { ViewerBundle } from '../viewerBundle';

function fetchText(url: string): Promise<{ type?: string; body: string }> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => resolve({ type: res.headers['content-type'], body }));
    }).on('error', reject);
  });
}

describe('ViewerBundle', () => {
  let root: string;
  let running: RunningServer | null = null;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agentopia-viewer-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<!doctype html>v1');
    writeFileSync(join(root, 'assets', 'main.js'), 'console.log(1)');
  });

  afterEach(() => {
    running?.close();
    running = null;
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['the shell at /', '/', '/index.html'],
    ['a nested asset', '/assets/main.js', '/assets/main.js'],
    ['the shell for an unknown path', '/floor/desk', '/index.html'],
  ])('serves %s', (_label, urlPath, expected) => {
    expect(ViewerBundle.load(root)?.get(urlPath)?.path).toBe(expected);
  });

  it('keeps serving the viewer it started with when the files on disk change', async () => {
    running = await startOfficeServer({ viewerDist: root, port: 0, usage: null, context: null });
    // An upgrade swaps the files under the running server.
    writeFileSync(join(root, 'index.html'), '<!doctype html>v2');
    rmSync(join(root, 'assets'), { recursive: true });

    expect((await fetchText(`${running.url}/`)).body).toBe('<!doctype html>v1');
    const script = await fetchText(`${running.url}/assets/main.js`);
    expect(script.body).toBe('console.log(1)');
    expect(script.type).toContain('javascript');
  });
});
