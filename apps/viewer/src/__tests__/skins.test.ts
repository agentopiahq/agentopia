import { EVENT_ADAPTERS } from '@agentopia/core';

import { SKINS, claudeSkin, skinFor } from '../skins';

describe('skinFor', () => {
  it.each<[string, string | undefined]>([
    ['a Claude Code lead', 'claude'],
    ['a resident, who belongs to no harness', undefined],
    ['a harness with no skin of its own', 'nobody'],
  ])('draws %s as Claude', (_label, harness) => {
    expect(skinFor(harness)).toBe(claudeSkin);
  });

  it('gives every listed harness its own skin', () => {
    for (const [harness, skin] of Object.entries(SKINS)) {
      expect(skinFor(harness)).toBe(skin);
    }
  });
});

describe.each(Object.keys(EVENT_ADAPTERS))('harness %s', (harness) => {
  it('has a skin of its own', () => {
    expect(SKINS[harness]).toBeDefined();
  });
});
