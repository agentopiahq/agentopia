import { Clock } from '@agentopia/core';
import { toCanvas } from 'html-to-image';

import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';
import { controlButton, stroke } from './zoom';

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
  const pad = (n: number): string => String(n).padStart(2, '0');
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `agentopia-${day}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}.png`;
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
}

/** The office and its corners, composited at `pixelRatio`, as a canvas. */
export async function snapshot(source: SnapshotSource): Promise<HTMLCanvasElement> {
  const { host, pixelRatio } = source;
  const office = source.paint();
  const leftOut = new Set<Element>(source.exclude ?? []);
  const width = host.clientWidth;
  const height = host.clientHeight;
  const corners = await toCanvas(host, {
    width,
    height,
    pixelRatio,
    // The office is the bottom layer; the corners go over it on a clear ground.
    style: { background: 'transparent' },
    filter: (node) =>
      !(node instanceof HTMLCanvasElement) && !(node instanceof Element && leftOut.has(node)),
  });
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

/** Hand the viewer `canvas` as a PNG file called `name`. */
export async function savePng(canvas: HTMLCanvasElement, name: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('the snapshot could not be encoded');
  }
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
  /** Stack a row above the camera's mice. */
  addAboveCamera(row: HTMLElement): void;
  /** Device pixels per CSS pixel on this screen. */
  pixelRatio(): number;
}

const EXPORT_STYLE = `
.agentopia-export{display:flex;align-items:center;gap:7px;pointer-events:none;user-select:none;}
.agentopia-export .agentopia-control{pointer-events:auto;}
.agentopia-export-word{font:400 15px/1.2 ${FONT.hand};color:${SHEET.lead};
  text-shadow:0 0 2px ${SHEET.paper},0 0 2px ${SHEET.paper},0 0 4px ${SHEET.paper};
  opacity:0;visibility:hidden;transition:opacity 140ms ease,visibility 0s linear 140ms;}
.agentopia-export:hover .agentopia-export-word,
.agentopia-export:focus-within .agentopia-export-word{opacity:1;visibility:visible;transition:opacity 140ms ease;}
.agentopia-export.coarse .agentopia-export-word{opacity:1;visibility:visible;}
`;

/** A tray with an arrow dropping into it, in the camera keys' line. */
const EXPORT_ICON = stroke('M6 1.8v5.6M3.6 5.2L6 7.6l2.4-2.4M2 8.4v1.8h8V8.4', 13);

/**
 * The export key, stacked above the camera's mice in the bottom-right corner:
 * pressed, it saves a PNG of the whole view in `host`, corners and all, named for the
 * time on `clock`. The key itself is left out of the picture; hovered, it
 * letters what it does to its left, as the camera's rows do.
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
  word.textContent = 'save png';
  let saving = false;
  const key = controlButton(EXPORT_ICON, 'Save a picture of the office (PNG)', () => {
    if (saving) {
      return;
    }
    saving = true;
    key.disabled = true;
    void snapshot({
      host,
      paint: () => office.paintSnapshot(),
      exclude: [row],
      pixelRatio: office.pixelRatio(),
    })
      .then((canvas) => savePng(canvas, snapshotName(new Date(options.clock.now()))))
      .catch((err: unknown) => console.error('agentopia: could not save a picture', err))
      .finally(() => {
        saving = false;
        key.disabled = false;
      });
  });
  row.append(style, word, key);
  office.addAboveCamera(row);
  return () => row.remove();
}
