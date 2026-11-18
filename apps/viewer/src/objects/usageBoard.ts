import { INK, Iso, V3 } from '../kit/iso';
import { MAT, SHEET, mix } from '../kit/palette';
import { plain } from '../styles/context';
import { SAMPLE_GLANCE, UsageBoardState, UsageGlance, money, tokens } from '../usage';
import { OfficeObject, PieceState, box3 } from './types';
import { glare, marker } from './wall';

/**
 * The usage board: a whiteboard hung over the print corner where the office
 * keeps its tally — what today's work has cost at API rates, the last seven
 * days as marker bars, the week and the month, and who spent it on sticky
 * notes. It is a glance; a click opens the whole ledger (`usagePanel.ts`).
 *
 * Its numbers come in its state (`usage`: a `UsageBoardState`); without one
 * it shows a believable sample day, as every object shows how it is authored.
 * Local frame as every wall piece: the wall is y = 0, the face toward +y.
 */

/** The board's face, local: high enough to hang over the copier and printer. */
export const USAGE_BOARD = { x0: -1.4, x1: 1.4, z0: 1.58, z1: 2.68 } as const;

const BLUE = '#2f5fb0';
const NOTE = '#f6d26b';

/** The board's numbers from its state: a glance, a message, or the sample. */
export function usageStateOf(state?: PieceState): UsageBoardState {
  const usage = state?.usage;
  if (usage === 'reading' || usage === 'none') {
    return usage;
  }
  return usage && typeof usage === 'object' ? (usage as UsageGlance) : SAMPLE_GLANCE;
}

/** A flat marker-drawn rectangle on the face at depth y: filled, outlined. */
function bar(
  k: Iso,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  fill: string
): void {
  const pts: V3[] = [
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
  ];
  k.fill(pts, fill, 0.85);
  k.line(pts, 1.1, true, mix(fill, '#000000', 0.35));
}

/** The seven days as bars over a baseline, today's in red, each with its initial. */
function chart(k: Iso, glance: UsageGlance | null, y: number): void {
  const x0 = -0.08;
  const x1 = 0.66;
  const base = USAGE_BOARD.z0 + 0.2;
  const top = USAGE_BOARD.z1 - 0.3;
  const days = glance?.days ?? [];
  const peak = Math.max(0.01, ...days.map((d) => d.cost));
  const slot = (x1 - x0) / 7;
  k.line(
    [
      [x0 - 0.03, y, top + 0.02],
      [x0 - 0.03, y, base],
      [x1 + 0.02, y, base],
    ],
    1.0,
    false,
    MAT.graphite.d
  );
  days.forEach((d, i) => {
    const bx = x0 + i * slot + slot * 0.18;
    const today = i === days.length - 1;
    const h = (d.cost / peak) * (top - base);
    if (h > 0.004) {
      bar(k, bx, bx + slot * 0.64, base, base + h, y, today ? MAT.tomato.m : MAT.cobalt.m);
    }
    marker(k, [bx + slot * 0.32, base - 0.11], y, d.label, 0.075, MAT.graphite.d, 'center');
  });
}

/** Today's spend by agent, one sticky note each, down the right edge. */
function notes(k: Iso, glance: UsageGlance, y: number): void {
  const x0 = 0.84;
  const x1 = 1.3;
  glance.agents.slice(0, 3).forEach((a, i) => {
    const z1 = USAGE_BOARD.z1 - 0.12 - i * 0.3;
    const z0 = z1 - 0.25;
    const tilt = (i % 2 === 0 ? 1 : -1) * 0.012;
    const pts: V3[] = [
      [x0, y, z0 + tilt],
      [x1, y, z0 - tilt],
      [x1, y, z1 - tilt],
      [x0, y, z1 + tilt],
    ];
    k.fill(
      pts.map((p): V3 => [p[0] + 0.012, p[1], p[2] - 0.015]),
      SHEET.shadow,
      0.25
    );
    k.shape(pts, NOTE, INK.hair);
    const ny = y + 0.001;
    marker(k, [x0 + 0.04, z1 - 0.1], ny, a.label.slice(0, 12), 0.062, MAT.graphite.d);
    marker(k, [x1 - 0.04, z0 + 0.04], ny, money(a.cost), 0.072, BLUE, 'right');
  });
}

