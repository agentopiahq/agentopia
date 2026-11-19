import { createHash } from 'node:crypto';

import { isRelease } from './semver';

/**
 * What npm says about agentopia's latest release, and fetching it.
 *
 * Every request is a plain GET to the public npm registry with nothing about
 * the user in it: no query, no identifiers. The tarball is only accepted from
 * the registry itself and only when its bytes match the integrity hash the
 * registry published for it, the same check `npm install` makes.
 */

export const PACKAGE = 'agentopiahq';
export const REGISTRY = 'https://registry.npmjs.org';
/** A request that takes longer than this is given up on. */
const FETCH_TIMEOUT_MS = 30_000;

export interface Release {
  version: string;
  tarball: string;
  /** `sha512-<base64>`, as npm publishes it. */
  integrity: string;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<FetchResponse>;

const defaultFetch: Fetch = (url, init) => fetch(url, init);

async function get(fetchImpl: Fetch, url: string): Promise<FetchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timer.unref?.();
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`${url} answered ${res.status}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Is `url` a tarball on the registry `registry`, over https? */
export function onRegistry(url: string, registry: string = REGISTRY): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.origin === new URL(registry).origin;
  } catch {
    return false;
  }
}

/** The release npm's `latest` tag points at. Throws when it cannot be read. */
export async function fetchLatest(
  fetchImpl: Fetch = defaultFetch,
  registry: string = REGISTRY
): Promise<Release> {
  const res = await get(fetchImpl, `${registry}/${PACKAGE}/latest`);
  const body = (await res.json()) as {
    version?: unknown;
    dist?: { tarball?: unknown; integrity?: unknown };
  };
  const version = typeof body.version === 'string' ? body.version : '';
  const tarball = typeof body.dist?.tarball === 'string' ? body.dist.tarball : '';
  const integrity = typeof body.dist?.integrity === 'string' ? body.dist.integrity : '';
  if (!isRelease(version) || !tarball || !integrity.startsWith('sha512-')) {
    throw new Error('the registry gave no usable latest release');
  }
  if (!onRegistry(tarball, registry)) {
    throw new Error(`refusing a tarball from outside the registry: ${tarball}`);
  }
  return { version, tarball, integrity };
}

/** Does `bytes` hash to `integrity` (`sha512-<base64>`)? */
export function matchesIntegrity(bytes: Buffer, integrity: string): boolean {
  if (!integrity.startsWith('sha512-')) {
    return false;
  }
  const digest = createHash('sha512').update(bytes).digest('base64');
  return digest === integrity.slice('sha512-'.length);
}

/** A release's tarball, checked against its integrity hash. Throws when it does not match. */
export async function downloadRelease(
  release: Release,
  fetchImpl: Fetch = defaultFetch,
  registry: string = REGISTRY
): Promise<Buffer> {
  if (!onRegistry(release.tarball, registry)) {
    throw new Error(`refusing a tarball from outside the registry: ${release.tarball}`);
  }
  const res = await get(fetchImpl, release.tarball);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!matchesIntegrity(bytes, release.integrity)) {
    throw new Error(`agentopiahq ${release.version} did not match its integrity hash`);
  }
  return bytes;
}
