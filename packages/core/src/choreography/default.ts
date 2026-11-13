import { ChoreographyRegistry, Segment, SegmentRelease } from './types';

/**
 * The shared base choreography — the staging every harness starts from.
 * Harness registries extend this and override per event kind; see
 * `harness.ts`.
 *
 * Tool work never leaves the desk: whatever the kind, the worker types at
 * the monitor and the monitor shows what is being run. The few beats that do
 * cross the floor are the door (arrivals, departures), the speaker (asking
 * you something) and the cabinets (filing context away).
 */

/** Dwell minimum for a work beat, so fast tools do not flicker. */
export const MIN_WORK_MS = 900;
/** How long a failure slump is held — it should always be visible in full. */
export const SLUMP_MS = 1400;
/** A line of conversation: the briefing, the sign-off, the request. */
export const TALK_MS = 1500;

/** What the monitor shows for a tool call. */
function screenLine(tool: string, detail?: string): string {
  return detail ? `${tool} ${detail}` : tool;
}

export const defaultChoreography: ChoreographyRegistry = {
  // A session opens. Seating its lead is director machinery (it also runs
  // on catch-up), so there is nothing to stage.
  'session.start': {},

  // Phase flips to closed; the director walks everyone out once their queues
  // drain.
  'session.end': {},

  // You spoke, through the speaker on the wall. That is director machinery
  // too; the lead simply gets to work. The prompt text is your line, not the
  // lead's, so it is not bubbled.
  'turn.user': {},

  // The lead finished: sign off from the desk with the reply, then wait.
  'turn.stop': {
    scope: 'lead',
    ensure: false,
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
        bubble: event.workerType ? `${event.workerType}: go` : 'go',
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
  'tool.end': {
    release: ({ event }): SegmentRelease | undefined => {
      const tool = event.tool;
      if (!tool) {
        return undefined;
      }
      return {
        slot: tool.id ?? tool.name,
        into:
          tool.status === 'failed'
            ? { station: 'own_desk', state: 'slump', minMs: SLUMP_MS }
            : undefined,
      };
    },
  },

  // Walk to the speaker and ask.
  'approval.request': {
    scope: 'lead',
    main: (): Segment[] => [
      { station: 'speaker', state: 'talking', minMs: TALK_MS, bubble: 'may I?' },
    ],
  },

  // State-only: phase returns to working, the petitioner just moves on.
  'approval.denied': {},

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
