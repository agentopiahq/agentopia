import { open, stat } from 'node:fs/promises';

/**
 * Follows JSONL files line by line, remembering how far each has been read,
 * so reading one again only reads what was appended since. A line split
 * across two reads (even mid-character) is held until it ends. A file that
 * shrank was rewritten, and is read again from the start.
 *
 * Agents' usage logs are append-only JSONL, so every usage reader shares
 * this; what a line means is the harness adapter's business.
 */

/** Read this much of a file at a time. */
const CHUNK = 4 * 1024 * 1024;
const EMPTY = Buffer.alloc(0);

interface Followed {
  /** Bytes read so far. */
  offset: number;
  /** A line not yet ended, as bytes: it may end mid-character. */
  rest: Buffer;
}

export class JsonlFollower {
  private files = new Map<string, Followed>();

  /** Whether a file has been followed before. */
  has(path: string): boolean {
    return this.files.has(path);
  }

  /** Hand every complete line appended to `path` since the last call to `onLine`. Never throws. */
  async follow(path: string, onLine: (line: string) => void): Promise<void> {
    let followed = this.files.get(path);
    if (!followed) {
      followed = { offset: 0, rest: EMPTY };
      this.files.set(path, followed);
    }
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      return;
    }
    if (size < followed.offset) {
      followed.offset = 0;
      followed.rest = EMPTY;
    }
    if (size === followed.offset) {
      return;
    }
    let handle;
    try {
      handle = await open(path, 'r');
    } catch {
      return;
    }
    try {
      const buf = Buffer.alloc(Math.min(CHUNK, size - followed.offset));
      while (followed.offset < size) {
        const { bytesRead } = await handle.read(buf, 0, buf.length, followed.offset);
        if (bytesRead === 0) {
          break;
        }
        followed.offset += bytesRead;
        const bytes = Buffer.concat([followed.rest, buf.subarray(0, bytesRead)]);
        const end = bytes.lastIndexOf(0x0a);
        // Copied, not sliced: the read buffer is reused for the next chunk.
        followed.rest = Buffer.from(bytes.subarray(end + 1));
        if (end >= 0) {
          for (const line of bytes.toString('utf8', 0, end).split('\n')) {
            onLine(line);
          }
        }
      }
    } catch {
      // A file that vanished mid-read: whatever was read stays read.
    } finally {
      await handle.close();
    }
  }
}
