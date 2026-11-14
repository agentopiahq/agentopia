import {
  AgentopiaEvent,
  LEAD_WORKER,
  OFFICE_IDLE_LIFE,
  ToolKind,
  ToolStatus,
} from '@agentopia/core';

/**
 * The hero's office is a little busier than a real one: two more residents
 * than the usual four, so a first look always finds someone up to something.
 */
export const HERO_IDLE_LIFE = {
  ...OFFICE_IDLE_LIFE,
  residents: OFFICE_IDLE_LIFE.residents + 2,
} as const;

/**
 * The mock session the marketing site's hero plays: one lead at a desk,
 * working through a turn that touches the moments worth showing — reading,
 * a helper filing in, a request for approval at the speaker, a failing test
 * and a passing one — then a short breather before the next turn.
 *
 * It is an endless script, generated one turn (a "cycle") at a time, so the
 * hero never restarts and never shows the lead leaving: there is no
 * `session.end`, and the breather is far shorter than the director's idle
 * leave.
 */

export const HERO_SESSION = 's-hero';
/** How long one cycle lasts, breather included, in ms. */
export const HERO_CYCLE_MS = 40_000;
/** When the first event lands, so the script has an origin of its own. */
export const HERO_EPOCH = 1_000_000;

interface Beat {
  /** Offset within the cycle, in ms. */
  at: number;
  event: Omit<AgentopiaEvent, 'ts' | 'session'>;
}

const tool = (
  id: string,
  kind: ToolKind,
  detail: string,
  status: ToolStatus
): NonNullable<AgentopiaEvent['tool']> => ({ id, name: kind, kind, detail, status });

/** A tool call and its result, with an id unique to the cycle and offset. */
function work(
  cycle: number,
  at: number,
  ms: number,
  kind: ToolKind,
  detail: string,
  over: { worker?: string; status?: ToolStatus } = {}
): Beat[] {
  const worker = over.worker ?? LEAD_WORKER;
  const id = `${worker}-${cycle}-${at}`;
  return [
    { at, event: { kind: 'tool.start', worker, tool: tool(id, kind, detail, 'in_progress') } },
    {
      at: at + ms,
      event: { kind: 'tool.end', worker, tool: tool(id, kind, detail, over.status ?? 'completed') },
    },
  ];
}

function beats(cycle: number): Beat[] {
  const helper = `helper-${cycle}`;
  const lead = (at: number, event: Beat['event']): Beat => ({ at, event });
  const own: Beat[] = [
    lead(0, { kind: 'turn.user', worker: LEAD_WORKER }),
    ...work(cycle, 800, 2600, 'read', 'src/office.ts'),
    ...work(cycle, 3800, 2400, 'search', 'whoIsAtTheDesk'),
    lead(6600, { kind: 'worker.start', worker: helper, workerType: 'Explore' }),
    ...work(cycle, 7400, 3600, 'read', 'packages/core', { worker: helper }),
    ...work(cycle, 7800, 3000, 'think', 'plan the change'),
    lead(11_400, { kind: 'worker.stop', worker: helper }),
    lead(12_400, { kind: 'approval.request', worker: LEAD_WORKER }),
    lead(16_400, { kind: 'approval.denied', worker: LEAD_WORKER }),
    ...work(cycle, 17_200, 3000, 'edit', 'src/office.ts'),
    ...work(cycle, 20_800, 2800, 'execute', 'yarn test', { status: 'failed' }),
    ...work(cycle, 24_600, 3200, 'execute', 'yarn test'),
    lead(28_400, { kind: 'turn.stop', worker: LEAD_WORKER, meta: { text: 'all green' } }),
  ];
  // `work` emits a call's start and end together, so overlapping calls are
  // authored out of order. Sorting is stable: ties keep the order above.
  return own.sort((a, b) => a.at - b.at);
}

/** Every event of one cycle, stamped on the script's own timeline. */
export function heroCycle(cycle: number): AgentopiaEvent[] {
  const start = HERO_EPOCH + cycle * HERO_CYCLE_MS;
  const opening: AgentopiaEvent[] =
    cycle === 0
      ? [
          {
            ts: start - 1200,
            kind: 'session.start',
            session: HERO_SESSION,
            worker: LEAD_WORKER,
            meta: { sessionName: 'tidy up the office' },
          },
        ]
      : [];
  return [
    ...opening,
    ...beats(cycle).map(({ at, event }) => ({ ...event, ts: start + at, session: HERO_SESSION })),
  ];
}
