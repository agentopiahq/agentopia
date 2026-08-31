import { pageTitle } from '../title';

describe('pageTitle', () => {
  it.each([
    [null, 'Agentopia'],
    [undefined, 'Agentopia'],
    ['', 'Agentopia'],
    ['   ', 'Agentopia'],
    ['Fix the flaky tests', 'Fix the flaky tests | Agentopia'],
  ])('formats %p as %p', (name, expected) => {
    expect(pageTitle(name)).toBe(expected);
  });

  it('caps a long session name with an ellipsis', () => {
    const name = 'a'.repeat(80);
    const title = pageTitle(name);
    expect(title).toBe(`${'a'.repeat(47)}… | Agentopia`);
  });

  it('keeps a name at the cap untouched', () => {
    const name = 'b'.repeat(48);
    expect(pageTitle(name)).toBe(`${name} | Agentopia`);
  });
});
