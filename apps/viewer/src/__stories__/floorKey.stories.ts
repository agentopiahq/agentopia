import type { Meta, StoryObj } from '@storybook/html-vite';

import { mountFloors } from '../floorKeys';
import { FLOORS, FLOOR_KEY, FloorState } from '../floors';
import { fontsReady } from '../kit/fonts';
import { SHEET } from '../kit/palette';
import { ZoomState } from '../zoom';

/**
 * The bottom-right corner's column on its own, over a stand-in for the
 * canvas: the camera's keys at the top and the floor key under them, as on
 * every screen. Pressed, the floor key opens its card of every floor, the one
 * the view is on lit; `Open` shows it opened, on the server floor.
 */

interface Args {
  floor: string;
  open: boolean;
}

function corner(args: Args): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = `position:relative;width:720px;height:360px;background:${SHEET.page};`;
  void fontsReady().then(() => {
    const zoom = new ZoomState(host, () => ({ scale: 1, centre: { x: 0, y: 0 } }));
    const floors = new FloorState(FLOORS, {
      getItem: (k) => (k === FLOOR_KEY ? args.floor : null),
      setItem: () => {},
    });
    mountFloors({
      floors,
      addUnderCamera: (row) => zoom.addUnder(row),
      goFloor: (way) => floors.go(way),
      goToFloor: (id) => floors.goTo(id),
    });
    if (args.open) {
      host.querySelector<HTMLButtonElement>('.agentopia-floors > .agentopia-control')?.click();
    }
  });
  return host;
}

const meta: Meta<Args> = {
  title: 'Office/Floor key',
  render: corner,
  args: { floor: 'office', open: false },
  argTypes: {
    floor: { control: 'select', options: FLOORS.map((floor) => floor.id) },
    open: { control: 'boolean' },
  },
};
export default meta;

export const Closed: StoryObj<Args> = {};
export const Open: StoryObj<Args> = { args: { floor: 'servers', open: true } };
