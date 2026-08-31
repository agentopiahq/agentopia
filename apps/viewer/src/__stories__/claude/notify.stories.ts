import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { notifyScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/notify',
};

export const Pre = phaseStory('pre', notifyScenario, registry);
export const Main = phaseStory('main', notifyScenario, registry);
export const Post = phaseStory('post', notifyScenario, registry);
export const Full = phaseStory('full', notifyScenario, registry);
