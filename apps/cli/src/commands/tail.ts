import { BusReader } from '@agentopia/core';
import { existsSync } from 'node:fs';

import { followFile } from '../follow';
import { formatEventLine, paint } from '../format';
import { harnessFor } from '../harness';
import { busPath } from '../paths';
import {
  latestSessionId,
  readSessionSummary,
  readSummaryFromBus,
  resolveSessionId,
} from '../session';

export interface TailOptions {
  session?: string;
  bus?: string;
  fromStart: boolean;
}

/** Stream normalized events for a session as they land on the bus. */
export function tailSession(options: TailOptions): number {
  const requested = options.session ? resolveSessionId(options.session) : latestSessionId();
  if (options.session && !requested && !options.bus) {
    process.stderr.write(`agentopia: no session matching "${options.session}"\n`);
    return 1;
  }
  const sessionId = requested;
  const path = options.bus ?? (sessionId ? busPath(sessionId) : null);

  if (!path) {
    process.stderr.write('agentopia: no sessions yet. Run `agentopia claude` first.\n');
    return 1;
  }
  if (!existsSync(path)) {
    process.stderr.write(`agentopia: no bus file at ${path}\n`);
    return 1;
  }

  const summary = sessionId ? readSessionSummary(sessionId) : readSummaryFromBus(path, path);
  const harness = summary ? harnessFor(summary.harness) : null;
  if (!harness) {
    process.stderr.write(`agentopia: unknown harness ${summary?.harness ?? '(empty bus)'}\n`);
    return 1;
  }

  process.stderr.write(paint.dim(`agentopia: tailing ${path}\n`));

  // followFile always reads from line 0 so seq stays absolute; --since-now
  // filters what gets *printed*, not what gets counted.
  const reader = new BusReader((record) => harness.normalize(record));
  const stop = followFile({ path }, (line, live) => {
    const sequenced = reader.push(line);
    if (sequenced && (live || options.fromStart)) {
      process.stdout.write(`${formatEventLine(sequenced.event)}\n`);
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
