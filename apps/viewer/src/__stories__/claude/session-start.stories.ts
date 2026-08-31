import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { sessionStartScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/session.start',
};

export const Pre = phaseStory('pre', sessionStartScenario, registry);
export const Main = phaseStory('main', sessionStartScenario, registry);
export const Post = phaseStory('post', sessionStartScenario, registry);
export const Full = phaseStory('full', sessionStartScenario, registry);
