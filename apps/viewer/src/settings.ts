import { CORNER_INSET } from './corners';
import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';
import { WEATHER_KINDS, WeatherKind } from './sky';
import { clockFace, minutesAlong } from './skyClock';
import { ICON, LIT, controlButton, stroke } from './zoom';

/**
 * The settings key, at the top of the keys stacked above the camera's mice in
 * the bottom-right corner. Pressed, it opens a card of settings to its left,
 * lettered and inked like the sheet. It holds three:
 *
 * - The daylight bar, the sky's day from midnight to midnight with a marker at
 *   the time outside. Drag the marker and the sun, the moon and the light run
 *   along with it; click the bar and the sky jumps there. Either way it runs on
 *   from where it was left, and the reset key beside it puts it back on the
 *   wall clock.
 * - The weather, every kind the sky has, the one outside now lit. Pick one and
 *   it rolls in within a second and stays for the rest of this
 *   ten-minute spell, then the clock's next spell takes over again; the reset
 *   key beside it hands the weather back to the clock sooner.
 * - The style, every way the office can be drawn (`styles/`), the one in force
 *   lit. Pick one and the office is redrawn in it at once; the choice is kept
 *   for this viewer.
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
  /** The kind of weather outside now. */
  weatherNow(): WeatherKind;
  /** Hold a kind of weather outside for the rest of this spell. */
  pickWeather(kind: WeatherKind): void;
  /** Put the weather back on the clock's spells now. */
  followWeatherClock(): void;
  /** How long a weather picked by hand has left, in milliseconds, or null while the clock brings it. */
  weatherPickLeft(): number | null;
  /** The drawing styles on offer, in order. */
  styles(): { id: string; label: string }[];
  /** The drawing style in force. */
  styleNow(): string;
  /** Draw the office in another style. */
  pickStyle(id: string): void;
}

/**
 * How wide the daylight bar (and the weather row under it) is: 240 CSS pixels,
 * or less on a screen too narrow for the card round it to fit.
 */
const BAR_W = `min(240px, calc(100vw - ${2 * CORNER_INSET + 72}px))`;
/** How far an arrow key moves the sky, in its minutes. */
const KEY_STEP = 15;

/** A cog: a ring with eight teeth round it. */
const GEAR_ICON = stroke(
  'M8.6 6a2.6 2.6 0 1 1-5.2 0a2.6 2.6 0 1 1 5.2 0ZM6 1.2v1.2M6 9.6v1.2M1.2 6h1.2M9.6 6h1.2' +
    'M2.6 2.6l.85.85M8.55 8.55l.85.85M2.6 9.4l.85-.85M8.55 3.45l.85-.85',
  13
);

