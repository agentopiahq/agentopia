import {
  Chunk,
  cutClip,
  exportName,
  frameGate,
  maskUnchanged,
  recordSize,
  trimChunks,
} from '../clip';

/** Chunks at `times` (ms), the ones in `keys` key frames. */
const chunks = (times: number[], keys: number[]): Chunk[] =>
  times.map((at) => ({ at, key: keys.includes(at), data: new Uint8Array(0) }));

const ats = (cs: readonly Chunk[]): number[] => cs.map((c) => c.at);

describe('trimChunks', () => {
  it.each([
    ['keeps everything inside the window', [0, 100, 200], [0], 1000, 200, [0, 100, 200]],
    [
      'drops what is before the last key frame at the window start',
      [0, 500, 1000, 1500, 2000],
      [0, 1000, 2000],
      1000,
      2000,
      [1000, 1500, 2000],
    ],
    [
      'reaches back to the key frame before the window',
      [0, 500, 1000, 1500, 2000, 2500],
      [0, 1000, 2000],
      1000,
      2500,
      [1000, 1500, 2000, 2500],
    ],
    ['keeps everything with no key frame that old', [0, 500, 1000], [500], 100, 1000, [500, 1000]],
    ['keeps everything with no key frame at all', [0, 500], [], 100, 500, [0, 500]],
  ])('%s', (_, times, keys, windowMs, now, expected) => {
    expect(ats(trimChunks(chunks(times, keys), now, windowMs))).toEqual(expected);
  });
});

describe('cutClip', () => {
  it('starts decoding at the key frame before the window and the clip at the window', () => {
    const cut = cutClip(chunks([0, 500, 1000, 1500, 2000, 2500], [0, 1000, 2000]), 1000);
    expect(cut && { chunks: ats(cut.chunks), from: cut.from, to: cut.to }).toEqual({
      chunks: [1000, 1500, 2000, 2500],
      from: 1500,
      to: 2500,
    });
  });

  it('starts at the first key frame when the buffer is shorter than the window', () => {
    const cut = cutClip(chunks([0, 100, 200, 300], [100]), 10_000);
    expect(cut && { chunks: ats(cut.chunks), from: cut.from }).toEqual({
      chunks: [100, 200, 300],
      from: 100,
    });
  });

  it('has nothing to cut without a key frame', () => {
    expect(cutClip(chunks([0, 100], []), 1000)).toBeNull();
  });
});

describe('frameGate', () => {
  it.each([
    [
      'takes every other frame of 30 fps at 15',
      15,
      [0, 33, 67, 100, 133, 167, 200],
      [0, 67, 133, 200],
    ],
    [
      'takes the first frame at or after each 20 fps tick',
      20,
      [0, 33, 67, 100, 133, 167, 200],
      [0, 67, 100, 167, 200],
    ],
    ['skips ticks a slow paint missed', 20, [0, 300, 333, 367], [0, 300, 367]],
    ['takes nothing before the start', 20, [-50, -10, 0, 60], [0, 60]],
  ])('%s', (_, fps, times, expected) => {
    const due = frameGate(0, fps);
    expect(times.filter((at) => due(at))).toEqual(expected);
  });
});

describe('maskUnchanged', () => {
  const palette = [
    [0, 0, 0],
    [4, 4, 4],
    [200, 0, 0],
    [0, 200, 0],
  ];

  it('marks pixels whose colour is the same or near enough, and keeps the shown ones', () => {
    const shown = new Uint8Array([0, 0, 2, 3]);
    const out = maskUnchanged(new Uint8Array([0, 1, 3, 3]), shown, palette, 9, 5);
    expect([...out]).toEqual([9, 9, 3, 9]);
    expect([...shown]).toEqual([0, 0, 3, 3]);
  });

  it('compares with what is shown, so slow drift still lands', () => {
    const shown = new Uint8Array([0]);
    const ramp = [
      [0, 0, 0],
      [4, 4, 4],
      [8, 8, 8],
    ];
    expect([...maskUnchanged(new Uint8Array([1]), shown, ramp, 9, 5)]).toEqual([9]);
    expect([...maskUnchanged(new Uint8Array([2]), shown, ramp, 9, 5)]).toEqual([2]);
    expect([...shown]).toEqual([2]);
  });
});

describe('recordSize', () => {
  const p1080 = { short: 1080, long: 1920 };
  const p720 = { short: 720, long: 1280 };
  it.each([
    ['a retina desktop to 1080p', 2880, 1800, p1080, { width: 1728, height: 1080 }],
    ['a wide one by its longer side', 3840, 1200, p1080, { width: 1920, height: 600 }],
    ['a phone held upright by its longer side', 1170, 2532, p1080, { width: 886, height: 1920 }],
    ['nothing up', 801, 501, p1080, { width: 800, height: 500 }],
    ['a 1080p recording to a 720p GIF', 1728, 1080, p720, { width: 1152, height: 720 }],
  ])('fits %s, even', (_, width, height, limit, expected) => {
    expect(recordSize(width, height, limit)).toEqual(expected);
  });
});

describe('exportName', () => {
  it.each([
    [new Date(2026, 10, 15, 13, 57, 4), 'gif', 'agentopia-2026-11-15-135704.gif'],
    [new Date(2027, 0, 2, 3, 4, 5), 'mp4', 'agentopia-2027-01-02-030405.mp4'],
  ])('names an export made at %p by the local time', (at, extension, expected) => {
    expect(exportName(at, extension)).toBe(expected);
  });
});
