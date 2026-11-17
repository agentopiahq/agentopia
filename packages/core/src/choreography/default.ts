import { AgentopiaEvent } from '../events';
import { inFlight } from '../state';
import {
  AnimationContext,
  ChoreographyRegistry,
  HumanAnswer,
  Segment,
  SegmentRelease,
} from './types';

/**
 * The shared base choreography — the staging every harness starts from.
 * Harness registries extend this and override per event kind; see
 * `harness.ts`.
 *
 * Tool work never leaves the desk: whatever the kind, the worker types at
 * the monitor and the monitor shows what is being run. The few beats that do
 * cross the floor are the door (arrivals, departures), the human (asking
 * you something) and the cabinets (filing context away).
 */

/** Dwell minimum for a work beat, so fast tools do not flicker. */
export const MIN_WORK_MS = 900;
/** How long a failure slump is held — it should always be visible in full. */
export const SLUMP_MS = 1400;
/** A line of conversation: the briefing, the sign-off, the request. */
export const TALK_MS = 1500;
/** How long the human takes to answer a lead who asked them something: a nod, a thumbs up, a word. */
export const ANSWER_MS = 1800;
/** The longest ask that fits the bubble; a longer one has its detail cut. */
const ASK_CHARS = 46;

/** What the monitor shows for a tool call. */
function screenLine(tool: string, detail?: string): string {
  return detail ? `${tool} ${detail}` : tool;
}

/**
 * What a lead says handing work to a helper, by the helper's agent type, when
 * the event does not carry the brief itself (no hook says what a subagent was
 * asked). Said to the helper, so it reads as an ask, never as a label.
 */
export const BRIEFS: Readonly<Record<string, readonly string[]>> = {
  Explore: [
    'could you have a dig round?',
    'please find where this lives',
    'could you find who calls this?',
    'would you map out this module?',
    'please go through the tests',
    'could you see what touches this?',
  ],
  Plan: [
    'could you sketch a plan first?',
    'how would you split this? Thanks!',
    'please weigh up the options',
    'could you find the safest order?',
  ],
  default: [
    'could you take this one, please?',
    'would you mind taking this?',
    'please check this for me',
    'could you give me a hand here?',
  ],
};

/**
 * The lead's line as a helper is briefed: the brief the event carries
 * (`meta.brief`), else one of `BRIEFS` for its type, the same for the same
 * helper, so a replay says the same.
 */
export function briefFor(event: AgentopiaEvent): string {
  const brief = event.meta?.brief;
  if (typeof brief === 'string' && brief.trim()) {
    return brief.trim();
  }
  const pool = BRIEFS[event.workerType ?? ''] ?? BRIEFS.default;
  let h = 0;
  for (const c of event.worker) {
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
  }
  return pool[h % pool.length];
}

/** A stable pick from a list, the same for the same event, so a replay says the same. */
function pickFor<T>(event: AgentopiaEvent, salt: string, pool: readonly T[]): T {
  let h = 0;
  for (const c of `${event.ts}|${event.session}|${event.worker}|${salt}`) {
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
  }
  return pool[h % pool.length];
}

/** Cut a tool's detail so the whole ask fits the bubble. */
function fit(prefix: string, detail: string, suffix: string): string {
  const one = detail.replace(/\s+/g, ' ').trim();
  const room = ASK_CHARS - prefix.length - suffix.length;
  const cut = one.length <= room ? one : `${one.slice(0, Math.max(4, room - 1)).trimEnd()}…`;
  return `${prefix}${cut}${suffix}`;
}

/** Verbs an MCP tool's name can start with, to ask for it as it is named. */
const VERBS = new Set(
  'add change close create delete edit fetch find get list make move open post read remove request run search send set start stop update upload write'.split(
    ' '
  )
);

/**
 * What a lead asks the human for, as exactly as the event says: the command
 * it wants to run, the file it wants to write, the site it wants to open.
 */
