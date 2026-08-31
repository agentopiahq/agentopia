import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { workerStopScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/worker.stop',
};

export const Pre = phaseStory('pre', workerStopScenario, registry);
export const Main = phaseStory('main', workerStopScenario, registry);
export const Post = phaseStory('post', workerStopScenario, registry);
export const Full = phaseStory('full', workerStopScenario, registry);