export const usageBoard: OfficeObject = {
  name: 'Usage board',
  blurb: "The usage board: today's API-rate cost, the week in bars, and who spent it.",
  bounds: box3([-1.5, 0, 1.45], [1.5, 0.22, 2.75]),
  footprint: box3([-1.45, 0, 1.5], [1.45, 0.16, 2.7]),

  shadow(k) {
    // Hung on the wall, it throws a thin shadow down the paint below it.
    k.fill(
      [
        [-1.2, 0.001, USAGE_BOARD.z0 - 0.12],
        [1.08, 0.001, USAGE_BOARD.z0 - 0.12],
        [1.08, 0.001, USAGE_BOARD.z0 - 0.06],
        [-1.2, 0.001, USAGE_BOARD.z0 - 0.06],
      ],
      SHEET.shadow,
      k.shadowAlpha * 0.5
    );
  },

  draw(k, state) {
    const usage = usageStateOf(state);
    const glance = typeof usage === 'object' ? usage : null;
    const { x0, x1, z0, z1 } = USAGE_BOARD;
    const y = 0.07;
    k.box([x0, 0, z0], [x1, y, z1], MAT.alu, {
      ink: INK.silhouette,
      decorate: {
        // The tally is what the board shows, like a monitor's screen: it keeps its colours.
        '+y': () =>
          plain(k.ctx, () => {
            const face: V3[] = [
              [x0 + 0.06, y, z0 + 0.06],
              [x1 - 0.06, y, z0 + 0.06],
              [x1 - 0.06, y, z1 - 0.06],
              [x0 + 0.06, y, z1 - 0.06],
            ];
            k.shape(face, k.grade(face, [0, 1, 0], '#fbfcfa'), INK.hair);
            const yy = y + 0.001;
            marker(k, [x0 + 0.16, z1 - 0.2], yy, 'USAGE', 0.13, BLUE);
            k.line(
              [
                [x0 + 0.15, yy, z1 - 0.25],
                [x0 + 0.62, yy, z1 - 0.24],
              ],
              1.1,
              false,
              BLUE
            );
            marker(k, [x0 + 0.68, z1 - 0.2], yy, 'today', 0.085, MAT.tomato.d);
            if (glance) {
              // As big as fits before the chart: a short sum bigger than a long one.
              const sum = money(glance.today.cost);
              const big = sum.length <= 5 ? 0.34 : sum.length <= 7 ? 0.28 : 0.22;
              marker(k, [x0 + 0.14, z1 - 0.58], yy, sum, big, BLUE);
              const small = (text: string, z: number): void =>
                marker(k, [x0 + 0.16, z], yy, text, 0.075, MAT.graphite.d);
              small(`${tokens(glance.today.tokens)} tokens`, z1 - 0.78);
              small(`week ${money(glance.week)}`, z0 + 0.2);
              small(`month ${money(glance.month)}`, z0 + 0.1);
            } else {
              const note = usage === 'reading' ? 'adding up…' : 'no usage here';
              marker(k, [x0 + 0.16, z1 - 0.6], yy, note, 0.12, SHEET.lead);
            }
            chart(k, glance, yy);
            if (glance) {
              notes(k, glance, yy + 0.002);
            }
            glare(k, y + 0.003, x0 + 1.5, x0 + 1.85, z0 + 0.06, z1 - 0.06);
          }),
      },
    });
    // The marker tray: two markers and an eraser.
    k.box([-1.15, 0, z0 - 0.06], [1.15, 0.17, z0], MAT.alu, { ink: INK.detail });
    k.rod([-0.9, 0.09, z0 + 0.02], [-0.62, 0.09, z0 + 0.02], 0.024, MAT.cobalt);
    k.rod([-0.54, 0.1, z0 + 0.02], [-0.26, 0.08, z0 + 0.02], 0.024, MAT.tomato);
    k.box([0.45, 0.03, z0], [0.79, 0.14, z0 + 0.06], MAT.graphite, { ink: INK.detail });
    k.box([0.45, 0.03, z0 + 0.06], [0.79, 0.14, z0 + 0.1], MAT.mustard, { ink: INK.detail });
  },
};