export function askFor(event: AgentopiaEvent): string {
  const tool = event.tool;
  if (!tool) {
    return 'may I go ahead?';
  }
  const detail = tool.detail?.trim() && tool.detail !== tool.name ? tool.detail.trim() : '';
  switch (tool.name) {
    case 'AskUserQuestion':
      return 'can I ask you something?';
    case 'ExitPlanMode':
      return 'may I start on the plan?';
    case 'Bash':
      return detail ? fit('may I run `', detail, '`?') : 'may I run a command?';
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return detail ? fit('may I edit ', detail, '?') : 'may I edit a file?';
    case 'Write':
      return detail ? fit('may I write ', detail, '?') : 'may I write a file?';
    case 'Read':
      return detail ? fit('may I read ', detail, '?') : 'may I read a file?';
    case 'WebFetch':
      return detail ? fit('may I open ', detail, '?') : 'may I open a web page?';
    case 'WebSearch':
      return detail ? fit('may I search for “', detail, '”?') : 'may I search the web?';
    case 'Agent':
    case 'Task':
      return 'may I bring in a helper?';
    case 'Skill':
      return detail ? fit('may I use the ', detail, ' skill?') : 'may I use a skill?';
  }
  // An MCP tool, `mcp__server__do_thing`: ask to do the thing.
  const mcp = /^mcp__.+?__(.+)$/.exec(tool.name);
  if (mcp) {
    const words = mcp[1].replace(/[_-]+/g, ' ').trim().toLowerCase();
    return fit(VERBS.has(words.split(' ')[0]) ? 'may I ' : 'may I use ', words, '?');
  }
  return detail
    ? fit(`may I ${tool.kind === 'execute' ? 'run' : 'use'} ${tool.name}: `, detail, '?')
    : fit('may I use ', tool.name, '?');
}

/** What the human says, when a yes or a no is said out loud. */
export const ANSWER_LINES = {
  yes: ['go ahead!', 'sure, go for it', 'yes, please do', 'yep, do it'],
  answered: ['here you go', 'let’s do that one', 'that one, please'],
  no: ['not that one', 'no, hold off', 'hmm, not now'],
} as const;

/**
 * How the human answers this event's ask, picked the same way for the same
 * event: a yes is a nod, a thumbs up or saying so; a no, a shake of the head
 * or saying so. A question asked (not a permission) is answered out loud.
 */
export function answerFor(event: AgentopiaEvent, yes: boolean): HumanAnswer {
  if (!yes) {
    const gesture = pickFor(event, 'no', ['shake', 'say'] as const);
    return gesture === 'say'
      ? { yes, gesture, line: pickFor(event, 'line', ANSWER_LINES.no) }
      : { yes, gesture };
  }
  if (event.tool?.name === 'AskUserQuestion') {
    return { yes, gesture: 'say', line: pickFor(event, 'line', ANSWER_LINES.answered) };
  }
  const gesture = pickFor(event, 'yes', ['nod', 'thumbs', 'say'] as const);
  return gesture === 'say'
    ? { yes, gesture, line: pickFor(event, 'line', ANSWER_LINES.yes) }
    : { yes, gesture };
}

/**
 * The slot a lead's ask is held open on, at the human, until it is answered:
 * one per call asked about, by the worker that wants it.
 */
const APPROVAL_SLOT = 'approval:';
export function approvalSlot(worker: string, call: string): string {
  return `${APPROVAL_SLOT}${worker}:${call}`;
}

/** The call an ask is about: the one of that tool already under way, else the tool by name. */
function askedCall(ctx: AnimationContext): string {
  const tool = ctx.event.tool;
  if (!tool) {
    return '';
  }
  if (tool.id) {
    return tool.id;
  }
  const worker = ctx.session.workers[ctx.event.worker];
  const running = worker ? inFlight(worker).filter((t) => t.name === tool.name) : [];
  const call = running[running.length - 1];
  return call?.id ?? tool.name;
}

/** You said no, or never said: every ask still held open is answered no. */
function answeredNo(event: AgentopiaEvent): SegmentRelease {
  return {
    slot: APPROVAL_SLOT,
    prefix: true,
    on: 'lead',
    ifOpen: true,
    into: hearing(answerFor(event, false)),
  };
}

/** The lead stands at the human and hears the answer. */
function hearing(answer: HumanAnswer): Segment {
  return { station: 'human', state: 'waiting', minMs: ANSWER_MS, answer };
}

