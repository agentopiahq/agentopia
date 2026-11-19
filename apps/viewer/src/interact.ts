import { OBJECTS, ObjectName } from './objects';
import { PieceState } from './objects/types';
import { BLIND_DOWN } from './objects/wall';
import { MARGIN_NOTES, RoomPiece } from './room';

/**
 * What a click on each kind of object does, and the state it leaves behind.
 *
 * An object that does one thing toggles at once: a door swings open, a
 * screen goes dark. One that does several opens a small popover of
 * controls beside it: a blind goes up, half or down. The sprint board opens
 * an editor of its own, and the usage board its ledger. Everything else is scenery, and a click on it is a
 * click on the floor.
 *
 * The margin labels stay off the sheet until they are wanted: a click on a
 * part with several controls opens a card beside it headed by its label
 * (CABINETS, context filed away), with its controls under it. A part with
 * nothing to do opens nothing.
 *
 * State lives per placed piece, keyed by its name and spot, and eases: a
 * number is a fraction (how far open) and glides toward where it was set,
 * so a door swings rather than jumps. It is a viewer's own arrangement of
 * the room, kept in their browser, and nothing about it reaches core: the
 * office's sessions never see a blind.
 */

export interface Control {
  label: string;
  /** Whether this control describes how the piece is now, to draw it pressed. */
  active: boolean;
  /** What pressing it sets. */
  patch: Record<string, unknown>;
  /** Every blind on the wall, or just this piece (the default). */
  scope?: 'piece' | 'wall';
  /**
   * Send this session home instead of setting anything: the one control that
   * reaches past the room, offered on an occupied desk where the page allows.
   */
  dismiss?: string;
}

/** What hovering an occupied desk says, where a click can clear it. */
export const DESK_HINT = 'clear this desk';

/**
 * An occupied desk's popover: one control that sends its session home, for
 * a session that left without saying goodbye (an archived thread fires no
 * hook, so only the idle timer would ever clear it).
 */
export const deskControls = (bus: string | null): Control[] =>
  bus ? [{ label: 'Clear this desk', active: false, patch: {}, dismiss: bus }] : [];

export type Interaction =
  | {
      kind: 'toggle';
      key: string;
      /** The key's value when nothing has been set. */
      fallback: number | boolean;
      /** What a click will do, from whether the key is on now: shown on hover. */
      hint: (on: boolean) => string;
      /** Whether its state shows in the sheet (a cast shadow, the sunlight). */
      sheet?: boolean;
      /** Whether whoever walks through it swings it open on the way. */
      door?: boolean;
    }
  | {
      kind: 'menu';
      hint: string;
      controls: (state: PieceState) => Control[];
      sheet?: boolean;
    }
  | { kind: 'board'; hint: string }
  | { kind: 'usage'; hint: string };

const num = (state: PieceState, key: string, fallback: number): number => {
  const v = state[key];
  return typeof v === 'number' ? v : fallback;
};
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.08;

const glassDoor: Interaction = {
  kind: 'toggle',
  key: 'open',
  fallback: 0,
  hint: (on) => (on ? 'close the meeting room doors' : 'open the meeting room doors'),
  sheet: true,
  door: true,
};

const blind: Interaction = {
  kind: 'menu',
  hint: 'raise or lower the blind',
  sheet: true,
  controls: (state) => {
    const down = num(state, 'down', BLIND_DOWN);
    return [
      { label: 'Up', active: near(down, 0), patch: { down: 0 } },
      { label: 'Half', active: near(down, 0.5), patch: { down: 0.5 } },
      { label: 'Down', active: near(down, 1), patch: { down: 1 } },
      { label: 'All up', active: false, patch: { down: 0 }, scope: 'wall' },
      { label: 'All down', active: false, patch: { down: 1 }, scope: 'wall' },
    ];
  },
};

const drawer = (label: string, key: string, state: PieceState): Control => {
  const open = num(state, key, 0) >= 0.5;
  return {
    label: `${open ? 'Close' : 'Open'} ${label}`,
    active: open,
    patch: { [key]: open ? 0 : 1 },
  };
};

