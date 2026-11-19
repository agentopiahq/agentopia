import { gunzipSync } from 'node:zlib';

/**
 * Reading an npm package tarball (`.tgz`) into memory, with no dependency and
 * no `tar` binary: a package is a few dozen small files, and the format is
 * 512-byte headers each followed by the file's bytes.
 *
 * Only regular files are kept. Links, devices and anything else are skipped,
 * and a path that is absolute or climbs out with `..` fails the whole read,
 * so a tarball can never write outside the folder it is unpacked into.
 */

const BLOCK = 512;

/** A NUL-terminated string field of a header. */
function field(header: Buffer, start: number, length: number): string {
  const raw = header.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
}

function octal(header: Buffer, start: number, length: number): number {
  const text = field(header, start, length).trim();
  const value = text === '' ? 0 : parseInt(text, 8);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('bad size in tarball');
  }
  return value;
}

/** The `path` of a pax extended header, if it has one. Records are `<len> key=value\n`. */
function paxPath(body: Buffer): string | undefined {
  let offset = 0;
  let path: string | undefined;
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset);
    if (space === -1) {
      break;
    }
    const length = Number(body.subarray(offset, space).toString('utf8'));
    if (!Number.isInteger(length) || length <= 0) {
      break;
    }
    const record = body.subarray(space + 1, offset + length - 1).toString('utf8');
    const eq = record.indexOf('=');
    if (eq !== -1 && record.slice(0, eq) === 'path') {
      path = record.slice(eq + 1);
    }
    offset += length;
  }
  return path;
}

/**
 * A tarball path made relative to the package: npm packs everything under
 * one top folder (`package/`), which is dropped. Throws on a path that could
 * land outside the folder it is unpacked into.
 */
export function packagePath(path: string): string {
  if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    throw new Error(`unsafe path in tarball: ${path}`);
  }
  const segments = path.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.includes('..')) {
    throw new Error(`unsafe path in tarball: ${path}`);
  }
  return segments.slice(1).join('/');
}

/** Every regular file in a gzipped tarball, by its path inside the package. */
export function readTarball(tgz: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(tgz);
  const files = new Map<string, Buffer>();
  let offset = 0;
  let nextPath: string | undefined;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] ?? 0);
    const bodyStart = offset + BLOCK;
    const body = tar.subarray(bodyStart, bodyStart + size);
    if (body.length !== size) {
      throw new Error('tarball ends early');
    }
    offset = bodyStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'x') {
      nextPath = paxPath(body);
      continue;
    }
    if (type === 'L') {
      nextPath = field(body, 0, body.length);
      continue;
    }
    if (type === 'g') {
      continue;
    }
    const prefix = field(header, 345, 155);
    const name = field(header, 0, 100);
    const path = nextPath ?? (prefix ? `${prefix}/${name}` : name);
    nextPath = undefined;
    if (type !== '0' && type !== '\0') {
      continue;
    }
    const relative = packagePath(path);
    if (relative) {
      files.set(relative, Buffer.from(body));
    }
  }
  return files;
}
