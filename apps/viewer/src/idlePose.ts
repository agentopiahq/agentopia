import { Actor, ArmSwing, IdleProp } from '@agentopia/core';

import type { Pose, PoseView, Vec } from './character';
import { SHEET } from './kit/palette';

/**
 * What an idle avatar is doing, posed on top of its state's pose.
 *
 * Core's idle life (`idle.ts`) says what each step is — `act` — and what is in
 * hand — `prop`. This module turns both into the figure: where the hands go,
 * the face, a sway, and the prop drawn in the hand. It only ever adjusts a
 * pose `character.ts` has already built for the actor's state, so the rig
 * and its states stay as they are: an activity is an overlay, never a state.
 *
 * Pure in `(actor, t)`, like every pose.
 */

/** The rig's own helpers, handed in so this module need not reach into its internals. */
export interface PoseKit {
  /** Push a hand out past the body's silhouette, so it shows. */
  reach(body: Vec, to: Vec, clearance?: number): Vec;
  /** Where an arm leaves the body, either side. */
  shoulderOf(body: Vec, side: -1 | 1): Vec;
  /** An arm's length, shoulder to hand. */
  armLength: number;
}

/**
 * One slow swing of the arms, forward and back, standing at ease: seconds.
 * Slower than the human's: the avatar's arms are short, and swung any faster
 * they read as flapping.
 */
export const SWAY_S = 4;
const SWAY = (Math.PI * 2) / SWAY_S;
/** How far the arms swing about the shoulder either way, radians. */
const ARM_SWAY = 0.5;
/**
 * How long the arms hang, of their full length: swinging in depth they are
 * seen a little end on.
 */
const ARM_HANG_LEN = 0.95;
/**
 * How far up the body from where the arms usually leave it they hang from
 * while it stands at ease, in rig units: up under the head, so they hang
 * down the body's sides from the top of it.
 */
const SHOULDER_LIFT = 2.4;
/**
 * How much lower on the screen a hand is at the end of its swing nearer you
 * than at the far end, in rig units: you look on from a little above.
 */
const ARM_TOWARD = 0.8;
/** Turned 45°, how far below its raised shoulder the nearer arm shows over the body: clear of the head. */
const UNDER_HEAD = 1.2;
/** How far the body swings either way, swaying side to side, in rig units. */
const BODY_SWING = 1.5;
/** How far behind the body's sway the arms swing with it, radians of the loop: they hang loose. */
const ARM_LAG = 0.7;

/**
 * How far the arms are swung forward, in radians about the shoulder (or
 * times `reach`), `w` radians into the sway, whose forward end is at π/2:
 * with the body, a beat behind it, or against it.
 */
export function armSwing(w: number, arms: ArmSwing | undefined, reach = ARM_SWAY): number {
  return arms === 'against' ? -Math.sin(w) * reach : Math.sin(w - ARM_LAG) * reach;
}

const MOVING = new Set<Actor['state']>(['walking', 'sprinting', 'pacing']);

/** Which hand is the front one, holding things: the one on the side it faces. */
const front = (facing: 1 | -1): 0 | 1 => (facing >= 0 ? 1 : 0);

/** 0..1, up for `on` seconds out of every `every`, on the avatar's own phase. */
function now(t: number, every: number, on: number, phase: number): number {
  const at = (t + phase) % every;
  if (at > on) {
    return 0;
  }
  return Math.sin((at / on) * Math.PI);
}

/** A steady phase per avatar, so a cafe full of sippers never sips in unison. */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 100;
}

/**
 * The whole body swinging slowly left and right over planted feet, `sway`
 * (-1..1) of the way to one side: tipping the way it goes and rising a touch
 * at each end, the hands down at its sides going with it.
 */
function sideToSide(pose: Pose, sway: number): void {
  const dx = sway * BODY_SWING;
  pose.body.x += dx;
  pose.body.y -= sway * sway * 0.5;
  pose.tilt = sway * 0.08;
  // The tipping body lifts the hand on the side it leaves, and drops the other.
  pose.hands = [
    { x: pose.hands[0].x + dx, y: pose.hands[0].y + sway * 0.9 },
    { x: pose.hands[1].x + dx, y: pose.hands[1].y - sway * 0.9 },
  ];
}

