import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { contextCompactedScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/context.compacted',
};

export const Pre = phaseStory('pre', contextCompactedScenario, registry);
export const Main = phaseStory('main', contextCompactedScenario, registry);
export const Post = phaseStory('post', contextCompactedScenario, registry);
export const Full = phaseStory('full', contextCompactedScenario, registry);
