import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { sessionEndScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/session.end',
};

export const Pre = phaseStory('pre', sessionEndScenario, registry);
export const Main = phaseStory('main', sessionEndScenario, registry);
export const Post = phaseStory('post', sessionEndScenario, registry);
export const Full = phaseStory('full', sessionEndScenario, registry);
