import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';
import { clockFace, minutesAlong } from './skyClock';
import { ICON, LIT, controlButton, stroke } from './zoom';

/**
 * The settings key, at the top of the keys stacked above the camera's mice in
 * the bottom-right corner. Pressed, it opens a card of settings to its left,
 * lettered and inked like the sheet. For now it holds one: the daylight bar,
 * the sky's day from midnight to midnight with a marker at the time outside.
 * Drag the marker and the sun, the moon and the light run along with it; click
 * the bar and the sky jumps there. Either way it runs on from where it was
 * left, and the reset key beside it puts it back on the wall clock.
 */

/** What the settings need of the office. */
export interface Settable {
  /** Stack a row above the camera's mice. */
  addAboveCamera(row: HTMLElement): void;
  /** The sky's time of day now, in minutes past its midnight. */
  skyMinutesNow(): number;
  /** Set the sky to `minutes` past its midnight; it runs on from there. */
  setSkyMinutes(minutes: number): void;
  /** Put the sky back on the wall clock. */
  followSkyClock(): void;
  /** Whether the sky keeps the wall clock's time. */
  skyFollowsClock(): boolean;
}

/** How wide the daylight bar is, in CSS pixels. */
const BAR_W = 220;
/** How far an arrow key moves the sky, in its minutes. */
const KEY_STEP = 15;

/** A cog: a ring with eight teeth round it. */
const GEAR_ICON = stroke(
  'M8.6 6a2.6 2.6 0 1 1-5.2 0a2.6 2.6 0 1 1 5.2 0ZM6 1.2v1.2M6 9.6v1.2M1.2 6h1.2M9.6 6h1.2' +
    'M2.6 2.6l.85.85M8.55 8.55l.85.85M2.6 9.4l.85-.85M8.55 3.45l.85-.85',
  13
);

/** The day behind the bar: night at either end, dawn at six, noon blue, dusk at six. */
const DAY_GRADIENT =
  'linear-gradient(90deg,#16213f 0%,#1f2d55 20%,#e88d8a 25%,#8cc6f2 32%,#5aa6ec 50%,' +
  '#8cc6f2 68%,#f0a070 75%,#2a3766 80%,#16213f 100%)';

const HALO = `0 0 2px ${SHEET.paper},0 0 2px ${SHEET.paper},0 0 4px ${SHEET.paper}`;

const SETTINGS_STYLE = `
.agentopia-settings{position:relative;display:flex;align-items:center;gap:7px;pointer-events:none;user-select:none;}
.agentopia-settings > .agentopia-control{pointer-events:auto;}
.agentopia-settings.open > .agentopia-control,
.agentopia-settings.open > .agentopia-control:hover{background:${LIT};border-color:${LIT};color:${SHEET.paper};}
.agentopia-settings-word{font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};text-shadow:${HALO};
  opacity:0;visibility:hidden;transition:opacity 140ms ease,visibility 0s linear 140ms;}
.agentopia-settings:not(.open):hover .agentopia-settings-word,
.agentopia-settings:not(.open):focus-within .agentopia-settings-word{opacity:1;visibility:visible;transition:opacity 140ms ease;}
.agentopia-settings.coarse:not(.open) .agentopia-settings-word{opacity:1;visibility:visible;}
.agentopia-settings-card{position:absolute;right:calc(100% + 10px);top:0;display:none;flex-direction:column;gap:8px;
  padding:12px 14px 10px;border:1.5px solid ${SHEET.ink};border-radius:10px;background:${SHEET.paper};
  box-shadow:4px 5px 0 #6a60551f;color:${SHEET.ink};pointer-events:auto;white-space:nowrap;}
.agentopia-settings.open .agentopia-settings-card{display:flex;}
.agentopia-settings-title{font:400 17px/1 ${FONT.hand};letter-spacing:2px;}
.agentopia-settings-label{display:flex;justify-content:space-between;align-items:baseline;gap:12px;
  font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};}
.agentopia-settings-time{font:700 15px/1.2 ${FONT.hand};color:${SHEET.ink};}
.agentopia-settings-row{display:flex;align-items:center;gap:8px;}
.agentopia-daylight{position:relative;width:${BAR_W}px;height:16px;box-sizing:border-box;
  border:1.5px solid ${SHEET.ink};border-radius:8px;background:${DAY_GRADIENT};cursor:pointer;touch-action:none;}
.agentopia-daylight:focus-visible{outline:2px solid ${LIT};outline-offset:2px;}
.agentopia-daylight-mark{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;box-sizing:border-box;
  border:1.5px solid ${SHEET.ink};border-radius:50%;background:${SHEET.paper};pointer-events:none;}
.agentopia-daylight.dragging .agentopia-daylight-mark{background:${LIT};}
.agentopia-daylight-ticks{position:relative;width:${BAR_W}px;height:12px;font:400 12px/1 ${FONT.hand};color:${SHEET.lead};}
.agentopia-daylight-ticks span{position:absolute;top:0;transform:translateX(-50%);}
`;

