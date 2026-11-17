import { Actor, ArmSwing } from '@agentopia/core';

import type { Pose, PoseView, Vec } from '../character';
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
  over: [false, false],
  overBelow: null,
  shoulderLift: 0,
});

// Plain shoulders either side of the body, and a plain arm.
const SHOULDER = 4;
const kit = {
  reach: (_body: Vec, to: Vec): Vec => to,
  shoulderOf: (body: Vec, side: -1 | 1): Vec => ({ x: body.x + side * SHOULDER, y: body.y + 7 }),
  armLength: 6,
};

const swaying = (arms: ArmSwing, state: Actor['state'] = 'idle', facing: 1 | -1 = 1): Actor => ({
  id: 'a',
  bus: '',
  worker: 'a',
  role: 'resident',
  label: '',
  pos: { x: 0, y: 0 },
  state,
  progress: 0,
  facing,
  stress: 0,
  activity: { id: 'unwind', act: 'sway', arms, key: 'a#1' },
});

/** One whole sway, pose by pose. */
function cycle(arms: ArmSwing, view: PoseView = {}, facing: 1 | -1 = 1): Pose[] {
  return Array.from({ length: 24 }, (_, i) => {
    const pose = base();
    activityPose(pose, swaying(arms, 'idle', facing), (i / 24) * SWAY_S, kit, view);
    return pose;
  });
}

/** How far a hand is across the screen from the middle of the body. */
const off = (pose: Pose, i: 0 | 1): number => pose.hands[i].x - pose.body.x;

describe('standing at ease, swaying', () => {
  it.each([
    ['with', 1],
    ['against', 1],
    ['with', -1],
  ] as const)(
    'at 45°, swings both arms forward and back together, in depth (%s the body, facing %s)',
    (arms, facing) => {
      const poses = cycle(arms, {}, facing);
      // The arm away from the side it faces is the nearer: over the body, the other behind.
      const near = facing > 0 ? 0 : 1;
      const far = facing > 0 ? 1 : 0;
      for (const pose of poses) {
        expect(pose.over[near]).toBe(true);
        expect(pose.over[far]).toBe(false);
        // Together: always the same way off their shoulders.
        expect(off(pose, 1) - off(pose, 0)).toBeCloseTo(2 * SHOULDER, 5);
      }
      // Forward (the way it faces), the nearer hand comes across the front of
      // the body; the other shows ahead of it, and goes in behind it on the way back.
      const ahead = (i: 0 | 1): number[] => poses.map((p) => off(p, i) * facing);
      expect(Math.max(...ahead(near))).toBeGreaterThan(-SHOULDER + 2);
      expect(Math.min(...ahead(near))).toBeLessThan(-SHOULDER - 2);
      expect(Math.max(...ahead(far))).toBeGreaterThan(SHOULDER + 2);
      expect(Math.min(...ahead(far))).toBeLessThan(SHOULDER - 2);
    }
  );

  it('turned away, sways side to side instead: no arm comes over the body', () => {
    const poses = cycle('with', { back: true });
    const dx = poses.map((p) => p.body.x - base().body.x);
    expect(Math.max(...dx)).toBeGreaterThan(1);
    expect(Math.min(...dx)).toBeLessThan(-1);
    for (const pose of poses) {
      expect(pose.over).toEqual([false, false]);
      expect(pose.overBelow).toBeNull();
      expect(pose.shoulderLift).toBe(0);
    }
  });

  it.each([
    ['with', 1],
    ['against', -1],
  ] as const)('swings the arms %s the body', (arms, sign) => {
    // Just past the body's furthest rock forward: the arms are out that way, or the other.
    expect(Math.sign(armSwing(Math.PI / 2 + 0.35, arms))).toBe(sign);
  });

  it.each([{}, { back: true }])('keeps the feet planted while it sways (seen %o)', (view) => {
    for (const pose of cycle('with', view)) {
      expect(pose.feet).toEqual(base().feet);
    }
  });

  it('leaves a talking avatar to its own pose', () => {
    const pose = base();
    activityPose(pose, swaying('with', 'talking'), 1, kit, { back: true });
    expect(pose).toEqual(base());
  });
});

describe('swaying side to side', () => {
  const swinging = (t: number): Pose => {
    const pose = base();
    const actor = swaying('with');
    activityPose(pose, { ...actor, activity: { id: 'unwind', act: 'swing', key: 'a#1' } }, t, kit);
    return pose;
  };
  const poses = Array.from({ length: 24 }, (_, i) => swinging((i / 24) * SWAY_S));

  it('swings the whole body left and right over planted feet, the hands going with it', () => {
    const dx = poses.map((p) => p.body.x - base().body.x);
    expect(Math.max(...dx)).toBeGreaterThan(1);
    expect(Math.min(...dx)).toBeLessThan(-1);
    poses.forEach((pose, i) => {
      expect(pose.feet).toEqual(base().feet);
      // Tipping the way it goes, and both hands carried along with the body.
      expect(Math.sign(pose.tilt)).toBe(Math.sign(dx[i]));
      expect(pose.hands[0].x - base().hands[0].x).toBeCloseTo(dx[i], 5);
      expect(pose.hands[1].x - base().hands[1].x).toBeCloseTo(dx[i], 5);
      // Nothing in depth: no arm comes over the body.
      expect(pose.over).toEqual([false, false]);
    });
  });
});
