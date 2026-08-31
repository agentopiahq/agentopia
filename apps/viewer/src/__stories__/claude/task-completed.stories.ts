import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { taskCompletedScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/task.completed',
};

export const Pre = phaseStory('pre', taskCompletedScenario, registry);
export const Main = phaseStory('main', taskCompletedScenario, registry);
export const Post = phaseStory('post', taskCompletedScenario, registry);
export const Full = phaseStory('full', taskCompletedScenario, registry);
