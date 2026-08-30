import { runDoctor } from './commands/doctor';
import { runHarness } from './commands/run';
import { showSessions } from './commands/sessions';
import { tailSession } from './commands/tail';
import { parseWatchArgs, watchSession } from './commands/watch';
import { harnessFor, harnessIds } from './harness';
import { VERSION } from './version';

const HELP = `agentopia ${VERSION} - watch your coding agent work as an office of little clones

Usage:
  agentopia <agent> [args...]     Run an agent with the office recording attached
  agentopia watch [session]       Serve the office viewer for a session
  agentopia tail [session]        Stream normalized events for a session
  agentopia sessions              List recorded sessions
  agentopia doctor                Check the plugin wiring
  agentopia help                  Show this message

Agents:
  ${harnessIds().join(', ')}

Examples:
  agentopia claude                Run Claude Code, recording to a fresh session
  agentopia claude --effort high  Extra arguments pass straight through
  agentopia tail                  Follow the most recent session
`;

interface TailArgs {
  session?: string;
  bus?: string;
  fromStart: boolean;
}

function parseTailArgs(args: string[]): TailArgs {
  const out: TailArgs = { fromStart: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--bus') {
      out.bus = args[++i];
    } else if (arg === '--since-now') {
      out.fromStart = false;
    } else if (!arg.startsWith('-')) {
      out.session = arg;
    }
  }
  return out;
}

export async function main(argv: string[]): Promise<number> {
  const [first, ...rest] = argv;

  if (!first || first === 'help' || first === '--help' || first === '-h') {
    process.stdout.write(HELP);
    return 0;
  }

  if (first === 'version' || first === '--version' || first === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (first === 'tail') {
    return tailSession(parseTailArgs(rest));
  }

  if (first === 'watch') {
    return watchSession(parseWatchArgs(rest));
  }

  if (first === 'sessions') {
    return showSessions();
  }

  if (first === 'doctor') {
    return runDoctor();
  }

  const harness = harnessFor(first);
  if (harness) {
    return runHarness(harness, rest);
  }

  process.stderr.write(
    `agentopia: unknown command or agent "${first}". Known agents: ${harnessIds().join(', ')}\n` +
      'Run `agentopia help` for usage.\n'
  );
  return 1;
}

/* c8 ignore start */
if (process.env.AGENTOPIA_NO_AUTORUN !== '1') {
  main(process.argv.slice(2))
    .then((code) => {
      // `tail` keeps the process alive on its own timer; anything else is done.
      if (code !== 0 || !['tail', 'watch'].includes(process.argv[2] ?? '')) {
        process.exitCode = code;
      }
    })
    .catch((err: Error) => {
      process.stderr.write(`agentopia: ${err.message}\n`);
      process.exitCode = 1;
    });
}
/* c8 ignore stop */
