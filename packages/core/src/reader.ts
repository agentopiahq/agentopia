import { BusRecord, RawRecord, isSessionHeader, parseRecord } from './bus';
import { AgentopiaEvent } from './events';

/**
 * An event plus its position in the bus file.
 *
 * `seq` is the 0-based line index, derived by the reader rather than carried in
 * the record — see the append-only invariant in bus.ts for why it cannot come
 * from the writer. It is a total order over one file, which makes it the right
 * key for an animation cursor.
 *
 * It is deliberately *not* a durable identity: two readers that start at
 * different offsets will number the same event differently. Use `event.rid`
 * when identity has to survive leaving this process.
 */
export interface SequencedEvent {
  seq: number;
  event: AgentopiaEvent;
}

export type Normalizer = (record: RawRecord) => AgentopiaEvent | null;

/**
 * Turns bus lines into sequenced events.
 *
 * Counts every line, including the header and lines it discards, so `seq`
 * matches line position in the file and stays reproducible across reads.
 */
export class BusReader {
  private line = 0;

  constructor(private readonly normalize: Normalizer) {}

  /** The seq the next line will receive. */
  get position(): number {
    return this.line;
  }

  push(rawLine: string): SequencedEvent | null {
    const seq = this.line++;
    const record: BusRecord | null = parseRecord(rawLine);
    if (!record || isSessionHeader(record)) {
      return null;
    }
    const event = this.normalize(record);
    return event ? { seq, event } : null;
  }

  pushAll(lines: string[]): SequencedEvent[] {
    const out: SequencedEvent[] = [];
    for (const line of lines) {
      const sequenced = this.push(line);
      if (sequenced) {
        out.push(sequenced);
      }
    }
    return out;
  }
}
