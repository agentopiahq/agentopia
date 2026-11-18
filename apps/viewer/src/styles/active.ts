import { RenderStyle } from './types';

/**
 * The house look: the office exactly as it is drawn, with nothing remapped.
 * Every other style is measured against it.
 */
export const CARTOON: RenderStyle = {
  id: 'cartoon',
  label: 'Cartoon',
  paper: '#fffdf6',
  grid: '#ece5d4',
};

let current: RenderStyle = CARTOON;
let version = 0;

/** The style everything is drawn in now. */
export function activeStyle(): RenderStyle {
  return current;
}

/** Draw everything in `style` from now on; returns whether that changed anything. */
export function useStyle(style: RenderStyle): boolean {
  if (style === current) {
    return false;
  }
  current = style;
  version += 1;
  return true;
}

/** Counts style changes, so a cache can tell its drawings are stale. */
export function styleVersion(): number {
  return version;
}
