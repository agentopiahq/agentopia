import { AgentopiaEvent, LEAD_WORKER } from '@agentopia/core';

import { TimelineEntry } from './replay';

export interface ScrubberHandlers {
  onScrubStart(): void;
  onScrub(fraction: number): void;
  onScrubEnd(fraction: number): void;
}

export interface Scrubber {
  show(): void;
  update(cursor: number, duration: number, entries: readonly TimelineEntry[]): void;
}

/** Clicks and hovers within this many pixels of a marker snap to its event. */
const SNAP_PX = 8;

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function clip(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** One line for the tooltip: who did what. */
function describeEvent(event: AgentopiaEvent): string {
  const who = event.worker === LEAD_WORKER ? 'lead' : (event.workerType ?? event.worker);
  const text = typeof event.meta?.text === 'string' ? event.meta.text : undefined;
  const tool = event.tool
    ? `${event.tool.name}${event.tool.detail ? ` ${event.tool.detail}` : ''}`
    : '';
  switch (event.kind) {
    case 'session.start':
      return 'session starts';
    case 'session.end':
      return 'session ends';
    case 'turn.user':
      return text ? clip(`you: ${text}`) : 'your turn';
    case 'turn.stop':
      return text ? clip(`${who}: ${text}`) : `${who} wraps up`;
    case 'worker.start':
      return `${who} arrives`;
    case 'worker.stop':
      return `${who} leaves`;
    case 'tool.start':
      return clip(`${who} · ${tool}`);
    case 'tool.end':
      return clip(`${who} · ${tool} ${event.tool?.status === 'failed' ? 'failed' : 'done'}`);
    case 'approval.request':
      return `${who} asks permission`;
    case 'approval.denied':
      return `${who} was told no`;
    case 'context.compact':
    case 'context.compacted':
      return 'context compacted';
    case 'task.created':
      return 'task created';
    case 'task.completed':
      return 'task completed';
    case 'notify':
      return text ? clip(text) : 'notification';
    default:
      return event.kind;
  }
}

function eventFailed(event: AgentopiaEvent): boolean {
  return (
    (event.kind === 'tool.end' && event.tool?.status === 'failed') ||
    event.kind === 'approval.denied'
  );
}

/**
 * The replay progress bar: drag anywhere on the track to scrub, with one tick
 * per event. Clicks and releases within SNAP_PX of a tick land exactly on
 * that event; hovering shows what it was. Marker interaction lives on the
 * track (nearest-within-tolerance) rather than per tick, so overlapping ticks
 * in a dense recording stay clickable.
 *
 * Scrub callbacks are rAF-throttled — every seek re-reduces the recording, so
 * one rebuild per rendered frame is the right rate, not one per pointermove.
 */
export function mountScrubber(handlers: ScrubberHandlers): Scrubber {
  const root = document.getElementById('scrubber');
  const track = document.getElementById('scrubber-track');
  const fill = document.getElementById('scrubber-fill');
  const markerLayer = document.getElementById('scrubber-markers');
  const handle = document.getElementById('scrubber-handle');
  const time = document.getElementById('scrubber-time');
  const tooltip = document.getElementById('scrubber-tooltip');
  if (!root || !track || !fill || !markerLayer || !handle || !time || !tooltip) {
    throw new Error('scrubber markup missing');
  }

  let entriesRef: readonly TimelineEntry[] = [];
  let durationRef = 0;
  let markerEls: HTMLElement[] = [];
  let renderedCount = -1;
  let renderedDuration = -1;
  let activeIndex = -1;
  let dragging = false;
  let pendingFraction: number | null = null;
  let rafId = 0;

  const fractionAt = (clientX: number): number => {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  /** Index of the event within SNAP_PX of the pointer, or -1. Entries are sorted. */
  const nearestIndex = (clientX: number): number => {
    const rect = track.getBoundingClientRect();
    if (entriesRef.length === 0 || durationRef <= 0 || rect.width <= 0) {
      return -1;
    }
    const targetMs = fractionAt(clientX) * durationRef;
    const tolMs = (SNAP_PX / rect.width) * durationRef;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < entriesRef.length; i++) {
      const dist = Math.abs(entriesRef[i].offset - targetMs);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
      if (entriesRef[i].offset - targetMs > tolMs) {
        break;
      }
    }
    return bestDist <= tolMs ? best : -1;
  };

  /** The fraction to seek to: an event's exact position when one is close. */
  const snappedFraction = (clientX: number): number => {
    const index = nearestIndex(clientX);
    if (index >= 0 && durationRef > 0) {
      return entriesRef[index].offset / durationRef;
    }
    return fractionAt(clientX);
  };

  const hideTooltip = (): void => {
    tooltip.classList.remove('visible');
    if (activeIndex >= 0) {
      markerEls[activeIndex]?.classList.remove('active');
      activeIndex = -1;
    }
  };

  const showTooltip = (index: number): void => {
    if (activeIndex !== index && activeIndex >= 0) {
      markerEls[activeIndex]?.classList.remove('active');
    }
    activeIndex = index;
    markerEls[index]?.classList.add('active');

    const entry = entriesRef[index];
    // Parallel batches land several events on one spot; say so.
    const siblings = entriesRef.filter((other) => other.offset === entry.offset).length - 1;
    const extra = siblings > 0 ? ` (+${siblings} more)` : '';
    tooltip.textContent = `${formatMs(entry.offset)} · ${describeEvent(entry.sequenced.event)}${extra}`;
    tooltip.classList.add('visible');

    const rootRect = root.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const fraction = durationRef > 0 ? entry.offset / durationRef : 0;
    const center = trackRect.left - rootRect.left + fraction * trackRect.width;
    const half = tooltip.offsetWidth / 2;
    const clamped = Math.min(rootRect.width - half + 24, Math.max(half - 24, center));
    tooltip.style.left = `${clamped}px`;
  };

  const updateTooltip = (clientX: number): void => {
    const index = nearestIndex(clientX);
    if (index >= 0) {
      showTooltip(index);
    } else {
      hideTooltip();
    }
  };

  const rebuildMarkers = (): void => {
    renderedCount = entriesRef.length;
    renderedDuration = durationRef;
    activeIndex = -1;
    markerLayer.textContent = '';
    markerEls = entriesRef.map((entry) => {
      const el = document.createElement('div');
      el.className = eventFailed(entry.sequenced.event)
        ? 'scrubber-marker failed'
        : 'scrubber-marker';
      const pct = durationRef > 0 ? (entry.offset / durationRef) * 100 : 0;
      el.style.left = `${pct}%`;
      markerLayer.appendChild(el);
      return el;
    });
  };

  const flush = (): void => {
    rafId = 0;
    if (pendingFraction !== null) {
      handlers.onScrub(pendingFraction);
      pendingFraction = null;
    }
  };

  track.addEventListener('pointerdown', (event) => {
    dragging = true;
    track.setPointerCapture(event.pointerId);
    handlers.onScrubStart();
    handlers.onScrub(snappedFraction(event.clientX));
  });

  track.addEventListener('pointermove', (event) => {
    updateTooltip(event.clientX);
    if (!dragging) {
      return;
    }
    pendingFraction = fractionAt(event.clientX);
    if (!rafId) {
      rafId = requestAnimationFrame(flush);
    }
  });

  track.addEventListener('pointerleave', () => {
    if (!dragging) {
      hideTooltip();
    }
  });

  const release = (event: PointerEvent): void => {
    if (!dragging) {
      return;
    }
    dragging = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      pendingFraction = null;
    }
    handlers.onScrubEnd(snappedFraction(event.clientX));
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);

  return {
    show(): void {
      root.classList.add('visible');
    },
    update(cursor: number, duration: number, entries: readonly TimelineEntry[]): void {
      entriesRef = entries;
      durationRef = duration;
      if (entries.length !== renderedCount || duration !== renderedDuration) {
        rebuildMarkers();
      }
      const pct = duration > 0 ? (cursor / duration) * 100 : 0;
      fill.style.width = `${pct}%`;
      handle.style.left = `${pct}%`;
      time.textContent = `${formatMs(cursor)} / ${formatMs(duration)}`;
    },
  };
}
