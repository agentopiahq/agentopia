import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * The relay's wire format, shared with the forwarder in
 * `plugins/claude/hooks/relay.mjs` (which cannot import this, so it keeps
 * its own copy; `relay.test.ts` holds the two together).
 *
 * A pairing token derives two things with HKDF: the channel, the only name
 * the relay knows a pairing by, and the AES-256-GCM key every batch is
 * sealed with. A sealed batch is base64url(iv | ciphertext | tag).
 */

const TOKEN_PREFIX = 'ar1_';

export interface RelayKeys {
  channel: string;
  key: Buffer;
}

/** What one sealed batch holds: whole lines of one bus, in order. */
export interface RelayBatch {
  v: 1;
  bus: string;
  lines: string[];
}

export function newToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function isToken(value: string): boolean {
  return /^ar1_[A-Za-z0-9_-]{43}$/.test(value);
}

export function relayKeys(token: string): RelayKeys {
  const derive = (info: string, length: number): Buffer =>
    Buffer.from(hkdfSync('sha256', token, Buffer.alloc(0), info, length));
  return {
    channel: derive('agentopia relay channel', 16).toString('hex'),
    key: derive('agentopia relay key', 32),
  };
}

export function seal(key: Buffer, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url');
}

/** The value a batch was sealed from, or null if it is not one of ours. */
export function open(key: Buffer, sealed: string): unknown {
  try {
    const raw = Buffer.from(sealed, 'base64url');
    if (raw.length < 12 + 16) {
      return null;
    }
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    const text = Buffer.concat([
      decipher.update(raw.subarray(12, raw.length - 16)),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const BUS_NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** A batch, checked: a bus name that is safe as a directory, and string lines. */
export function asBatch(value: unknown): RelayBatch | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const v = value as Record<string, unknown>;
  if (v.v !== 1 || typeof v.bus !== 'string' || !BUS_NAME.test(v.bus) || v.bus.startsWith('.')) {
    return null;
  }
  if (!Array.isArray(v.lines) || !v.lines.every((line) => typeof line === 'string')) {
    return null;
  }
  return { v: 1, bus: v.bus, lines: v.lines as string[] };
}
