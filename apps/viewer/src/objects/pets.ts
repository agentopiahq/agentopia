import { DOG_BED, PET_BOWLS } from '@agentopia/core';

import { INK, Iso, V2, V3, ellipse, lift, plane, roundRect } from '../kit/iso';
import { MAT, Mat } from '../kit/palette';
import { OfficeObject, box3 } from './types';

/**
 * The pets' things: their bowls by the kitchen, and the dog's bed in the sun.
 * Both are where core's floor plan puts them (`PET_BOWLS`, `DOG_BED`), and
 * both are built to the pets (`PETS` in `scale.ts`).
 */

/** Where the bowl mat stands, in the room: the middle of the row of bowls. */
export const BOWLS_AT: V3 = [
  PET_BOWLS.cat.food.x,
  (PET_BOWLS.cat.food.y + PET_BOWLS.dog.water.y) / 2,
  0,
];

/** How deep a bowl is, and how wide: the cat's a little smaller than the dog's. */
export const BOWL = { h: 0.075, cat: 0.1, dog: 0.12 } as const;

const KIBBLE = '#a8683a';
const WATER: Mat = { l: '#dff1f7', m: '#b9e0ee', d: '#8cc3d8' };

/**
 * One bowl, in the mat's frame (its +x runs along the row): a squat glazed
 * bowl, a little wider at the rim, full of kibble or of water.
 */
function bowl(k: Iso, at: V2, r: number, glaze: Mat, food: boolean): void {
  const [x, y] = at;
  k.prism(ellipse(x, y, r * 0.82, r * 0.82, 18), 'z', 0, BOWL.h * 0.5, glaze, {
    ink: INK.detail,
  });
  k.prism(ellipse(x, y, r, r, 20), 'z', BOWL.h * 0.5, BOWL.h, glaze, {
    ink: INK.panel,
    cap: food ? { l: '#c98a55', m: '#b9784a', d: '#8f5530' } : WATER,
    decorateCap: () => {
      if (food) {
        // A heap of kibble.
        for (const [dx, dy] of [
          [-0.035, -0.02],
          [0.03, -0.03],
          [0.0, 0.02],
          [0.04, 0.03],
          [-0.03, 0.035],
        ]) {
          k.dot([x + dx * (r / 0.1), y + dy * (r / 0.1), BOWL.h + 0.004], 0.9, KIBBLE, 0.3);
        }
      } else {
        // A glint on the water.
        k.line(
          [
            [x - r * 0.45, y - r * 0.1, BOWL.h + 0.002],
            [x - r * 0.1, y - r * 0.4, BOWL.h + 0.002],
          ],
          INK.hair,
          false,
          '#ffffff'
        );
      }
    },
  });
}

/** Where each bowl sits along the mat, from core's floor plan. */
const ALONG = {
  catFood: PET_BOWLS.cat.food.y - BOWLS_AT[1],
  catWater: PET_BOWLS.cat.water.y - BOWLS_AT[1],
  dogFood: PET_BOWLS.dog.food.y - BOWLS_AT[1],
  dogWater: PET_BOWLS.dog.water.y - BOWLS_AT[1],
};

/**
 * The bowls, in a row on a little mat against the wall. Placed facing `-x`,
 * the mat's local +x runs along world +y, so the bowls fall in core's order.
 */
export const petBowls: OfficeObject = {
  name: 'Pet bowls',
  blurb: "The cat's and the dog's food and water, in a row on a mat by the kitchen.",
  bounds: box3([-0.52, -0.22, 0], [0.52, 0.22, 0.12]),
  footprint: box3([-0.46, -0.15, 0], [0.46, 0.15, BOWL.h]),

  shadow(k) {
    for (const [x, r] of [
      [ALONG.catFood, BOWL.cat],
      [ALONG.catWater, BOWL.cat],
      [ALONG.dogFood, BOWL.dog],
      [ALONG.dogWater, BOWL.dog],
    ]) {
      k.castShadow(lift(plane.z(BOWL.h), ellipse(x, 0, r, r, 12)), 0, 0.5);
    }
  },

  draw(k) {
    // The mat: a rounded rubber mat, a paw print at either end.
    const mat = lift(plane.z(0.006), roundRect(-0.5, -0.19, 0.5, 0.19, 0.08));
    k.lit(mat, [0, 0, 1], MAT.felt);
    k.line(mat, INK.detail, true);
    k.sorted((add) => {
      const row: Array<[number, number, Mat, boolean]> = [
        [ALONG.catFood, BOWL.cat, MAT.teal, true],
        [ALONG.catWater, BOWL.cat, MAT.teal, false],
        [ALONG.dogFood, BOWL.dog, MAT.tomato, true],
        [ALONG.dogWater, BOWL.dog, MAT.tomato, false],
      ];
      for (const [x, r, glaze, food] of row) {
        add(box3([x - r, -r, 0], [x + r, r, BOWL.h]), () => bowl(k, [x, 0], r, glaze, food));
      }
    });
  },
};

/** The dog bed's cushion top: where the dog lies (core's `DOG_BED_PERCH.z`). */
export const BED_TOP = 0.14;

/** A round dog bed: a plump bolster ring round a soft cushion. */
export const dogBed: OfficeObject = {
  name: 'Dog bed',
  blurb: "The dog's round bed, a bolster round a cushion, in the sun under the window.",
  bounds: box3(
    [-DOG_BED.r - 0.04, -DOG_BED.r - 0.04, 0],
    [DOG_BED.r + 0.04, DOG_BED.r + 0.04, 0.24]
  ),
  footprint: box3([-DOG_BED.r, -DOG_BED.r, 0], [DOG_BED.r, DOG_BED.r, BED_TOP]),

  shadow(k) {
    k.castShadow(lift(plane.z(0.16), ellipse(0, 0, DOG_BED.r, DOG_BED.r, 20)), 0, 0.7);
  },

  draw(k) {
    const r = DOG_BED.r;
    // The base and the cushion in it, then the bolster ring round it.
    k.prism(ellipse(0, 0, r, r, 28), 'z', 0, 0.08, MAT.slate, { ink: INK.panel });
    k.prism(ellipse(0, 0, r * 0.72, r * 0.72, 24), 'z', 0.08, BED_TOP - 0.01, MAT.oat, {
      ink: INK.detail,
      rim: false,
    });
    // The bolster: a ring of soft lumps, drawn back to front.
    const n = 18;
    const ring = Array.from({ length: n }, (_, i): V3 => {
      const a = (i / n) * Math.PI * 2;
      return [Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84, 0.12];
    }).sort((a, b) => k.depth(a) - k.depth(b));
    for (const c of ring) {
      k.ball(c, 0.08, MAT.slate, INK.detail);
    }
  },
};
