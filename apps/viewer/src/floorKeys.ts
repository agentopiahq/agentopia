import { Floor, FloorState, Way } from './floors';
import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';
import { controlButton, stroke, typing } from './zoom';

/**
 * The floor keys, stacked over the settings key in the bottom-right corner:
 * an up arrow over a down arrow, which take the view a floor up or down the
 * building (`floors.ts`). A key that has no floor its way (up from the
 * office, down from the bottom floor) is greyed out. Hovered, the floor the
 * view is on is lettered beside them. Page Up and Page Down do the same.
 */

/** What the floor keys need of the office. */
export interface Floored {
  /** Stack a row above the camera's mice. */
  addAboveCamera(row: HTMLElement): void;
  /** The building's floors, and the one the view is on. */
  readonly floors: FloorState;
  /** Go a floor up or down. */
  goFloor(way: Way): boolean;
}

const UP_ICON = stroke('M6 10V2.4M2.8 5.4L6 2.2l3.2 3.2', 13);
const DOWN_ICON = stroke('M6 2v7.6M2.8 6.6L6 9.8l3.2-3.2', 13);

const HALO = `0 0 2px ${SHEET.paper},0 0 2px ${SHEET.paper},0 0 4px ${SHEET.paper}`;

const FLOORS_STYLE = `
.agentopia-floors{display:flex;align-items:center;gap:7px;pointer-events:none;user-select:none;}
.agentopia-floors-keys{display:flex;flex-direction:column;gap:4px;}
.agentopia-floors-keys > .agentopia-control{pointer-events:auto;}
.agentopia-floors-word{font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};text-shadow:${HALO};text-align:right;
  opacity:0;visibility:hidden;transition:opacity 140ms ease,visibility 0s linear 140ms;}
.agentopia-floors:hover .agentopia-floors-word,
.agentopia-floors:focus-within .agentopia-floors-word{opacity:1;visibility:visible;transition:opacity 140ms ease;}
.agentopia-camera-corner.tips .agentopia-floors.coarse .agentopia-floors-word{opacity:1;visibility:visible;transition:opacity 140ms ease;}
`;

/** What a key says it does: where it goes, or that there is nowhere further that way. */
export function floorKeyLabel(way: Way, next: Floor | null): string {
  if (!next) {
    return way === 'up' ? 'Already on the top floor' : 'Already on the bottom floor';
  }
  return `${way === 'up' ? 'Up' : 'Down'} to ${next.label}`;
}

/** Mount the floor keys over the camera's mice; returns a function that takes them away. */
export function mountFloors(office: Floored): () => void {
  const row = document.createElement('div');
  row.className = 'agentopia-floors';
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
    row.classList.add('coarse');
  }
  const style = document.createElement('style');
  style.textContent = FLOORS_STYLE;
  const word = document.createElement('div');
  word.className = 'agentopia-floors-word';
  const keys = document.createElement('div');
  keys.className = 'agentopia-floors-keys';
  const up = controlButton(UP_ICON, 'Up a floor', () => office.goFloor('up'));
  const down = controlButton(DOWN_ICON, 'Down a floor', () => office.goFloor('down'));
  keys.append(up, down);

  const show = (): void => {
    const { floors } = office;
    word.textContent = floors.floor.label;
    for (const [key, way] of [
      [up, 'up'],
      [down, 'down'],
    ] as const) {
      const label = floorKeyLabel(way, floors.next(way));
      key.disabled = !floors.can(way);
      key.title = label;
      key.setAttribute('aria-label', label);
    }
  };
  show();
  const stop = office.floors.onChange(show);

  const onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) {
      return;
    }
    const way: Way | null = e.key === 'PageUp' ? 'up' : e.key === 'PageDown' ? 'down' : null;
    if (way) {
      e.preventDefault();
      office.goFloor(way);
    }
  };
  window.addEventListener('keydown', onKey);

  row.append(style, word, keys);
  office.addAboveCamera(row);
  return () => {
    stop();
    window.removeEventListener('keydown', onKey);
    row.remove();
  };
}
