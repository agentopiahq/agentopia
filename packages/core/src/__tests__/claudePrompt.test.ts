import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeClaudeCode } from '../adapters/claude';
import { readablePrompt } from '../adapters/claudePrompt';

interface PromptCase {
  case: string;
  prompt: string;
  said: string | null;
}

/** Shared with the hook emitter's test, so its copy reads prompts the same way. */
const CASES: PromptCase[] = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'prompts.json'), 'utf8')
);

describe('readablePrompt', () => {
  it.each(CASES.map((c) => [c.case, c.prompt, c.said] as const))(
    'reads %s',
    (_name, prompt, said) => {
      expect(readablePrompt(prompt) ?? null).toBe(said);
    }
  );

  it.each(CASES.filter((c) => c.said !== null).map((c) => [c.case, c.said as string] as const))(
    'leaves %s alone once read',
    (_name, said) => {
      expect(readablePrompt(said)).toBe(said);
    }
  );

  it.each([undefined, 42, ''])('reads nothing from %p', (prompt) => {
    expect(readablePrompt(prompt)).toBeUndefined();
  });
});

describe('a prompt in the Claude Code adapter', () => {
  it('reaches the office as its words', () => {
    const event = normalizeClaudeCode({
      ts: 1000,
      sid: 's1',
      ev: 'UserPromptSubmit',
      msg: '<relay from="coordinator" session="session_01SQ…',
    });
    expect(event?.meta?.text).toBe('Message from the coordinator');
  });
});
