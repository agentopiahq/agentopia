import { TOOL_KINDS, ToolKind, choreographyFor } from '@agentopia/core';

import { Phase, mountStory } from '../lib/harness';
import { toolStartScenario } from '../lib/scenarios';

const registry = choreographyFor('claude');

export default {
  title: 'Claude Code/tool.start',
};

interface Args {
  kind: ToolKind;
  mcp: boolean;
}

const story = (phase: Phase) => ({
  args: { kind: 'read' as ToolKind, mcp: false },
  argTypes: {
    kind: { control: 'select', options: [...TOOL_KINDS] },
    mcp: { control: 'boolean' },
  },
  render: (args: Args) =>
    mountStory({ scenario: toolStartScenario(args.kind, args.mcp), registry, phase }),
});

export const Pre = story('pre');
export const Main = story('main');
export const Post = story('post');
export const Full = story('full');
