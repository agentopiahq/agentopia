/**
 * Incremental line splitting for a file that is being appended to.
 *
 * Kept pure and separate from the IO so the torn-tail case — the common one
 * when a hook is mid-write — is directly testable.
 */
export interface LineSplit {
  lines: string[];
  rest: string;
}

export function splitLines(buffered: string): LineSplit {
  const parts = buffered.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts, rest };
}

export class LineBuffer {
  private rest = '';

  push(chunk: string): string[] {
    const { lines, rest } = splitLines(this.rest + chunk);
    this.rest = rest;
    return lines;
  }

  /** Any trailing content that never got its newline. */
  remainder(): string {
    return this.rest;
  }
}
