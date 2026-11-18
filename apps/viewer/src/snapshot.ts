import { Clock } from '@agentopia/core';
import { getFontEmbedCSS, toCanvas } from 'html-to-image';

import { exportName } from './clip';
import { CORNER_INSET } from './corners';
import type { ClipFile, Progress } from './exportClip';
import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';
import { CLIP_MS, Recorder, canRecord } from './recorder';
import { LIT, controlButton, stroke } from './zoom';

/**
 * A picture of the office as it is on screen right now, saved as a PNG: the
 * office itself and everything pinned over it in the corners (the title
 * block, the small print, the camera's mice).
 *
 * The office is a WebGL canvas and the corners are page elements over it, so
 * the picture is made in two layers. The canvas is copied straight after a
 * fresh paint (WebGL keeps no frame to read back later); the page elements
 * are lettered by `html-to-image` with the canvas left out, on a clear
 * ground; and the second is laid over the first.
 */

/** A file name for a picture taken at `at`, by the viewer's local time: `agentopia-2026-11-15-135704.png`. */
export function snapshotName(at: Date): string {
  return exportName(at, 'png');
}

export interface SnapshotSource {
  /** The element the office and its corners live in. */
  host: HTMLElement;
  /** The office's canvas, painted afresh and copied out: the bottom layer. */
  paint: () => HTMLCanvasElement;
  /** Elements on the page to leave out of the picture (the office's own canvas is always left out). */
  exclude?: ReadonlyArray<Element>;
  /** Device pixels per CSS pixel in the picture. */
  pixelRatio: number;
  /** The page's faces as embeddable CSS, from `fontsFor`; read afresh when absent. */
  fontEmbedCSS?: string;
}

/**
 * The faces the corners are lettered in, as CSS with the font files inlined:
 * a picture of the page cannot reach the page's own fonts. Reading them is
 * the slow part of a first picture, so the export key starts it early (when
 * the pointer reaches it) and keeps the answer.
 */
export function fontsFor(host: HTMLElement): Promise<string> {
  return getFontEmbedCSS(host);
}

/**
 * The page elements over the office (its corners), lettered at `pixelRatio`
 * on a clear ground, with the office's canvas and `exclude` left out: the top
 * layer of a picture, and laid over every frame of a clip.
 */
export function cornersLayer(source: Omit<SnapshotSource, 'paint'>): Promise<HTMLCanvasElement> {
  const { host, pixelRatio } = source;
  const leftOut = new Set<Element>(source.exclude ?? []);
  return toCanvas(host, {
    width: host.clientWidth,
    height: host.clientHeight,
    pixelRatio,
    fontEmbedCSS: source.fontEmbedCSS,
    // The office is the bottom layer; the corners go over it on a clear ground.
    style: { background: 'transparent' },
    filter: (node) =>
      !(node instanceof HTMLCanvasElement) && !(node instanceof Element && leftOut.has(node)),
  });
}

/** The office and its corners, composited at `pixelRatio`, as a canvas. */
export async function snapshot(source: SnapshotSource): Promise<HTMLCanvasElement> {
  const { host, pixelRatio } = source;
  const office = source.paint();
  const width = host.clientWidth;
  const height = host.clientHeight;
  const corners = await cornersLayer(source);
  const out = document.createElement('canvas');
  out.width = Math.round(width * pixelRatio);
  out.height = Math.round(height * pixelRatio);
  const g = out.getContext('2d');
  if (!g) {
    throw new Error('no 2d context for the snapshot');
  }
  // The office's canvas is sized to fill the host, so both layers span the picture.
  g.drawImage(office, 0, 0, out.width, out.height);
  g.drawImage(corners, 0, 0, out.width, out.height);
  return out;
}

/** `canvas` as a PNG. */
export async function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('the snapshot could not be encoded');
  }
  return blob;
}

