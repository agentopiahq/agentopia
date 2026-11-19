import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.AGENTOPIA_NO_AUTORUN = '1';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { main } = require('../index') as typeof import('../index');

function captureStdout(): { text: () => string; restore: () => void } {
  let out = '';
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  return { text: () => out, restore: () => spy.mockRestore() };
}

describe('help', () => {
  it.each([['agentopia watch <session>'], ['agentopia tail'], ['agentopia sessions']])(
    'leaves out the hidden %s',
    async (line) => {
      const stdout = captureStdout();
      try {
        expect(await main(['help'])).toBe(0);
        expect(stdout.text()).toContain('agentopia watch ');
        expect(stdout.text()).not.toContain(line);
      } finally {
        stdout.restore();
      }
    }
  );

  it('still runs the hidden sessions command', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agentopia-help-'));
    const before = process.env.AGENTOPIA_HOME;
    process.env.AGENTOPIA_HOME = home;
    const stdout = captureStdout();
    try {
      expect(await main(['sessions'])).toBe(0);
      expect(stdout.text()).toContain('No sessions recorded yet');
    } finally {
      stdout.restore();
      if (before === undefined) {
        delete process.env.AGENTOPIA_HOME;
      } else {
        process.env.AGENTOPIA_HOME = before;
      }
      rmSync(home, { recursive: true, force: true });
    }
  });
});
