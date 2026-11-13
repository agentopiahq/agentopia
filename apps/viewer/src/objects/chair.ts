import { Box3, INK, Iso, V2, V3, ellipse, roundRect } from '../kit/iso';
import { MAT, Mat } from '../kit/palette';
import { AVATAR } from './scale';
import { OfficeObject, PieceState, box3, frac } from './types';

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
 * How a task chair can be pushed in under someone sitting at it: its centre
 * in its own local frame once fully tucked, and the state keys that move it.
 * `tucked` (0 aside, 1 in) slides it from where the room stands it to `at`
 * and squares it up; `spin` (radians) swivels it about its post on top, so
 * whoever sits in it can turn from the desk to the room.
 */
export interface Tuck {
  at: V2;
}

/** How far a chair is pushed in, and swivelled, for a state. */
export function chairPose(state: PieceState | undefined): { tucked: number; spin: number } {
  const spin = state?.spin;
  return {
    tucked: frac(state, 'tucked', 0),
    spin: typeof spin === 'number' && Number.isFinite(spin) ? spin : 0,
  };
}

/** Seat cushion top: where a sitter's torso rests. */
export const SEAT_TOP_Z = SEAT_Z + 0.07;
/** The task chair's armrest pads: where a seated avatar's hands rest. */
export const ARMREST_Z = SEAT_Z + 0.2;

/**
 * The task chair's widths, in tiles from its middle, sized to the avatar
 * rather than to a person: its torso is wider for its height than ours, so a
 * chair of ordinary width sits *in front of* it, seen from behind, instead of
 * round it. The seat and backrest are wider than the avatar's hips
 * (`AVATAR.hips`), the armrests clear them either side, and the backrest
 * comes up to where its head begins.
 */
export const TASK = {
  seat: 0.34,
  back: 0.33,
  arm: 0.37,
  /** The five-star base's reach. */
  base: 0.3,
  /** Its footprint's half-width, and how far its drawing reaches. */
  half: 0.4,
  reach: 0.46,
  backTop: SEAT_Z + 0.58,
} as const;

/**
 * An office task chair: five-star base on casters, a gas lift, an
 * upholstered seat, a mesh back on a spine, and two armrests. `turn` is how
 * it stands swung aside; with a `tuck` its state can slide it in under a
 * sitter (see `Tuck`).
 */
