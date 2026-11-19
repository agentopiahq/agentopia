import { parseStartArgs, showStatus, startBackground, stopBackground } from './commands/background';
import { runDoctor } from './commands/doctor';
import { runInstall, runUninstall } from './commands/install';
import { runHarness } from './commands/run';
import { showSessions } from './commands/sessions';
import { tailSession } from './commands/tail';
import { parseWatchArgs, watchSession } from './commands/watch';
import { harnessFor, harnessIds } from './harness';
import { VERSION } from './version';

// `watch <session>`, `tail` and `sessions` work but are left out of the help
// for now, with one session's own view (the viewer's `SESSION_VIEWS`): the
// floor is the product. Put their lines back here to show them again.
const HELP = `agentopia ${VERSION} - Watch your agents create, in a cozy office.

Usage:
  agentopia <agent> [args...]     Run an agent with the office recording attached
  agentopia install               Install the agentopia plugin into Claude Code
  agentopia watch                 Serve the office: every live session on one floor
  agentopia start                 Serve the office in the background, past this terminal
  agentopia status                Say whether the office is running, and where
  agentopia stop                  Stop the office, however it was started
  agentopia uninstall             Uninstall the agentopia plugin from Claude Code
  agentopia doctor                Check the plugin wiring
  agentopia help                  Show this message

Agents:
  ${harnessIds().join(', ')}

Examples:
  agentopia claude                Run Claude Code, recording to a fresh session
  agentopia claude --effort high  Extra arguments pass straight through
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

  if (first === 'start') {
    const options = parseStartArgs(rest);
    if (typeof options === 'string') {
      process.stderr.write(`agentopia: ${options}\n`);
      return 1;
    }
    return startBackground(options);
  }

  if (first === 'status') {
    return showStatus();
  }

  if (first === 'stop') {
    return stopBackground();
  }

  if (first === 'sessions') {
    return showSessions();
  }

  if (first === 'install') {
    return runInstall();
  }

  if (first === 'uninstall') {
    return runUninstall();
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
