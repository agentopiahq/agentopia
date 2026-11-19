import {
  ANSWER_MS,
  ARMCHAIR_SEAT,
  Actor,
  ActorState,
  ArmSwing,
  CAFE_SEATS,
  CAT_PERCHES,
  CAT_TOWER_SCRATCH,
  DESKS,
  DOG_BED_PERCH,
  DeskView,
  FLOOR_SPOT,
  GAIT,
  IdleAct,
  IdleProp,
  MEETING_SEATS,
  OfficeFrame,
  PET_SPEED,
  PET_WINDOW_SPOTS,
  PetKind,
  PetView,
  Point,
  SOFA_SEATS,
  TOWER_PERCHES,
  besideAvatar,
  bowlSpot,
} from '@agentopia/core';

import { DIRECTION, Heading, headingOf } from './heading';
import { HERO_TASKS } from './heroScript';

/**
 * Posing the office by hand, for pictures and clips (the website's `?pose`).
 *
 * The office is frozen on one frame of the director's, and from then on the
 * frame is a scene that belongs to the person posing it: anyone in it (you,
 * the agents, the cat and the dog) can be put anywhere, facing any of the four
 * floor directions, in any pose the skins can draw. Nothing here knows the
 * director's rules; a pose is a hand-made `Actor` or `PetView`, which the
 * renderer draws like any other. Each pose's animation loops on its own clock,
 * counted from when it was picked, and a pose that walks walks up and down a
 * short leg so its legs step, so a clip of a posed office moves.
 *
 * Pure: frame and poses in, frame out. The editor that drives it is `poser.ts`.
 */

/** A pose a person can be put in, and what it draws. */
export interface PersonPoseSpec {
  id: string;
  label: string;
  state: ActorState;
  act?: IdleAct;
  prop?: IdleProp;
  arms?: ArmSwing;
  gesture?: 'nod' | 'thumbs' | 'shake';
  /** Who can strike it: the agents' rig, the human's, or both. */
  who: 'agent' | 'human' | 'both';
  /** Whether it can be struck sitting down, on a sofa or a chair; `always` sits. */
  seat: 'never' | 'may' | 'always';
  /** What they say, if the pose says something until told otherwise. */
  says?: string;
}

const MOVING: ReadonlySet<ActorState> = new Set(['walking', 'sprinting', 'running', 'pacing']);

