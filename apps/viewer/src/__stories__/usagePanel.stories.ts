import { mockUsageReport } from '../mockUsage';
import { UsagePanel } from '../usagePanel';

/**
 * The usage ledger the usage board opens, over the made-up usage the
 * marketing site's office shows (`mockUsage.ts`), dated to a fixed day so
 * the story draws the same every time.
 */

const NOW = Date.parse('2026-11-14T17:00:00Z');

export default {
  title: 'Office/Usage ledger',
  parameters: { layout: 'fullscreen' },
};

export const Ledger = {
  render: () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:relative;width:100%;height:100vh;background:#e3dac6;';
    const panel = new UsagePanel(host, { onClose: () => panel.open() });
    panel.update(mockUsageReport(NOW), { demo: true });
    panel.open();
    return host;
  },
};
