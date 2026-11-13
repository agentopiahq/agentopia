import { INK, Iso, V2, V3 } from '../kit/iso';
import { MAT, Mat } from '../kit/palette';

/** A glass door leaf on its hinge: where it hangs, how big, which way it swings. */
export interface GlassLeaf {
  /** The hinge's floor point, local. */
  hinge: V2;
  /** The leaf's direction from the hinge while shut, a unit vector. */
  along: V2;
  /** How far it has swung, in radians; positive turns `along` toward +y's side of it. */
  swing: number;
  len: number;
  z0: number;
  z1: number;
  /** The frame's material. */
  frame: Mat;
  /** The pull: how far along the leaf, and its bottom and top. */
  pull: { t: number; z0: number; z1: number };
}

/**
 * A framed glass leaf swung on its hinge: the pane, a highlight, its frame
 * edge-on (rails top and bottom) once it is open, and a bar pull on
 * whichever face shows. Swung shut it lies exactly where a fixed pane would.
 */
export function glassLeaf(k: Iso, leaf: GlassLeaf): void {
  const { hinge, len, z0, z1, pull } = leaf;
  const c = Math.cos(leaf.swing);
  const s = Math.sin(leaf.swing);
  // Turn `along` by the swing, toward its left normal.
  const d: V2 = [leaf.along[0] * c - leaf.along[1] * s, leaf.along[0] * s + leaf.along[1] * c];
  const n: V2 = [-d[1], d[0]];
  const at = (t: number, z: number, out = 0): V3 => [
    hinge[0] + d[0] * t + n[0] * out,
    hinge[1] + d[1] * t + n[1] * out,
    z,
  ];
  const pane: V3[] = [at(0, z0), at(len, z0), at(len, z1), at(0, z1)];
  k.fill(pane, MAT.glass.l, 0.3);
  k.fill(
    [
      at(len * 0.08, z0 + 0.2),
      at(len * 0.2, z0 + 0.2),
      at(len * 0.41, z1 - 0.16),
      at(len * 0.29, z1 - 0.16),
    ],
    '#ffffff',
    0.3
  );
  k.line(pane, INK.hair, true, leaf.frame.d);
  if (Math.abs(leaf.swing) > 0.02) {
    const flat = (t0: number, t1: number): V2[] =>
      [at(t0, 0, -0.02), at(t1, 0, -0.02), at(t1, 0, 0.02), at(t0, 0, 0.02)].map((p): V2 => [
        p[0],
        p[1],
      ]);
    k.prism(flat(0, len), 'z', z0 - 0.04, z0, leaf.frame, { ink: INK.hair });
    k.prism(flat(0, len), 'z', z1, z1 + 0.04, leaf.frame, { ink: INK.hair });
    k.prism(flat(len - 0.04, len), 'z', z0, z1, leaf.frame, { ink: INK.hair });
  }
  const out = k.facing([n[0], n[1], 0]) ? 0.06 : -0.06;
  k.rod(at(pull.t, pull.z0, out), at(pull.t, pull.z1, out), 0.016, MAT.alu);
}