export const PERSON_POSES: readonly PersonPoseSpec[] = [
  { id: 'stand', label: 'stand', state: 'idle', who: 'both', seat: 'may' },
  {
    id: 'sway',
    label: 'sway',
    state: 'idle',
    act: 'sway',
    arms: 'with',
    who: 'both',
    seat: 'never',
  },
  { id: 'walk', label: 'walk', state: 'walking', who: 'both', seat: 'never' },
  { id: 'sprint', label: 'sprint', state: 'sprinting', who: 'agent', seat: 'never' },
  { id: 'run', label: 'run', state: 'running', who: 'agent', seat: 'never' },
  { id: 'pace', label: 'pace', state: 'pacing', who: 'agent', seat: 'never' },
  { id: 'type', label: 'type', state: 'working', who: 'agent', seat: 'never' },
  { id: 'think', label: 'think', state: 'thinking', who: 'both', seat: 'may' },
  {
    id: 'talk',
    label: 'talk',
    state: 'talking',
    who: 'both',
    seat: 'may',
    says: 'Could you take a look?',
  },
  { id: 'wait', label: 'wait', state: 'waiting', who: 'agent', seat: 'never' },
  { id: 'slump', label: 'slump', state: 'slump', who: 'agent', seat: 'may' },
  { id: 'nap', label: 'nap', state: 'napping', who: 'both', seat: 'may' },
  {
    id: 'read',
    label: 'read',
    state: 'idle',
    act: 'read',
    prop: 'book',
    who: 'agent',
    seat: 'may',
  },
  {
    id: 'coffee',
    label: 'coffee',
    state: 'idle',
    act: 'drink',
    prop: 'mug',
    who: 'agent',
    seat: 'may',
  },
  {
    id: 'sip',
    label: 'sip',
    state: 'idle',
    act: 'drink',
    prop: 'cup',
    who: 'agent',
    seat: 'may',
  },
  {
    id: 'snack',
    label: 'snack',
    state: 'idle',
    act: 'eat',
    prop: 'snack',
    who: 'agent',
    seat: 'may',
  },
  { id: 'listen', label: 'listen', state: 'idle', act: 'chat', who: 'agent', seat: 'may' },
  { id: 'study', label: 'study', state: 'idle', act: 'study', who: 'agent', seat: 'may' },
  { id: 'gaze', label: 'look out', state: 'idle', act: 'swing', who: 'agent', seat: 'never' },
  { id: 'brew', label: 'brew', state: 'idle', act: 'brew', who: 'agent', seat: 'never' },
  { id: 'grab', label: 'grab', state: 'idle', act: 'grab', who: 'agent', seat: 'never' },
  {
    id: 'plant',
    label: 'water',
    state: 'idle',
    act: 'water',
    prop: 'can',
    who: 'agent',
    seat: 'never',
  },
  { id: 'sit', label: 'sit', state: 'idle', act: 'sit', who: 'human', seat: 'always' },
  { id: 'hug', label: 'hug', state: 'idle', act: 'hug', who: 'human', seat: 'always' },
  { id: 'nod', label: 'nod', state: 'idle', gesture: 'nod', who: 'human', seat: 'may' },
  { id: 'thumbs', label: 'thumbs', state: 'idle', gesture: 'thumbs', who: 'human', seat: 'may' },
  { id: 'shake', label: 'shake', state: 'idle', gesture: 'shake', who: 'human', seat: 'may' },
];

/** The poses open to someone: the human's rig draws fewer than the agents'. */
export function posesFor(actor: Pick<Actor, 'role'>): PersonPoseSpec[] {
  const human = actor.role === 'human';
  return PERSON_POSES.filter((p) => p.who === 'both' || (p.who === 'human') === human);
}

export function personPose(id: string): PersonPoseSpec {
  return PERSON_POSES.find((p) => p.id === id) ?? PERSON_POSES[0];
}

/** A pose a pet can be put in. */
export interface PetPoseSpec {
  id: PetView['act'];
  label: string;
  kinds: readonly PetKind[];
}

const BOTH: readonly PetKind[] = ['cat', 'dog'];

export const PET_POSES: readonly PetPoseSpec[] = [
  { id: 'stand', label: 'stand', kinds: BOTH },
  { id: 'walk', label: 'walk', kinds: BOTH },
  { id: 'trot', label: 'trot', kinds: BOTH },
  { id: 'sit', label: 'sit', kinds: BOTH },
  { id: 'gaze', label: 'gaze', kinds: BOTH },
  { id: 'loaf', label: 'loaf', kinds: BOTH },
  { id: 'nap', label: 'nap', kinds: BOTH },
  { id: 'sniff', label: 'sniff', kinds: BOTH },
  { id: 'eat', label: 'eat', kinds: BOTH },
  { id: 'drink', label: 'drink', kinds: BOTH },
  { id: 'stretch', label: 'stretch', kinds: BOTH },
  { id: 'play', label: 'play', kinds: BOTH },
  { id: 'beg', label: 'beg', kinds: BOTH },
  { id: 'groom', label: 'groom', kinds: ['cat'] },
  { id: 'scratch', label: 'scratch', kinds: ['cat'] },
  { id: 'bat', label: 'bat toy', kinds: ['cat'] },
];

export function petPosesFor(kind: PetKind): PetPoseSpec[] {
  return PET_POSES.filter((p) => p.kinds.includes(kind));
}

/** Somewhere to put someone exactly: a seat, a perch, a bowl. */
export interface Snap {
  id: string;
  label: string;
  at: Point;
  /** How high it is: a perch's top. */
  z: number;
  /** Which way whoever is put there faces. */
  heading: Heading;
  /** Put there, a person sits. */
  seated?: boolean;
}

