import { snapshotName } from '../snapshot';

describe('snapshotName', () => {
  it.each([
    [new Date(2026, 10, 15, 13, 57, 4), 'agentopia-2026-11-15-135704.png'],
    [new Date(2027, 0, 2, 3, 4, 5), 'agentopia-2027-01-02-030405.png'],
    [new Date(2026, 11, 31, 23, 59, 59), 'agentopia-2026-12-31-235959.png'],
  ])('names a picture taken at %p by the local time', (at, expected) => {
    expect(snapshotName(at)).toBe(expected);
  });
});
