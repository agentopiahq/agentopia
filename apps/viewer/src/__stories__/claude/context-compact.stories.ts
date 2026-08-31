import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { contextCompactScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/context.compact',
};

export const Pre = phaseStory('pre', contextCompactScenario, registry);
export const Main = phaseStory('main', contextCompactScenario, registry);
export const Post = phaseStory('post', contextCompactScenario, registry);
export const Full = phaseStory('full', contextCompactScenario, registry);
