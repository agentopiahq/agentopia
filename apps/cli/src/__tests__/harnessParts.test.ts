/**
 * Every harness the CLI can launch has all of its pieces, in every layer. A
 * new harness that misses one fails here by name, instead of quietly falling
 * back to Claude Code's. The viewer checks its skins against core's adapters
 * the same way (`apps/viewer/src/__tests__/skins.test.ts`).
 */
import { CHOREOGRAPHIES, EVENT_ADAPTERS, USAGE_ADAPTERS } from '@agentopia/core';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { HARNESSES, harnessIds } from '../harness';

const PLUGINS = resolve(__dirname, '../../../../plugins');

describe.each(harnessIds())('harness %s', (id) => {
  const harness = HARNESSES[id]!;

  it('normalizes with its event adapter in core', () => {
    expect(EVENT_ADAPTERS[id]).toBeDefined();
    expect(harness.normalize).toBe(EVENT_ADAPTERS[id]);
  });

  it('has a choreography registry in core', () => {
    expect(CHOREOGRAPHIES[id]).toBeDefined();
  });

  it('pairs its usage reader with a usage adapter in core, or has neither', () => {
    const reader = harness.usage?.();
    expect(reader?.harness).toBe(USAGE_ADAPTERS[id]?.harness);
  });

  it.each([
    ['manifest', harness.plugin.manifest],
    ['hook wiring', harness.plugin.hooks],
    ['emitter', 'hooks/emit.mjs'],
  ])('ships its plugin %s', (_label, file) => {
    expect(existsSync(join(PLUGINS, id, file))).toBe(true);
  });

  it('stamps its records with its own id', () => {
    const emitter = readFileSync(join(PLUGINS, id, 'hooks/emit.mjs'), 'utf8');
    expect(emitter).toMatch(new RegExp(`^const HARNESS = '${id}';$`, 'm'));
  });
});
