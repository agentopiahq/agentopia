import { parseRecord } from '@repo/core';
import { existsSync } from 'node:fs';

import { followFile } from '../follow';
import { formatEventLine, paint } from '../format';
import { harnessFor } from '../harness';
import { busPath } from '../paths';
import { latestSessionId, readSessionMeta } from '../session';

export interface TailOptions {
  session?: string;
  bus?: string;
  fromStart: boolean;
}

/** Stream normalized events for a session as they land on the bus. */
export function tailSession(options: TailOptions): number {
  const sessionId = options.session ?? latestSessionId();
  const path = options.bus ?? (sessionId ? busPath(sessionId) : null);

  if (!path) {
    process.stderr.write('cubicle: no sessions yet. Run `cubicle claude` first.\n');
    return 1;
  }
  if (!existsSync(path)) {
    process.stderr.write(`cubicle: no bus file at ${path}\n`);
    return 1;
  }

  const meta = sessionId ? readSessionMeta(sessionId) : null;
  const harness = harnessFor(meta?.harness ?? 'claude');
  if (!harness) {
    process.stderr.write(`cubicle: unknown harness ${meta?.harness}\n`);
    return 1;
  }

  process.stderr.write(paint.dim(`cubicle: tailing ${path}\n`));

  const stop = followFile({ path, fromStart: options.fromStart }, (line) => {
    const record = parseRecord(line);
    if (!record) {
      return;
    }
    const event = harness.normalize(record);
    if (event) {
      process.stdout.write(`${formatEventLine(event)}\n`);
    }
  });

  const shutdown = (): void => {
    stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return 0;
}