/** Hand the viewer `blob` as a file called `name`. */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a moment to take the blob before it is let go.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** What the export key needs of the office. */
export interface Snapshottable {
  /** Paint the office now and copy its canvas out. */
  paintSnapshot(): HTMLCanvasElement;
  /** Call `listener` with the office's canvas right after each paint; returns a function that stops it. */
  onPaint(listener: (canvas: HTMLCanvasElement) => void): () => void;
  /** Stack a row above the camera's mice. */
  addAboveCamera(row: HTMLElement): void;
  /** Device pixels per CSS pixel on this screen. */
  pixelRatio(): number;
}

const HALO = `0 0 2px ${SHEET.paper},0 0 2px ${SHEET.paper},0 0 4px ${SHEET.paper}`;

const EXPORT_STYLE = `
.agentopia-export{position:relative;display:flex;align-items:center;gap:7px;pointer-events:none;user-select:none;}
.agentopia-export > .agentopia-control{pointer-events:auto;}
.agentopia-export.open > .agentopia-control,
.agentopia-export.open > .agentopia-control:hover{background:${LIT};border-color:${LIT};color:${SHEET.paper};}
.agentopia-export-word{font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};text-shadow:${HALO};
  opacity:0;visibility:hidden;transition:opacity 140ms ease,visibility 0s linear 140ms;}
.agentopia-export:not(.open):hover .agentopia-export-word,
.agentopia-export:not(.open):focus-within .agentopia-export-word{opacity:1;visibility:visible;transition:opacity 140ms ease;}
.agentopia-camera-corner.tips .agentopia-export.coarse:not(.open) .agentopia-export-word,
.agentopia-export.saving .agentopia-export-word{opacity:1;visibility:visible;}
.agentopia-export-card{position:absolute;right:calc(100% + 10px);top:0;display:none;flex-direction:column;gap:6px;
  padding:12px 14px 12px;border:1.5px solid ${SHEET.ink};border-radius:10px;background:${SHEET.paper};
  box-shadow:4px 5px 0 #6a60551f;color:${SHEET.ink};pointer-events:auto;white-space:nowrap;}
.agentopia-export.open .agentopia-export-card{display:flex;}
.agentopia-export.up .agentopia-export-card{top:auto;bottom:0;}
.agentopia-export.above .agentopia-export-card{right:0;top:auto;bottom:calc(100% + 10px);}
.agentopia-export-title{font:400 17px/1 ${FONT.hand};letter-spacing:2px;margin-bottom:2px;}
.agentopia-export-option{display:flex;align-items:center;gap:9px;width:208px;padding:6px 10px 6px 8px;box-sizing:border-box;
  border:1.5px solid ${SHEET.ink};border-radius:8px;background:${SHEET.paper};color:${SHEET.ink};cursor:pointer;
  box-shadow:0 2px 0 ${SHEET.ink};text-align:left;}
.agentopia-export-option svg{display:block;flex:none;}
.agentopia-export-option:hover,.agentopia-export-option:focus-visible{border-color:${LIT};color:${LIT};box-shadow:0 2px 0 ${LIT};outline:none;}
.agentopia-export-option:disabled{cursor:default;opacity:0.45;box-shadow:none;border-color:${SHEET.ink};color:${SHEET.ink};}
.agentopia-export-name{flex:1;font:700 16px/1 ${FONT.hand};}
.agentopia-export-note{font:400 14px/1 ${FONT.hand};color:${SHEET.lead};}
`;

/** A tray with an arrow dropping into it, in the camera keys' line. */
const EXPORT_ICON = stroke('M6 1.8v5.6M3.6 5.2L6 7.6l2.4-2.4M2 8.4v1.8h8V8.4', 13);

/** The menu's glyphs: a framed hill and sun, a strip of film frames, a camera with its lens. */
const OPTION_ICON = {
  png: stroke(
    'M1.5 2.2h9v7.6h-9ZM1.5 8.2l2.8-2.6l2 1.8l1.5-1.2l2.7 2.2M7.6 4.2a.8.8 0 1 1 .01 0',
    18
  ),
  gif: stroke('M2.2 1.4h7.6v9.2H2.2ZM2.2 4.4h7.6M2.2 7.6h7.6M4 1.4v9.2M8 1.4v9.2', 18),
  video: stroke('M1.2 3.2h6.6v5.6H1.2ZM7.8 5.2l3-1.8v5.2l-3-1.8', 18),
};