/**
 * Pose an idle activity over the state's pose. Walking it carries its prop
 * in the stride's front hand, untouched; once there, it does the thing.
 */
export function activityPose(
  pose: Pose,
  actor: Actor,
  t: number,
  kit: PoseKit,
  view: PoseView = {}
): void {
  const activity = actor.activity;
  if (!activity || MOVING.has(actor.state)) {
    return;
  }
  const f = actor.facing;
  const hand = front(f);
  const other: 0 | 1 = hand === 1 ? 0 : 1;
  const by = pose.body.y;
  const body = pose.body;
  const phase = phaseOf(actor.avatar ?? actor.id);

  switch (activity.act) {
    case 'read': {
      // The book open in both hands at the chest, a page turned now and then.
      const turn = now(t, 7, 0.7, phase);
      pose.hands[hand] = kit.reach(body, { x: f * 13.5, y: by + 7.5 }, 1);
      pose.hands[other] = kit.reach(body, { x: f * 5.5, y: by + 9 - turn * 3 }, 1);
      pose.tilt = f * 0.06;
      pose.look = { eyes: 'open', mouth: 'flat' };
      pose.point = null;
      break;
    }
    case 'drink':
    case 'eat': {
      // Held at the chest; up to the mouth for a sip or a bite.
      const sip = activity.act === 'eat' ? now(t, 3.2, 1.0, phase) : now(t, 5, 1.5, phase);
      pose.hands[hand] = kit.reach(body, { x: f * (12.5 - sip * 1.5), y: by + 7 - sip * 7.5 }, 0.5);
      pose.tilt = -f * 0.05 * sip;
      pose.look =
        sip > 0.4
          ? { eyes: activity.act === 'drink' ? 'closed' : 'open', mouth: 'open' }
          : { eyes: 'open', mouth: 'smile' };
      pose.point = null;
      break;
    }
    case 'brew': {
      // Both hands at the machine, pressing and waiting on it.
      const press = Math.max(0, Math.sin(t * 3 + phase));
      pose.hands[hand] = kit.reach(body, { x: f * 15, y: by + 3 - press * 2 });
      pose.hands[other] = kit.reach(body, { x: f * 10, y: by + 10 });
      pose.tilt = f * 0.07;
      pose.look = { eyes: 'open', mouth: 'flat' };
      pose.point = null;
      break;
    }
    case 'grab': {
      // Reaching in for something.
      const dig = Math.sin(t * 5 + phase);
      pose.hands[hand] = kit.reach(body, { x: f * 16, y: by + 1 + dig * 2 });
      pose.tilt = f * 0.12;
      pose.look = { eyes: 'open', mouth: 'grin' };
      pose.point = null;
      break;
    }
    case 'water': {
      // The can held out over the plant, tipped.
      pose.hands[hand] = kit.reach(body, { x: f * 15, y: by + 6 + Math.sin(t * 2 + phase) });
      pose.tilt = f * 0.08;
      pose.look = { eyes: 'open', mouth: 'smile' };
      pose.point = null;
      break;
    }
    case 'gaze': {
      // Just looking out.
      sideToSide(pose, Math.sin(t * SWAY + phase));
      pose.look = { eyes: 'open', mouth: 'smile' };
      break;
    }
    case 'sway': {
      if (actor.state !== 'idle') {
        break;
      }
      if (view.back) {
        // The swing in depth is only drawn from the front; turned away, it
        // sways side to side instead.
        sideToSide(pose, Math.sin(t * SWAY + phase));
        break;
      }
      // At ease: rocking very gently forward and back on planted feet, the
      // arms hanging down and swinging forward and back together like
      // pendulums, with the body (a beat behind it) or against it, as the
      // step says. The swing is in depth, so it is drawn by where you watch
      // from, as the human's is (`swaying` in human.ts).
      const w = t * SWAY + phase;
      const rock = Math.sin(w);
      const a = armSwing(w, activity.arms);
      const len = kit.armLength * ARM_HANG_LEN;
      const sides = [-1, 1] as const;
      pose.shoulderLift = SHOULDER_LIFT;
      const shoulder = (side: -1 | 1): Vec => {
        const s = kit.shoulderOf(body, side);
        return { x: s.x, y: s.y - SHOULDER_LIFT };
      };
      // Content, eyes shut a moment now and then, enjoying it.
      pose.look = { eyes: now(t, 6.5, 1.6, phase) > 0.25 ? 'closed' : 'open', mouth: 'smile' };
      pose.point = null;
      // From the front it is always turned 45° (the rig has no square-on
      // view): forward is the way it faces, across the screen, so the arm
      // nearer you (on the side away from the way it faces) swings across
      // the front of the body, and the other swings back behind it.
      body.x += f * rock * 0.3;
      body.y += rock * 0.4;
      pose.tilt = f * rock * 0.04;
      pose.hands = sides.map((side) => {
        const s = shoulder(side);
        return {
          x: s.x + f * Math.sin(a) * len,
          y: s.y + Math.cos(a) * len + Math.sin(a) * ARM_TOWARD,
        };
      }) as [Vec, Vec];
      pose.over = f > 0 ? [true, false] : [false, true];
      // Its shoulder end is up under the head, which stays over it.
      pose.overBelow = shoulder(1).y + UNDER_HEAD;
      break;
    }
    case 'reach': {
      // Up for the blind's cord, tugging.
      const tug = Math.max(0, Math.sin(t * 6 + phase));
      pose.hands[hand] = kit.reach(body, { x: f * 9, y: by - 13 + tug * 4 });
      pose.tilt = f * 0.05;
      pose.look = { eyes: 'open', mouth: 'grin' };
      pose.point = null;
      break;
    }
    case 'study': {
      // Looking it over, a finger raised beside the face.
      const sway = Math.sin(t * 1.2 + phase);
      pose.hands[hand] = kit.reach(body, { x: f * 12, y: by - 2 + sway });
      pose.point = hand;
      pose.tilt = sway * 0.04 + f * 0.03;
      pose.look = { eyes: 'open', mouth: 'flat' };
      break;
    }
    case 'chat':
      if (actor.state !== 'talking') {
        // Listening: a nod now and then, smiling.
        pose.body.y += now(t, 2.2, 0.5, phase) * 1.2;
        pose.look = { eyes: 'open', mouth: 'smile' };
      }
      break;
    default:
      break;
  }
}

