import { Actor, DESKS, OfficeFrame, PetView, TOWER_PERCHES } from '@agentopia/core';

import {
  FOLLOW_LAG_MS,
  PERSON_SNAPS,
  WALK_LEG,
  along,
  followPet,
  freeze,
  guessPersonPose,
  nearestSnap,
  parseScene,
  personPoseOf,
  petPoseOf,
  petPosesFor,
  petSnaps,
  poseFrame,
  posePerson,
  posePet,
  posesFor,
} from '../pose';

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 'resident/0',
  avatar: 'resident/0',
  bus: '',
  worker: 'resident/0',
  role: 'resident',
  label: 'resident',
  pos: { x: 10, y: 10 },
  state: 'idle',
  progress: 0,
  facing: 1,
  stress: 0,
  phase: 100,
  ...over,
});

const pet = (over: Partial<PetView> = {}): PetView => ({
  id: 'pet/cat',
  kind: 'cat',
  pos: { x: 12, y: 12 },
  z: 0,
  dir: { x: 1, y: 0 },
  act: 'sit',
  phase: 0,
  progress: 0,
  ...over,
});

const frame = (): OfficeFrame => ({
  at: 1000,
  actors: [actor(), actor({ id: 'resident/1', avatar: 'resident/1', pos: { x: 4, y: 4 } })],
  desks: [],
  waiting: 0,
  human: actor({ id: 'human', avatar: 'human', role: 'human', label: 'you' }),
  lagMs: 40,
  pets: [pet(), pet({ id: 'pet/dog', kind: 'dog' })],
});

describe('poses on offer', () => {
  it.each([
    ['human', ['sit', 'hug', 'nod', 'thumbs', 'shake', 'talk'], ['type', 'read', 'coffee']],
    ['resident', ['type', 'read', 'coffee', 'talk'], ['sit', 'hug', 'thumbs']],
  ] as const)('the %s gets what its rig draws', (role, has, lacks) => {
    const ids = posesFor({ role }).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([...has]));
    for (const id of lacks) {
      expect(ids).not.toContain(id);
    }
  });

  it.each([
    ['cat', true],
    ['dog', false],
  ] as const)('grooming is for the cat only (%s)', (kind, grooms) => {
    expect(petPosesFor(kind).some((p) => p.id === 'groom')).toBe(grooms);
  });
});

describe('posing a person', () => {
  const pose = (over: Partial<ReturnType<typeof personPoseOf>> = {}) => ({
    pose: 'read',
    pos: { x: 3, y: 5 },
    heading: '+x' as const,
    seated: true,
    says: '',
    since: 1000,
    hidden: false,
    ...over,
  });

  it('stands where put, facing the way picked, and loops from when the pose was struck', () => {
    const posed = posePerson(actor(), pose(), 1500);
    expect(posed.pos).toEqual({ x: 3, y: 5 });
    expect(posed.activity).toMatchObject({
      act: 'read',
      prop: 'book',
      seated: true,
      faceTo: { x: 4, y: 5 },
    });
    expect(posed.phase).toBe(500);
    expect(posed.bubble).toBeUndefined();
  });

  it.each([
    ['sway', false],
    ['read', true],
  ])('sits in %s only if the pose can be struck sitting', (id, seated) => {
    expect(posePerson(actor(), pose({ pose: id }), 1000).activity?.seated).toBe(seated);
  });

  it('types as a lead at its own desk, whoever it is', () => {
    const posed = posePerson(actor(), pose({ pose: 'type' }), 1000);
    expect(posed).toMatchObject({ state: 'working', role: 'lead', station: 'own_desk' });
  });

  it('says its line', () => {
    expect(posePerson(actor(), pose({ pose: 'talk', says: 'Ship it?' }), 1000).bubble).toBe(
      'Ship it?'
    );
  });

  it('walks up and down its leg, holding nothing', () => {
    const posed = posePerson(actor(), pose({ pose: 'walk', heading: '+y' }), 1600);
    expect(posed.state).toBe('walking');
    expect(posed.activity).toBeUndefined();
    expect(posed.pos.x).toBe(3);
    expect(posed.pos.y).toBeGreaterThan(5);
  });

  it('repeats a gesture after a breath', () => {
    const posed = posePerson(actor({ role: 'human' }), pose({ pose: 'nod', since: 0 }), 60_000);
    expect(posed.gesture).toBe('nod');
    expect(posed.phase).toBeLessThan(60_000);
  });
});

