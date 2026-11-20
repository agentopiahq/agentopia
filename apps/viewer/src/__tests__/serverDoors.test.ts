import { PieceStore, STAIRWELL_DOOR, floorInteraction, isOn, rackDoor, toggled } from '../interact';
import { Iso } from '../kit/iso';
import { worldBox } from '../objects/bake';
import { RACK, RACK_SIDES, doorOpen, leafBox, rackParts } from '../objects/serverRack';
import { RACK_ROWS, SERVER_PIECES, sideToward } from '../serverRoom';

const racks = SERVER_PIECES.filter((piece) => piece.name.startsWith('serverRack'));
const pen = (): Iso => new Iso({} as CanvasRenderingContext2D, { unit: 32 });

describe("the server floor's doors", () => {
  it.each([
    ['serverRack', 'front', "open the rack's front door"],
    ['serverRackGpu', 'back', "open the rack's back door"],
    ['door', 'front', 'close the stairwell door'],
  ] as const)('says what a click on a %s (%s) does', (name, side, hint) => {
    const interaction = floorInteraction(name, side);
    expect(interaction && interaction.hint(isOn({}, interaction))).toBe(hint);
  });

  it.each(['cableTray', 'inRowCooler', 'airHandler'] as const)('leaves the %s alone', (name) => {
    expect(floorInteraction(name, 'front')).toBeUndefined();
  });

  it.each([
    [rackDoor('front'), {}, { front: 1 }],
    [rackDoor('back'), { back: 1 }, { back: 0 }],
    [STAIRWELL_DOOR, {}, { open: 0 }],
    [STAIRWELL_DOOR, { open: 0 }, { open: 1 }],
  ])('toggles %#', (interaction, state, next) => {
    expect(toggled(state, interaction)).toEqual(next);
  });

  it("swings each of a rack's doors on its own", () => {
    expect(doorOpen({ front: 1 }, 'front')).toBe(1);
    expect(doorOpen({ front: 1 }, 'back')).toBe(0);
  });

  it.each(RACK_SIDES)('keeps the %s door out in its aisle at every angle', (side) => {
    for (let i = 0; i <= 10; i++) {
      const [lo, hi] = leafBox(side, i / 10);
      if (side === 'front') {
        expect(lo[1]).toBeGreaterThan(RACK.d / 2);
      } else {
        expect(hi[1]).toBeLessThan(-RACK.d / 2);
      }
      // Never past the edge of the rack beside it, nor its door.
      expect(lo[0]).toBeGreaterThan(-RACK.w / 2 - 0.05);
      expect(hi[0]).toBeLessThan(RACK.w / 2 + 0.05);
    }
  });

  it('keeps two open doors across an aisle from meeting', () => {
    for (let r = 0; r < RACK_ROWS.length - 1; r++) {
      const a = RACK_ROWS[r];
      const b = RACK_ROWS[r + 1];
      const k = pen();
      k.place([0, a.y, 0], a.facing);
      const fromA = worldBox(k, leafBox(a.facing === '+y' ? 'front' : 'back', 1));
      k.place([0, b.y, 0], b.facing);
      const fromB = worldBox(k, leafBox(b.facing === '-y' ? 'front' : 'back', 1));
      expect(fromA[1][1]).toBeLessThan(fromB[0][1]);
    }
  });

  it("sorts a rack's doors apart from its body", () => {
    const parts = rackParts({ front: 0.5 });
    expect(parts.map((p) => p.name)).toEqual(['body', 'front', 'back']);
    expect(parts[1].footprint).toEqual(leafBox('front', 0.5));
  });

  it.each([
    [0, '+y', 'front'],
    [0, '-y', 'back'],
    [Math.PI, '+y', 'back'],
    [Math.PI, '-y', 'front'],
  ] as const)('from yaw %d a rack facing %s shows its %s door', (yaw, facing, side) => {
    const rack = racks.find((piece) => piece.place.facing === facing);
    expect(rack && sideToward(rack, yaw)).toBe(side);
  });

  it('remembers the floor apart from the office', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    new PieceStore(storage).set('door@1.00,1.00', { open: 0 });
    new PieceStore(storage, 'agentopia.server.pieces.v1').set('door@1.00,1.00', { open: 1 });
    expect(new PieceStore(storage).wanted('door@1.00,1.00')).toEqual({ open: 0 });
    expect(new PieceStore(storage, 'agentopia.server.pieces.v1').wanted('door@1.00,1.00')).toEqual({
      open: 1,
    });
  });
});
