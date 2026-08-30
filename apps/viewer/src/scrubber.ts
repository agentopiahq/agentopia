export interface ScrubberHandlers {
  onScrubStart(): void;
  onScrub(fraction: number): void;
  onScrubEnd(fraction: number): void;
}

export interface Scrubber {
  show(): void;
  update(cursor: number, duration: number): void;
}

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The replay progress bar: click or drag anywhere on the track to seek.
 * Scrub callbacks are rAF-throttled — every seek re-reduces the recording, so
 * one rebuild per rendered frame is the right rate, not one per pointermove.
 */
export function mountScrubber(handlers: ScrubberHandlers): Scrubber {
  const root = document.getElementById('scrubber');
  const track = document.getElementById('scrubber-track');
  const fill = document.getElementById('scrubber-fill');
  const handle = document.getElementById('scrubber-handle');
  const time = document.getElementById('scrubber-time');
  if (!root || !track || !fill || !handle || !time) {
    throw new Error('scrubber markup missing');
  }

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
    handlers.onScrub(fractionAt(event.clientX));
  });

  track.addEventListener('pointermove', (event) => {
    if (!dragging) {
      return;
    }
    pendingFraction = fractionAt(event.clientX);
    if (!rafId) {
      rafId = requestAnimationFrame(flush);
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
    handlers.onScrubEnd(fractionAt(event.clientX));
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);

  return {
    show(): void {
      root.classList.add('visible');
    },
    update(cursor: number, duration: number): void {
      const pct = duration > 0 ? (cursor / duration) * 100 : 0;
      fill.style.width = `${pct}%`;
      handle.style.left = `${pct}%`;
      time.textContent = `${formatMs(cursor)} / ${formatMs(duration)}`;
    },
  };
}
