import { INK, Iso, V3, ellipse, lift, plane, roundRect } from '../kit/iso';
import { ACCENT, MAT, PAL, SHEET, mix } from '../kit/palette';
import { drawStool } from './chair';
import { OfficeObject, box3 } from './types';

/**
 * The rooms within the room: the glass partitions and door of the meeting
 * room, its table and screen, and the phone booths. Partitions are authored
 * one tile long, running along local x at y = 0, so a side of any whole
 * number of tiles is a row of them.
 */

/** How tall the partitions stand. */
export const GLASS_H = 2.3;
const T = 0.035;

/** Clear glass: a cool tint over whatever is behind, and a streak of reflection. */
function glass(k: Iso, x0: number, x1: number, z0: number, z1: number, y = 0): void {
  const pane: V3[] = [
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
  ];
  k.fill(pane, MAT.glass.l, 0.28);
  const ctx = k.ctx;
  ctx.save();
  ctx.globalAlpha *= 0.3;
  const w = x1 - x0;
  k.fill(
    [
      [x0 + w * 0.15, y, z0 + 0.1],
      [x0 + w * 0.3, y, z0 + 0.1],
      [x0 + w * 0.62, y, z1 - 0.1],
      [x0 + w * 0.47, y, z1 - 0.1],
    ],
    '#ffffff',
    0.5
  );
  ctx.restore();
  // The frosted manifestation band at eye height, so nobody walks into it.
  k.fill(
    [
      [x0, y, 1.2],
      [x1, y, 1.2],
      [x1, y, 1.34],
      [x0, y, 1.34],
    ],
    '#ffffff',
    0.55
  );
}

type Leaf = 'panel' | 'doorLeft' | 'doorRight';

/**
 * One panel of glass partition, `w` tiles long: aluminium head and sill
 * rails, stiles at each end. A door leaf has no sill to step over, its pull
 * on the side that meets its partner: the meeting room's door is a pair, two
 * tiles wide, so the avatar walks in without turning sideways.
 */
function partition(leaf: Leaf, w = 1): OfficeObject {
  const hw = w / 2;
  const door = leaf !== 'panel';
  return {
    name: door ? 'Glass door' : 'Glass partition',
    blurb: door
      ? 'One leaf of the meeting room’s double glass door: no sill, a long pull.'
      : 'One panel of the meeting room’s glass wall: clear, with a frosted band.',
    bounds: box3([-hw - 0.02, -0.1, 0], [hw + 0.02, 0.1, GLASS_H + 0.02]),
    footprint: box3([-hw, -T, 0], [hw, T, GLASS_H]),

    shadow(k) {
      // Glass throws a faint shadow; the rails a firmer one.
      if (!door) {
        k.castShadow(Iso.corners([-hw, -T, 0], [hw, T, 0.08]));
      }
      k.castShadow(Iso.corners([-hw, -T, 0], [hw, T, GLASS_H]), 0, 0.18);
    },

    draw(k) {
      const sill = door ? 0.02 : 0.08;
      k.box([-hw, -T, 0], [hw, T, sill], MAT.alu, { ink: INK.detail });
      glass(k, -hw + 0.03, hw - 0.03, sill, GLASS_H - 0.06, k.facing([0, 1, 0]) ? T : -T);
      if (door) {
        // The pull, on whichever face shows, at the edge that meets the other leaf.
        const y = k.facing([0, 1, 0]) ? T + 0.01 : -T - 0.01;
        const px = leaf === 'doorLeft' ? hw - 0.12 : -hw + 0.12;
        k.rod(
          [px, y + Math.sign(y) * 0.04, 0.6],
          [px, y + Math.sign(y) * 0.04, 1.4],
          0.016,
          MAT.alu
        );
        if (leaf === 'doorLeft') {
          k.text([0, y, 1.245], [Math.sign(y), 0, 0], [0, 0, 1], 'MEETING', 0.075 * k.unit, {
            color: SHEET.lead,
            weight: '600',
          });
        }
      }
      k.box([-hw, -T, GLASS_H - 0.06], [hw, T, GLASS_H], MAT.alu, { ink: INK.detail });
      for (const x of [-hw, hw - 0.03]) {
        k.box([x, -T, sill], [x + 0.03, T, GLASS_H - 0.06], MAT.alu, { ink: INK.hair });
      }
    },
  };
}

export const glassPanel = partition('panel');
export const glassPanelHalf = partition('panel', 0.5);
export const glassDoorLeft = partition('doorLeft');
export const glassDoorRight = partition('doorRight');