const toward = (from: Point, to: Point): Heading => headingOf(to.x - from.x, to.y - from.y);

const seatSnap = (id: string, label: string, seat: { spot: Point; faceTo: Point }): Snap => ({
  id,
  label,
  at: { ...seat.spot },
  z: 0,
  heading: toward(seat.spot, seat.faceTo),
  seated: true,
});

/** Every seat in the office, the desks first. */
export const PERSON_SNAPS: readonly Snap[] = [
  ...DESKS.map((desk, i): Snap => ({
    id: `desk ${i + 1}`,
    label: `desk ${i + 1}`,
    at: { ...desk.seat },
    z: 0,
    heading: '-y',
  })),
  seatSnap('sofa 1', 'corner sofa, far', SOFA_SEATS[0]),
  seatSnap('sofa 2', 'corner sofa, near', SOFA_SEATS[1]),
  seatSnap('sofa 3', 'lounge sofa, left', SOFA_SEATS[2]),
  seatSnap('sofa 4', 'lounge sofa, right', SOFA_SEATS[3]),
  seatSnap('armchair', 'armchair', ARMCHAIR_SEAT),
  ...CAFE_SEATS.flatMap(([a, b], i) => [
    seatSnap(`cafe ${i + 1}a`, `café ${i + 1}, left`, a),
    seatSnap(`cafe ${i + 1}b`, `café ${i + 1}, right`, b),
  ]),
  ...MEETING_SEATS.map((seat, i) => seatSnap(`meeting ${i + 1}`, `meeting chair ${i + 1}`, seat)),
  seatSnap('floor', 'floor by the window', FLOOR_SPOT),
];

const perchSnap = (id: string, label: string, perch: typeof DOG_BED_PERCH): Snap => ({
  id,
  label,
  at: { ...perch.at },
  z: perch.z,
  heading: toward(perch.at, perch.faceTo ?? { x: perch.at.x + 1, y: perch.at.y }),
});

const floorSnap = (id: string, label: string, at: Point, heading: Heading): Snap => ({
  id,
  label,
  at: { ...at },
  z: 0,
  heading,
});

/** Where a pet can be put exactly: its perches up high, its bowls, the windows. */
export function petSnaps(kind: PetKind): Snap[] {
  const windows = PET_WINDOW_SPOTS.map((w, i) =>
    floorSnap(`window ${i + 1}`, `window ${i + 1}`, w.spot, '-x')
  );
  const bowls = [
    floorSnap('food', 'food bowl', bowlSpot(kind, 'food'), '+x'),
    floorSnap('water', 'water bowl', bowlSpot(kind, 'water'), '+x'),
  ];
  if (kind === 'dog') {
    return [perchSnap('dog bed', 'dog bed', DOG_BED_PERCH), ...bowls, ...windows];
  }
  return [
    perchSnap('tower bed', 'cat tower, top', TOWER_PERCHES.bed),
    perchSnap('tower ledge', 'cat tower, ledge', TOWER_PERCHES.ledge),
    perchSnap('tower den', 'cat tower, den', TOWER_PERCHES.den),
    floorSnap(
      'scratch',
      'scratching post',
      CAT_TOWER_SCRATCH.spot,
      toward(CAT_TOWER_SCRATCH.spot, CAT_TOWER_SCRATCH.post)
    ),
    ...CAT_PERCHES.map((p) => perchSnap(p.id, p.id.replace(/ [\d., ]+$/, ''), p)),
    ...bowls,
    ...windows,
  ];
}

/**
 * The snap nearest a spot on screen, if any is within `radius` there. `screen`
 * places a floor point at a height on the screen, so a perch is matched where
 * it is drawn, up on top of its furniture.
 */
export function nearestSnap(
  snaps: readonly Snap[],
  at: { x: number; y: number },
  screen: (p: Point, z: number) => { x: number; y: number },
  radius: number
): Snap | null {
  let best: Snap | null = null;
  let bestD = radius;
  for (const snap of snaps) {
    const s = screen(snap.at, snap.z);
    const d = Math.hypot(s.x - at.x, s.y - at.y);
    if (d <= bestD) {
      best = snap;
      bestD = d;
    }
  }
  return best;
}

