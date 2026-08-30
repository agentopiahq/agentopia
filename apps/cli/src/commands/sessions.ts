import { clockOf, paint } from '../format';
import { listSessions } from '../session';

export function showSessions(limit = 15): number {
  const sessions = listSessions(limit);
  if (sessions.length === 0) {
    process.stdout.write('No sessions recorded yet. Run `cubicle claude` to start one.\n');
    return 0;
  }

  for (const session of sessions) {
    const date = new Date(session.startedAt).toISOString().slice(0, 10);
    process.stdout.write(
      `${session.id}  ${paint.dim(`${date} ${clockOf(session.startedAt)}`)}  ` +
        `${paint.clay(session.harness.padEnd(8))}  ${paint.dim(session.cwd)}\n`
    );
  }
  return 0;
}
