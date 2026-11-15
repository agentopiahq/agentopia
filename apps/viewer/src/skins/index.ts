import { claudeSkin } from './claude';
import { Skin } from './types';

export * from './claude';
export * from './types';

/**
 * Per-harness looks, keyed by harness id (`Actor.harness`). Add a harness's
 * skin next to `claude.ts` and list it here.
 */
export const SKINS: Record<string, Skin> = {
  claude: claudeSkin,
};

/**
 * The look for an actor's harness. Residents (no harness) and harnesses with
 * no skin of their own are drawn as Claude Code agents.
 */
export function skinFor(harness?: string): Skin {
  return (harness && SKINS[harness]) || claudeSkin;
}
