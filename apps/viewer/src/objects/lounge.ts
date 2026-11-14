import { FONT, INK, Iso, V3, ellipse, lift, plane, roundRect } from '../kit/iso';
import { MAT, Mat, SHEET, mix } from '../kit/palette';
import { SEAT_Z } from './chair';
import { AVATAR } from './scale';
import { OfficeObject, box3, flag, frac } from './types';

/**
 * The lounge and the huddle corner: a sofa, an armchair, a bean bag beside a
 * little side table with a bubble tea on it (after the reference), a coffee
 * table, and a round huddle table. Every seat is at `SEAT_Z`, the avatar's
 * hip height, and every table top is where a seated avatar's hands land.
 * Each is authored with its sitter facing local +y.
 */

/** Arm width on an upholstered seat. */
const ARM = 0.16;
/** One seat cushion: a whole avatar wide, so each place takes one sitter. */
export const SOFA_SEAT_W = AVATAR.width;
/** How deep an upholstered seat is: room for the avatar to sit back. */
export const SOFA_DEPTH = 1.0;

/**
 * An upholstered seat for `cushions` sitters: a base, cushions, a back and
 * two arms. It is sorted in parts, since whoever sits on it is between them:
 * on the seat, in front of the back, and between the arms.
 */
function upholstered(name: string, blurb: string, cushions: number, m: Mat): OfficeObject {
  const hx = (cushions * SOFA_SEAT_W) / 2 + ARM;
  const hy = SOFA_DEPTH / 2;
  const back = SEAT_Z + 0.36;
  const arm = SEAT_Z + 0.14;
  return {
    name,
    blurb,
    bounds: box3([-hx - 0.06, -hy - 0.06, 0], [hx + 0.06, hy + 0.06, back + 0.06]),
    footprint: box3([-hx, -hy, 0], [hx, hy, back]),
    parts: [
      {
        name: 'seat',
        seat: true,
        footprint: box3([-hx + ARM, -hy + 0.2, 0], [hx - ARM, hy, SEAT_Z + 0.3]),
      },
      { name: 'back', footprint: box3([-hx, -hy, 0], [hx, -hy + 0.2, back]) },
      { name: 'left arm', footprint: box3([-hx, -hy, 0], [-hx + ARM, hy, arm]) },
      { name: 'right arm', footprint: box3([hx - ARM, -hy, 0], [hx, hy, arm]) },
    ],

    shadow(k) {
      k.castShadow(Iso.corners([-hx, -hy, 0], [hx, hy, SEAT_Z]));
      k.castShadow(Iso.corners([-hx, -hy, 0], [hx, -hy + 0.2, back]));
    },

    draw(k) {
      k.sorted((add) => {
        // Little wooden feet.
        for (const x of [-hx + 0.08, hx - 0.08]) {
          for (const y of [-hy + 0.08, hy - 0.08]) {
            add(box3([x - 0.03, y - 0.03, 0], [x + 0.03, y + 0.03, 0.06]), () =>
              k.cylinder(x, y, 0, 0.06, 0.025, MAT.wood, INK.hair)
            );
          }
        }
        // The base, between the arms and in front of the back, which both
        // go down to it: each part stands whole, so none draws over another.
        add(box3([-hx + ARM, -hy + 0.2, 0.06], [hx - ARM, hy, SEAT_Z - 0.08]), () =>
          k.slab(-hx + ARM, -hy + 0.2, hx - ARM, hy, 0.06, SEAT_Z - 0.08, 0.06, m, INK.panel)
        );
        // The back, then the seat cushions in front of it.
        add(box3([-hx, -hy, 0.06], [hx, -hy + 0.2, back]), () =>
          k.slab(-hx + 0.04, -hy, hx - 0.04, -hy + 0.2, 0.06, back, 0.08, m, INK.panel)
        );
        const span = (2 * (hx - ARM)) / cushions;
        for (let i = 0; i < cushions; i++) {
          const x0 = -hx + ARM + i * span;
          add(box3([x0, -hy + 0.2, SEAT_Z - 0.08], [x0 + span, hy, SEAT_Z]), () =>
            k.slab(
              x0 + 0.01,
              -hy + 0.2,
              x0 + span - 0.01,
              hy - 0.01,
              SEAT_Z - 0.08,
              SEAT_Z,
              0.07,
              m,
              INK.detail
            )
          );
        }
        for (const x of [-hx, hx - ARM]) {
          add(box3([x, -hy, 0.06], [x + ARM, hy, arm]), () =>
            k.slab(x, -hy, x + ARM, hy, 0.06, arm, 0.07, m, INK.panel)
          );
        }
        // A cushion propped in one corner.
        add(box3([-hx + 0.18, -hy + 0.2, SEAT_Z], [-hx + 0.5, -hy + 0.32, SEAT_Z + 0.3]), () =>
          k.prism(
            roundRect(-hx + 0.2, SEAT_Z, -hx + 0.48, SEAT_Z + 0.28, 0.08),
            'y',
            -hy + 0.2,
            -hy + 0.3,
            m === MAT.mustard ? MAT.oat : MAT.mustard,
            {
              ink: INK.detail,
            }
          )
        );
      });
    },
  };
}

