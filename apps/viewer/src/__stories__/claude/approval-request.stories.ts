import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { approvalRequestScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/approval.request',
};

export const Pre = phaseStory('pre', approvalRequestScenario, registry);
export const Main = phaseStory('main', approvalRequestScenario, registry);
export const Post = phaseStory('post', approvalRequestScenario, registry);
export const Full = phaseStory('full', approvalRequestScenario, registry);