/** What each prop looks like. */
const PROP = {
  bookCover: '#4f7fc4',
  bookEdge: '#2f5590',
  page: '#fbf6ea',
  mug: '#f7f2e6',
  coffee: '#6b4226',
  cup: '#d8eef7',
  water: '#79bfe6',
  snack: '#dba15f',
  chip: '#6b4226',
  can: '#6fae79',
  canDark: '#4f8a5a',
} as const;

type Ctx = CanvasRenderingContext2D;

function outlined(g: Ctx, fill: string, line = 0.9): void {
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = SHEET.ink;
  g.lineWidth = line;
  g.lineJoin = 'round';
  g.stroke();
}

function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/**
 * Draw what the avatar has in hand, over the figure, in rig space. Seen from
 * behind, what is held in front is hidden by the body — except the can,
 * held out to the side.
 */
export function drawProp(g: Ctx, pose: Pose, actor: Actor, t: number): void {
  const prop: IdleProp | undefined = actor.activity?.prop;
  if (!prop || (pose.back && prop !== 'can')) {
    return;
  }
  const f = actor.facing;
  const hand = pose.hands[front(f)];
  switch (prop) {
    case 'book': {
      // Open, its spine between the hands, the pages facing the reader.
      const other = pose.hands[front(f) === 1 ? 0 : 1];
      const cx = (hand.x + other.x) / 2;
      const cy = Math.min(hand.y, other.y) - 3.2;
      const w = Math.max(9, Math.abs(hand.x - other.x) + 3);
      roundRect(g, cx - w / 2, cy, w, 6.4, 0.8);
      outlined(g, PROP.bookCover);
      roundRect(g, cx - w / 2 + 0.9, cy - 0.6, w / 2 - 1, 5.6, 0.5);
      outlined(g, PROP.page, 0.6);
      roundRect(g, cx + 0.1, cy - 0.6, w / 2 - 1, 5.6, 0.5);
      outlined(g, PROP.page, 0.6);
      break;
    }
    case 'mug':
    case 'cup': {
      const mug = prop === 'mug';
      const w = mug ? 4.2 : 3.4;
      const h = mug ? 4.4 : 5;
      const x = hand.x - w / 2 + f * 0.6;
      const y = hand.y - h + 1.2;
      if (mug) {
        // The handle, on the side away from the hand.
        g.beginPath();
        g.arc(x + (f > 0 ? w : 0), y + h / 2, 1.3, 0, Math.PI * 2);
        g.strokeStyle = SHEET.ink;
        g.lineWidth = 0.9;
        g.stroke();
      }
      roundRect(g, x, y, w, h, mug ? 0.9 : 0.5);
      outlined(g, mug ? PROP.mug : PROP.cup);
      g.beginPath();
      g.ellipse(x + w / 2, y + 0.4, w / 2 - 0.5, 0.55, 0, 0, Math.PI * 2);
      g.fillStyle = mug ? PROP.coffee : PROP.water;
      g.fill();
      if (mug) {
        // A wisp of steam.
        const rise = (t * 0.8) % 1;
        g.globalAlpha = 0.6 * (1 - rise);
        g.beginPath();
        g.moveTo(x + w / 2, y - 1 - rise * 3);
        g.bezierCurveTo(
          x + w / 2 + 1.2,
          y - 2.5 - rise * 3,
          x + w / 2 - 1.2,
          y - 4 - rise * 3,
          x + w / 2,
          y - 5.5 - rise * 3
        );
        g.strokeStyle = SHEET.ink;
        g.lineWidth = 0.6;
        g.stroke();
        g.globalAlpha = 1;
      }
      break;
    }
    case 'snack': {
      g.beginPath();
      g.arc(hand.x + f * 0.8, hand.y - 1.6, 2.2, 0, Math.PI * 2);
      outlined(g, PROP.snack);
      g.fillStyle = PROP.chip;
      for (const [dx, dy] of [
        [-0.8, -0.5],
        [0.7, 0.3],
        [0, 1],
      ]) {
        g.beginPath();
        g.arc(hand.x + f * 0.8 + dx, hand.y - 1.6 + dy, 0.35, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'can': {
      // A watering can, its spout out ahead, tipped while it pours.
      const pouring = actor.activity?.act === 'water' && actor.state !== 'walking';
      g.save();
      g.translate(hand.x + f * 2.5, hand.y + 1);
      g.rotate(pouring ? f * 0.45 : 0);
      g.beginPath();
      g.moveTo(f * 2.6, -1.2);
      g.lineTo(f * 7.2, -4.2);
      g.lineTo(f * 7.6, -3.4);
      g.lineTo(f * 2.6, 0.6);
      g.closePath();
      outlined(g, PROP.canDark, 0.7);
      roundRect(g, -3, -2.8, 6, 5.2, 1);
      outlined(g, PROP.can);
      g.beginPath();
      g.arc(-f * 0.6, -3.1, 1.8, Math.PI, 0);
      g.strokeStyle = SHEET.ink;
      g.lineWidth = 0.9;
      g.stroke();
      g.restore();
      if (pouring) {
        // Drops falling from the rose.
        g.fillStyle = PROP.water;
        for (let i = 0; i < 3; i++) {
          const fall = (t * 1.6 + i / 3) % 1;
          g.globalAlpha = 1 - fall;
          g.beginPath();
          g.arc(hand.x + f * (10 + i * 0.7), hand.y + 2 + fall * 9, 0.6, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      break;
    }
  }
}