export const sofa = upholstered(
  'Sofa',
  'A big two-seat sofa in sage: each seat a whole avatar wide, at its hip height.',
  2,
  MAT.felt
);
export const sofaRust = upholstered('Rust sofa', 'A big two-seat sofa in rust.', 2, MAT.rust);
export const armchair = upholstered(
  'Armchair',
  'A deep armchair in mustard, a seat for one.',
  1,
  MAT.mustard
);

/**
 * A bean bag, after the reference: a soft oat canvas blob, slumped low, with
 * a dent where you sit and a hump behind for your back.
 */
export const beanBag: OfficeObject = {
  name: 'Bean bag',
  blurb: 'A bean bag, slumped and comfy, after the reference.',
  bounds: box3([-0.55, -0.55, 0], [0.55, 0.55, 0.75]),
  footprint: box3([-0.45, -0.45, 0], [0.45, 0.45, 0.6]),

  shadow(k) {
    k.castShadow(lift(plane.z(0.3), ellipse(0, -0.05, 0.42, 0.42, 16)), 0, 0.7);
  },

  draw(k) {
    const ctx = k.ctx;
    // The bag is one soft shape: a hump behind for the back and a wide,
    // slumped body in front. Ink both outlines thick, then fill both over
    // them, so only the outer edge of the union keeps its line.
    const parts: Array<[V3, number, number]> = [
      [[0, -0.12, 0.36], 0.36, 0.95],
      [[0.02, 0.08, 0.2], 0.48, 0.6],
    ];
    const path = (c: V3, r: number, squash: number): [number, number, number] => {
      const [x, y] = k.P(c);
      const R = r * k.unit;
      ctx.beginPath();
      ctx.ellipse(x, y, R, R * squash, 0, 0, Math.PI * 2);
      return [x, y, R];
    };
    ctx.save();
    ctx.strokeStyle = k.inkColor;
    ctx.lineWidth = INK.panel * 2 * k.lineScale * k.inkWeight;
    for (const [c, r, sq] of parts) {
      path(c, r, sq);
      ctx.stroke();
    }
    for (const [c, r, sq] of parts) {
      const [x, y, R] = path(c, r, sq);
      if (ctx.createRadialGradient) {
        const g = ctx.createRadialGradient(x + R * 0.3, y - R * 0.35 * sq, R * 0.1, x, y, R * 1.05);
        g.addColorStop(0, mix(MAT.oat.l, '#ffffff', 0.3));
        g.addColorStop(0.55, MAT.oat.m);
        g.addColorStop(1, MAT.oat.d);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = MAT.oat.m;
      }
      ctx.fill();
    }
    ctx.restore();
    const [dx, dy] = k.P([0.04, 0.02, 0.3]);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(dx, dy, 0.24 * k.unit, 0.1 * k.unit, 0, 0, Math.PI * 2);
    ctx.fillStyle = MAT.oat.d;
    ctx.globalAlpha *= 0.45;
    ctx.fill();
    ctx.restore();
    // A seam across the front.
    const [sx0, sy0] = k.P([-0.3, 0.3, 0.16]);
    const [sx1, sy1] = k.P([0.34, 0.3, 0.16]);
    const [sxm, sym] = k.P([0.02, 0.5, 0.1]);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx0, sy0);
    ctx.quadraticCurveTo(sxm, sym, sx1, sy1);
    ctx.strokeStyle = MAT.oat.d;
    ctx.lineWidth = INK.hair * k.lineScale;
    ctx.stroke();
    ctx.restore();
  },
};

