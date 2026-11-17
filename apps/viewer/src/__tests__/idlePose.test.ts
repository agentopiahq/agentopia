import { Actor, ArmSwing } from '@agentopia/core';

import type { Pose, Vec } from '../character';
import { SWAY_S, activityPose } from '../idlePose';

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

/** How far each hand moves across the screen against the body, between two moments of the sway. */
function handTravel(arms: ArmSwing): [number, number] {
  const at = (t: number): Pose => {
    const pose = base();
    activityPose(pose, swaying(arms), t, kit);
    return pose;
  };
  const a = at(0.1 * SWAY_S);
  const b = at(0.45 * SWAY_S);
  const off = (p: Pose, i: 0 | 1): number => p.hands[i].x - p.body.x;
  return [off(b, 0) - off(a, 0), off(b, 1) - off(a, 1)];
}

describe('standing at ease, swaying', () => {
  it('swings both arms the same way across the screen at once', () => {
    const [far, near] = handTravel('same');
    expect(Math.sign(far)).toBe(Math.sign(near));
    expect(Math.abs(far)).toBeGreaterThan(0.1);
  });

  it('swings the arms in mirror, each the opposite way to the other', () => {
    const [far, near] = handTravel('opposite');
    expect(Math.sign(far)).toBe(-Math.sign(near));
    expect(Math.abs(far)).toBeGreaterThan(0.1);
  });

  it.each([0, 0.25, 0.5, 0.75].map((k) => [k]))(
    'keeps the feet planted while the body sways (%s of the way through)',
    (k) => {
      const pose = base();
      activityPose(pose, swaying('same'), k * SWAY_S, kit);
      expect(pose.feet).toEqual(base().feet);
      expect(pose.look.mouth).toBe('smile');
    }
  );

  it('leaves a talking avatar to its own pose', () => {
    const pose = base();
    activityPose(pose, swaying('same', 'talking'), 1, kit);
    expect(pose).toEqual(base());
  });
});
