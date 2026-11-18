/**
 * The pure half of the office's clips: which encoded frames a rolling buffer
 * keeps, where a clip of its last seconds starts, and which of those frames a
 * slower export (a GIF) keeps. No browser APIs here, so it is tested on its own.
 *
 * Every frame is encoded as it is painted, and an encoded frame can only be
 * decoded from the key frame before it. So the buffer always reaches back to
 * the key frame at or before the start of the window, a little more than the
 * window itself, and a clip decodes from there and drops the frames before
 * its start.
 */

/** One encoded frame in the buffer. */
export interface Chunk {
  /** When it was painted, in milliseconds on the recorder's clock. */
  at: number;
  /** Whether it decodes on its own. */
  key: boolean;
  data: Uint8Array;
}

/**
 * The chunks to keep at `now` for a window of `windowMs`: from the last key
 * frame at or before the window's start. With no key frame that old, all of them.
 */
export function trimChunks<C extends Chunk>(
  chunks: readonly C[],
  now: number,
  windowMs: number
): C[] {
  return chunks.slice(keyBefore(chunks, now - windowMs));
}

/** The index of the last key frame at or before `from`, or of the first key frame if none is that old. */
function keyBefore(chunks: readonly Chunk[], from: number): number {
  let found = -1;
  for (let i = 0; i < chunks.length; i += 1) {
    if (!chunks[i].key) {
      continue;
    }
    if (chunks[i].at <= from || found < 0) {
      found = i;
    }
    if (chunks[i].at > from) {
      break;
    }
  }
  return Math.max(0, found);
}

/** A clip cut from the buffer: the chunks to decode, and the time the clip starts. */
export interface ClipCut<C extends Chunk> {
  chunks: C[];
  /** Frames painted before this are decoded (later ones need them) but left out. */
  from: number;
  /** The last frame's time. */
  to: number;
}

/** The last `windowMs` of `chunks`, or null when there is no key frame to decode from. */
export function cutClip<C extends Chunk>(
  chunks: readonly C[],
  windowMs: number
): ClipCut<C> | null {
  const first = chunks.findIndex((c) => c.key);
  if (first < 0) {
    return null;
  }
  const to = chunks[chunks.length - 1].at;
  const kept = chunks.slice(first);
  const start = keyBefore(kept, to - windowMs);
  return { chunks: kept.slice(start), from: Math.max(kept[start].at, to - windowMs), to };
}

/**
 * A gate that lets through, of frames painted in order, the first at or after
 * each tick of `fps` from `from`: a 30 fps recording played at a GIF's 20.
 */
export function frameGate(from: number, fps: number): (at: number) => boolean {
  const step = 1000 / fps;
  let next = from;
  return (at) => {
    if (at + 0.5 < next) {
      return false;
    }
    next += step;
    if (next <= at) {
      // A slow paint skips the ticks it missed rather than bunching up after.
      next = at - ((at - from) % step) + step;
    }
    return true;
  };
}

/**
 * A GIF frame that stores only what moved: each pixel whose colour is within
 * `tolerance` (per channel, on average) of the one already shown there is set
 * to `transparent`, and the frame before shows through. `shown` is the palette
 * index on screen at each pixel, and is brought up to date. The office's sheet
 * is still and its people are small, and the tolerance keeps the faint noise
 * of the recording's own compression from counting as movement.
 */
export function maskUnchanged(
  index: Uint8Array,
  shown: Uint8Array,
  palette: readonly (readonly number[])[],
  transparent: number,
  tolerance: number
): Uint8Array {
  const out = new Uint8Array(index.length);
  const limit = 3 * tolerance * tolerance;
  for (let i = 0; i < index.length; i += 1) {
    const now = index[i];
    const was = shown[i];
    if (now === was) {
      out[i] = transparent;
      continue;
    }
    const a = palette[now];
    const b = palette[was];
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    if (dr * dr + dg * dg + db * db <= limit) {
      out[i] = transparent;
    } else {
      out[i] = now;
      shown[i] = now;
    }
  }
  return out;
}

/**
 * The size to record a canvas of `width` by `height` at: its longer side at
 * most `maxSide`, both sides even (video encoders halve the colour planes).
 */
export function recordSize(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  const even = (n: number): number => Math.max(2, Math.floor((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** A file name for an export made at `at`, by the viewer's local time: `agentopia-2026-11-15-135704.gif`. */
export function exportName(at: Date, extension: string): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `agentopia-${day}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}.${extension}`;
}