/** A little round wooden side table on three legs, a bubble tea on it. */
export const sideTable: OfficeObject = {
  name: 'Side table',
  blurb: 'A three-legged side table with a bubble tea on it, after the reference.',
  bounds: box3([-0.26, -0.26, 0], [0.26, 0.26, 0.72]),
  footprint: box3([-0.2, -0.2, 0], [0.2, 0.2, 0.42]),

  shadow(k) {
    k.castShadow(lift(plane.z(0.42), ellipse(0, 0, 0.2, 0.2, 12)), 0, 0.7);
  },

  draw(k) {
    const z = 0.42;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      k.rod(
        [Math.cos(a) * 0.08, Math.sin(a) * 0.08, z - 0.03],
        [Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0],
        0.018,
        MAT.wood
      );
    }
    k.prism(ellipse(0, 0, 0.21, 0.21, 22), 'z', z - 0.04, z, MAT.wood, { ink: INK.panel });
    // The bubble tea: a clear cup, milky tea, pearls, a lid and a straw.
    const cup = 0.06;
    k.prism(
      ellipse(0.02, 0.02, cup, cup, 16),
      'z',
      z,
      z + 0.16,
      { l: '#d9b48a', m: '#c99f74', d: '#a67d55' },
      { ink: INK.detail }
    );
    for (const [px, py] of [
      [-0.02, 0.06],
      [0.03, 0.07],
      [0.07, 0.05],
    ]) {
      k.dot([px, py, z + 0.025], 1.2, '#3b2a20');
    }
    k.prism(
      ellipse(0.02, 0.02, cup + 0.008, cup + 0.008, 16),
      'z',
      z + 0.16,
      z + 0.175,
      MAT.glass,
      { ink: INK.hair }
    );
    k.rod([0.03, 0.02, z + 0.12], [0.05, 0.0, z + 0.28], 0.008, MAT.tomato, INK.hair);
  },
};

/** A low oak coffee table, a book and a plant pot on it. */
export const coffeeTable: OfficeObject = {
  name: 'Coffee table',
  blurb: 'A low oak coffee table with a book and a little plant on it.',
  bounds: box3([-0.6, -0.36, 0], [0.6, 0.36, 0.55]),
  footprint: box3([-0.55, -0.3, 0], [0.55, 0.3, 0.3]),

  shadow(k) {
    k.castShadow(Iso.corners([-0.55, -0.3, 0.24], [0.55, 0.3, 0.3]), 0, 0.8);
  },

  draw(k) {
    k.sorted((add) => {
      for (const x of [-0.48, 0.48]) {
        for (const y of [-0.23, 0.23]) {
          add(box3([x - 0.03, y - 0.03, 0], [x + 0.03, y + 0.03, 0.25]), () =>
            k.cylinder(x, y, 0, 0.25, 0.025, MAT.oak, INK.hair)
          );
        }
      }
      add(box3([-0.55, -0.3, 0.25], [0.55, 0.3, 0.3]), () => {
        k.slab(-0.55, -0.3, 0.55, 0.3, 0.25, 0.3, 0.06, MAT.oak, INK.panel);
        k.slab(-0.38, -0.16, -0.06, 0.12, 0.3, 0.33, 0.01, MAT.cobalt, INK.detail);
        k.slab(-0.38, -0.16, -0.06, 0.12, 0.33, 0.345, 0.01, MAT.trim, INK.hair);
      });
      add(box3([0.16, -0.12, 0.3], [0.38, 0.1, 0.55]), () => {
        k.cylinder(0.27, -0.01, 0.3, 0.38, 0.07, MAT.glaze, INK.detail);
        const leaves: Array<[V3, number]> = [
          [[0.25, -0.03, 0.43], 0.06],
          [[0.3, 0.02, 0.46], 0.055],
          [[0.26, 0.01, 0.5], 0.05],
        ];
        for (const [c, r] of leaves) {
          k.ball(c, r, MAT.leaf, INK.hair);
        }
      });
    });
  },
};

