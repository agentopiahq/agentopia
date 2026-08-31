import { defaultChoreography } from './default';
import { ChoreographyRegistry } from './types';

/**
 * Per-harness registries. Each harness implements the same
 * `EventChoreography` interface, usually by extending the default; the
 * differences live here, not in the director.
 *
 * Claude Code currently matches the default exactly. When Codex lands, its
 * registry goes next to this one — its coarse tool surface (nearly everything
 * is `execute`) will want different staging for the same normalized events.
 */
export const claudeChoreography: ChoreographyRegistry = {
  ...defaultChoreography,
};

const REGISTRIES: Record<string, ChoreographyRegistry> = {
  claude: claudeChoreography,
};

/** The registry for a harness, falling back to the shared default. */
export function choreographyFor(harness?: string): ChoreographyRegistry {
  return (harness && REGISTRIES[harness]) || defaultChoreography;
}
