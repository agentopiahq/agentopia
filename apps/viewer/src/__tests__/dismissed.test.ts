import { DISMISSED_KEPT, loadDismissed, rememberDismissed } from '../dismissed';
import { StateStorage } from '../interact';

function memory(initial: Record<string, string> = {}): StateStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('dismissed desks', () => {
  it('remembers a dismissal across visits, never moving one back in time', () => {
    const storage = memory();
    rememberDismissed(storage, 'a', 2000);
    rememberDismissed(storage, 'b', 1000);
    rememberDismissed(storage, 'a', 1500);

    expect(new Map(loadDismissed(storage))).toEqual(
      new Map([
        ['a', 2000],
        ['b', 1000],
      ])
    );
  });

  it('forgets the oldest once it holds as many as it keeps', () => {
    const storage = memory();
    for (let i = 0; i <= DISMISSED_KEPT; i++) {
      rememberDismissed(storage, `s${i}`, i);
    }

    const kept = loadDismissed(storage).map(([bus]) => bus);
    expect(kept).toHaveLength(DISMISSED_KEPT);
    expect(kept).not.toContain('s0');
  });

  it.each([
    ['nothing stored', memory()],
    ['no storage', null],
    ['a damaged copy', memory({ 'agentopia.office.dismissed.v1': '{oops' })],
    ['the wrong shape', memory({ 'agentopia.office.dismissed.v1': '[1,2]' })],
  ])('starts clear from %s', (_, storage) => {
    expect(loadDismissed(storage)).toEqual([]);
  });
});
