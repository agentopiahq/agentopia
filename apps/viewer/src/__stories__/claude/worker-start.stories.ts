import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { workerStartScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/worker.start',
};

export const Pre = phaseStory('pre', workerStartScenario, registry);
export const Main = phaseStory('main', workerStartScenario, registry);
export const Post = phaseStory('post', workerStartScenario, registry);
export const Full = phaseStory('full', workerStartScenario, registry);
