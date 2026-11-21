import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** The real emitter, run as the agent runs it: a bare node process. */
const EMITTER = resolve(__dirname, '../../../../plugins/claude/hooks/emit.mjs');

const SID = '98b27cbe-7004-43c7-99e6-6824f70e7573';
const HOST = 'local_355429e2-2651-4d36-8235-954f52ce7902';

let home: string;
let bus: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'agentopia-emit-'));
  bus = join(home, 'bus.jsonl');
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** The live-session registry's record, as Claude Code writes it. */
function registry(record: Record<string, unknown>): void {
  mkdirSync(join(home, '.claude/sessions'), { recursive: true });
  writeFileSync(
    join(home, '.claude/sessions/22593.json'),
    JSON.stringify({ sessionId: SID, ...record })
  );
}

/** The desktop app's record of the session, holding the title the user sees. */
function desktop(file: string, title: string): void {
  const dir = join(home, 'Library/Application Support/Claude/claude-code-sessions/acct/org');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${file}.json`), JSON.stringify({ cliSessionId: SID, title }));
}

/** The desktop app's record with a title of its own making (`titleSource: auto`). */
function desktopAuto(file: string, title: string): void {
  const dir = join(home, 'Library/Application Support/Claude/claude-code-sessions/acct/org');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${file}.json`),
    JSON.stringify({ cliSessionId: SID, title, titleSource: 'auto' })
  );
}

/** The session's transcript, one JSON line per entry. */
function transcript(...lines: unknown[]): void {
  writeFileSync(join(home, 'transcript.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n'));
}

/** A `/rename`, as Claude Code writes it into the transcript. */
function renamed(title: string): Record<string, unknown> {
  return { type: 'custom-title', customTitle: title, sessionId: SID };
}

