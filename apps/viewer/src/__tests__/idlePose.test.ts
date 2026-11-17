import { Actor, ArmSwing } from '@agentopia/core';

import type { Pose, Vec } from '../character';
import { SWAY_S, activityPose, armSwing } from '../idlePose';

const base = (): Pose => ({
  body: { x: 0, y: -18 },
  tilt: 0,
  squash: 1,
  hands: [
    { x: -10, y: -9 },
    { x: 10, y: -9 },
  ],
  feet: [
    { x: -3, y: -2 },
    { x: 3, y: -2 },
  ],
  look: { eyes: 'open', mouth: 'grin' },
  back: false,
  thought: false,
  point: null,
  chin: null,
  held: null,
  sheet: null,
  wheel: null,
});

// A plain arm: the hand on a circle about a shoulder either side of the body.
const kit = {
  reach: (_body: Vec, to: Vec): Vec => to,
  swingArm: (body: Vec, side: -1 | 1, turn: number): Vec => ({
    x: body.x + side * (4 + Math.cos(0.3 + turn) * 6),
    y: body.y + 7 + Math.sin(0.3 + turn) * 6,
  }),
};

const swaying = (arms: ArmSwing, state: Actor['state'] = 'idle'): Actor => ({
  id: 'a',
  bus: '',
  worker: 'a',
  role: 'resident',
  label: '',
  pos: { x: 0, y: 0 },
  state,
  progress: 0,
  facing: 1,
  stress: 0,
  activity: { id: 'unwind', act: 'sway', arms, key: 'a#1' },
});

/** How far each hand is swung across the screen from where it hangs at rest, through one sway. */
function swungBy(arms: ArmSwing): Array<[number, number]> {
  return Array.from({ length: 24 }, (_, i) => {
    const pose = base();
    activityPose(pose, swaying(arms), (i / 24) * SWAY_S, kit);
    const rest = [kit.swingArm(pose.body, -1, 0), kit.swingArm(pose.body, 1, 0)];
    return [pose.hands[0].x - rest[0].x, pose.hands[1].x - rest[1].x];
  });
}

describe('standing at ease, swaying', () => {
  it.each(['with', 'against'] as const)(
    'swings both arms together, the same way at once (%s the body)',
    (arms) => {
      const swung = swungBy(arms);
      expect(Math.max(...swung.map(([far]) => Math.abs(far)))).toBeGreaterThan(0.5);
      for (const [far, near] of swung.filter(
        ([a, b]) => Math.abs(a) > 0.05 && Math.abs(b) > 0.05
      )) {
        expect(Math.sign(far)).toBe(Math.sign(near));
      }
    }
  );

  it.each([
    ['with', 1],
    ['against', -1],
  ] as const)('swings the arms %s the body', (arms, sign) => {
    // Just past the body's furthest sway right: the arms are out that way, or the other.
    expect(Math.sign(armSwing(Math.PI / 2 + 0.35, arms))).toBe(sign);
  });

  it.each([1, -1] as const)(
    'rocks forward and back: leaning the way it faces (%s) as it dips toward you',
    (facing) => {
      for (let i = 0; i < 24; i++) {
        const pose = base();
        activityPose(pose, { ...swaying('with'), facing }, (i / 24) * SWAY_S, kit);
        const dip = pose.body.y - base().body.y;
        if (Math.abs(dip) > 0.05) {
          expect(Math.sign(pose.tilt * facing)).toBe(Math.sign(dip));
          expect(Math.sign((pose.body.x - base().body.x) * facing)).toBe(Math.sign(dip));
        }
      }
    }
  );

  it.each([0, 0.25, 0.5, 0.75].map((k) => [k]))(
    'keeps the feet planted while the body sways (%s of the way through)',
    (k) => {
      const pose = base();
      activityPose(pose, swaying('with'), k * SWAY_S, kit);
      expect(pose.feet).toEqual(base().feet);
      expect(pose.look.mouth).toBe('smile');
    }
  );

  it('leaves a talking avatar to its own pose', () => {
    const pose = base();
    activityPose(pose, swaying('with', 'talking'), 1, kit);
    expect(pose).toEqual(base());
  });
});