describe('along', () => {
  it.each([
    [0, 0, false],
    [500, 0.5, false],
    [1000 * WALK_LEG, WALK_LEG, false],
    [1000 * (WALK_LEG + 0.5), WALK_LEG - 0.5, true],
    [2000 * WALK_LEG, 0, false],
  ])('at %d ms at a tile a second it is %d out', (ms, out, back) => {
    const at = along({ x: 0, y: 0 }, '+x', ms, 1);
    expect(at.pos.x).toBeCloseTo(out);
    expect(at.back).toBe(back);
  });
});

describe('posing a pet', () => {
  const base = {
    pos: TOWER_PERCHES.bed.at,
    z: TOWER_PERCHES.bed.z,
    heading: '+y' as const,
    since: 0,
    hidden: false,
  };

  it('stays up on its perch', () => {
    expect(posePet(pet(), { ...base, pose: 'nap' }, 900)).toMatchObject({
      act: 'nap',
      z: TOWER_PERCHES.bed.z,
      dir: { x: 0, y: 1 },
      phase: 900,
    });
  });

  it('walks on the floor, turning on the way back', () => {
    const out = posePet(pet(), { ...base, pose: 'walk' }, 100);
    const home = posePet(pet(), { ...base, pose: 'walk' }, (1.5 * WALK_LEG * 1000) / 1.25);
    expect(out.z).toBe(0);
    expect(out.dir.y).toBe(1);
    expect(home.dir.y).toBe(-1);
  });

  it('starts from the pose it was in, or standing', () => {
    expect(petPoseOf(pet({ act: 'jump' }), '+x', 0).pose).toBe('stand');
    expect(petPoseOf(pet({ act: 'loaf' }), '+x', 0).pose).toBe('loaf');
  });
});

describe('guessPersonPose', () => {
  it.each([
    [actor({ state: 'working' }), 'type'],
    [actor({ state: 'walking' }), 'walk'],
    [actor({ activity: { id: 'x', act: 'drink', prop: 'mug', key: 'k' } }), 'coffee'],
    [actor({ activity: { id: 'x', act: 'drink', prop: 'cup', key: 'k' } }), 'sip'],
    [actor({ role: 'human', activity: { id: 'x', act: 'hug', key: 'k' } }), 'hug'],
    [actor({ role: 'human', state: 'waiting' }), 'stand'],
  ])('%#: reads what they were doing', (who, id) => {
    expect(guessPersonPose(who)).toBe(id);
  });
});

describe('a scene', () => {
  it('runs on from the frame it froze, posed and not', () => {
    const scene = freeze(frame());
    scene.elapsed = 400;
    scene.people['resident/1'] = { ...personPoseOf(scene.base.actors[1], '+x', 0), hidden: true };
    scene.pets['pet/dog'] = { ...petPoseOf(scene.base.pets[1], '+x', 0), pose: 'nap' };
    const shown = poseFrame(scene);
    expect(shown.at).toBe(1400);
    expect(shown.lagMs).toBe(0);
    expect(shown.actors.map((a) => a.id)).toEqual(['resident/0']);
    expect(shown.actors[0].phase).toBe(500);
    expect(shown.pets.find((p) => p.id === 'pet/dog')?.act).toBe('nap');
  });

  it('is a copy: the live frame can go on changing', () => {
    const live = frame();
    const scene = freeze(live);
    live.actors[0].pos.x = 99;
    expect(scene.base.actors[0].pos.x).toBe(10);
  });

  it.each([null, '', 'nope', '{"version":2}', '{"version":1,"base":{}}'])(
    'reads %p back as no scene',
    (json) => {
      expect(parseScene(json)).toBeNull();
    }
  );

  it('reads its own back', () => {
    const scene = freeze(frame());
    expect(parseScene(JSON.stringify(scene))).toEqual(scene);
  });
});

