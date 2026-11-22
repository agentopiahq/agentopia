import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { agentopiaHome } from '../paths';
import { isToken } from './envelope';

/** Where the forwarder posts and the office pulls, unless told otherwise. */
export const DEFAULT_RELAY_URL = 'https://www.agentopia.town/api/relay';

/**
 * This office's pairing, in `~/.agentopia/relay.json`: the token (keep it
 * secret: it is the key) and the relay it was paired through. Written by
 * `agentopia relay pair`, removed by `agentopia relay off`.
 */
export interface RelayConfig {
  token: string;
  url: string;
}

/** How far this office has read its channel, kept apart so a re-pair starts over. */
interface RelayCursor {
  channel: string;
  after: number;
}

export function relayConfigPath(): string {
  return join(agentopiaHome(), 'relay.json');
}

function cursorPath(): string {
  return join(agentopiaHome(), 'relay', 'cursor.json');
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function writePrivate(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export function readRelayConfig(): RelayConfig | null {
  const raw = readJson(relayConfigPath());
  if (!raw || typeof raw.token !== 'string' || !isToken(raw.token)) {
    return null;
  }
  const url =
    typeof raw.url === 'string' && /^https?:\/\//.test(raw.url) ? raw.url : DEFAULT_RELAY_URL;
  return { token: raw.token, url: url.replace(/\/+$/, '') };
}

export function writeRelayConfig(config: RelayConfig): void {
  writePrivate(relayConfigPath(), config);
}

export function clearRelayConfig(): void {
  rmSync(relayConfigPath(), { force: true });
  rmSync(cursorPath(), { force: true });
}

export function readCursor(channel: string): number {
  const raw = readJson(cursorPath());
  return raw && raw.channel === channel && typeof raw.after === 'number' && raw.after >= 0
    ? raw.after
    : 0;
}

export function writeCursor(channel: string, after: number): void {
  const cursor: RelayCursor = { channel, after };
  writePrivate(cursorPath(), cursor);
}