/** A round huddle table on a pedestal, at the height a seated avatar works at. */
export const huddleTable: OfficeObject = {
  name: 'Huddle table',
  blurb: 'A round huddle table, for a quick talk without booking the room.',
  bounds: box3([-0.72, -0.72, 0], [0.72, 0.72, 0.9]),
  footprint: box3([-0.65, -0.65, 0], [0.65, 0.65, 0.66]),

  shadow(k) {
    k.castShadow(lift(plane.z(0.66), ellipse(0, 0, 0.65, 0.65, 20)), 0, 0.8);
  },

  draw(k) {
    const z = 0.66;
    k.prism(ellipse(0, 0, 0.3, 0.3, 20), 'z', 0, 0.04, MAT.graphite, { ink: INK.detail });
    k.cylinder(0, 0, 0.04, z - 0.04, 0.05, MAT.graphite, INK.detail);
    k.prism(ellipse(0, 0, 0.65, 0.65, 28), 'z', z - 0.04, z, MAT.oak, { ink: INK.silhouette });
    // A notebook, a pen and a cup.
    k.slab(-0.3, -0.1, 0.0, 0.26, z, z + 0.02, 0.01, MAT.trim, INK.detail);
    k.line(
      [
        [-0.25, 0.0, z + 0.021],
        [-0.06, 0.0, z + 0.021],
      ],
      INK.hair
    );
    k.rod([0.04, 0.0, z + 0.015], [0.2, 0.12, z + 0.015], 0.012, MAT.cobalt, INK.hair);
    k.cylinder(0.24, -0.22, z, z + 0.11, 0.05, MAT.ceramic, INK.detail);
    k.fill(lift(plane.z(z + 0.111), ellipse(0.24, -0.22, 0.038, 0.038, 12)), '#5a3420');
  },
};

/** Technical books for the shelf: spine colour, title, and how tall and thick. */
const BOOKS: Array<[string, string, number, number]> = [
  ['#2f5fb0', 'ALGORITHMS', 0.27, 0.07],
  ['#c9473b', 'COMPILERS', 0.25, 0.06],
  ['#3d7d5a', 'DISTRIBUTED SYSTEMS', 0.28, 0.075],
  ['#e1b04a', 'TYPESCRIPT', 0.22, 0.05],
  ['#6a4c9c', 'OPERATING SYSTEMS', 0.27, 0.07],
  ['#2b2a30', 'UNIX', 0.2, 0.045],
  ['#d9783f', 'RUST', 0.23, 0.055],
  ['#4a8fbf', 'NETWORKING', 0.25, 0.06],
  ['#b9394f', 'DESIGN PATTERNS', 0.26, 0.065],
  ['#5b7f3a', 'DATABASES', 0.24, 0.06],
  ['#e8dcc2', 'GIT', 0.19, 0.04],
  ['#33476b', 'REFACTORING', 0.24, 0.055],
  ['#a05a2c', 'GRAPHICS', 0.26, 0.065],
  ['#7d8b99', 'LINUX KERNEL', 0.27, 0.07],
  ['#d94f7a', 'MACHINE LEARNING', 0.28, 0.07],
  ['#2f8a8a', 'TESTING', 0.21, 0.05],
];

/** One row of books standing on a shelf at height z, from x0 to x1, at depth y. */
function bookRow(k: Iso, x0: number, x1: number, y: number, z: number, start: number): void {
  let x = x0;
  for (let i = 0; x < x1 - 0.06; i++) {
    const [color, title, h, w] = BOOKS[(start + i * 5) % BOOKS.length];
    if (x + w > x1) {
      break;
    }
    const m: Mat = { l: color, m: mix(color, '#000000', 0.12), d: mix(color, '#000000', 0.3) };
    k.box([x, y - 0.24, z], [x + w, y, z + h], m, { ink: INK.hair });
    // Bands across the spine, and its title running up it.
    const yy = y + 0.001;
    for (const bz of [0.03, h - 0.04]) {
      k.line(
        [
          [x + 0.005, yy, z + bz],
          [x + w - 0.005, yy, z + bz],
        ],
        INK.hair,
        false,
        mix(color, '#ffffff', 0.5)
      );
    }
    k.text([x + w / 2 + 0.008, yy, z + 0.05], [0, 0, 1], [-1, 0, 0], title, 0.028 * k.unit, {
      color: mix(color, '#ffffff', 0.8),
      align: 'left',
      weight: '700',
    });
    x += w + 0.004;
  }
}

