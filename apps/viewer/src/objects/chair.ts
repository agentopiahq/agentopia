import { Box3, INK, Iso, V2, V3, ellipse, roundRect } from '../kit/iso';
import { MAT, Mat } from '../kit/palette';
import { AVATAR } from './scale';
import { OfficeObject, box3 } from './types';

/**
 * Chairs. Each is authored with its seat over the origin and its sitter
 * facing local +y (the back on the -y side), and can be turned by any angle
 * about its own middle — a desk chair pushed back and swung aside, a meeting
 * chair squared to the table — on top of the quarter turn the room places it
 * with.
 */

const rot =
  (a: number) =>
  ([x, y, z]: V3): V3 => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];

const rot2 =
  (a: number) =>
  ([x, y]: V2): V2 => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** The axis-aligned box round a set of points, for sorting a chair's parts. */
function around(pts: V3[], pad = 0.01): Box3 {
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p[i] - pad);
      hi[i] = Math.max(hi[i], p[i] + pad);
    }
  }
  return [lo, hi];
}

/**
 * Seat height, sized to the avatar: it stands about 1.9 tiles tall, but on
 * short legs, with its hips only about 0.3 tiles up. Every seat in the office
 * is at that height, so a seated avatar's hands land at the desk and table
 * tops. Exported for the rig and anything that seats someone.
 */
export const SEAT_Z = AVATAR.hip;

/**
 * An office task chair: five-star base on casters, a gas lift, an
 * upholstered seat, a mesh back on a spine, and two armrests.
 */
export function taskChair(turn: number, fabric: Mat = MAT.charcoal): OfficeObject {
  const R = rot(turn);
  const R2 = rot2(turn);
  const legs: Array<[V3, V3]> = Array.from({ length: 5 }, (_, i) => {
    const a = ((i * 72 + 18) * Math.PI) / 180;
    return [
      [0, 0, 0.08],
      [Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.05],
    ];
  });
  const seat = roundRect(-0.24, -0.22, 0.24, 0.25, 0.08).map(R2);
  const back = roundRect(-0.23, -0.3, 0.23, -0.23, 0.03).map(R2);
  const backZ: [number, number] = [SEAT_Z + 0.12, SEAT_Z + 0.52];
  const arms: Array<[V3, V3, V2[]]> = [-1, 1].map((side) => [
    R([side * 0.22, -0.02, SEAT_Z + 0.02]),
    R([side * 0.24, 0.0, SEAT_Z + 0.17]),
    roundRect(side * 0.24 - 0.035, -0.13, side * 0.24 + 0.035, 0.12, 0.03).map(R2),
  ]);
  const top = (pts: V2[], z: number): V3[] => pts.map(([x, y]) => [x, y, z]);
  return {
    name: 'Task chair',
    blurb: 'A charcoal task chair on five casters, its seat at the avatar’s hip height.',
    bounds: box3([-0.34, -0.34, 0], [0.34, 0.34, SEAT_Z + 0.56]),
    footprint: box3([-0.26, -0.26, 0], [0.26, 0.26, SEAT_Z + 0.52]),

    shadow(k) {
      k.castShadow([
        ...legs.map(([, tip]) => R(tip)),
        ...top(seat, SEAT_Z + 0.05),
        ...top(back, backZ[1]),
      ]);
    },

    draw(k) {
      k.sorted((add) => {
        // The base: five legs out from the hub, a caster under each tip.
        const base = legs.flatMap(([a, b]) => [R(a), R(b)]);
        add(around(base), () => {
          const order = legs
            .map(([a, b]) => [R(a), R(b)] as const)
            .sort((p, q) => k.depth(p[1]) - k.depth(q[1]));
          for (const [a, b] of order) {
            k.ball([b[0], b[1], 0.035], 0.035, MAT.graphite, INK.hair);
            k.rod(a, b, 0.022, MAT.graphite, INK.detail);
          }
          k.cylinder(0, 0, 0.05, 0.11, 0.055, MAT.graphite, INK.detail);
        });
        add(box3([-0.04, -0.04, 0.11], [0.04, 0.04, SEAT_Z]), () =>
          k.cylinder(0, 0, 0.11, SEAT_Z - 0.04, 0.03, MAT.alu, INK.detail)
        );
        add(around([...top(seat, SEAT_Z - 0.04), ...top(seat, SEAT_Z + 0.06)]), () => {
          k.prism(seat, 'z', SEAT_Z - 0.04, SEAT_Z + 0.02, MAT.graphite, { ink: INK.detail });
          k.prism(
            roundRect(-0.23, -0.21, 0.23, 0.24, 0.08).map(R2),
            'z',
            SEAT_Z + 0.02,
            SEAT_Z + 0.07,
            fabric,
            { ink: INK.panel }
          );
        });
        // The spine up to the back, then the back's frame and mesh.
        add(around([R([0, -0.2, SEAT_Z]), R([0, -0.27, backZ[0] + 0.05])]), () =>
          k.rod(R([0, -0.18, SEAT_Z]), R([0, -0.27, backZ[0] + 0.06]), 0.025, MAT.graphite)
        );
        add(around([...top(back, backZ[0]), ...top(back, backZ[1])]), () => {
          k.prism(back, 'z', backZ[0], backZ[1], fabric, { ink: INK.panel, cap: MAT.graphite });
          // The mesh: fine horizontal threads across the back's seen face.
          const ctx = k.ctx;
          ctx.save();
          ctx.globalAlpha *= 0.35;
          for (let z = backZ[0] + 0.06; z < backZ[1] - 0.03; z += 0.05) {
            const side = k.facing(R([0, 1, 0])) ? -0.23 : -0.3;
            k.line([R([-0.2, side, z]), R([0.2, side, z])], INK.hair, false, fabric.d);
          }
          ctx.restore();
        });
        for (const [a, b, pad] of arms) {
          add(around([a, b, ...top(pad, SEAT_Z + 0.2)]), () => {
            k.rod(a, b, 0.018, MAT.graphite, INK.hair);
            k.prism(pad, 'z', SEAT_Z + 0.17, SEAT_Z + 0.2, MAT.graphite, { ink: INK.detail });
          });
        }
      });
    },
  };
}

