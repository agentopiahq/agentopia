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
  square: false,
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
        expect(pose.overBelow).toBeNull();
        expect(pose.square).toBe(false);
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

  it.each([
    ['from the front', { square: true }],
    ['from behind', { back: true }],
  ] as const)(
    'square-on %s, brings the hands round the body and apart toward you, shoulders behind',
    (_name, view) => {
      const poses = cycle('with', view);
      const gap = (p: Pose): number => p.hands[1].x - p.hands[0].x;
      const over = poses.filter((p) => p.over[0]);
      const behind = poses.filter((p) => !p.over[0]);
      expect(over.length).toBeGreaterThan(6);
      expect(behind.length).toBeGreaterThan(6);
      for (const pose of poses) {
        expect(pose.over[0]).toBe(pose.over[1]);
        expect(pose.square).toBe(true);
        expect(pose.tilt).toBe(0);
        expect(off(pose, 0)).toBeCloseTo(-off(pose, 1), 5);
        // Only below the shoulders does an arm come over the body.
        expect(pose.overBelow).toBeGreaterThan(kit.shoulderOf(pose.body, 1).y + 1);
      }
      expect(Math.min(...over.map(gap))).toBeGreaterThanOrEqual(Math.max(...behind.map(gap)));
      expect(Math.max(...over.map(gap))).toBeGreaterThan(Math.min(...behind.map(gap)) + 4);
    }
  );

  it('comes toward you on the way forward from the front, and on the way back from behind', () => {
    const front = cycle('with', { square: true });
    const back = cycle('with', { back: true });
    expect(front.filter((pose, i) => pose.over[0] === back[i].over[0]).length).toBeLessThan(3);
  });

  it.each([
    ['with', 1],
    ['against', -1],
  ] as const)('swings the arms %s the body', (arms, sign) => {
    // Just past the body's furthest rock forward: the arms are out that way, or the other.
    expect(Math.sign(armSwing(Math.PI / 2 + 0.35, arms))).toBe(sign);
  });

  it.each([{}, { square: true }, { back: true }])(
    'keeps the feet planted while it sways (seen %o)',
    (view) => {
      for (const pose of cycle('with', view)) {
        expect(pose.feet).toEqual(base().feet);
        expect(pose.look.mouth).toBe('smile');
      }
    }
  );

  it('leaves a talking avatar to its own pose', () => {
    const pose = base();
    activityPose(pose, swaying('with', 'talking'), 1, kit, { square: true });
    expect(pose).toEqual(base());
  });
});