export const defaultChoreography: ChoreographyRegistry = {
  // A session opens. Seating its lead is director machinery (it also runs
  // on catch-up), so there is nothing to stage.
  'session.start': {},

  // Phase flips to closed; the director walks everyone out once their queues
  // drain.
  'session.end': {},

  // You spoke: the human talks, and what you asked for goes up over their
  // head. That is director machinery too; the lead simply gets to work. A
  // prompt while something was still being asked is the answer to it: no.
  'turn.user': { scope: 'lead', ensure: false, release: ({ event }) => answeredNo(event) },

  // The lead finished: sign off from the desk with the reply, then wait.
  // Stopping with something still being asked means it was never allowed.
  'turn.stop': {
    scope: 'lead',
    ensure: false,
    release: ({ event }) => answeredNo(event),
    main: ({ event }): Segment[] => {
      const text = typeof event.meta?.text === 'string' ? event.meta.text : '';
      if (!text) {
        return [];
      }
      return [{ station: 'own_desk', state: 'talking', minMs: TALK_MS, bubble: text }];
    },
  },

  // A helper files in through the door to its lead's desk and gets briefed:
  // a short two-way conversation before either of them does anything else.
  'worker.start': {
    enters: true,
    main: (): Segment[] => [{ station: 'own_desk', state: 'talking', minMs: TALK_MS }],
    lead: ({ event }): Segment[] => [
      {
        station: 'own_desk',
        state: 'talking',
        minMs: TALK_MS,
        bubble: briefFor(event),
      },
    ],
  },

  // And out again, once it has finished what it was doing. The lead never departs.
  'worker.stop': { ensure: false, departs: true },

  // The heart of the show: type it at the desk, and put it on the monitor.
  // The monitor carries the command, so the worker does not also say it.
  'tool.start': {
    main: ({ event }): Segment[] => {
      const tool = event.tool;
      if (!tool) {
        return [];
      }
      return [
        {
          station: 'own_desk',
          state: 'working',
          minMs: MIN_WORK_MS,
          openSlot: tool.id ?? tool.name,
          screen: screenLine(tool.name, tool.detail),
          coalesce: true,
        },
      ];
    },
  },

  // Success closes the open beat quietly; failure morphs it into a slump.
  // A call the lead was still asking the human about has been let run: the
  // human says yes, and the lead heads back.
  'tool.end': {
    release: ({ event }): SegmentRelease[] | undefined => {
      const tool = event.tool;
      if (!tool) {
        return undefined;
      }
      const yes = (call: string): SegmentRelease => ({
        slot: approvalSlot(event.worker, call),
        on: 'lead',
        ifOpen: true,
        into: hearing(answerFor(event, true)),
      });
      return [
        {
          slot: tool.id ?? tool.name,
          into:
            tool.status === 'failed'
              ? { station: 'own_desk', state: 'slump', minMs: SLUMP_MS }
              : undefined,
        },
        ...(tool.id ? [yes(tool.id)] : []),
        yes(tool.name),
      ];
    },
  },

  // Walk over to the human, wherever they are sitting, and ask for exactly
  // what is wanted. The call waits at the desk no longer (it cannot run until
  // you say), and the ask is held open at the human until it is answered:
  // the call going ahead is a yes; a denial, a new prompt or the turn ending
  // is a no (see `tool.end`, `approval.denied`, `turn.user`, `turn.stop`).
  'approval.request': {
    scope: 'lead',
    release: (ctx): SegmentRelease | undefined => {
      const call = askedCall(ctx);
      return call ? { slot: call, on: 'worker' } : undefined;
    },
    main: (ctx): Segment[] => [
      {
        station: 'human',
        state: 'talking',
        minMs: TALK_MS,
        bubble: askFor(ctx.event),
        openSlot: approvalSlot(ctx.event.worker, askedCall(ctx)),
      },
    ],
  },

  // You said no: the human shakes their head, or says so.
  'approval.denied': { scope: 'lead', ensure: false, release: ({ event }) => answeredNo(event) },

  // Everyone in the session files their papers away in the cabinets.
  'context.compact': {
    scope: 'session',
    main: (): Segment[] => [{ station: 'cabinets', state: 'working', minMs: MIN_WORK_MS * 2 }],
  },

  // State-only: workers walk back from the cabinets on their own.
  'context.compacted': {},

  // Set dressing only, via reduced state.
  'task.created': {},
  'task.completed': {},

  // Reserved: the agent actively wants the human. No staging yet.
  notify: {},
};