/** How someone is posed. */
export interface PersonPose {
  pose: string;
  pos: Point;
  heading: Heading;
  seated: boolean;
  /** What they say; empty, they say nothing. */
  says: string;
  /** Scene time the pose was struck, ms: its loop counts from here. */
  since: number;
  hidden: boolean;
}

/** How a pet is posed. */
export interface PetPose {
  pose: PetView['act'];
  pos: Point;
  /** Up on a perch, how high. */
  z: number;
  heading: Heading;
  since: number;
  hidden: boolean;
  /**
   * Whom it keeps beside, by actor id: sat by them (in its pose) while they
   * stand still, trotting after them while they walk.
   */
  follow?: string;
}

/** A frozen office and everything posed in it. */
export interface Scene {
  version: 1;
  /** The director's frame it was frozen on. */
  base: OfficeFrame;
  /** Scene time, ms since the freeze: what every loop runs on. */
  elapsed: number;
  people: Record<string, PersonPose>;
  pets: Record<string, PetPose>;
}

export function freeze(frame: OfficeFrame): Scene {
  return { version: 1, base: structuredClone(frame), elapsed: 0, people: {}, pets: {} };
}

/** A scene read back, or null if it is not one this version made. */
export function parseScene(json: string | null): Scene | null {
  if (!json) {
    return null;
  }
  try {
    const scene = JSON.parse(json) as Scene;
    if (scene?.version !== 1 || !scene.base?.human || !Array.isArray(scene.base.actors)) {
      return null;
    }
    return scene;
  } catch {
    return null;
  }
}

/** The pose nearest what someone was doing when the office froze. */
export function guessPersonPose(actor: Actor): string {
  const options = posesFor(actor);
  const act = actor.activity?.act;
  const byAct = options.find(
    (p) => p.act !== undefined && p.act === act && p.prop === actor.activity?.prop
  );
  if (byAct) {
    return byAct.id;
  }
  if (actor.gesture) {
    return actor.gesture;
  }
  const byState: Partial<Record<ActorState, string>> = {
    walking: 'walk',
    sprinting: 'sprint',
    running: 'run',
    pacing: 'pace',
    working: 'type',
    thinking: 'think',
    talking: 'talk',
    waiting: 'wait',
    slump: 'slump',
    napping: 'nap',
  };
  const id = byState[actor.state] ?? 'stand';
  return options.some((p) => p.id === id) ? id : 'stand';
}

/** A person posed as they were, ready to change. */
export function personPoseOf(actor: Actor, heading: Heading, elapsed: number): PersonPose {
  const pose = guessPersonPose(actor);
  return {
    pose,
    pos: { ...actor.pos },
    heading,
    seated: actor.activity?.seated === true || personPose(pose).seat === 'always',
    says: actor.bubble ?? '',
    since: elapsed,
    hidden: false,
  };
}

/** A pet posed as it was. */
export function petPoseOf(pet: PetView, heading: Heading, elapsed: number): PetPose {
  const known = PET_POSES.some((p) => p.id === pet.act && p.kinds.includes(pet.kind));
  return {
    pose: known ? pet.act : 'stand',
    pos: { ...pet.pos },
    z: pet.z,
    heading,
    since: elapsed,
    hidden: false,
  };
}

/** How long one leg of a posed walk is, tiles: up and back along it. */
export const WALK_LEG = 1.4;

/** Tiles a second each moving pose covers. */
const SPEED: Partial<Record<ActorState, number>> = {
  walking: GAIT.walking.max,
  sprinting: GAIT.sprinting.max,
  running: GAIT.sprinting.max * 1.3,
  pacing: GAIT.pacing.max,
};

/**
 * Up and down a leg from `pos` along `heading`, `ms` in at `speed`: where it
 * is, and whether it is on the way back.
 */
