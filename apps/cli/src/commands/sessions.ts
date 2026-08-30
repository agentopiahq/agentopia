import { clockOf, paint } from '../format';
import { listSessions } from '../session';

export function showSessions(limit = 15): number {
  const sessions = listSessions(limit);
  if (sessions.length === 0) {
    process.stdout.write('No sessions recorded yet. Run `cubicle claude` to start one.\n');
    return 0;
  }

  for (const session of sessions) {
    const date = new Date(session.ts).toISOString().slice(0, 10);
    // Both identities, because neither one stands in for the other: resume
    // reuses a harness session across runs, and /clear starts a new one within
    // a run.
    const harnessSession = session.harnessSession
      ? paint.dim(session.harnessSession.slice(0, 8))
      : paint.dim('--------');
    process.stdout.write(
      `${session.id}  ${harnessSession}  ${paint.dim(`${date} ${clockOf(session.ts)}`)}  ` +
        `${paint.clay(session.harness.padEnd(8))}  ${paint.dim(session.cwd)}\n`
    );
  }
  return 0;
}