/** Fire one hook and return the record it wrote. */
function fire(ev: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const payload = {
    hook_event_name: ev,
    session_id: SID,
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
    transcript_path: join(home, 'transcript.jsonl'),
    ...extra,
  };
  spawnSync(process.execPath, [EMITTER], {
    input: JSON.stringify(payload),
    env: { HOME: home, AGENTOPIA_BUS: bus },
  });
  const lines = readFileSync(bus, 'utf8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]!);
}

/** Fire one hook and return the `name` it wrote, if any. */
function emit(ev: string): string | undefined {
  return fire(ev).name as string | undefined;
}

describe('record stamp', () => {
  it('stamps every record with the harness that wrote it', () => {
    emit('PreToolUse');
    const lines = readFileSync(bus, 'utf8').trim().split('\n');
    expect(JSON.parse(lines[lines.length - 1]!)).toMatchObject({ ev: 'PreToolUse', h: 'claude' });
  });
});

describe('session name sampling', () => {
  it('writes no name before the desktop title exists', () => {
    registry({ name: 'agentopia-93', nameSource: 'derived', hostSessionId: HOST });
    desktop(HOST, '');
    expect(emit('UserPromptSubmit')).toBeUndefined();
  });

  it('keeps a registry name the user gave', () => {
    registry({ name: 'release prep', nameSource: 'user' });
    expect(emit('Stop')).toBe('release prep');
  });

  it.each(['Local session (from a project)', 'New session', 'Untitled'])(
    'treats the desktop title %j as no title',
    (title) => {
      registry({ name: 'agentopia-93', hostSessionId: HOST });
      desktopAuto(HOST, title);
      expect(emit('Stop')).toBeUndefined();
      expect(emit('PostToolUse')).toBeUndefined();
      expect(existsSync(`${bus}.titled`)).toBe(false);
    }
  );

  it('picks the desktop title up on a finished tool call mid-turn', () => {
    registry({ name: 'agentopia-93', hostSessionId: HOST });
    desktop(HOST, 'Add idle routines');
    expect(emit('PostToolUse')).toBe('Add idle routines');
  });

  it.each(['PostToolUse', 'PostToolUseFailure'])('never writes the placeholder on %s', (ev) => {
    registry({ name: 'agentopia-93', hostSessionId: HOST });
    expect(emit(ev)).toBeUndefined();
  });

  it('leaves tool starts unsampled', () => {
    registry({ name: 'agentopia-93', hostSessionId: HOST });
    desktop(HOST, 'Add idle routines');
    expect(emit('PreToolUse')).toBeUndefined();
  });

  it('scans the desktop store on a turn-level event once the session has left the registry', () => {
    desktop('local_other', 'Add idle routines');
    expect(emit('SessionEnd')).toBe('Add idle routines');
  });

  it('skips the store scan on a tool call when the registry names no desktop record', () => {
    registry({ name: 'agentopia-93' });
    desktop('local_other', 'Add idle routines');
    expect(emit('PostToolUse')).toBeUndefined();
  });

  describe('once the title is recorded', () => {
    beforeEach(() => {
      registry({ name: 'agentopia-93', hostSessionId: HOST });
      desktop(HOST, 'Add idle routines');
      emit('PostToolUse');
      desktop(HOST, 'Renamed');
    });

    /** Pretend the title was recorded `agoMs` ago. */
    function recordedAgo(agoMs: number): void {
      const when = (Date.now() - agoMs) / 1000;
      utimesSync(`${bus}.titled`, when, when);
    }

    it('skips the read on tool calls for five minutes', () => {
      recordedAgo(4 * 60 * 1000);
      expect(emit('PostToolUse')).toBeUndefined();
    });

    it('re-checks on a tool call after five minutes, picking up a rename', () => {
      recordedAgo(6 * 60 * 1000);
      expect(emit('PostToolUse')).toBe('Renamed');
    });

    it('still samples on every turn-level event', () => {
      expect(emit('Stop')).toBe('Renamed');
    });
  });

  it('keeps checking on every tool call while there is no title', () => {
    registry({ name: 'agentopia-93', hostSessionId: HOST });
    desktop(HOST, '');
    emit('PostToolUse');
    expect(existsSync(`${bus}.titled`)).toBe(false);
    desktop(HOST, 'Add idle routines');
    expect(emit('PostToolUse')).toBe('Add idle routines');
  });
});

describe('renamed sessions', () => {
  beforeEach(() => {
    registry({ name: 'agentopia-93', hostSessionId: HOST });
    desktop(HOST, 'Add idle routines');
  });

  it('names the session by its /rename on a turn-level event', () => {
    transcript({ type: 'user' }, renamed('Kiro Crew'), { type: 'assistant' });
    expect(emit('Stop')).toBe('Kiro Crew');
  });

  it('takes the latest rename', () => {
    transcript(renamed('First'), { type: 'user' }, renamed('Second'));
    expect(emit('UserPromptSubmit')).toBe('Second');
  });

  it('ignores the words in some other line', () => {
    transcript(renamed('Kiro Crew'), { type: 'user', text: '"custom-title"' });
    expect(emit('Stop')).toBe('Kiro Crew');
  });

  it('keeps the desktop title off the bus once renamed', () => {
    transcript(renamed('Kiro Crew'));
    emit('Stop');
    expect(emit('PostToolUse')).toBeUndefined();
    transcript({ type: 'user' });
    expect(emit('Stop')).toBeUndefined();
  });

  it('falls back to the desktop title without a transcript', () => {
    expect(emit('Stop')).toBe('Add idle routines');
  });
});

describe('prompt text', () => {
  it('keeps a plain prompt as written', () => {
    expect(fire('UserPromptSubmit', { prompt: 'Add a <Button> to the bar' }).msg).toBe(
      'Add a <Button> to the bar'
    );
  });

  it('unwraps a relayed prompt to its note', () => {
    const prompt = [
      '<relay from="coordinator" session="s" current-time="t" reason="spawn">',
      '  The note below was written by the coordinator session.',
      '  <note>',
      '    Run entirely on the Mac, never in the cloud.',
      '  </note>',
      '</relay>',
    ].join('\n');
    expect(fire('UserPromptSubmit', { prompt }).msg).toBe(
      'Run entirely on the Mac, never in the cloud.'
    );
  });

  it("prefers the person's own words to the note", () => {
    const prompt =
      '<relay from="coordinator"><cited author="user">fix the export button</cited>' +
      '<note>The person wants the export fixed.</note></relay>';
    expect(fire('UserPromptSubmit', { prompt }).msg).toBe('fix the export button');
  });

  it('drops system reminders', () => {
    const prompt = 'Ship it <system-reminder>Today is Friday.</system-reminder>';
    expect(fire('UserPromptSubmit', { prompt }).msg).toBe('Ship it');
  });
});
