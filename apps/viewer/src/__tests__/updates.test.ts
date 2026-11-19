import { BuildWatch, ServerHello, changelogUrl } from '../updates';

/** A server that answers each `/api/server` with the next hello in line. */
function answers(...hellos: Array<ServerHello | null>): () => Promise<ServerHello | null> {
  return () => Promise.resolve(hellos.shift() ?? null);
}

const v = (version: string, build: string | null): ServerHello => ({ version, build });

describe('BuildWatch', () => {
  it.each<[string, Array<ServerHello | null>, string[]]>([
    ['the same build on every reconnect', [v('0.3.0', 'a'), v('0.3.0', 'a'), v('0.3.0', 'a')], []],
    ['a new build after a reconnect', [v('0.3.0', 'a'), v('0.4.0', 'b')], ['0.4.0']],
    ['that build again', [v('0.3.0', 'a'), v('0.4.0', 'b'), v('0.4.0', 'b')], ['0.4.0']],
    [
      'one build, then another',
      [v('0.3.0', 'a'), v('0.4.0', 'b'), v('0.5.0', 'c')],
      ['0.4.0', '0.5.0'],
    ],
    ['a server that names no build', [v('0.3.0', null), v('0.4.0', null)], []],
    ['a server that cannot be reached at first', [null, v('0.3.0', 'a'), v('0.3.0', 'a')], []],
  ])('offers an update for %s', async (_, hellos, offered) => {
    const seen: string[] = [];
    const watch = new BuildWatch(answers(...hellos), (hello) => seen.push(hello.version));
    for (let i = 0; i < hellos.length; i++) {
      await watch.opened();
    }
    expect(seen).toEqual(offered);
  });
});

describe('changelogUrl', () => {
  it('links to the release on GitHub', () => {
    expect(changelogUrl('0.4.0')).toBe(
      'https://github.com/agentopiahq/agentopia/releases/tag/agentopiahq%400.4.0'
    );
  });
});