/** The weathers' glyphs, in the controls' line: a cloud is a flat base under two bumps. */
const WEATHER_ICON: Record<WeatherKind, string> = {
  clear: stroke(
    'M8.2 6a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 1 1 4.4 0ZM6 1v1.2M6 9.8V11M1 6h1.2M9.8 6H11' +
      'M2.5 2.5l.85.85M8.65 8.65l.85.85M2.5 9.5l.85-.85M8.65 3.35l.85-.85',
    16
  ),
  cloudy: stroke(
    'M6.3 3.4a2 2 0 0 1 3.6 2.1M8.2 .9v.9M10.9 2.3l-.6.6M11.3 5.4h-.8' +
      'M2.4 10.6h4.9a1.9 1.9 0 0 0 .2-3.8A2.6 2.6 0 0 0 2.5 7.6a1.5 1.5 0 0 0-.1 3Z',
    16
  ),
  fog: stroke('M2 3.4h8M1 6h7.4M9.8 6h1M2.8 8.6h8.2', 16),
  rain: stroke(
    'M3.2 6.8h5.6a2 2 0 0 0 .2-4A2.8 2.8 0 0 0 3.3 3.8a1.5 1.5 0 0 0-.1 3Z' +
      'M4 8.6l-.6 1.8M6.4 8.6l-.6 1.8M8.8 8.6l-.6 1.8',
    16
  ),
  storm: stroke(
    'M3.2 6.8h5.6a2 2 0 0 0 .2-4A2.8 2.8 0 0 0 3.3 3.8a1.5 1.5 0 0 0-.1 3Z' +
      'M6.7 7.6L5.3 9.5h1.9l-1.3 2',
    16
  ),
  // A six-armed flake, each arm forked at its tip.
  snow: stroke(
    'M6 1v10M1.7 3.5l8.6 5M1.7 8.5l8.6-5' +
      'M4.9 1.7L6 2.6l1.1-.9M4.9 10.3L6 9.4l1.1.9' +
      'M1.9 5l1.3-.3l-.2-1.4M10.1 7l-1.3.3l.2 1.4M1.9 7l1.3.3l-.2 1.4M10.1 5l-1.3-.3l.2-1.4',
    16
  ),
};

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
.agentopia-camera-corner.tips .agentopia-settings.coarse:not(.open) .agentopia-settings-word{opacity:1;visibility:visible;transition:opacity 140ms ease;}
.agentopia-settings-card{position:absolute;right:calc(100% + 10px);top:0;display:none;flex-direction:column;gap:8px;
  padding:12px 14px 10px;border:1.5px solid ${SHEET.ink};border-radius:10px;background:${SHEET.paper};
  box-shadow:4px 5px 0 #6a60551f;color:${SHEET.ink};pointer-events:auto;white-space:nowrap;}
.agentopia-settings.open .agentopia-settings-card{display:flex;}
.agentopia-settings.above .agentopia-settings-card{right:0;top:auto;bottom:calc(100% + 10px);}
.agentopia-settings.rise:not(.above) .agentopia-settings-card{top:auto;bottom:0;}
.agentopia-settings-card{max-height:calc(100vh - ${2 * CORNER_INSET}px);overflow-y:auto;}
.agentopia-settings-title{font:400 17px/1 ${FONT.hand};letter-spacing:2px;}
.agentopia-settings-label{display:flex;justify-content:space-between;align-items:baseline;gap:12px;
  font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};}
.agentopia-settings-time{font:700 15px/1.2 ${FONT.hand};color:${SHEET.ink};}
.agentopia-settings-row{display:flex;align-items:center;gap:8px;}
.agentopia-daylight{position:relative;width:${BAR_W};height:16px;box-sizing:border-box;
  border:1.5px solid ${SHEET.ink};border-radius:8px;background:${DAY_GRADIENT};cursor:pointer;touch-action:none;}
.agentopia-daylight:focus-visible{outline:2px solid ${LIT};outline-offset:2px;}
.agentopia-daylight-mark{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;box-sizing:border-box;
  border:1.5px solid ${SHEET.ink};border-radius:50%;background:${SHEET.paper};pointer-events:none;}
.agentopia-daylight.dragging .agentopia-daylight-mark{background:${LIT};}
.agentopia-daylight-ticks{position:relative;width:${BAR_W};height:12px;font:400 12px/1 ${FONT.hand};color:${SHEET.lead};}
.agentopia-daylight-ticks span{position:absolute;top:0;transform:translateX(-50%);}
.agentopia-weather{display:flex;gap:4px;width:${BAR_W};}
.agentopia-weather-kind{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;
  padding:4px 1px 3px;box-sizing:border-box;overflow:hidden;border:1.5px solid ${SHEET.ink};border-radius:7px;
  background:${SHEET.paper};color:${SHEET.ink};cursor:pointer;font:400 11px/1 ${FONT.hand};letter-spacing:-0.2px;}
.agentopia-weather-kind svg{display:block;}
.agentopia-weather-kind:hover,.agentopia-weather-kind:focus-visible{border-color:${LIT};color:${LIT};outline:none;}
.agentopia-weather-kind[aria-pressed="true"]{background:${LIT};border-color:${LIT};color:${SHEET.paper};}
.agentopia-settings-gap{height:2px;}
.agentopia-styles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;width:${BAR_W};}
.agentopia-style-kind{min-width:0;padding:4px 2px 3px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;
  border:1.5px solid ${SHEET.ink};border-radius:7px;background:${SHEET.paper};color:${SHEET.ink};cursor:pointer;
  font:400 12px/1.1 ${FONT.hand};white-space:nowrap;}
