import { stationForTool } from '../stations';
import { ChoreographyRegistry, Segment, SegmentRelease } from './types';

/**
 * The shared base choreography — the staging every harness starts from.
 * Harness registries extend this and override per event kind; see
 * `harness.ts`.
 */

/** Dwell minimum for a work beat, so fast tools do not flicker. */
export const MIN_WORK_MS = 900;
/** How long a failure slump is held — it should always be visible in full. */
export const SLUMP_MS = 1400;

export const defaultChoreography: ChoreographyRegistry = {
  // The office opens. Seating everyone from reduced state is director
  // machinery (it also runs on catch-up), so there is nothing to stage.
  'session.start': {},

  // Phase flips to closed; workers settle at their desks on their own.
  'session.end': {},

  // The human spoke: recall the lead to their desk. The prompt text is the
  // human's line, not the lead's, so it is not bubbled.
  'turn.user': { scope: 'lead', interrupt: true },

  // The lead finished: recall, then speak the reply while waiting starts.
  'turn.stop': {
    scope: 'lead',
    ensure: false,
    interrupt: true,
    bubble: ({ event }) =>
      typeof event.meta?.text === 'string' && event.meta.text ? event.meta.text : undefined,
  },

  // A subagent files in through the door and takes the next free desk.
  'worker.start': { enters: true },

  // And out again. The lead never departs.
  'worker.stop': { ensure: false, departs: true },

  // The heart of the show: walk to the tool's station and do the thing.
  'tool.start': {
    main: ({ event }): Segment[] => {
      const tool = event.tool;
      if (!tool) {
        return [];
      }
      return [
        {
          station: stationForTool(tool.kind, event.meta),
          state: 'working',
          minMs: MIN_WORK_MS,
          openSlot: tool.id ?? tool.name,
          bubble: tool.detail,
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
            ? {
                station: stationForTool(tool.kind, event.meta),
                state: 'slump',
                minMs: SLUMP_MS,
              }
            : undefined,
      };
    },
  },

  // Stand at the human's desk holding the form.
  'approval.request': {
    main: (): Segment[] => [
      { station: 'human_desk', state: 'working', minMs: MIN_WORK_MS, bubble: 'may I?' },
    ],
  },

  // State-only: phase returns to working, the petitioner just moves on.
  'approval.denied': {},

  // Everyone boxes up papers and carries them off.
  'context.compact': {
    scope: 'office',
    main: (): Segment[] => [{ station: 'box_room', state: 'working', minMs: MIN_WORK_MS * 2 }],
  },

  // State-only: workers walk back from the box room on their own.
  'context.compacted': {},

  // Set dressing only — the whiteboard gains a sticky via reduced state.
  'task.created': {},
  'task.completed': {},

  // Reserved: the agent actively wants the human. No staging yet.
  notify: {},
};