describe('snaps', () => {
  it('has every desk and seat', () => {
    expect(PERSON_SNAPS.filter((s) => s.id.startsWith('desk'))).toHaveLength(DESKS.length);
    expect(PERSON_SNAPS.filter((s) => s.seated).length).toBeGreaterThan(10);
  });

  it.each([
    ['cat', 'tower bed'],
    ['dog', 'dog bed'],
  ] as const)('the %s has its %s', (kind, id) => {
    expect(petSnaps(kind).map((s) => s.id)).toContain(id);
  });

  it('picks the nearest on screen within reach', () => {
    const screen = (p: { x: number; y: number }, z: number) => ({
      x: p.x * 10,
      y: p.y * 10 - z * 10,
    });
    const snaps = petSnaps('cat');
    const top = snaps.find((s) => s.id === 'tower bed');
    if (!top) {
      throw new Error('no tower bed');
    }
    const at = screen(top.at, top.z);
    expect(nearestSnap(snaps, { x: at.x + 1, y: at.y }, screen, 3)?.id).toBe('tower bed');
    expect(nearestSnap(snaps, { x: -500, y: -500 }, screen, 3)).toBeNull();
  });
});

describe('a pet keeping beside someone', () => {
  const pose = {
    pose: 'sit' as const,
    pos: { x: 12, y: 12 },
    z: 1,
    heading: '+x' as const,
    since: 0,
    hidden: false,
  };

  it('sits by them, facing them, while they stand still', () => {
    const kept = followPet(pet(), pose, () => ({ x: 10, y: 10 }), 5000);
    expect(kept.act).toBe('sit');
    expect(kept.z).toBe(0);
    expect(Math.hypot(kept.pos.x - 10, kept.pos.y - 10)).toBeLessThan(1.6);
    expect(kept.dir.x * (10 - kept.pos.x) + kept.dir.y * (10 - kept.pos.y)).toBeGreaterThan(0);
  });

  it('walks after them, behind and to one side, while they walk', () => {
    const walker = (ms: number) => ({ x: ms / 1000, y: 10 });
    const kept = followPet(pet(), pose, walker, 5000);
    expect(kept.act).toBe('walk');
    expect(kept.dir).toEqual({ x: 1, y: 0 });
    expect(kept.pos.x).toBeCloseTo((5000 - FOLLOW_LAG_MS) / 1000);
    expect(kept.pos.y).not.toBe(10);
  });
});

describe('desks posed at work', () => {
  it('light up a free desk for whoever is posed typing at it', () => {
    const scene = freeze(frame());
    scene.people['resident/0'] = {
      ...personPoseOf(scene.base.actors[0], '-y', 0),
      pose: 'type',
      pos: { ...DESKS[2].seat },
    };
    const desks = poseFrame(scene).desks;
    expect(desks).toHaveLength(1);
    expect(desks[0]).toMatchObject({ slot: 2, phase: 'working' });
    expect(desks[0].screen).toBeTruthy();
  });

  it('leave a desk a session holds as it is', () => {
    const scene = freeze({
      ...frame(),
      desks: [
        { slot: 2, bus: 'b', phase: 'working', subagents: 0, stress: 0, lagMs: 0, screenSince: 0 },
      ],
    });
    scene.people['resident/0'] = {
      ...personPoseOf(scene.base.actors[0], '-y', 0),
      pose: 'type',
      pos: { ...DESKS[2].seat },
    };
    expect(poseFrame(scene).desks.map((d) => d.bus)).toEqual(['b']);
  });

  it('follows a posed person through the scene', () => {
    const scene = freeze(frame());
    scene.pets['pet/dog'] = { ...petPoseOf(scene.base.pets[1], '+x', 0), follow: 'resident/0' };
    const dog = poseFrame(scene).pets.find((p) => p.id === 'pet/dog');
    expect(Math.hypot((dog?.pos.x ?? 0) - 10, (dog?.pos.y ?? 0) - 10)).toBeLessThan(1.6);
  });
});
