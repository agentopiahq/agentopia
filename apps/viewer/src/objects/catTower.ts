import { CAT_TOWER, TowerLevel } from '@agentopia/core';

import { INK, Iso, V2, V3, ellipse, lift, plane, roundRect } from '../kit/iso';
import { MAT, Mat } from '../kit/palette';
import { ObjectPart, OfficeObject, box3 } from './types';

/**
 * The cat tower: a little cat tree after the reference's soft, warm look —
 * beige plush levels on sisal-wrapped posts over a carpeted base. Nearest the
 * wall, a den with a round door and a scratching post; out from it a ledge on
 * its own post with a pom-pom toy hung off its corner, and at the back a
 * round bed on the tallest post.
 *
 * Every level is where core's floor plan puts it (`CAT_TOWER.levels`), so the
 * cat lands on the plush exactly: its top is the perch's height. Each level
 * is its own part, sorted on its own, so the cat up on one is drawn over that
 * one and behind whatever stands nearer.
 */

const { levels, post, half, toy } = CAT_TOWER;

/** Sisal rope round the posts: warm straw, wound in rings. */
const SISAL: Mat = { l: '#efd8a6', m: '#d8b878', d: '#a8864d' };
/** The plush, and the board under each level. */
const PLUSH = MAT.oat;
const BOARD = MAT.birch;
/** The bed's cushion, and the toy. */
const CUSHION = MAT.sand;
const TOY = MAT.tomato;

/** How thick the base is, and how thick a level's board and plush are. */
const BASE_H = 0.06;
const BOARD_H = 0.035;
const PLUSH_H = 0.035;
/** How fat the posts are under the ledge and the bed. */
const POST_R = 0.085;

const middle = (l: TowerLevel): V2 => [(l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2];
const BED_AT = middle(levels.bed);
/** The top bed's radius: it fills its level. */
export const BED_R =
  Math.min(levels.bed.x1 - levels.bed.x0, levels.bed.y1 - levels.bed.y0) / 2 - 0.005;
const LEDGE_POST: V2 = [middle(levels.ledge)[0] - 0.04, middle(levels.ledge)[1]];
/** The den's round door: as wide as the cat's head, so it can go in. */
export const DOOR = { r: 0.18, z: 0.25 } as const;
/** Where the toy's string is tied (the ledge's corner) and how low it hangs. */
const TOY_AT: V2 = [toy.x, toy.y];
const TOY_Z = toy.z;
const TOY_R = 0.05;

/** A sisal post: a cylinder with rings of rope wound round its near side. */
function sisalPost(k: Iso, at: V2, r: number, z0: number, z1: number): void {
  const [x, y] = at;
  k.prism(ellipse(x, y, r, r, 18), 'z', z0, z1, SISAL, { ink: INK.panel, rim: false });
  const n = 14;
  for (let z = z0 + 0.04; z < z1 - 0.015; z += 0.042) {
    const ring: V3[] = [];
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const nrm: V3 = [Math.cos(a), Math.sin(a), 0];
      if (k.facing(nrm)) {
        ring.push([x + nrm[0] * r, y + nrm[1] * r, z]);
      } else if (ring.length > 1) {
        break;
      }
    }
    if (ring.length > 1) {
      k.line(ring, INK.hair, false, SISAL.d);
    }
  }
}

/** The den's round door, on its side at `x`, facing along x. */
function denDoor(k: Iso, x: number): void {
  const [, cy] = middle(levels.den);
  const door = ellipse(cy, DOOR.z, DOOR.r, DOOR.r * 0.95, 20).map(([y, z]): V3 => [x, y, z]);
  k.fill(door, MAT.walnut.d);
  k.line(door, INK.detail, true);
}

/** A level: a board, then plush on it, a little inset; its top is at `l.z`. */
function level(k: Iso, l: TowerLevel): void {
  const z0 = l.z - PLUSH_H - BOARD_H;
  k.slab(l.x0, l.y0, l.x1, l.y1, z0, l.z - PLUSH_H, 0.05, BOARD, INK.panel);
  k.prism(
    roundRect(l.x0 + 0.01, l.y0 + 0.01, l.x1 - 0.01, l.y1 - 0.01, 0.06),
    'z',
    l.z - PLUSH_H,
    l.z,
    PLUSH,
    {
      ink: INK.detail,
    }
  );
}

const partBox = (l: TowerLevel, z0: number = BASE_H) => box3([l.x0, l.y0, z0], [l.x1, l.y1, l.z]);

/** The parts it is sorted in: the base, then each level with what holds it up. */
const PARTS: ObjectPart[] = [
  { name: 'base', footprint: box3([-half.w, -half.d, 0], [half.w, half.d, BASE_H]) },
  { name: 'den', footprint: partBox(levels.den) },
  { name: 'ledge', footprint: partBox(levels.ledge) },
  { name: 'bed', footprint: partBox(levels.bed) },
  {
    name: 'post',
    footprint: box3(
      [post.x - post.r, post.y - post.r, BASE_H],
      [post.x + post.r, post.y + post.r, post.z]
    ),
  },
];

