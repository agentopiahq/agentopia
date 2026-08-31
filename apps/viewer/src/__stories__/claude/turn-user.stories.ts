import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { turnUserScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/turn.user',
};

export const Pre = phaseStory('pre', turnUserScenario, registry);
export const Main = phaseStory('main', turnUserScenario, registry);
export const Post = phaseStory('post', turnUserScenario, registry);
export const Full = phaseStory('full', turnUserScenario, registry);