.agentopia-style-kind:hover,.agentopia-style-kind:focus-visible{border-color:${LIT};color:${LIT};outline:none;}
.agentopia-style-kind[aria-pressed="true"]{background:${LIT};border-color:${LIT};color:${SHEET.paper};}
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

  const weatherLabel = document.createElement('div');
  weatherLabel.className = 'agentopia-settings-label';
  const weatherName = document.createElement('span');
  weatherName.textContent = 'weather';
  const weatherState = document.createElement('span');
  weatherState.className = 'agentopia-settings-time';
  weatherLabel.append(weatherName, weatherState);

  const kinds = document.createElement('div');
  kinds.className = 'agentopia-weather';
  kinds.setAttribute('role', 'group');
  kinds.setAttribute('aria-label', 'Weather outside');
  const tiles = new Map<WeatherKind, HTMLButtonElement>();
  for (const kind of WEATHER_KINDS) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'agentopia-weather-kind';
    tile.innerHTML = `${WEATHER_ICON[kind]}<span>${kind}</span>`;
    tile.title = `Make it ${kind} till the weather next turns`;
    tile.addEventListener('click', () => {
      office.pickWeather(kind);
      show();
    });
    tiles.set(kind, tile);
    kinds.append(tile);
  }
  const weatherBack = controlButton(ICON.reset, 'Let the clock bring the weather again', () => {
    office.followWeatherClock();
    show();
  });
  const weatherRow = document.createElement('div');
  weatherRow.className = 'agentopia-settings-row';
  weatherRow.append(kinds, weatherBack);

  const styleLabel = document.createElement('div');
  styleLabel.className = 'agentopia-settings-label';
  const styleName = document.createElement('span');
  styleName.textContent = 'style';
  const styleState = document.createElement('span');
  styleState.className = 'agentopia-settings-time';
  styleLabel.append(styleName, styleState);
  const styleGrid = document.createElement('div');
  styleGrid.className = 'agentopia-styles';
  styleGrid.setAttribute('role', 'group');
  styleGrid.setAttribute('aria-label', 'Drawing style');
  const styleTiles = new Map<string, HTMLButtonElement>();
  for (const { id, label: styleLabelText } of office.styles()) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'agentopia-style-kind';
    tile.textContent = styleLabelText.toLowerCase();
    tile.title = `Draw the office as ${styleLabelText.toLowerCase()}`;
    tile.addEventListener('click', () => {
      office.pickStyle(id);
      show();
    });
    styleTiles.set(id, tile);
    styleGrid.append(tile);
  }

  const gap = document.createElement('div');
  gap.className = 'agentopia-settings-gap';
  const gap2 = document.createElement('div');
  gap2.className = 'agentopia-settings-gap';
  card.append(
    title,
    label,
    barRow,
    ticks,
    gap,
    weatherLabel,
    weatherRow,
    gap2,
    styleLabel,
    styleGrid
  );

  /** Draw the bar at the sky's time now. */
  const show = (): void => {
    const minutes = office.skyMinutesNow();
    mark.style.left = `${(minutes / 1440) * 100}%`;
    const following = office.skyFollowsClock();
    time.textContent = `${clockFace(minutes)}${following ? '' : ' · set by hand'}`;
    bar.setAttribute('aria-valuenow', String(Math.round(minutes)));
    bar.setAttribute('aria-valuetext', clockFace(minutes));
    back.disabled = following;

    const weather = office.weatherNow();
    const left = office.weatherPickLeft();
    const natural = left === null;
    weatherState.textContent = natural
      ? weather
      : `${weather} · picked, ${Math.max(1, Math.ceil(left / 60_000))} min left`;
    for (const [kind, tile] of tiles) {
      tile.setAttribute('aria-pressed', String(kind === weather));
    }
    weatherBack.disabled = natural;

    const style = office.styleNow();
    styleState.textContent =
      office
        .styles()
        .find((s) => s.id === style)
        ?.label.toLowerCase() ?? style;
    for (const [id, tile] of styleTiles) {
      tile.setAttribute('aria-pressed', String(id === style));
    }
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
    // Beside the key where it fits; on a screen too narrow for that, above it.
    row.classList.remove('above');
    if (card.getBoundingClientRect().left < CORNER_INSET) {
      row.classList.add('above');
    }
    // Too tall to hang down from the key: it rises from it instead.
    row.classList.remove('rise');
    if (card.getBoundingClientRect().bottom > window.innerHeight - CORNER_INSET) {
      row.classList.add('rise');
    }
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