export const INTERACTIONS: Partial<Record<ObjectName, Interaction>> = {
  door: {
    kind: 'toggle',
    key: 'open',
    fallback: 1,
    hint: (on) => (on ? 'close the door' : 'open the door'),
    sheet: true,
    door: true,
  },
  glassDoorLeft: glassDoor,
  glassDoorRight: glassDoor,
  booth: {
    kind: 'toggle',
    key: 'open',
    fallback: 0,
    hint: (on) => (on ? 'close the booth' : 'open the booth'),
    door: true,
  },
  drinksFridge: {
    kind: 'toggle',
    key: 'open',
    fallback: 0,
    hint: (on) => (on ? 'close the fridge' : 'open the fridge'),
  },
  cabinet: {
    kind: 'menu',
    hint: 'open a drawer',
    controls: (state) => [drawer('top', 'top', state), drawer('bottom', 'bottom', state)],
  },
  windowBlind: blind,
  windowBlind2: blind,
  windowBlind3: blind,
  screen: {
    kind: 'toggle',
    key: 'on',
    fallback: true,
    hint: (on) => (on ? 'turn the screen off' : 'turn the screen on'),
  },
  projectionScreen: {
    kind: 'menu',
    hint: 'work the projection screen',
    controls: (state) => {
      const up = num(state, 'up', 1) >= 0.5;
      const slides = state.slides === true;
      return [
        { label: up ? 'Roll it down' : 'Pull it up', active: false, patch: { up: up ? 0 : 1 } },
        {
          label: slides ? 'Slides off' : 'Slides on',
          active: slides,
          patch: slides ? { slides: false } : { slides: true, up: 1 },
        },
      ];
    },
  },
  mobileBoard: { kind: 'board', hint: 'open the sprint board' },
  usageBoard: { kind: 'usage', hint: 'open the usage ledger' },
};

export const interactionOf = (piece: RoomPiece): Interaction | undefined =>
  INTERACTIONS[piece.name];

export interface Annotation {
  title: string;
  note: string;
}

/** Which margin label each kind of part belongs to. */
const LABELLED: Partial<Record<ObjectName, string>> = {
  glassPanel: 'MEETING ROOM',
  glassPanelHalf: 'MEETING ROOM',
  glassDoorLeft: 'MEETING ROOM',
  glassDoorRight: 'MEETING ROOM',
  meetingTable: 'MEETING ROOM',
  screen: 'MEETING ROOM',
  booth: 'PHONE BOOTHS',
  kitchenCounter: 'KITCHEN',
  drinksFridge: 'KITCHEN',
  snackCabinet: 'KITCHEN',
  standingTable: 'KITCHEN',
  waterCooler: 'KITCHEN',
  cafeTable: 'KITCHEN',
  desk: 'DESKS',
  deskChair: 'DESKS',
  cabinet: 'CABINETS',
  sofaRust: 'LOUNGE',
  armchair: 'LOUNGE',
  beanBag: 'LOUNGE',
  sideTable: 'LOUNGE',
  door: 'THE DOOR',
};

/** Parts no margin label names, in the labels' own voice. */
const OWN: Partial<Record<ObjectName, Annotation>> = {
  windowBlind: { title: 'WINDOWS', note: 'let the sun in, or keep it out' },
  windowBlind2: { title: 'WINDOWS', note: 'let the sun in, or keep it out' },
  windowBlind3: { title: 'WINDOWS', note: 'let the sun in, or keep it out' },
  projectionScreen: { title: 'PROJECTION SCREEN', note: 'for the company all-hands' },
  mobileBoard: { title: 'SPRINT BOARD', note: 'what the team is on' },
  usageBoard: { title: 'USAGE BOARD', note: 'tokens and spend, by day' },
};

/**
 * A part's annotation: its margin label when it has one, else a label in the
 * same voice, else its own name and what it is for.
 */
export function annotationOf(piece: RoomPiece): Annotation {
  const label = LABELLED[piece.name];
  const fromLabel = label ? MARGIN_NOTES[label] : undefined;
  if (fromLabel) {
    return fromLabel;
  }
  const own = OWN[piece.name];
  if (own) {
    return own;
  }
  // In the labels' voice: lower case, no full stop.
  const obj = OBJECTS[piece.name];
  const note = obj.blurb.replace(/\.$/, '');
  return { title: obj.name.toUpperCase(), note: note.charAt(0).toLowerCase() + note.slice(1) };
}

/** A placed piece's identity: its kind and where it stands. */
export const pieceKey = (piece: RoomPiece): string =>
  `${piece.name}@${piece.place.at[0].toFixed(2)},${piece.place.at[1].toFixed(2)}`;

/** Whether a toggle's key reads as on. */
export function isOn(
  state: PieceState,
  interaction: Extract<Interaction, { kind: 'toggle' }>
): boolean {
  const v = state[interaction.key] ?? interaction.fallback;
  return typeof v === 'number' ? v >= 0.5 : v === true;
}

/** What a toggle sets its key to, from its state now. */
export function toggled(
  state: PieceState,
  interaction: Extract<Interaction, { kind: 'toggle' }>
): Record<string, unknown> {
  const on = isOn(state, interaction);
  const value = typeof interaction.fallback === 'number' ? (on ? 0 : 1) : !on;
  return { [interaction.key]: value };
}

