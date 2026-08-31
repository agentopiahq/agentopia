import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { turnStopScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/turn.stop',
};

export const Pre = phaseStory('pre', turnStopScenario, registry);
export const Main = phaseStory('main', turnStopScenario, registry);
export const Post = phaseStory('post', turnStopScenario, registry);
export const Full = phaseStory('full', turnStopScenario, registry);
