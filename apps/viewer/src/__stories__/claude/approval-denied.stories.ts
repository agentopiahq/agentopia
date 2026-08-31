import { choreographyFor } from '@agentopia/core';

import { phaseStory } from '../lib/harness';
import { approvalDeniedScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/approval.denied',
};

export const Pre = phaseStory('pre', approvalDeniedScenario, registry);
export const Main = phaseStory('main', approvalDeniedScenario, registry);
export const Post = phaseStory('post', approvalDeniedScenario, registry);
export const Full = phaseStory('full', approvalDeniedScenario, registry);
