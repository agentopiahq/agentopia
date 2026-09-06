import { choreographyFor } from '@agentopia/core';

import { mountStory } from './lib/harness';
import { showcaseScenario } from './lib/scenarios';

/**
 * The preview: one continuous run of the floor, with one session touching
 * every event kind and two neighbours sharing the office.
 *
 * The per-event stories exist to tune one animation in isolation; this one
 * exists to be watched. It plays in real time rather than sped up, because the
 * point is the pacing — helpers filing in, the walk to the speaker for
 * approval, the slump when the tests fail, the badges flipping on the desks.
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