export function along(
  pos: Point,
  heading: Heading,
  ms: number,
  speed: number,
  leg = WALK_LEG
): { pos: Point; back: boolean } {
  const [dx, dy] = DIRECTION[heading];
  const s = ((ms / 1000) * speed) % (2 * leg);
  const back = s > leg;
  const d = back ? 2 * leg - s : s;
  return { pos: { x: pos.x + dx * d, y: pos.y + dy * d }, back };
}

/** Someone as posed, at scene time `elapsed`. */
export function posePerson(actor: Actor, pose: PersonPose, elapsed: number): Actor {
  const spec = personPose(pose.pose);
  const ms = Math.max(0, elapsed - pose.since);
  const [dx, dy] = DIRECTION[pose.heading];
  const moving = MOVING.has(spec.state);
  const pos = moving
    ? along(pose.pos, pose.heading, ms, SPEED[spec.state] ?? 1).pos
    : { ...pose.pos };
  const seated = spec.seat === 'always' || (spec.seat === 'may' && pose.seated);
  // A gesture plays once in `ANSWER_MS`; posed, it plays again after a breath.
  const phase = spec.gesture ? ms % (ANSWER_MS + 700) : ms;
  const typing = spec.id === 'type' && actor.role !== 'human';
  const posed: Actor = {
    ...actor,
    pos,
    state: spec.state,
    // Typing is what a lead does at its own desk: its hands go to the keys.
    role: typing ? 'lead' : actor.role,
    station: typing ? 'own_desk' : undefined,
    bubble: pose.says.trim() === '' ? undefined : pose.says,
    progress: 0.5,
    stress: 0,
    phase,
    tempo: 1,
    gesture: spec.gesture,
    activity: {
      id: 'pose',
      // `sit` draws nothing of its own on the agents: it only says where to face.
      act: spec.act ?? 'sit',
      prop: spec.prop,
      arms: spec.arms,
      seated,
      faceTo: { x: pose.pos.x + dx, y: pose.pos.y + dy },
      key: `pose ${actor.id} ${pose.since}`,
    },
  };
  if (moving) {
    // On the move nobody holds anything still; facing follows the walk.
    delete posed.activity;
  }
  return posed;
}

/** A pet as posed, at scene time `elapsed`. */
export function posePet(pet: PetView, pose: PetPose, elapsed: number): PetView {
  const ms = Math.max(0, elapsed - pose.since);
  const [dx, dy] = DIRECTION[pose.heading];
  const moving = pose.pose === 'walk' || pose.pose === 'trot';
  if (moving) {
    const speed = PET_SPEED[pet.kind][pose.pose === 'walk' ? 'walk' : 'trot'];
    const { pos, back } = along(pose.pos, pose.heading, ms, speed);
    const s = back ? -1 : 1;
    return {
      ...pet,
      pos,
      z: 0,
      dir: { x: dx * s, y: dy * s },
      act: pose.pose,
      phase: ms,
      progress: 0.5,
    };
  }
  return {
    ...pet,
    pos: { ...pose.pos },
    z: pose.z,
    dir: { x: dx, y: dy },
    act: pose.pose,
    activity: undefined,
    phase: ms,
    progress: 0.5,
  };
}

/** An unposed figure carries on with whatever it was doing when the office froze. */
function carryOn<T extends { phase?: number; tempo?: number }>(it: T, elapsed: number): T {
  return { ...it, phase: (it.phase ?? 0) + elapsed * (it.tempo ?? 1) };
}

/** How far behind a walker a follower is, in ms of the walk. */
export const FOLLOW_LAG_MS = 650;

/**
 * A pet keeping beside someone, whose place `at(ms)` gives at any scene time:
 * by their side, facing them, while they stand still; a little behind and to
 * one side, walking or trotting, while they move.
 */
