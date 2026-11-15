import { manualClock } from '@agentopia/core';
import type { Meta, StoryObj } from '@storybook/html-vite';

import { SITE_URL, mountCredits } from '../credits/credits';
import { fontsReady } from '../kit/fonts';
import { SHEET } from '../kit/palette';

/**
 * The office's small print on its own: the makers and the copyright in the
 * bottom-left corner, the code and the legal pages in the bottom-right one,
 * over a stand-in for the canvas. Narrow the frame below 720px to see the
 * left corner drop the logos.
 */

interface Args {
  width: number;
  onSite: boolean;
}

// A fixed year, so the capture never changes on New Year's Day.
const CLOCK = manualClock(Date.UTC(2026, 10, 14));

function corners(args: Args): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = `position:relative;width:${args.width}px;height:260px;background:${SHEET.page};`;
  void fontsReady().then(() => {
    mountCredits(host, { clock: CLOCK, site: args.onSite ? '' : SITE_URL });
  });
  return host;
}

const meta: Meta<Args> = {
  title: 'Office/Credits',
  render: corners,
  args: { width: 900, onSite: true },
  argTypes: {
    width: { control: { type: 'range', min: 360, max: 1400, step: 20 } },
    onSite: { control: 'boolean' },
  },
};
export default meta;

export const Corners: StoryObj<Args> = {};
export const Compact: StoryObj<Args> = { args: { width: 480 } };
