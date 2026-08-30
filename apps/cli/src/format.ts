import { CubicleEvent } from '@repo/core';

/** Built from a char code so no invisible control byte lives in this file. */
const CSI = `${String.fromCharCode(27)}[`;
const RESET = `${CSI}0m`;

export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR) {
    return true;
  }
  return Boolean(process.stdout.isTTY);
}

function wrap(code: string, text: string): string {
  return colorEnabled() ? `${CSI}${code}m${text}${RESET}` : text;
}

export const paint = {
  dim: (t: string) => wrap('2', t),
  bold: (t: string) => wrap('1', t),
  clay: (t: string) => wrap('38;2;217;119;87', t),
  blue: (t: string) => wrap('38;2;110;168;254', t),
  green: (t: string) => wrap('38;2;126;186;121', t),
  red: (t: string) => wrap('38;2;214;110;110', t),
  amber: (t: string) => wrap('38;2;209;168;92', t),
};

export function pad(text: string, width: number): string {
  const clipped = text.length > width ? `${text.slice(0, width - 1)}...` : text;
  return clipped.padEnd(width);
}

export function clockOf(ts: number): string {
  const d = new Date(ts);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

const KIND_PAINT: Record<string, (t: string) => string> = {
  'session.start': paint.bold,
  'session.end': paint.bold,
  'turn.user': paint.blue,
  'turn.stop': paint.blue,
  'worker.start': paint.clay,
  'worker.stop': paint.clay,
  'approval.request': paint.amber,
  'approval.denied': paint.amber,
  notify: paint.amber,
};

/** One line per event, for `cubicle tail`. */
export function formatEventLine(event: CubicleEvent): string {
  const worker = event.workerType ?? event.worker;
  const tint = KIND_PAINT[event.kind] ?? ((t: string) => t);

  let subject = '';
  if (event.tool) {
    const name = event.tool.status === 'failed' ? paint.red(event.tool.name) : event.tool.name;
    subject = `${pad(event.tool.kind, 8)}${name}`;
    if (event.tool.detail) {
      subject += ` ${paint.dim(event.tool.detail)}`;
    }
  } else if (typeof event.meta?.text === 'string' && event.meta.text) {
    subject = paint.dim(String(event.meta.text));
  }

  return [paint.dim(clockOf(event.ts)), pad(worker, 14), tint(pad(event.kind, 17)), subject].join(
    ' '
  );
}