/** Table height: the desk's, less a little, for a seated avatar. */
const TABLE = { hx: 1.5, hy: 0.5, z: 0.66 } as const;

export const meetingTable: OfficeObject = {
  name: 'Meeting table',
  blurb: 'An oak meeting table on two trestles: laptops, a speakerphone, coffee.',
  bounds: box3([-1.6, -0.6, 0], [1.6, 0.6, 1.0]),
  footprint: box3([-TABLE.hx, -TABLE.hy, 0], [TABLE.hx, TABLE.hy, TABLE.z]),

  shadow(k) {
    k.castShadow(
      Iso.corners([-TABLE.hx, -TABLE.hy, TABLE.z - 0.06], [TABLE.hx, TABLE.hy, TABLE.z])
    );
    for (const x of [-1.1, 1.1]) {
      k.castShadow(Iso.corners([x - 0.05, -0.36, 0], [x + 0.05, 0.36, TABLE.z]), 0, 0.6);
    }
  },

  draw(k) {
    const z = TABLE.z;
    k.sorted((add) => {
      for (const x of [-1.1, 1.1]) {
        add(box3([x - 0.05, -0.38, 0], [x + 0.05, 0.38, z - 0.06]), () => {
          k.box([x - 0.05, -0.38, 0], [x + 0.05, 0.38, 0.05], MAT.graphite, { ink: INK.detail });
          k.box([x - 0.035, -0.04, 0.05], [x + 0.035, 0.04, z - 0.06], MAT.graphite, {
            ink: INK.detail,
          });
          k.box([x - 0.04, -0.34, z - 0.1], [x + 0.04, 0.34, z - 0.06], MAT.graphite, {
            ink: INK.detail,
          });
        });
      }
      add(box3([-TABLE.hx, -TABLE.hy, z - 0.06], [TABLE.hx, TABLE.hy, z]), () => {
        k.slab(-TABLE.hx, -TABLE.hy, TABLE.hx, TABLE.hy, z - 0.06, z, 0.2, MAT.oak, INK.silhouette);
        // A cable port in the middle, with the speakerphone over it.
        k.prism(ellipse(0, 0, 0.16, 0.16, 18), 'z', z, z + 0.035, MAT.graphite, {
          ink: INK.detail,
        });
        k.dot([0, 0, z + 0.036], 1.4, ACCENT.ledGreen);
      });
      // Two open laptops and a few cups.
      const laptop = (x: number, y: number, facing: 1 | -1): void => {
        const d = 0.17 * facing;
        add(box3([x - 0.2, y - 0.2, z], [x + 0.2, y + 0.2, z + 0.25]), () => {
          k.slab(x - 0.18, y - 0.13, x + 0.18, y + 0.13, z, z + 0.02, 0.02, MAT.alu, INK.detail);
          // The lid, tipped back from the far edge.
          const hinge = y - d * 0.75;
          const lid: V3[] = [
            [x - 0.18, hinge, z + 0.02],
            [x + 0.18, hinge, z + 0.02],
            [x + 0.18, hinge - d * 0.25, z + 0.24],
            [x - 0.18, hinge - d * 0.25, z + 0.24],
          ];
          k.shape(lid, MAT.alu.m, INK.detail);
          const inner = lid.map(([px, py, pz]): V3 => [
            px * 0.9 + x * 0.1,
            py + d * 0.01,
            pz === z + 0.02 ? z + 0.04 : z + 0.22,
          ]);
          k.fill(inner, mix(PAL.sky, '#ffffff', 0.2));
        });
      };
      laptop(-0.6, -0.18, 1);
      laptop(0.55, 0.2, -1);
      for (const [x, y, c] of [
        [0.1, -0.3, MAT.trim],
        [-0.25, 0.28, MAT.tomato],
        [1.05, -0.2, MAT.trim],
      ] as const) {
        add(box3([x - 0.06, y - 0.06, z], [x + 0.06, y + 0.06, z + 0.12]), () =>
          k.cylinder(x, y, z, z + 0.11, 0.05, c, INK.detail)
        );
      }
    });
  },
};

