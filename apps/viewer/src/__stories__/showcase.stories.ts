import { choreographyFor } from '@agentopia/core';

import { mountStory } from './lib/harness';
import { showcaseScenario } from './lib/scenarios';

/**
 * The preview: one continuous run of the office, touching every event kind.
 *
 * The per-event stories exist to tune one animation in isolation; this one
 * exists to be watched. It plays in real time rather than sped up, because the
 * point is the pacing — the walks between stations, the pause at your desk
 * waiting on approval, the slump when the tests fail.
 */
export default {
  title: 'Showcase',
};

export const Office = {
  render: () =>
    mountStory({
      scenario: showcaseScenario(),
      registry: choreographyFor('claude'),
      phase: 'full',
    }),
};