/**
 * A meeting-room chair: an upholstered shell on four slim aluminium legs.
 */
export function meetingChair(turn: number, shell: Mat): OfficeObject {
  const R = rot(turn);
  const R2 = rot2(turn);
  const feet: V3[] = [
    [-0.2, -0.2, 0],
    [0.2, -0.2, 0],
    [0.2, 0.2, 0],
    [-0.2, 0.2, 0],
  ];
  const seat = roundRect(-0.23, -0.21, 0.23, 0.23, 0.1).map(R2);
  const back = roundRect(-0.22, -0.26, 0.22, -0.19, 0.035).map(R2);
  const top = (pts: V2[], z: number): V3[] => pts.map(([x, y]) => [x, y, z]);
  return {
    name: 'Meeting chair',
    blurb: 'A meeting-room chair: an upholstered shell on four slim legs.',
    bounds: box3([-0.32, -0.32, 0], [0.32, 0.32, SEAT_Z + 0.46]),
    footprint: box3([-0.24, -0.24, 0], [0.24, 0.24, SEAT_Z + 0.44]),

    shadow(k) {
      k.castShadow([...feet.map(R), ...top(seat, SEAT_Z), ...top(back, SEAT_Z + 0.44)]);
    },

    draw(k) {
      k.sorted((add) => {
        const legs = feet.map((f) => [R(f), R([f[0] * 0.8, f[1] * 0.8, SEAT_Z - 0.04])] as const);
        for (const [a, b] of legs) {
          add(around([a, b]), () => k.rod(a, b, 0.018, MAT.alu, INK.detail));
        }
        add(around([...top(seat, SEAT_Z - 0.04), ...top(seat, SEAT_Z + 0.05)]), () =>
          k.prism(seat, 'z', SEAT_Z - 0.04, SEAT_Z + 0.05, shell, { ink: INK.panel })
        );
        add(around([...top(back, SEAT_Z + 0.05), ...top(back, SEAT_Z + 0.44)]), () =>
          k.prism(back, 'z', SEAT_Z + 0.05, SEAT_Z + 0.44, shell, { ink: INK.panel })
        );
      });
    },
  };
}

/** A round stool on a single post, for a phone booth. */
export function drawStool(k: Iso, x: number, y: number, z0 = 0, h = SEAT_Z): void {
  k.cylinder(x, y, z0, z0 + 0.03, 0.16, MAT.graphite, INK.detail);
  k.cylinder(x, y, z0 + 0.03, z0 + h - 0.05, 0.025, MAT.alu, INK.hair);
  k.prism(ellipse(x, y, 0.17, 0.17, 18), 'z', z0 + h - 0.05, z0 + h, MAT.tomato, {
    ink: INK.detail,
  });
}
