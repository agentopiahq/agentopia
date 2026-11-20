import { CORNER_INSET } from './corners';
import { FloorState, Way } from './floors';
import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';
import { LIT, controlButton, stroke, typing } from './zoom';

/**
 * The floor key, first under the camera's keys in the bottom-right corner:
 * one key with the building's floors drawn on it, the same on a big screen
 * and a touch screen. Pressed, it opens a card to its left listing every
 * floor, top to bottom, the one the view is on lit; picking another takes the
 * view straight there (`floors.ts`), however many floors away, with the usual
 * slide. A pick, a press anywhere off the card, or Escape closes it. Hovered,
 * the floor the view is on is lettered beside the key. Page Up and Page Down
 * still go a floor up or down.
 */

/** What the floor key needs of the office. */
export interface Floored {
  /** Stack a row under the camera's keys. */
  addUnderCamera(row: HTMLElement): void;
  /** The building's floors, and the one the view is on. */
  readonly floors: FloorState;
  /** Go a floor up or down. */
  goFloor(way: Way): boolean;
  /** Go straight to the floor `id`. */
  goToFloor(id: string): boolean;
}

/** One floor in the picker: what it is called there, and whether the view is on it. */
export interface FloorChoice {
  id: string;
  label: string;
  current: boolean;
}

/** The picker's floors, top to bottom, the one the view is on marked. */
export function floorChoices(floors: FloorState): FloorChoice[] {
  return floors.all.map((floor) => ({
    id: floor.id,
    label: floor.label.replace(/^the /, ''),
    current: floor.id === floors.floor.id,
  }));
}

/** Two floors stacked, drawn isometric like the office itself. */
const FLOORS_ICON = stroke(
  'M6 1.6l4.6 2.5L6 6.6 1.4 4.1zM1.4 6.6L6 9.1l4.6-2.5M1.4 8.9L6 11.4l4.6-2.5',
  13
);

const HALO = `0 0 2px ${SHEET.paper},0 0 2px ${SHEET.paper},0 0 4px ${SHEET.paper}`;

const FLOORS_STYLE = `
.agentopia-floors{position:relative;display:flex;align-items:center;gap:7px;pointer-events:none;user-select:none;}
.agentopia-floors > .agentopia-control{pointer-events:auto;}
.agentopia-floors.open > .agentopia-control,
.agentopia-floors.open > .agentopia-control:hover{background:${LIT};border-color:${LIT};color:${SHEET.paper};}
.agentopia-floors-word{font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};text-shadow:${HALO};text-align:right;
  opacity:0;visibility:hidden;transition:opacity 140ms ease,visibility 0s linear 140ms;}
.agentopia-floors:not(.open):hover .agentopia-floors-word,
.agentopia-floors:not(.open):focus-within .agentopia-floors-word{opacity:1;visibility:visible;transition:opacity 140ms ease;}
.agentopia-camera-corner.tips .agentopia-floors.coarse:not(.open) .agentopia-floors-word{opacity:1;visibility:visible;transition:opacity 140ms ease;}
.agentopia-floors-card{position:absolute;right:calc(100% + 10px);top:0;display:none;flex-direction:column;gap:5px;
  padding:12px 14px 12px;border:1.5px solid ${SHEET.ink};border-radius:10px;background:${SHEET.paper};
  box-shadow:4px 5px 0 #6a60551f;color:${SHEET.ink};pointer-events:auto;white-space:nowrap;}
.agentopia-floors.open .agentopia-floors-card{display:flex;}
.agentopia-floors.rise .agentopia-floors-card{top:auto;bottom:0;}
.agentopia-floors.above .agentopia-floors-card{right:0;top:auto;bottom:calc(100% + 10px);}
.agentopia-floors-title{font:400 17px/1 ${FONT.hand};letter-spacing:2px;margin-bottom:3px;}
.agentopia-floors-pick{display:flex;align-items:center;gap:8px;min-width:150px;padding:5px 10px 4px 8px;box-sizing:border-box;
  border:1.5px solid ${SHEET.ink};border-radius:8px;background:${SHEET.paper};color:${SHEET.ink};cursor:pointer;
  font:400 15px/1.1 ${FONT.hand};text-align:left;}
.agentopia-floors-pick:hover,.agentopia-floors-pick:focus-visible{border-color:${LIT};color:${LIT};outline:none;}
.agentopia-floors-pick[aria-checked="true"]{background:${LIT};border-color:${LIT};color:${SHEET.paper};cursor:default;}
.agentopia-floors-level{min-width:14px;font:700 13px/1 ${FONT.hand};opacity:0.7;}
`;

/** Mount the floor key under the camera's keys; returns a function that takes it away. */
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

  const card = document.createElement('div');
  card.className = 'agentopia-floors-card';
  card.setAttribute('role', 'menu');
  card.setAttribute('aria-label', 'Floors');
  // The card's presses and wheel are its own: never a pan or zoom of the office under it.
  for (const type of ['pointerdown', 'wheel', 'click'] as const) {
    card.addEventListener(type, (e) => e.stopPropagation());
  }

  const outside = (e: PointerEvent): void => {
    if (!row.contains(e.target as Node)) {
      close();
    }
  };
  const escape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
      key.focus();
    }
  };
  const close = (): void => {
    row.classList.remove('open');
    key.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape);
  };
  const open = (): void => {
    row.classList.add('open');
    // Beside the key where it fits; on a screen too narrow for that, above it.
    // Its top beside the key's, or its bottom where the key is low on the screen.
    row.classList.remove('above', 'rise');
    if (card.getBoundingClientRect().left < CORNER_INSET) {
      row.classList.add('above');
    } else if (card.getBoundingClientRect().bottom > window.innerHeight - CORNER_INSET) {
      row.classList.add('rise');
    }
    key.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
  };
  const key = controlButton(FLOORS_ICON, 'Floors', () => {
    if (row.classList.contains('open')) {
      close();
    } else {
      open();
    }
  });
  key.setAttribute('aria-haspopup', 'menu');
  key.setAttribute('aria-expanded', 'false');

  // The card's floors, numbered down the building from the top, and the word for where the view is.
  const show = (): void => {
    const here = office.floors.floor.label;
    word.textContent = here;
    key.title = `Floors: on ${here}`;
    key.setAttribute('aria-label', key.title);
    const title = document.createElement('div');
    title.className = 'agentopia-floors-title';
    title.textContent = 'FLOORS';
    const picks = floorChoices(office.floors).map((choice, level) => {
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'agentopia-floors-pick';
      pick.dataset.floor = choice.id;
      pick.setAttribute('role', 'menuitemradio');
      pick.setAttribute('aria-checked', String(choice.current));
      const number = document.createElement('span');
      number.className = 'agentopia-floors-level';
      number.textContent = String(level + 1);
      const name = document.createElement('span');
      name.textContent = choice.label;
      pick.append(number, name);
      pick.addEventListener('click', () => {
        close();
        if (!choice.current) {
          office.goToFloor(choice.id);
        }
      });
      return pick;
    });
    card.replaceChildren(title, ...picks);
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

  row.append(style, word, key, card);
  office.addUnderCamera(row);
  return () => {
    close();
    stop();
    window.removeEventListener('keydown', onKey);
    row.remove();
  };
}
