import { OFFICE_IDLE_LIFE, choreographyFor } from '@agentopia/core';

import { mountStory } from './lib/harness';
import { showcaseScenario } from './lib/scenarios';

/**
 * The preview: one continuous run of the floor, with one session touching
 * every event kind and two neighbours sharing the office.
 *
 * The per-event stories exist to tune one animation in isolation; this one
 * exists to be watched. It plays in real time rather than sped up, because the
 * point is the pacing — helpers filing in, the walk over to the human for
 * approval, the slump when the tests fail, the badges flipping on the desks.
 * It is also the one story with the office's idle life on, so the floor is as
 * lived in as the real one; the event stories leave it off.
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
      idleLife: OFFICE_IDLE_LIFE,
    }),
};