/** Mount the settings key over the camera's mice; returns a function that takes it away. */
export function mountSettings(office: Settable): () => void {
  const row = document.createElement('div');
  row.className = 'agentopia-settings';
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (coarse) {
    row.classList.add('coarse');
  }
  const style = document.createElement('style');
  style.textContent = SETTINGS_STYLE;
  const word = document.createElement('div');
  word.className = 'agentopia-settings-word';
  word.textContent = 'settings';

  const card = document.createElement('div');
  card.className = 'agentopia-settings-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Settings');
  const title = document.createElement('div');
  title.className = 'agentopia-settings-title';
  title.textContent = 'SETTINGS';

  const label = document.createElement('div');
  label.className = 'agentopia-settings-label';
  const name = document.createElement('span');
  name.textContent = 'daylight';
  const time = document.createElement('span');
  time.className = 'agentopia-settings-time';
  label.append(name, time);

  const bar = document.createElement('div');
  bar.className = 'agentopia-daylight';
  bar.tabIndex = 0;
  bar.setAttribute('role', 'slider');
  bar.setAttribute('aria-label', 'Time of day outside');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '1440');
  const mark = document.createElement('div');
  mark.className = 'agentopia-daylight-mark';
  bar.append(mark);

  const back = controlButton(ICON.reset, 'Follow the clock again', () => {
    office.followSkyClock();
    show();
  });

  const barRow = document.createElement('div');
  barRow.className = 'agentopia-settings-row';
  barRow.append(bar, back);

  const ticks = document.createElement('div');
  ticks.className = 'agentopia-daylight-ticks';
  for (const hour of [0, 6, 12, 18, 24]) {
    const tick = document.createElement('span');
    tick.style.left = `${(hour / 24) * 100}%`;
    tick.textContent = String(hour);
    ticks.append(tick);
  }
  card.append(title, label, barRow, ticks);

  /** Draw the bar at the sky's time now. */
  const show = (): void => {
    const minutes = office.skyMinutesNow();
    mark.style.left = `${(minutes / 1440) * 100}%`;
    const following = office.skyFollowsClock();
    time.textContent = `${clockFace(minutes)}${following ? '' : ' · set by hand'}`;
    bar.setAttribute('aria-valuenow', String(Math.round(minutes)));
    bar.setAttribute('aria-valuetext', clockFace(minutes));
    back.disabled = following;
  };

  // A press on the bar sets the sky there; holding and dragging runs it along.
  const setFrom = (e: PointerEvent): void => {
    const box = bar.getBoundingClientRect();
    office.setSkyMinutes(minutesAlong(e.clientX - box.left, box.width));
    show();
  };
  bar.addEventListener('pointerdown', (e) => {
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('dragging');
    setFrom(e);
  });
  bar.addEventListener('pointermove', (e) => {
    if (bar.hasPointerCapture(e.pointerId)) {
      setFrom(e);
    }
  });
  const release = (e: PointerEvent): void => {
    if (bar.hasPointerCapture(e.pointerId)) {
      bar.releasePointerCapture(e.pointerId);
    }
    bar.classList.remove('dragging');
  };
  bar.addEventListener('pointerup', release);
  bar.addEventListener('pointercancel', release);
  bar.addEventListener('keydown', (e) => {
    const by = e.key === 'ArrowRight' ? KEY_STEP : e.key === 'ArrowLeft' ? -KEY_STEP : 0;
    if (by !== 0) {
      e.preventDefault();
      office.setSkyMinutes((office.skyMinutesNow() + by + 1440) % 1440);
      show();
    }
  });

  // The card's presses, drags and wheel are its own: never a pan or zoom of the office under it.
  for (const type of ['pointerdown', 'wheel', 'click'] as const) {
    card.addEventListener(type, (e) => e.stopPropagation());
  }

  // While open, the marker keeps pace with the sky.
  let frame = 0;
  const tick = (): void => {
    show();
    frame = requestAnimationFrame(tick);
  };
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
  const open = (): void => {
    row.classList.add('open');
    key.setAttribute('aria-expanded', 'true');
    show();
    frame = requestAnimationFrame(tick);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
  };
  const close = (): void => {
    row.classList.remove('open');
    key.setAttribute('aria-expanded', 'false');
    cancelAnimationFrame(frame);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape);
  };
  const key = controlButton(GEAR_ICON, 'Settings', () => {
    if (row.classList.contains('open')) {
      close();
    } else {
      open();
    }
  });
  key.setAttribute('aria-haspopup', 'dialog');
  key.setAttribute('aria-expanded', 'false');

  row.append(style, word, key, card);
  office.addAboveCamera(row);
  return () => {
    close();
    row.remove();
  };
}
