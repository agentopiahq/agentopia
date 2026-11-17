import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { OBJECTS } from '../objects';

/**
 * The Office/Objects stories, read as text: Storybook lists a file's stories
 * in the order they are exported, and nothing else makes an object's story.
 */
const source = readFileSync(join(process.cwd(), 'src/__stories__/objects.stories.ts'), 'utf8');
const stories = [...source.matchAll(/^export const (\w+) = story\('(\w+)'/gm)].map((m) => ({
  story: m[1],
  object: m[2],
}));

describe('the office object stories', () => {
  it('lists them A to Z', () => {
    const names = stories.map((s) => s.story);
    expect(names).toEqual(
      [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    );
  });

  // Variants of one object (a second chair colour, a narrower window) share its name, and its story.
  const named = [...new Set(Object.values(OBJECTS).map((obj) => obj.name))];
  it.each(named)('gives the %s a story of its own', (name) => {
    const shown = stories.map((s) => OBJECTS[s.object as keyof typeof OBJECTS]?.name);
    expect(shown).toContain(name);
  });
});
