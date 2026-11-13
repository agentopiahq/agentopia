import '@fontsource/gaegu/latin-400.css';
import '@fontsource/gaegu/latin-700.css';
import '@fontsource/young-serif/latin-400.css';

import { FONT } from './iso';

/**
 * The sheet's two faces, bundled with the viewer so the office works offline:
 * Young Serif for the title, Gaegu for every hand-lettered word. Canvas text
 * uses whatever face is loaded at the moment it is drawn, so anything baked
 * once (the sheet, the objects) waits for these first.
 */
let ready: Promise<void> | null = null;

export function fontsReady(): Promise<void> {
  if (!ready) {
    const faces = [`76px ${FONT.title}`, `20px ${FONT.hand}`, `700 20px ${FONT.hand}`];
    ready = Promise.all(faces.map((face) => document.fonts.load(face)))
      .then(() => undefined)
      // A missing face falls back to the stack; never block the office on it.
      .catch(() => undefined);
  }
  return ready;
}