/**
 * The pieces a change to one also changes: the other leaf of a double door
 * (the leaf beside it, a tile along x on the same line), every blind on the
 * same wall for a wall-wide control, or just the piece itself.
 */
export function linked(
  piece: RoomPiece,
  all: readonly RoomPiece[],
  scope: 'piece' | 'wall' = 'piece'
): RoomPiece[] {
  if (scope === 'wall' && piece.wall) {
    return all.filter((p) => p.wall === piece.wall && interactionOf(p) === interactionOf(piece));
  }
  if (piece.name === 'glassDoorLeft' || piece.name === 'glassDoorRight') {
    const partner = piece.name === 'glassDoorLeft' ? 'glassDoorRight' : 'glassDoorLeft';
    const [x, y] = piece.place.at;
    const other = all.find(
      (p) =>
        p.name === partner &&
        Math.abs(p.place.at[1] - y) < 0.05 &&
        Math.abs(Math.abs(p.place.at[0] - x) - 1) < 0.05
    );
    return other ? [piece, other] : [piece];
  }
  return [piece];
}

/** Where a piece's state is remembered between visits. */
export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A browser's storage, if it has one it will let us use. */
export function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const STORAGE_KEY = 'agentopia.office.pieces.v1';
/** How fast an eased number moves, in fractions per second: a door swings in under half a second. */
const EASE_PER_S = 2.6;

/**
 * Every piece's state: where it was set (`target`), and where it is drawn
 * now (`shown`), which eases toward it. A hold is a per-frame floor under a
 * target — a door swung open for whoever walks through — that is never kept.
 */
export class PieceStore {
  private target = new Map<string, Record<string, unknown>>();
  private shown = new Map<string, Record<string, unknown>>();

  constructor(private readonly storage: StateStorage | null = null) {
    this.load();
  }

  /** The state a piece is drawn with now. */
  get(key: string): PieceState {
    return this.shown.get(key) ?? {};
  }

  /** The state a piece was set to, which may still be easing in. */
  wanted(key: string): PieceState {
    return this.target.get(key) ?? {};
  }

  set(key: string, patch: Record<string, unknown>): void {
    this.target.set(key, { ...this.target.get(key), ...patch });
    const shown = { ...this.shown.get(key) };
    for (const [k, v] of Object.entries(patch)) {
      // A number eases there from where it is drawn (`step`); anything else lands at once.
      if (typeof v !== 'number') {
        shown[k] = v;
      }
    }
    this.shown.set(key, shown);
    this.save();
  }

  /**
   * Ease every number a step of `dt` ms toward its target (or the hold under
   * it), and say which pieces moved. `fallback` gives a key's default, so a
   * number never set before eases from how the piece is authored.
   */
  step(
    dt: number,
    holds: ReadonlyMap<string, Record<string, number>> = new Map(),
    fallback: (key: string, field: string) => number = () => 0
  ): string[] {
    const moved: string[] = [];
    const keys = new Set([...this.target.keys(), ...holds.keys(), ...this.shown.keys()]);
    const reach = (EASE_PER_S * Math.max(0, dt)) / 1000;
    for (const key of keys) {
      const target = this.target.get(key) ?? {};
      const hold = holds.get(key) ?? {};
      const shown = { ...this.shown.get(key) };
      let changed = false;
      const fields = new Set([...Object.keys(target), ...Object.keys(hold), ...Object.keys(shown)]);
      for (const field of fields) {
        const t = target[field];
        const numeric =
          typeof t === 'number' ||
          typeof hold[field] === 'number' ||
          typeof shown[field] === 'number';
        if (!numeric) {
          continue;
        }
        // Where it was set (or its default), held up by whoever is walking through.
        const set = typeof t === 'number' ? t : fallback(key, field);
        const want = typeof hold[field] === 'number' ? Math.max(hold[field], set) : set;
        const cur =
          typeof shown[field] === 'number' ? (shown[field] as number) : fallback(key, field);
        if (cur === want && typeof shown[field] === 'number') {
          continue;
        }
        const next = Math.abs(want - cur) <= reach ? want : cur + Math.sign(want - cur) * reach;
        shown[field] = next;
        changed = true;
      }
      if (changed) {
        this.shown.set(key, shown);
        moved.push(key);
      }
    }
    return moved;
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (value && typeof value === 'object') {
            this.target.set(key, { ...(value as Record<string, unknown>) });
            this.shown.set(key, { ...(value as Record<string, unknown>) });
          }
        }
      }
    } catch {
      // A private window, or a damaged copy: start from the room as authored.
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.target)));
    } catch {
      // Out of space or blocked: the room still works, it just will not be remembered.
    }
  }
}
