import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** More than this and the directory is not a viewer build; serve it from disk. */
const MAX_FILES = 2000;
const MAX_BYTES = 128 * 1024 * 1024;

/**
 * The viewer's files, read into memory when the server starts. An upgrade
 * (`npm i -g agentopiahq`) replaces the files on disk under a server that
 * keeps running, and a tab loaded from the new files would talk to the old
 * server's API; held in memory, a server always serves the viewer it shipped
 * with, until the new version replaces it.
 */
export class ViewerBundle {
  /**
   * Which build this is: a hash of its `index.html`, which names every hashed
   * asset, so it changes with any change to the viewer. A tab compares it
   * across reconnects to tell that the server under it was replaced.
   */
  readonly build: string;

  private constructor(private readonly files: Map<string, Buffer>) {
    const shell = files.get('/index.html') ?? Buffer.alloc(0);
    this.build = createHash('sha256').update(shell).digest('hex').slice(0, 12);
  }

  /** Read every file under `root`, or null when it is too big to be a viewer build. */
  static load(root: string): ViewerBundle | null {
    const files = new Map<string, Buffer>();
    let bytes = 0;
    const walk = (dir: string): boolean => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!walk(path)) {
            return false;
          }
        } else if (entry.isFile()) {
          const body = readFileSync(path);
          bytes += body.length;
          files.set(`/${relative(root, path).split(sep).join('/')}`, body);
          if (files.size > MAX_FILES || bytes > MAX_BYTES) {
            return false;
          }
        }
      }
      return true;
    };
    try {
      return walk(root) ? new ViewerBundle(files) : null;
    } catch {
      return null;
    }
  }

  /**
   * The file at a URL path, its path to name its type by. Unknown paths get
   * the shell (the SPA fallback); null only if there is no shell either.
   */
  get(urlPath: string): { path: string; body: Buffer } | null {
    const path = urlPath === '/' ? '/index.html' : urlPath;
    const body = this.files.get(path);
    if (body) {
      return { path, body };
    }
    const shell = this.files.get('/index.html');
    return shell ? { path: '/index.html', body: shell } : null;
  }
}