/** A wall-hung screen for the meeting room: a big dark panel, a soft glare. */
export const screen: OfficeObject = {
  name: 'Screen',
  blurb: 'The meeting room’s wall screen, showing the agenda.',
  bounds: box3([-1.0, 0, 0.9], [1.0, 0.12, 2.25]),
  footprint: box3([-0.95, 0, 1.0], [0.95, 0.08, 2.2]),
  shadow() {},
  draw(k) {
    k.box([-0.95, 0, 1.1], [0.95, 0.06, 2.15], MAT.graphite, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          const s: V3[] = [
            [-0.9, 0.061, 1.15],
            [0.9, 0.061, 1.15],
            [0.9, 0.061, 2.1],
            [-0.9, 0.061, 2.1],
          ];
          k.shape(s, k.grade(s, [0, 1, 0], '#2c4a7a'), INK.hair);
          // The agenda: a title bar and a few lines.
          k.fill(
            [
              [-0.8, 0.062, 1.88],
              [0.2, 0.062, 1.88],
              [0.2, 0.062, 1.98],
              [-0.8, 0.062, 1.98],
            ],
            PAL.cream
          );
          for (let i = 0; i < 4; i++) {
            const zz = 1.74 - i * 0.13;
            k.line(
              [
                [-0.8, 0.062, zz],
                [0.4 - i * 0.18, 0.062, zz],
              ],
              1.2,
              false,
              mix(PAL.sky, '#ffffff', 0.3)
            );
          }
          k.fill(
            [
              [0.45, 0.062, 1.25],
              [0.82, 0.062, 1.25],
              [0.82, 0.062, 1.7],
              [0.45, 0.062, 1.7],
            ],
            PAL.gold,
            0.9
          );
        },
      },
    });
  },
};

/** A booth the avatar fits in: its door as wide as the avatar, its roof clear of its head. */
const BOOTH = { hx: 0.9, hy: 0.85, h: 2.3 } as const;

/**
 * A phone booth: a felt-panelled pod with a glass front door and a glass
 * side, a roof with a vent and a light, and inside a stool, a little shelf
 * and an acoustic back panel. Its front (+y) faces the open floor.
 */
export const booth: OfficeObject = {
  name: 'Phone booth',
  blurb: 'A phone booth for one: felt walls, a glass door, a stool and a shelf.',
  bounds: box3([-1.0, -0.95, 0], [1.0, 0.95, BOOTH.h + 0.1]),
  footprint: box3([-BOOTH.hx, -BOOTH.hy, 0], [BOOTH.hx, BOOTH.hy, BOOTH.h]),

  shadow(k) {
    k.castShadow(Iso.corners([-BOOTH.hx, -BOOTH.hy, 0], [BOOTH.hx, BOOTH.hy, BOOTH.h]));
  },

  draw(k) {
    const { hx, hy, h } = BOOTH;
    const f = 0.07;
    const felt = MAT.ochre;
    // Draw the far walls first, then the inside, then the near walls, so
    // whichever way it is turned the glass and felt stack the right way.
    const walls: Array<{ n: V3; draw: () => void }> = [
      {
        n: [0, -1, 0],
        draw: () => k.box([-hx, -hy, 0.08], [hx, -hy + f, h - 0.12], felt, { ink: INK.detail }),
      },
      {
        n: [1, 0, 0],
        draw: () => k.box([hx - f, -hy, 0.08], [hx, hy, h - 0.12], felt, { ink: INK.detail }),
      },
      {
        n: [-1, 0, 0],
        draw: () => {
          // A glass side, framed.
          k.box([-hx, -hy, 0.08], [-hx + 0.04, -hy + 0.06, h - 0.12], MAT.graphite, {
            ink: INK.hair,
          });
          k.box([-hx, hy - 0.06, 0.08], [-hx + 0.04, hy, h - 0.12], MAT.graphite, {
            ink: INK.hair,
          });
          const pane: V3[] = [
            [-hx + 0.02, -hy + 0.06, 0.1],
            [-hx + 0.02, hy - 0.06, 0.1],
            [-hx + 0.02, hy - 0.06, h - 0.14],
            [-hx + 0.02, -hy + 0.06, h - 0.14],
          ];
          k.fill(pane, MAT.glass.l, 0.3);
          k.line(pane, INK.hair, true, MAT.graphite.d);
        },
      },
      {
        n: [0, 1, 0],
        draw: () => {
          // The glass door, a graphite frame round it and a bar pull.
          const y = hy - 0.02;
          k.box([-hx, y - 0.02, 0.08], [-hx + 0.06, hy, h - 0.12], MAT.graphite, { ink: INK.hair });
          k.box([hx - 0.06, y - 0.02, 0.08], [hx, hy, h - 0.12], MAT.graphite, { ink: INK.hair });
          const pane: V3[] = [
            [-hx + 0.06, y, 0.1],
            [hx - 0.06, y, 0.1],
            [hx - 0.06, y, h - 0.14],
            [-hx + 0.06, y, h - 0.14],
          ];
          k.fill(pane, MAT.glass.l, 0.3);
          k.fill(
            [
              [-hx + 0.2, y, 0.3],
              [-hx + 0.4, y, 0.3],
              [-hx + 0.75, y, h - 0.3],
              [-hx + 0.55, y, h - 0.3],
            ],
            '#ffffff',
            0.3
          );
          k.line(pane, INK.hair, true, MAT.graphite.d);
          k.rod([hx - 0.16, hy + 0.04, 0.8], [hx - 0.16, hy + 0.04, 1.4], 0.016, MAT.alu);
        },
      },
    ];
    const far = walls.filter((w) => !k.facing(w.n));
    const near = walls.filter((w) => k.facing(w.n));
    k.box([-hx, -hy, 0], [hx, hy, 0.08], MAT.graphite, { ink: INK.panel });
    for (const w of far) {
      w.draw();
    }
    // Inside: a carpet, the stool, a shelf on the back wall, a little lamp.
    k.fill(lift(plane.z(0.081), roundRect(-hx + f, -hy + f, hx - f, hy - 0.03, 0.02)), MAT.felt.m);
    k.box([-0.4, -hy + f, 0.7], [0.4, -hy + f + 0.24, 0.74], MAT.oak, { ink: INK.detail });
    k.box([-0.12, -hy + f + 0.04, 0.74], [0.1, -hy + f + 0.17, 0.75], MAT.graphite, {
      ink: INK.hair,
    });
    drawStool(k, 0, 0.05, 0.08);
    for (const w of near) {
      w.draw();
    }
    // The roof, its vent and its light strip.
    k.box([-hx - 0.02, -hy - 0.02, h - 0.12], [hx + 0.02, hy + 0.02, h], felt, {
      ink: INK.silhouette,
      decorate: {
        '+z': () => {
          k.shape(
            lift(plane.z(h + 0.001), roundRect(-0.25, -0.25, 0.25, 0.25, 0.04)),
            MAT.graphite.m,
            INK.hair
          );
          for (let i = 0; i < 4; i++) {
            const x = -0.18 + i * 0.12;
            k.line(
              [
                [x, -0.18, h + 0.002],
                [x, 0.18, h + 0.002],
              ],
              INK.hair,
              false,
              MAT.graphite.d
            );
          }
        },
      },
    });
    k.dot([hx - 0.12, hy + 0.025, h - 0.06], 1.6, ACCENT.ledGreen);
  },
};

