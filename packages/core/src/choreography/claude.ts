import { defaultChoreography } from './default';
import { ChoreographyRegistry } from './types';

/**
 * Claude Code's staging. It matches the shared default exactly; a harness
 * with a different tool surface (Codex runs nearly everything as `execute`)
 * overrides the kinds it wants staged differently in a file like this one.
 */
export const claudeChoreography: ChoreographyRegistry = {
  ...defaultChoreography,
};