/**
 * A low bookshelf of technical books, backing the lounge: a short run of
 * spines on each shelf — algorithms, compilers, distributed systems and the
 * rest — with room left for a basket, a plant, a photo and a flat stack, and
 * a plant and a globe on top. At about the avatar's chest height,
 * every shelf is in its reach.
 */
export const bookshelf: OfficeObject = {
  name: 'Bookshelf',
  blurb: 'A low bookshelf of technical books: algorithms, compilers, systems, and more.',
  bounds: box3([-1.3, -0.26, 0], [1.3, 0.26, 1.45]),
  footprint: box3([-1.22, -0.21, 0], [1.22, 0.21, 1.05]),

  shadow(k) {
    k.castShadow(Iso.corners([-1.22, -0.21, 0], [1.22, 0.21, 1.05]));
  },

  draw(k) {
    const [hx, hy, h] = [1.22, 0.21, 1.05];
    const t = 0.04;
    const shelves = [0.06, 0.4, 0.72];
    // Back, then the shelves and their books, then the sides and the top.
    k.box([-hx, -hy, 0], [hx, -hy + t, h], MAT.oak, { ink: INK.detail, rim: false });
    const nearSide = k.facing([1, 0, 0]) ? hx - t : -hx;
    const farSide = nearSide === -hx ? hx - t : -hx;
    k.box([farSide, -hy, 0], [farSide + t, hy, h], MAT.oak, { ink: INK.detail });
    for (const z of shelves) {
      k.box([-hx + t, -hy + t, z - 0.03], [hx - t, hy, z], MAT.oak, { ink: INK.hair });
    }
    // Not crammed: a short run of books on each shelf, with room left for a
    // basket, a plant, a photo, a flat stack.
    const fy = hy - 0.02;
    const [z0, z1, z2] = shelves;
    bookRow(k, -hx + t + 0.04, -0.5, fy, z0, 0);
    k.box([0.15, -0.12, z0], [0.62, fy, z0 + 0.2], MAT.wood, { ink: INK.detail });
    k.line(
      [
        [0.17, fy + 0.001, z0 + 0.1],
        [0.6, fy + 0.001, z0 + 0.1],
      ],
      INK.hair,
      false,
      MAT.wood.d
    );
    bookRow(k, -0.25, 0.4, fy, z1, 3);
    k.cylinder(-0.8, 0.02, z1, z1 + 0.09, 0.07, MAT.glaze, INK.detail);
    k.ball([-0.8, 0.02, z1 + 0.15], 0.07, MAT.fern, INK.hair);
    bookRow(k, -hx + t + 0.04, -0.75, fy, z2, 6);
    // A framed photo, propped up.
    k.box([-0.35, -0.04, z2], [0.02, 0.0, z2 + 0.24], MAT.graphite, {
      ink: INK.detail,
      decorate: {
        '+y': () =>
          k.fill(
            [
              [-0.32, 0.001, z2 + 0.03],
              [-0.01, 0.001, z2 + 0.03],
              [-0.01, 0.001, z2 + 0.21],
              [-0.32, 0.001, z2 + 0.21],
            ],
            '#bcd7e6'
          ),
      },
    });
    bookRow(k, 0.45, 0.8, fy, z2, 9);
    // A little stack lying flat on the middle shelf.
    for (let i = 0; i < 3; i++) {
      const z = 0.4 + i * 0.05;
      const c = BOOKS[(i * 7) % BOOKS.length][0];
      k.box(
        [hx - 0.48, -hy + 0.06, z],
        [hx - 0.12, hy - 0.04, z + 0.05],
        { l: c, m: mix(c, '#000000', 0.12), d: mix(c, '#000000', 0.3) },
        { ink: INK.hair }
      );
    }
    k.box([nearSide, -hy, 0], [nearSide + t, hy, h], MAT.oak, { ink: INK.detail });
    k.box([-hx, -hy, h - t], [hx, hy, h], MAT.oak, { ink: INK.panel });
    // On top: a potted plant and a desk globe.
    k.cylinder(-0.8, 0, h, h + 0.12, 0.08, MAT.terracotta, INK.detail);
    for (const [c, r] of [
      [[-0.84, -0.02, h + 0.2], 0.08],
      [[-0.74, 0.03, h + 0.24], 0.07],
      [[-0.8, 0.0, h + 0.31], 0.06],
    ] as Array<[V3, number]>) {
      k.ball(c, r, MAT.leaf, INK.hair);
    }
    k.cylinder(0.6, 0, h, h + 0.03, 0.07, MAT.brass, INK.hair);
    k.rod([0.6, 0, h + 0.03], [0.6, 0, h + 0.1], 0.012, MAT.brass, INK.hair);
    k.ball([0.6, 0, h + 0.2], 0.11, MAT.cobalt, INK.detail);
  },
};

