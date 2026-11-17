import { Actor, ArmSwing } from '@agentopia/core';

import { HUMAN_HIPS, HUMAN_SWAY_S, RIG_SCALE, humanPose } from '../human';

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
  const cycle = (arms: ArmSwing, look = {}) =>
    Array.from({ length: 24 }, (_, i) =>
      humanPose(human(arms), (i / 24) * HUMAN_SWAY_S, 0, 'sit', 0, look)
    );

  it.each(['with', 'against'] as const)(
    'at 45°, swings both arms forward and back together, in depth (%s the body)',
    (arms) => {
      const poses = cycle(arms);
      for (const pose of poses) {
        // The arm nearer you over the body, the other behind it.
        expect(pose.over).toEqual([true, false]);
        expect(pose.square).toBe(false);
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

  it.each([
    ['from the front', { square: true }],
    ['from behind', { back: true }],
    ['from behind, turned 45°', { back: true, square: false }],
  ] as const)(
    'square-on %s, brings the arms over the body and apart as they swing toward you',
    (_name, look) => {
      const poses = cycle('with', look);
      const gap = (p: (typeof poses)[number]): number => p.hands[1].x - p.hands[0].x;
      const over = poses.filter((p) => p.over[0]);
      const behind = poses.filter((p) => !p.over[0]);
      expect(over.length).toBeGreaterThan(6);
      expect(behind.length).toBeGreaterThan(6);
      for (const pose of poses) {
        expect(pose.over[0]).toBe(pose.over[1]);
        expect(pose.square).toBe(true);
        // Mirror images of each other, either side of the body.
        expect(pose.hands[0].x - pose.hip.x).toBeCloseTo(-(pose.hands[1].x - pose.hip.x), 5);
        expect(pose.lean).toBe(0);
      }
      // Wider apart every moment they are over the body than any moment they are behind it.
      expect(Math.min(...over.map(gap))).toBeGreaterThanOrEqual(Math.max(...behind.map(gap)));
      expect(Math.max(...over.map(gap))).toBeGreaterThan(Math.min(...behind.map(gap)) + 4);
      // Behind it, the hands tuck in within the body's width.
      expect(Math.min(...behind.map(gap))).toBeLessThan(HEM * 2);
    }
  );

  it('swings toward you on the way forward from the front, and on the way back from behind', () => {
    const front = cycle('with', { square: true });
    const back = cycle('with', { back: true });
    front.forEach((pose, i) => {
      if (Math.abs(pose.hands[1].x - pose.hands[0].x - 2 * (HEM + 0.8)) > 0.5) {
        expect(back[i].over[0]).toBe(!pose.over[0]);
      }
    });
  });

  it('keeps the feet planted, and leaves the arms behind the body when just standing', () => {
    const still = humanPose(human(), 1, 0, 'sit', 0);
    expect(still.over).toEqual([false, false]);
    for (const look of [{}, { square: true }, { back: true }]) {
      for (let i = 0; i < 12; i++) {
        expect(humanPose(human('with'), (i / 12) * HUMAN_SWAY_S, 0, 'sit', 0, look).feet).toEqual(
          still.feet
        );
      }
    }
  });
});