export function taskChair(turn: number, fabric: Mat = MAT.charcoal, tuck?: Tuck): OfficeObject {
  const layout = (state?: PieceState) => {
    const { tucked, spin } = tuck ? chairPose(state) : { tucked: 0, spin: 0 };
    const a = turn * (1 - tucked) + spin;
    const dx = tuck ? tuck.at[0] * tucked : 0;
    const dy = tuck ? tuck.at[1] * tucked : 0;
    const r3 = rot(a);
    const r2 = rot2(a);
    const R = (p: V3): V3 => {
      const [x, y, z] = r3(p);
      return [x + dx, y + dy, z];
    };
    const R2 = (p: V2): V2 => {
      const [x, y] = r2(p);
      return [x + dx, y + dy];
    };
    const legs: Array<[V3, V3]> = Array.from({ length: 5 }, (_, i) => {
      const la = ((i * 72 + 18) * Math.PI) / 180;
      return [
        [0, 0, 0.08],
        [Math.cos(la) * TASK.base, Math.sin(la) * TASK.base, 0.05],
      ];
    });
    return {
      R,
      R2,
      dx,
      dy,
      legs,
      seat: roundRect(-TASK.seat, -0.22, TASK.seat, 0.25, 0.08).map(R2),
      back: roundRect(-TASK.back, -0.3, TASK.back, -0.23, 0.03).map(R2),
      arms: [-1, 1].map((side): [V3, V3, V2[]] => [
        R([side * (TASK.arm - 0.02), -0.02, SEAT_Z + 0.02]),
        R([side * TASK.arm, 0.0, SEAT_Z + 0.17]),
        roundRect(side * TASK.arm - 0.035, -0.13, side * TASK.arm + 0.035, 0.12, 0.03).map(R2),
      ]),
    };
  };
  const backZ: [number, number] = [SEAT_Z + 0.12, TASK.backTop];
  const top = (pts: V2[], z: number): V3[] => pts.map(([x, y]) => [x, y, z]);
  const footprint = box3([-TASK.half, -0.3, 0], [TASK.half, 0.3, TASK.backTop]);
  // Room enough for it at either end of its slide.
  const reach = tuck ? Math.hypot(tuck.at[0], tuck.at[1]) : 0;
  const lo = (v: number): number => Math.min(-TASK.reach, v - TASK.reach);
  const hi = (v: number): number => Math.max(TASK.reach, v + TASK.reach);
  const tx = tuck ? tuck.at[0] : 0;
  const ty = tuck ? tuck.at[1] : 0;
  return {
    name: 'Task chair',
    blurb: 'A charcoal task chair on five casters, its seat at the avatar’s hip height.',
    bounds:
      reach > 0
        ? box3([lo(tx), lo(ty), 0], [hi(tx), hi(ty), TASK.backTop + 0.04])
        : box3([-TASK.reach, -TASK.reach, 0], [TASK.reach, TASK.reach, TASK.backTop + 0.04]),
    footprint,
    footprintOf(state) {
      const { dx, dy } = layout(state);
      return box3(
        [footprint[0][0] + dx, footprint[0][1] + dy, 0],
        [footprint[1][0] + dx, footprint[1][1] + dy, footprint[1][2]]
      );
    },

    shadow(k, state) {
      const { R, legs, seat, back } = layout(state);
      k.castShadow([
        ...legs.map(([, tip]) => R(tip)),
        ...top(seat, SEAT_Z + 0.05),
        ...top(back, backZ[1]),
      ]);
    },

    draw(k, state) {
      const { R, R2, legs, seat, back, arms } = layout(state);
      const hub = R([0, 0, 0]);
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
          k.cylinder(hub[0], hub[1], 0.05, 0.11, 0.055, MAT.graphite, INK.detail);
        });
        add(
          box3([hub[0] - 0.04, hub[1] - 0.04, 0.11], [hub[0] + 0.04, hub[1] + 0.04, SEAT_Z]),
          () => k.cylinder(hub[0], hub[1], 0.11, SEAT_Z - 0.04, 0.03, MAT.alu, INK.detail)
        );
        add(around([...top(seat, SEAT_Z - 0.04), ...top(seat, SEAT_Z + 0.06)]), () => {
          k.prism(seat, 'z', SEAT_Z - 0.04, SEAT_Z + 0.02, MAT.graphite, { ink: INK.detail });
          k.prism(
            roundRect(-TASK.seat + 0.01, -0.21, TASK.seat - 0.01, 0.24, 0.08).map(R2),
            'z',
            SEAT_Z + 0.02,
            SEAT_TOP_Z,
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
          const behind = R([0, 1, 0]);
          const front = k.facing([behind[0] - hub[0], behind[1] - hub[1], 0]);
          for (let z = backZ[0] + 0.06; z < backZ[1] - 0.03; z += 0.05) {
            const side = front ? -0.23 : -0.3;
            k.line(
              [R([-TASK.back + 0.03, side, z]), R([TASK.back - 0.03, side, z])],
              INK.hair,
              false,
              fabric.d
            );
          }
          ctx.restore();
        });
        for (const [a, b, pad] of arms) {
          add(around([a, b, ...top(pad, ARMREST_Z)]), () => {
            k.rod(a, b, 0.018, MAT.graphite, INK.hair);
            k.prism(pad, 'z', ARMREST_Z - 0.03, ARMREST_Z, MAT.graphite, { ink: INK.detail });
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
