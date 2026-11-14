import { Box3, Facing, Iso, compareBoxes, drawOrder, hull, viewToward } from '../kit/iso';
import { MAT } from '../kit/palette';

/** A pen with no canvas: projection, facing and tone need none. */
const pen = (): Iso => new Iso({} as CanvasRenderingContext2D, { unit: 32 });

describe('the isometric pen', () => {
  it.each<[Facing, [number, number, number]]>([
    ['+y', [0, 1, 0]],
    ['+x', [1, 0, 0]],
    ['-y', [0, -1, 0]],
    ['-x', [-1, 0, 0]],
  ])('turns an object so its front faces %s', (facing, expected) => {
    const k = pen().place([0, 0, 0], facing);
    expect(k.dir([0, 1, 0]).map((v) => Math.round(v) + 0)).toEqual(expected);
  });

  it.each<[string, [number, number, number], boolean]>([
    ['the top', [0, 0, 1], true],
    ['the +x side', [1, 0, 0], true],
    ['the +y side', [0, 1, 0], true],
    ['the -x side', [-1, 0, 0], false],
    ['the -y side', [0, -1, 0], false],
    ['the underside', [0, 0, -1], false],
  ])('sees %s: %s', (_name, normal, seen) => {
    expect(pen().facing(normal)).toBe(seen);
  });

  it('cuts the three visible faces of a box into three different bands', () => {
    const k = pen();
    const tones = [
      k.tone([0, 0, 1], MAT.machine),
      k.tone([1, 0, 0], MAT.machine),
      k.tone([0, 1, 0], MAT.machine),
    ];
    expect(tones).toEqual([MAT.machine.l, MAT.machine.m, MAT.machine.d]);
  });

  it('projects one tile along x down and to the right, along y down and to the left', () => {
    const k = pen();
    const [x1, y1] = k.P([1, 0, 0]);
    const [x2, y2] = k.P([0, 1, 0]);
    const [x3, y3] = k.P([0, 0, 1]);
    expect(x1).toBeGreaterThan(0);
    expect(y1).toBeGreaterThan(0);
    expect(x2).toBeLessThan(0);
    expect(y2).toBeGreaterThan(0);
    expect(x3).toBeCloseTo(0);
    expect(y3).toBeCloseTo(-32);
  });

  it('wraps points in their convex hull', () => {
    const h = hull([
      [0, 0],
      [2, 0],
      [1, 1],
      [2, 2],
      [0, 2],
    ]);
    expect(h).toHaveLength(4);
    expect(h).not.toContainEqual([1, 1]);
  });
});

describe('depth order', () => {
  const box = (x: number, y: number, w = 0.4): Box3 => [
    [x - w, y - w, 0],
    [x + w, y + w, 1],
  ];
  const desk: Box3 = [
    [9.8, 6.85, 0],
    [12.2, 7.85, 2.1],
  ];

  it.each<[string, Box3, number]>([
    ['the lead in its seat is in front of its desk', box(11, 8.6, 0.22), 1],
    ['a helper on the far side of the desk is behind it', box(9.1, 9.0, 0.22), -1],
    ['a helper on the near side of the desk is in front of it', box(12.9, 9.0, 0.22), 1],
    ['a walker behind the desk is hidden by it', box(11, 5.5, 0.22), -1],
  ])('%s', (_name, actor, sign) => {
    expect(Math.sign(compareBoxes(actor, desk))).toBe(sign);
  });

  it('is antisymmetric', () => {
    const a = box(3, 4);
    const b = box(5, 4);
    expect(Math.sign(compareBoxes(a, b))).toBe(-Math.sign(compareBoxes(b, a)));
  });
});

describe('depth order from a turned view', () => {
  it('flips which of two boxes is in front when the viewer walks round', () => {
    const near: Box3 = [
      [5, 0, 0],
      [6, 1, 1],
    ];
    const far: Box3 = [
      [0, 0, 0],
      [1, 1, 1],
    ];
    expect(Math.sign(compareBoxes(near, far, viewToward(0)))).toBe(1);
    expect(Math.sign(compareBoxes(near, far, viewToward(Math.PI)))).toBe(-1);
  });

  it('keeps every hard constraint where a plain sort would break one', () => {
    // A desk's pedestal under its top, and a monitor foot on the top beside
    // the pedestal: the foot is x-separated from the pedestal but sits on the
    // top, so only the screen-overlap test keeps the three in order.
    const pedestal: Box3 = [
      [0.42, -0.42, 0],
      [1.12, 0.42, 0.72],
    ];
    const top: Box3 = [
      [-1.2, -0.5, 0.72],
      [1.2, 0.5, 0.8],
    ];
    const foot: Box3 = [
      [-0.3, -0.42, 0.8],
      [0.3, -0.12, 0.83],
    ];
    const k = pen();
    const order = drawOrder([foot, top, pedestal], k.view(), (w) => k.screenOfWorld(w));
    expect(order.indexOf(2)).toBeLessThan(order.indexOf(1));
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(0));
  });

  // A seat rule against the boxes closed a two-way loop, and the sort broke
  // it by depth: a chair's back drawn under the lead sat in front of it.
  it.each([
    ['the boxes agree with', [1, 0] as const],
    ['the boxes say the opposite of', [0, 1] as const],
  ])('keeps an explicit order that %s', (_how, [first, second]) => {
    const back: Box3 = [
      [0, 0, 0.4],
      [0.6, 0.1, 0.9],
    ];
    const sitter: Box3 = [
      [0, 0.2, 0],
      [0.6, 0.6, 1.4],
    ];
    const k = pen();
    const order = drawOrder([back, sitter], k.view(), (w) => k.screenOfWorld(w), {
      before: [[first, second]],
    });
    expect(order).toEqual([first, second]);
  });
});
