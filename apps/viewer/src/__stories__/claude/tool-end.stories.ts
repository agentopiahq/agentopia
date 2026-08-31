import { TOOL_KINDS, ToolKind, choreographyFor } from '@agentopia/core';

import { Phase, mountStory } from '../lib/harness';
import { toolEndScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/tool.end',
};

interface Args {
  status: 'completed' | 'failed';
  kind: ToolKind;
}

const story = (phase: Phase) => ({
  args: { status: 'failed' as const, kind: 'read' as ToolKind },
  argTypes: {
    status: { control: 'radio', options: ['completed', 'failed'] },
    kind: { control: 'select', options: [...TOOL_KINDS] },
  },
  render: (args: Args) =>
    mountStory({ scenario: toolEndScenario(args.status, args.kind), registry, phase }),
});

export const Pre = story('pre');
export const Main = story('main');
export const Post = story('post');
export const Full = story('full');
