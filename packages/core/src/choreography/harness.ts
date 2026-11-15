import { claudeChoreography } from './claude';
import { defaultChoreography } from './default';
import { ChoreographyRegistry } from './types';

/**
 * Per-harness registries, by harness id. Each harness implements the same
 * `EventChoreography` interface, usually by extending the default; the
 * differences live beside `claude.ts`, never in the director.
 */
export const CHOREOGRAPHIES: Readonly<Record<string, ChoreographyRegistry>> = {
  claude: claudeChoreography,
};

/** The registry for a harness, falling back to the shared default. */
export function choreographyFor(harness?: string): ChoreographyRegistry {
  return (harness && CHOREOGRAPHIES[harness]) || defaultChoreography;
}
