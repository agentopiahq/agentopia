import { manualClock } from '@agentopia/core';
import type { Meta, StoryObj } from '@storybook/html-vite';

import { SITE_URL, mountCredits } from '../credits/credits';
import { fontsReady } from '../kit/fonts';
import { SHEET } from '../kit/palette';

/**
 * The office's small print on its own, over a stand-in for the canvas: a ©
 * bottom left that opens into the makers and the copyright, and a link icon
 * bottom right that opens into GitHub and the legal pages. Hover either to
 * open it; `Open` shows both opened.
 */

interface Args {
  width: number;
  onSite: boolean;
  open: boolean;
}

// A fixed year, so the capture never changes on New Year's Day.
const CLOCK = manualClock(Date.UTC(2026, 10, 14));

function corners(args: Args): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = `position:relative;width:${args.width}px;height:260px;background:${SHEET.page};`;
  void fontsReady().then(() => {
    mountCredits(host, { clock: CLOCK, site: args.onSite ? '' : SITE_URL });
    if (args.open) {
      host.querySelectorAll('.agentopia-corner').forEach((el) => el.classList.add('open'));
    }
  });
  return host;
}

const meta: Meta<Args> = {
  title: 'Office/Credits',
  render: corners,
  args: { width: 900, onSite: true, open: false },
  argTypes: {
    width: { control: { type: 'range', min: 360, max: 1400, step: 20 } },
    onSite: { control: 'boolean' },
    open: { control: 'boolean' },
  },
};
export default meta;

export const Folded: StoryObj<Args> = {};
export const Open: StoryObj<Args> = { args: { open: true } };