export function followPet(
  pet: PetView,
  pose: PetPose,
  at: (ms: number) => Point,
  elapsed: number
): PetView {
  const ms = Math.max(0, elapsed - pose.since);
  const now = at(elapsed);
  const before = at(elapsed - 100);
  const speed = Math.hypot(now.x - before.x, now.y - before.y) * 10;
  if (speed < 0.05) {
    const spot = besideAvatar(now, pose.pos);
    const act = pose.pose === 'walk' || pose.pose === 'trot' ? 'sit' : pose.pose;
    const dx = now.x - spot.x;
    const dy = now.y - spot.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      ...pet,
      pos: spot,
      z: 0,
      dir: { x: dx / len, y: dy / len },
      act,
      phase: ms,
      progress: 0.5,
    };
  }
  const lagged = at(elapsed - FOLLOW_LAG_MS);
  const ahead = at(elapsed - FOLLOW_LAG_MS + 100);
  const dx = ahead.x - lagged.x;
  const dy = ahead.y - lagged.y;
  const len = Math.hypot(dx, dy) || 1;
  // A step to the walker's side, so it is never drawn inside them.
  const side = 0.35;
  return {
    ...pet,
    pos: { x: lagged.x - (dy / len) * side, y: lagged.y + (dx / len) * side },
    z: 0,
    dir: { x: dx / len, y: dy / len },
    act: speed > PET_SPEED[pet.kind].walk * 1.2 ? 'trot' : 'walk',
    phase: ms,
    progress: 0.5,
  };
}

/** How near a desk's seat someone has to be to be at it, tiles. */
const AT_DESK = 0.05;

/**
 * The desks someone is posed typing at, that no session holds: lit as if a
 * session were there, its name and its command one of the demo's tasks, so a
 * posed office at work looks it.
 */
function postedDesks(base: OfficeFrame, actors: readonly Actor[]): DeskView[] {
  const held = new Set(base.desks.map((d) => d.slot));
  const extra: DeskView[] = [];
  for (const actor of actors) {
    if (actor.state !== 'working' || actor.station !== 'own_desk') {
      continue;
    }
    const slot = DESKS.findIndex(
      (d) => Math.hypot(d.seat.x - actor.pos.x, d.seat.y - actor.pos.y) < AT_DESK
    );
    if (slot < 0 || held.has(slot)) {
      continue;
    }
    held.add(slot);
    // A task of its own: none another desk already shows.
    const named = new Set([...base.desks, ...extra].map((d) => d.name));
    const start = (slot * 7 + 3) % HERO_TASKS.length;
    const task =
      [...HERO_TASKS.slice(start), ...HERO_TASKS.slice(0, start)].find((t) => !named.has(t.name)) ??
      HERO_TASKS[start];
    extra.push({
      slot,
      bus: `pose-desk-${slot}`,
      name: task.name,
      phase: 'working',
      subagents: 0,
      stress: 0,
      lagMs: 0,
      screen: task.test,
      screenSince: base.at,
    });
  }
  return extra;
}

/** The frozen office as posed, at its scene time. */
export function poseFrame(scene: Scene): OfficeFrame {
  const { base, elapsed, people, pets } = scene;
  const person = (actor: Actor, ms = elapsed): Actor =>
    people[actor.id] ? posePerson(actor, people[actor.id], ms) : carryOn(actor, ms);
  const everyone = [...base.actors, base.human];
  const placeOf = (id: string): ((ms: number) => Point) | null => {
    const actor = everyone.find((a) => a.id === id);
    if (!actor || people[id]?.hidden === true) {
      return null;
    }
    return (ms) => person(actor, Math.max(0, ms)).pos;
  };
  const pet = (p: PetView): PetView => {
    const pose = pets[p.id];
    if (!pose) {
      return carryOn(p, elapsed);
    }
    const leader = pose.follow ? placeOf(pose.follow) : null;
    return leader ? followPet(p, pose, leader, elapsed) : posePet(p, pose, elapsed);
  };
  const actors = base.actors.filter((a) => people[a.id]?.hidden !== true).map((a) => person(a));
  return {
    ...base,
    at: base.at + elapsed,
    lagMs: 0,
    actors,
    desks: [...base.desks, ...postedDesks(base, actors)],
    human: person(base.human),
    pets: base.pets.filter((p) => pets[p.id]?.hidden !== true).map(pet),
  };
}