export const catTower: OfficeObject = {
  name: 'Cat tower',
  blurb: "The cat's tower: a den, a ledge and a bed up top, and a post to scratch.",
  bounds: box3(
    [-half.w - 0.04, -half.d - 0.04, 0],
    [half.w + 0.04, half.d + 0.04, levels.bed.z + 0.12]
  ),
  footprint: box3([-half.w, -half.d, 0], [half.w, half.d, levels.bed.z]),
  parts: PARTS,

  shadow(k) {
    const at = (z: number, pts: V2[]): V3[] => lift(plane.z(z), pts);
    k.castShadow(
      [
        at(BASE_H, roundRect(-half.w, -half.d, half.w, half.d, 0.08)),
        at(
          levels.den.z,
          roundRect(levels.den.x0, levels.den.y0, levels.den.x1, levels.den.y1, 0.05)
        ),
        at(
          levels.ledge.z,
          roundRect(levels.ledge.x0, levels.ledge.y0, levels.ledge.x1, levels.ledge.y1, 0.05)
        ),
        at(levels.bed.z, ellipse(BED_AT[0], BED_AT[1], BED_R, BED_R, 16)),
        at(post.z, ellipse(post.x, post.y, post.r + 0.02, post.r + 0.02, 12)),
      ],
      0,
      0.6
    );
  },

  draw(k) {
    k.sorted((add) => {
      // The carpeted base everything stands on.
      add(
        PARTS[0].footprint,
        () => k.slab(-half.w, -half.d, half.w, half.d, 0, BASE_H, 0.08, PLUSH, INK.panel),
        'base'
      );

      // The den: a plush box with a round door in its front.
      const d = levels.den;
      add(
        partBox(d),
        () =>
          k.box([d.x0, d.y0 + 0.01, BASE_H], [d.x1, d.y1 - 0.01, d.z], PLUSH, {
            decorate: {
              '+x': () => denDoor(k, d.x1 + 0.001),
              '-x': () => denDoor(k, d.x0 + 0.009),
            },
          }),
        'den'
      );

      // The ledge, on its post, with the toy hung off its corner.
      const l = levels.ledge;
      add(
        box3(
          [LEDGE_POST[0] - POST_R, LEDGE_POST[1] - POST_R, BASE_H],
          [LEDGE_POST[0] + POST_R, LEDGE_POST[1] + POST_R, l.z - PLUSH_H - BOARD_H]
        ),
        () => sisalPost(k, LEDGE_POST, POST_R, BASE_H, l.z - PLUSH_H - BOARD_H),
        'ledge'
      );
      add(
        box3([l.x0, l.y0, l.z - PLUSH_H - BOARD_H], [l.x1, l.y1, l.z]),
        () => level(k, l),
        'ledge'
      );
      add(
        box3(
          [TOY_AT[0] - TOY_R, TOY_AT[1] - TOY_R, TOY_Z - TOY_R],
          [TOY_AT[0] + TOY_R, TOY_AT[1] + TOY_R, l.z - 0.07]
        ),
        () => {
          k.line(
            [
              [TOY_AT[0], TOY_AT[1], l.z - PLUSH_H - BOARD_H],
              [TOY_AT[0], TOY_AT[1], TOY_Z + TOY_R * 0.6],
            ],
            INK.hair
          );
          k.ball([TOY_AT[0], TOY_AT[1], TOY_Z], TOY_R, TOY, INK.detail);
        },
        'ledge'
      );

      // The bed up top: a round cup of plush on the tallest post.
      const b = levels.bed;
      const cup = b.z - PLUSH_H - BOARD_H;
      add(
        box3(
          [BED_AT[0] - POST_R, BED_AT[1] - POST_R, BASE_H],
          [BED_AT[0] + POST_R, BED_AT[1] + POST_R, cup]
        ),
        () => sisalPost(k, BED_AT, POST_R, BASE_H, cup),
        'bed'
      );
      add(
        box3([b.x0, b.y0, cup], [b.x1, b.y1, b.z]),
        () => {
          const [x, y] = BED_AT;
          k.prism(ellipse(x, y, BED_R, BED_R, 24), 'z', cup, cup + BOARD_H, BOARD, {
            ink: INK.panel,
          });
          k.prism(ellipse(x, y, BED_R * 0.74, BED_R * 0.74, 22), 'z', cup + BOARD_H, b.z, CUSHION, {
            ink: INK.detail,
            rim: false,
          });
          // A soft bolster round the cushion, drawn back to front.
          const n = 16;
          const ring = Array.from({ length: n }, (_, i): V3 => {
            const a = (i / n) * Math.PI * 2;
            return [x + Math.cos(a) * BED_R * 0.84, y + Math.sin(a) * BED_R * 0.84, b.z + 0.005];
          }).sort((p, q) => k.depth(p) - k.depth(q));
          for (const c of ring) {
            k.ball(c, 0.048, PLUSH, INK.detail);
          }
        },
        'bed'
      );

      // The free scratching post at the front, a plush pad on its top.
      add(
        PARTS[4].footprint,
        () => {
          sisalPost(k, [post.x, post.y], post.r, BASE_H, post.z - 0.04);
          k.prism(
            ellipse(post.x, post.y, post.r + 0.025, post.r + 0.025, 16),
            'z',
            post.z - 0.04,
            post.z,
            PLUSH,
            {
              ink: INK.panel,
            }
          );
        },
        'post'
      );
    });
  },
};
