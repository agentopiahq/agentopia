import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { taskCreatedScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/task.created',
};

export const Pre = phaseStory('pre', taskCreatedScenario, registry);
export const Main = phaseStory('main', taskCreatedScenario, registry);
export const Post = phaseStory('post', taskCreatedScenario, registry);
export const Full = phaseStory('full', taskCreatedScenario, registry);