/** A little round café table by the kitchen, for two, at a seated avatar's hands. */
export const cafeTable: OfficeObject = {
  name: 'Café table',
  blurb: 'A little round café table by the kitchen, for a coffee for two.',
  bounds: box3([-0.52, -0.52, 0], [0.52, 0.52, 0.95]),
  footprint: box3([-0.46, -0.46, 0], [0.46, 0.46, 0.66]),

  shadow(k) {
    k.castShadow(lift(plane.z(0.66), ellipse(0, 0, 0.46, 0.46, 18)), 0, 0.8);
  },

  draw(k) {
    const z = 0.66;
    k.prism(ellipse(0, 0, 0.22, 0.22, 18), 'z', 0, 0.03, MAT.graphite, { ink: INK.detail });
    k.cylinder(0, 0, 0.03, z - 0.03, 0.035, MAT.graphite, INK.detail);
    k.prism(ellipse(0, 0, 0.46, 0.46, 26), 'z', z - 0.03, z, MAT.oak, { ink: INK.panel });
    // Two cups and a little vase of flowers.
    k.cylinder(-0.18, 0.1, z, z + 0.1, 0.045, MAT.ceramic, INK.hair);
    k.fill(lift(plane.z(z + 0.101), ellipse(-0.18, 0.1, 0.034, 0.034, 12)), '#5a3420');
    k.cylinder(0.2, -0.12, z, z + 0.1, 0.045, MAT.tomato, INK.hair);
    k.cylinder(0.02, -0.02, z, z + 0.12, 0.035, MAT.glass, INK.hair);
    k.rod([0.02, -0.02, z + 0.1], [0.0, -0.04, z + 0.24], 0.006, MAT.leaf, INK.hair);
    k.ball([0.0, -0.04, z + 0.26], 0.03, MAT.blush, INK.hair);
    k.rod([0.02, -0.02, z + 0.1], [0.06, 0.0, z + 0.22], 0.006, MAT.leaf, INK.hair);
    k.ball([0.06, 0.0, z + 0.24], 0.028, MAT.mustard, INK.hair);
  },
};

/** The all-hands screen's white surface, in its own frame. */
const SCREEN = { hx: 1.3, z0: 0.55, z1: 2.45 } as const;

/**
 * A pull-up projection screen for the company all-hands: a matte white
 * surface in a thin black border, drawn up out of an aluminium case on the
 * floor on a centre post. Its front (+y) faces the sofas.
 */
