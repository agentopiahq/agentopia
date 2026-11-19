import { MAT, SHEET } from '../kit/palette';
import { STYLES, styleById } from '../styles/catalog';
import { css, nearest, parseColor, rgba } from '../styles/color';
import { tintOf } from '../styles/context';
import { Hint, Paints } from '../styles/types';

const paints: Paints = {
  hatch: () => 'hatch',
  texture: () => 'texture',
  studs: () => 'studs',
};
const hint: Hint = { angle: 30, seam: false, last: rgba('#c98a4b'), figure: false };
/** Every tone the office's materials come in, and the sheet's own colours. */
const TONES = [
  ...Object.values(MAT).flatMap((m) => [m.l, m.m, m.d]),
  ...Object.values(SHEET)
    .filter((v) => typeof v === 'string' && v.startsWith('#'))
    .map(String),
];

describe('parseColor', () => {
  it.each([
    ['#abc', [170, 187, 204, 1]],
    ['#a1b2c3', [161, 178, 195, 1]],
    ['#a1b2c380', [161, 178, 195, 128 / 255]],
    ['rgb(1, 2, 3)', [1, 2, 3, 1]],
    ['rgba(1,2,3,0.5)', [1, 2, 3, 0.5]],
  ])('reads %s', (input, want) => {
    expect(parseColor(input)).toEqual(want);
  });

  it.each(['red', 'transparent', '#12', 'hsl(0, 1%, 1%)'])('gives up on %s', (input) => {
    expect(parseColor(input)).toBeNull();
  });

  it('writes back what it read', () => {
    expect(css(rgba('#c98a4b'))).toBe('#c98a4b');
    expect(css([1, 2, 3, 0.5])).toBe('rgba(1,2,3,0.500)');
  });
});

describe('nearest', () => {
  it('picks the closest palette colour and keeps the alpha', () => {
    expect(
      nearest([250, 10, 10, 0.4], [rgba('#000000'), rgba('#ff0000'), rgba('#ffffff')])
    ).toEqual([255, 0, 0, 0.4]);
  });
});

describe('the styles', () => {
  it('start with the house style, and never share an id or a label', () => {
    expect(STYLES[0].id).toBe('cartoon');
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
    expect(new Set(STYLES.map((s) => s.label)).size).toBe(STYLES.length);
  });

  it('fall back to the house style for an unknown id', () => {
    expect(styleById('no-such-style').id).toBe('cartoon');
    expect(styleById(null).id).toBe('cartoon');
  });

  it.each(STYLES.map((s) => [s.id, s] as const))(
    '%s maps every tone of the office',
    (_id, style) => {
      for (const tone of TONES) {
        const c = rgba(tone);
        const fill = style.fill?.(c, hint, paints) ?? css(c);
        expect(typeof fill === 'string' ? fill.length : 1).toBeGreaterThan(0);
        const stroke = style.stroke?.(c, hint, paints);
        expect(stroke === null || stroke === undefined || typeof stroke === 'string').toBe(true);
        expect(parseColor(tintOf(style, c))).not.toBeNull();
        if (style.letter) {
          expect(parseColor(style.letter(c))).not.toBeNull();
        }
      }
    }
  );

  it.each(STYLES.filter((s) => s.finish).map((s) => [s.id, s.finish] as const))(
    '%s finishes with a look()',
    (_id, finish) => {
      expect(finish).toMatch(/vec4 look\(vec2 s\)/);
    }
  );

  it.each(STYLES.map((s) => [s.id, s] as const))(
    '%s names a paper and a grid it can draw',
    (_id, style) => {
      expect(parseColor(style.paper)).not.toBeNull();
      expect(parseColor(style.grid)).not.toBeNull();
    }
  );

  it('keeps a see-through colour see-through', () => {
    for (const style of STYLES) {
      expect(parseColor(tintOf(style, [200, 100, 50, 0.25]))?.[3]).toBeCloseTo(0.25, 2);
    }
  });
});

describe('toy bricks', () => {
  const bricks = styleById('toy-bricks');
  const desk = rgba('#c98a4b');

  it.each([
    ['a level top', { top: 48, figure: false }, 'studs'],
    ['an upright face', { top: 0, figure: false }, 'plain'],
    ['a figure', { top: 48, figure: true }, 'plain'],
  ])('studs %s only when it is the room', (_name, o, want) => {
    const fill = bricks.fill?.(desk, { ...hint, ...o }, paints);
    expect(fill === 'studs' ? 'studs' : 'plain').toBe(want);
  });

  it('draws in plastic colours only', () => {
    const plastic = new Set(TONES.map((t) => bricks.tint?.(rgba(t))));
    expect(plastic.size).toBeLessThan(22);
  });
});

describe('clay', () => {
  it('smooths every face out of a few clean colours, and never inks it black', () => {
    const clay = styleById('clay');
    expect(new Set(TONES.map((t) => clay.fill?.(rgba(t), hint, paints))).size).toBeLessThan(22);
    const ink = parseColor(String(clay.stroke?.(rgba('#2b2930'), hint, paints)));
    expect(ink && Math.max(ink[0], ink[1], ink[2])).toBeGreaterThan(40);
  });
});