type ExportKind = keyof typeof OPTION_ICON;

/** What the hover word says while an export is being made. */
const MAKING: Record<ExportKind, string> = {
  png: 'saving…',
  gif: 'making gif',
  video: 'making video',
};

/**
 * The export key, stacked above the camera's mice in the bottom-right corner.
 * Pressed, it opens a card to its left with three ways to save the view in
 * `host`, corners and all, named for the time on `clock`:
 *
 * - a picture, a PNG of it as it is now;
 * - a GIF of its last ten seconds, looping;
 * - a video of its last ten seconds (MP4 where the browser can make one).
 *
 * The last ten seconds are always being kept (`Recorder`), so a clip is of what
 * just happened. Where the browser cannot record, the clips are greyed out.
 * The key itself is left out of everything it saves; hovered, it letters what
 * it does to its left, as the camera's rows do, and while a file is being made
 * it says how far along it is.
 */
export function mountExport(
  host: HTMLElement,
  office: Snapshottable,
  options: { clock: Clock }
): () => void {
  const row = document.createElement('div');
  row.className = 'agentopia-export';
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (coarse) {
    row.classList.add('coarse');
  }
  const style = document.createElement('style');
  style.textContent = EXPORT_STYLE;
  const word = document.createElement('div');
  word.className = 'agentopia-export-word';
  word.textContent = 'export';

  const recorder = canRecord() ? new Recorder(options.clock) : null;
  const stopRecording = recorder ? office.onPaint((canvas) => recorder.capture(canvas)) : null;

  let fonts: Promise<string> | null = null;
  const readFonts = (): Promise<string> => {
    fonts ??= fontsFor(host).catch(() => {
      fonts = null;
      return '';
    });
    return fonts;
  };

  const card = document.createElement('div');
  card.className = 'agentopia-export-card';
  card.setAttribute('role', 'menu');
  card.setAttribute('aria-label', 'Export');
  const title = document.createElement('div');
  title.className = 'agentopia-export-title';
  title.textContent = 'EXPORT';
  card.append(title);

  const notes = new Map<ExportKind, HTMLSpanElement>();
  const buttons = new Map<ExportKind, HTMLButtonElement>();
  const option = (kind: ExportKind, name: string, label: string): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'agentopia-export-option';
    b.setAttribute('role', 'menuitem');
    b.setAttribute('aria-label', label);
    b.title = label;
    const nameEl = document.createElement('span');
    nameEl.className = 'agentopia-export-name';
    nameEl.textContent = name;
    const note = document.createElement('span');
    note.className = 'agentopia-export-note';
    b.innerHTML = OPTION_ICON[kind];
    b.append(nameEl, note);
    b.addEventListener('click', () => {
      close();
      start(kind);
    });
    notes.set(kind, note);
    buttons.set(kind, b);
    card.append(b);
  };
  option('png', 'picture', 'Save a picture of the office now (PNG)');
  option('gif', 'gif', 'Save the last ten seconds as a looping GIF');
  option('video', 'video', 'Save the last ten seconds as a video');

  /** The notes beside each option: what it saves, or why it can't yet. */
  const show = (): void => {
    (notes.get('png') as HTMLSpanElement).textContent = 'now · png';
    const seconds = recorder?.seconds() ?? 0;
    for (const kind of ['gif', 'video'] as const) {
      const note = notes.get(kind) as HTMLSpanElement;
      const button = buttons.get(kind) as HTMLButtonElement;
      if (!recorder) {
        note.textContent = 'not in this browser';
        button.disabled = true;
      } else if (recorder.stoppedFor()) {
        note.textContent =
          recorder.stoppedFor() === 'slow' ? 'too slow here' : 'not in this browser';
        button.disabled = true;
      } else if (seconds < 1) {
        note.textContent = 'recording…';
        button.disabled = true;
      } else {
        const span = Math.min(CLIP_MS / 1000, Math.floor(seconds));
        // Where frames cost more to copy (Safari), fewer are kept: say so.
        const fps = recorder.framesPerSecond();
        note.textContent = fps < 30 ? `last ${span} s · ${fps} fps` : `last ${span} s`;
        button.disabled = false;
      }
    }
  };

  let saving = false;
  const busy = (on: boolean, text = 'export'): void => {
    saving = on;
    key.disabled = on;
    row.classList.toggle('saving', on);
    word.textContent = text;
  };
  const progressFor =
    (kind: ExportKind): Progress =>
    (done) => {
      word.textContent = `${MAKING[kind]} ${Math.round(done * 100)}%`;
    };

  const make = async (kind: ExportKind): Promise<ClipFile> => {
    const pixelRatio = office.pixelRatio();
    const fontEmbedCSS = (await readFonts()) || undefined;
    if (kind === 'png') {
      const canvas = await snapshot({
        host,
        paint: () => office.paintSnapshot(),
        exclude: [row],
        pixelRatio,
        fontEmbedCSS,
      });
      return { blob: await toPng(canvas), extension: 'png' };
    }
    // The clip as it stands now; the recorder keeps going while it is made.
    const clip = recorder?.take();
    if (!clip) {
      throw new Error('nothing recorded yet');
    }
    const corners = await cornersLayer({
      host,
      exclude: [row],
      pixelRatio: clip.width / Math.max(1, host.clientWidth),
      fontEmbedCSS,
    }).catch(() => null);
    const progress = progressFor(kind);
    progress(0);
    // The encoders are a quarter of a megabyte: fetched the first time a clip is made.
    const { clipToGif, clipToVideo } = await import('./exportClip');
    return kind === 'gif'
      ? clipToGif(clip, corners, progress)
      : clipToVideo(clip, corners, progress);
  };

  const start = (kind: ExportKind): void => {
    if (saving) {
      return;
    }
    busy(true, MAKING[kind]);
    // The time it was asked for, not when it is done.
    const at = new Date(options.clock.now());
    void make(kind)
      .then((file) => saveFile(file.blob, exportName(at, file.extension)))
      .catch((err: unknown) => console.error(`agentopia: could not save the ${kind}`, err))
      .finally(() => busy(false));
  };

  for (const type of ['pointerdown', 'wheel', 'click'] as const) {
    card.addEventListener(type, (e) => e.stopPropagation());
  }
  let ticking = 0;
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
    // Its top beside the key's, or its bottom where the key is low on the
    // screen (last in the column on a touch screen).
    row.classList.remove('above', 'up');
    if (card.getBoundingClientRect().left < CORNER_INSET) {
      row.classList.add('above');
    } else if (card.getBoundingClientRect().bottom > window.innerHeight - CORNER_INSET) {
      row.classList.add('up');
    }
    key.setAttribute('aria-expanded', 'true');
    show();
    ticking = window.setInterval(show, 500);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    void readFonts();
  };
  const close = (): void => {
    row.classList.remove('open');
    key.setAttribute('aria-expanded', 'false');
    window.clearInterval(ticking);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape);
  };
  const key = controlButton(EXPORT_ICON, 'Export a picture, GIF or video', () => {
    if (row.classList.contains('open')) {
      close();
    } else {
      open();
    }
  });
  key.setAttribute('aria-haspopup', 'menu');
  key.setAttribute('aria-expanded', 'false');
  // Heading for the key is a good sign an export is wanted: start on the fonts.
  row.addEventListener('pointerenter', () => void readFonts());
  row.addEventListener('focusin', () => void readFonts());
  row.append(style, word, key, card);
  office.addAboveCamera(row);
  return () => {
    close();
    stopRecording?.();
    recorder?.destroy();
    row.remove();
  };
}