export const projectionScreen: OfficeObject = {
  name: 'Projection screen',
  blurb: 'A white pull-up projection screen, for the company all-hands.',
  bounds: box3([-SCREEN.hx - 0.15, -0.25, 0], [SCREEN.hx + 0.15, 0.25, SCREEN.z1 + 0.1]),
  footprint: box3([-SCREEN.hx - 0.1, -0.18, 0], [SCREEN.hx + 0.1, 0.18, SCREEN.z1]),

  shadow(k) {
    k.castShadow(Iso.corners([-SCREEN.hx - 0.1, -0.12, 0], [SCREEN.hx + 0.1, 0.12, 0.14]));
    k.castShadow(Iso.corners([-SCREEN.hx, -0.01, SCREEN.z0], [SCREEN.hx, 0.01, SCREEN.z1]), 0, 0.5);
  },

  draw(k, state) {
    const { hx } = SCREEN;
    // Pulled up out of its case by `up`; rolled away, only the bar shows.
    const up = frac(state, 'up', 1);
    const slides = flag(state, 'slides', false);
    const z1 = 0.14 + (SCREEN.z1 - 0.14) * up;
    const z0 = Math.min(SCREEN.z0, z1 - 0.06);
    k.sorted((add) => {
      // The case on the floor, on little feet, and the post up the back.
      add(box3([-hx - 0.1, -0.12, 0], [hx + 0.1, 0.12, 0.14]), () => {
        for (const x of [-hx + 0.05, hx - 0.05]) {
          k.box([x - 0.05, -0.18, 0], [x + 0.05, 0.18, 0.02], MAT.graphite, { ink: INK.hair });
        }
        k.slab(-hx - 0.1, -0.1, hx + 0.1, 0.1, 0.02, 0.14, 0.05, MAT.alu, INK.panel);
      });
      if (up > 0.05) {
        add(box3([-0.03, -0.07, 0.14], [0.03, -0.02, z1]), () =>
          k.box([-0.025, -0.07, 0.14], [0.025, -0.03, z1], MAT.alu, { ink: INK.hair })
        );
      }
      add(box3([-hx, -0.02, 0.14], [hx, 0.02, z1 + 0.04]), () => {
        // The fabric, in its border, and the bar along its top.
        k.box([-hx, -0.015, 0.14], [hx, 0.015, Math.max(z1, 0.17)], MAT.graphite, {
          ink: INK.detail,
          rim: false,
          decorate: {
            '+y': () => {
              const white: V3[] = [
                [-hx + 0.06, 0.016, z0],
                [hx - 0.06, 0.016, z0],
                [hx - 0.06, 0.016, z1 - 0.06],
                [-hx + 0.06, 0.016, z1 - 0.06],
              ];
              if (z1 - z0 > 0.1) {
                k.shape(white, k.grade(white, [0, 1, 0], '#fbfbf8'), INK.hair);
                if (slides && up > 0.9) {
                  slide(k, hx, z0, z1 - 0.06);
                }
              }
            },
          },
        });
        k.box([-hx - 0.04, -0.03, z1], [hx + 0.04, 0.03, z1 + 0.04], MAT.alu, { ink: INK.detail });
      });
    });
  },
};

/** The all-hands deck, thrown on the screen: a title, a chart and a few bullets. */
function slide(k: Iso, hx: number, z0: number, z1: number): void {
  const y = 0.017;
  const x0 = -hx + 0.16;
  const x1 = hx - 0.16;
  const h = z1 - z0;
  const quad = (a: number, b: number, c: number, d: number): V3[] => [
    [a, y, c],
    [b, y, c],
    [b, y, d],
    [a, y, d],
  ];
  // A soft glow where the light lands, then the slide's own content.
  k.fill(quad(x0 - 0.06, x1 + 0.06, z0 + 0.04, z1 - 0.04), '#fff3c4', 0.35);
  k.fill(quad(x0, x1 * 0.2, z1 - h * 0.2, z1 - h * 0.1), MAT.cobalt.m);
  k.text([x0, y + 0.001, z1 - h * 0.32], [1, 0, 0], [0, 0, 1], 'Q4 all-hands', 0.13 * k.unit, {
    color: SHEET.ink,
    font: FONT.hand,
    align: 'left',
  });
  for (let i = 0; i < 3; i++) {
    const z = z1 - h * (0.48 + i * 0.13);
    k.dot([x0 + 0.04, y + 0.001, z + 0.02], 1.4, MAT.tomato.m);
    k.line(
      [
        [x0 + 0.12, y + 0.001, z + 0.02],
        [x0 + 0.9 - i * 0.2, y + 0.001, z + 0.02],
      ],
      1.2,
      false,
      SHEET.lead
    );
  }
  const bars = [0.35, 0.5, 0.45, 0.72, 0.9];
  bars.forEach((v, i) => {
    const bx = 0.25 + i * 0.22;
    k.shape(
      quad(bx, bx + 0.14, z0 + 0.12, z0 + 0.12 + v * h * 0.55),
      i === 4 ? MAT.tomato.m : MAT.mint.m,
      INK.hair
    );
  });
}