/** A water cooler: a blue bottle upside down on a white cabinet. */
export const waterCooler: OfficeObject = {
  name: 'Water cooler',
  blurb: 'The water cooler, where helpers would gossip if they stayed long enough.',
  bounds: box3([-0.3, -0.3, 0], [0.3, 0.3, 1.6]),
  footprint: box3([-0.22, -0.22, 0], [0.22, 0.22, 1.55]),
  shadow(k) {
    k.castShadow([...Iso.corners([-0.22, -0.22, 0], [0.22, 0.22, 1.0]), [0, 0, 1.55]]);
  },
  draw(k) {
    k.box([-0.22, -0.22, 0], [0.22, 0.22, 1.0], MAT.laminate, {
      ink: INK.silhouette,
      decorate: {
        '+y': () => {
          k.shape(
            [
              [-0.14, 0.22, 0.62],
              [0.14, 0.22, 0.62],
              [0.14, 0.22, 0.86],
              [-0.14, 0.22, 0.86],
            ],
            MAT.graphite.m,
            INK.hair
          );
          k.dot([-0.06, 0.22, 0.8], 1.6, ACCENT.ledBlue, INK.hair);
          k.dot([0.06, 0.22, 0.8], 1.6, ACCENT.ledRed, INK.hair);
          k.line(
            [
              [-0.1, 0.22, 0.66],
              [0.1, 0.22, 0.66],
            ],
            1.2,
            false,
            MAT.alu.l
          );
        },
      },
    });
    k.cylinder(0, 0, 1.0, 1.05, 0.12, MAT.graphite, INK.detail);
    k.prism(ellipse(0, 0, 0.17, 0.17, 20), 'z', 1.05, 1.45, MAT.cobalt, { ink: INK.panel });
    k.cylinder(0, 0, 1.45, 1.53, 0.09, MAT.cobalt, INK.detail);
    // The water line inside the bottle.
    k.line(
      lift(plane.z(1.32), ellipse(0, 0, 0.17, 0.17, 20).slice(14, 21)),
      INK.hair,
      false,
      '#ffffff'
    );
  },
};
