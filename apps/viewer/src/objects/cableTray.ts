import { INK, V3 } from '../kit/iso';
import { MAT, PAL } from '../kit/palette';
import { RACK, cable } from './serverRack';
import { OfficeObject, box3 } from './types';

/**
 * The yellow ladder tray over a run of racks, on posts from their roofs:
 * rails and rungs, a bed of cables of every colour running its length, and
 * a bundle dropping from it into the back of every rack.
 *
 * Local frame: origin on the floor under the middle of the run, its front
 * (+y) the racks' front, so the tray rides over their back halves.
 */

/** Racks in a run, under one tray. */
export const RUN_RACKS = 7;

const L = RUN_RACKS * RACK.w;
const HL = L / 2;
/** Across the tray: over the back half of the racks. */
const Y0 = -RACK.d / 2 + 0.05;
const Y1 = -0.06;
/** The tray's rails, top and bottom, and where the posts stand on the racks' roofs. */
const Z0 = 2.36;
const Z1 = 2.45;
const ROOF = RACK.h;
/** Where each rack's drop comes down: over its roof's cable brush. */
const DROPS = Array.from({ length: RUN_RACKS }, (_, i) => -HL + (i + 0.5) * RACK.w);
const BRUSH_Y = -RACK.d / 2 + 0.13;

const COLORS = [PAL.blue, PAL.gold, PAL.rose, PAL.sage, PAL.pink, '#a58ee0', '#7fd0e6'];

export const cableTray: OfficeObject = {
  name: 'Cable tray',
  blurb: 'A yellow ladder tray over each run, carrying the cables from rack to rack.',
  bounds: box3([-HL - 0.05, Y0 - 0.05, ROOF], [HL + 0.05, Y1 + 0.05, Z1 + 0.1]),
  footprint: box3([-HL, Y0, ROOF], [HL, Y1, Z1]),

  shadow() {
    // It rides on the racks, so its shadow falls on their roofs, not the floor.
  },

  draw(k) {
    const back = k.facing([0, -1, 0]);
    // Posts from the racks' roofs, at every second seam.
    for (let i = 0; i <= RUN_RACKS; i += 2) {
      const x = Math.max(-HL + 0.03, Math.min(HL - 0.03, -HL + i * RACK.w));
      for (const y of [Y0 + 0.04, Y1 - 0.04]) {
        k.rod([x, y, ROOF], [x, y, Z0], 0.014, MAT.alu, INK.hair);
      }
    }
    // The drops: a bundle from the tray's floor down into each rack's brush.
    const drop = (x: number): void => {
      for (let j = 0; j < 5; j++) {
        const dx = (j - 2) * 0.018;
        cable(
          k,
          [
            [x + dx, (Y0 + Y1) / 2, Z0 + 0.02],
            [x + dx * 1.4, (Y0 + Y1) / 2 - 0.02, Z0 - 0.12],
            [x + dx, BRUSH_Y, ROOF + 0.02],
          ],
          COLORS[(j + Math.round((x + HL) * 3)) % COLORS.length],
          0.9
        );
      }
    };
    const rail = (y: number): void => {
      k.box([-HL, y - 0.018, Z0], [HL, y + 0.018, Z1], MAT.mustard, { ink: INK.panel });
    };
    // Back to front: the far rail, the drops and the bed, then the near rail.
    const [far, near] = back ? [Y1, Y0] : [Y0, Y1];
    for (const x of DROPS) {
      drop(x);
    }
    rail(far);
    // The rungs, under the cables.
    for (let x = -HL + 0.1; x < HL; x += 0.22) {
      k.fill(
        [
          [x - 0.015, Y0, Z0 + 0.01],
          [x + 0.015, Y0, Z0 + 0.01],
          [x + 0.015, Y1, Z0 + 0.01],
          [x - 0.015, Y1, Z0 + 0.01],
        ],
        MAT.mustard.d
      );
    }
    // The bed of cables, each strand wandering a little along the run.
    for (let j = 0; j < 9; j++) {
      const y = Y0 + 0.04 + (j % 5) * ((Y1 - Y0 - 0.08) / 4);
      const z = Z0 + 0.02 + Math.floor(j / 5) * 0.018;
      const pts: V3[] = [];
      for (let x = -HL; x <= HL + 1e-6; x += L / 8) {
        pts.push([x, y + Math.sin(x * 2.1 + j) * 0.012, z]);
      }
      cable(k, pts, COLORS[j % COLORS.length], 1.1);
    }
    rail(near);
    // Each end of the tray closed with a cross bar.
    for (const x of [-HL, HL]) {
      k.box([x - 0.015, Y0, Z0], [x + 0.015, Y1, Z0 + 0.03], MAT.mustard, { ink: INK.detail });
    }
  },
};
