import { Actor, ArmSwing } from '@agentopia/core';

import { HUMAN_HIPS, RIG_SCALE, humanPose } from '../human';
import { SWAY_S } from '../idlePose';

const human = (arms?: ArmSwing): Actor => ({
  id: 'human',
  bus: '',
  worker: 'human',
  role: 'human',
  label: 'you',
  pos: { x: 0, y: 0 },
  state: 'idle',
  progress: 0,
  facing: 1,
  stress: 0,
  activity: arms ? { id: 'human', act: 'sway', arms, key: 'human#1' } : undefined,
});

/** Half the hoodie's width at the hem, in rig units. */
const HEM = (HUMAN_HIPS * 32) / RIG_SCALE / 2;

describe('the human standing at ease', () => {
  it.each(['with', 'against'] as const)(
    'swings both arms forward and back together, in depth (%s the body)',
    (arms) => {
      const poses = Array.from({ length: 24 }, (_, i) =>
        humanPose(human(arms), (i / 24) * SWAY_S, 0, 'sit', 0)
      );
      for (const pose of poses) {
        // Layered at 45°: the nearer arm over the body, the other behind it.
        expect(pose.quarter).toBe(true);
        // Together: the two hands always the same way off their shoulders.
        expect(pose.hands[1].x - pose.hands[0].x).toBeCloseTo(
          poses[0].hands[1].x - poses[0].hands[0].x,
          1
        );
      }
      const near = poses.map((p) => p.hands[0].x - p.hip.x);
      const far = poses.map((p) => p.hands[1].x - p.hip.x);
      // Forward, the nearer hand comes across the front of the body; back, it clears it.
      expect(Math.max(...near)).toBeGreaterThan(-HEM + 2);
      expect(Math.min(...near)).toBeLessThan(-HEM);
      // Back, the other hand goes in behind the body; forward, it shows ahead of it.
      expect(Math.min(...far)).toBeLessThan(HEM - 2);
      expect(Math.max(...far)).toBeGreaterThan(HEM);
    }
  );

  it('keeps the feet planted, and hangs the arms out to the sides when just standing', () => {
    const still = humanPose(human(), 1, 0, 'sit', 0);
    expect(still.quarter).toBe(false);
    for (let i = 0; i < 12; i++) {
      expect(humanPose(human('with'), (i / 12) * SWAY_S, 0, 'sit', 0).feet).toEqual(still.feet);
    }
  });
});
