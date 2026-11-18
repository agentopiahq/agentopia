import { Clock } from '@agentopia/core';

import { Chunk, ClipCut, captureRate, cutClip, recordSize, trimChunks } from './clip';

/**
 * The office's last few seconds, kept so an export can make a GIF or a video
 * of what just happened, not of what happens next.
 *
 * Keeping raw frames would cost hundreds of megabytes, so each frame is
 * encoded as it is painted (WebCodecs, in hardware where the machine has it)
 * and only the encoded chunks are kept: a few megabytes for ten seconds. A
 * clip decodes them back. Frames are copied from the office's canvas right
 * after it paints, the only moment WebGL still holds them.
 *
 * Where the browser has no WebCodecs the recorder never starts, and the
 * export menu offers only the picture.
 */

/** How much of the past a clip can reach, in milliseconds. */
export const CLIP_MS = 10_000;
/** Frames recorded per second, at most. */
const FPS = 30;
/**
 * Of every second, how much of the office's own time copying frames out may
 * take, in milliseconds. A GPU copies a frame for almost nothing; where it
 * costs more (Safari reads a big WebGL canvas back slowly), fewer frames are
 * taken, and below `MIN_FPS` none at all.
 */
const BUDGET_MS = 100;
/** The fewest frames a second worth recording. */
const MIN_FPS = 10;
/** A key frame this often, in milliseconds: the buffer reaches this far past the window. */
const KEY_EVERY_MS = 1_000;
/** A recorded frame is at most 1080p: 1080 pixels on its shorter side, 1920 on its longer. */
const MAX_SIZE = { short: 1080, long: 1920 };
/** Frames waiting on the encoder beyond which a new one is dropped rather than queued. */
const MAX_QUEUE = 3;

/** Codecs to keep the buffer in, cheapest first: H.264 is in hardware almost everywhere. */
const CODECS = ['avc1.42E028', 'vp09.00.10.08', 'vp8'];

/** What a clip export decodes. */
export interface RecordedClip extends ClipCut<Chunk> {
  config: VideoDecoderConfig;
  width: number;
  height: number;
}

/** Whether this browser can record clips at all. */
export function canRecord(): boolean {
  return (
    typeof VideoEncoder === 'function' &&
    typeof VideoDecoder === 'function' &&
    typeof VideoFrame === 'function' &&
    typeof document !== 'undefined'
  );
}

export class Recorder {
  private chunks: Chunk[] = [];
  private encoder: VideoEncoder | null = null;
  private decoderConfig: VideoDecoderConfig | null = null;
  private codec: string | null = null;
  /** The recorded size, and the size of the canvas it was worked out from. */
  private size = { width: 0, height: 0 };
  private sourceSize = { width: 0, height: 0 };
  private configuring = false;
  private broken = false;
  private lastAt = -Infinity;
  private lastKeyAt = -Infinity;
  /** What copying a frame out has cost, averaged, in milliseconds; and over how many. */
  private cost = 0;
  private costed = 0;
  /** Frames taken a second, as the cost allows. */
  private fps = FPS;
  /** Why the recorder stopped for good, if it has. */
  private stop: 'unsupported' | 'slow' | null = null;
  /** The clock's time at the first frame: encoded timestamps count from here. */
  private epoch = NaN;
  private readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d', { alpha: false });
  private readonly onVisibility = (): void => {
    // A hidden page barely paints; a clip across the gap would jump. Start afresh.
    if (document.hidden) {
      this.reset();
    }
  };

  constructor(private readonly clock: Clock) {
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Copy the canvas just painted into the buffer, if a frame is due. */
  capture(source: HTMLCanvasElement): void {
    if (this.broken || this.configuring || document.hidden || !this.g) {
      return;
    }
    const now = this.clock.now();
    // Slack enough that every other paint at 60 Hz (every fourth at 120) is taken.
    if (now - this.lastAt < 1000 / this.fps - 8) {
      return;
    }
    if (source.width !== this.sourceSize.width || source.height !== this.sourceSize.height) {
      void this.configure(source.width, source.height);
      return;
    }
    const encoder = this.encoder;
    if (!encoder || encoder.state !== 'configured' || encoder.encodeQueueSize > MAX_QUEUE) {
      return;
    }
    if (Number.isNaN(this.epoch)) {
      this.epoch = now;
    }
    this.lastAt = now;
    const { width, height } = this.size;
    this.g.drawImage(source, 0, 0, width, height);
    const frame = new VideoFrame(this.canvas, { timestamp: Math.round((now - this.epoch) * 1000) });
    const keyFrame = now - this.lastKeyAt >= KEY_EVERY_MS;
    if (keyFrame) {
      this.lastKeyAt = now;
    }
    try {
      encoder.encode(frame, { keyFrame });
    } finally {
      frame.close();
    }
    this.weigh(this.clock.now() - now);
  }

  /** Why the recorder has stopped for good, or null while it records. */
  stoppedFor(): 'unsupported' | 'slow' | null {
    return this.broken ? (this.stop ?? 'unsupported') : null;
  }

  /** Frames a second it is taking. */
  framesPerSecond(): number {
    return this.fps;
  }

  private weigh(ms: number): void {
    this.costed += 1;
    this.cost += (ms - this.cost) / Math.min(this.costed, 10);
    if (this.costed < 10) {
      return;
    }
    this.fps = captureRate(this.cost, BUDGET_MS, FPS, MIN_FPS);
    if (this.fps === 0) {
      console.warn(
        `agentopia: copying a frame costs ${this.cost.toFixed(1)} ms here; clips are off`
      );
      this.stop = 'slow';
      this.destroy();
    }
  }

  /** How many seconds of the past a clip made now would hold. */
  seconds(): number {
    const cut = cutClip(this.chunks, CLIP_MS);
    return cut ? (cut.to - cut.from) / 1000 : 0;
  }

  /** The last `CLIP_MS` as it stands now, or null with nothing yet recorded. */
  take(): RecordedClip | null {
    const cut = this.decoderConfig ? cutClip(this.chunks, CLIP_MS) : null;
    if (!cut || !this.decoderConfig) {
      return null;
    }
    return { ...cut, config: this.decoderConfig, ...this.size };
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.closeEncoder();
    this.chunks = [];
    this.broken = true;
  }

  private reset(): void {
    this.chunks = [];
    this.lastAt = -Infinity;
    // The first frame after a gap must be a key frame, to decode on its own.
    this.lastKeyAt = -Infinity;
  }

  private closeEncoder(): void {
    if (this.encoder && this.encoder.state !== 'closed') {
      this.encoder.close();
    }
    this.encoder = null;
  }

  /** Set the encoder up for a canvas of this size; the buffer starts again. */
  private async configure(sourceWidth: number, sourceHeight: number): Promise<void> {
    this.configuring = true;
    this.sourceSize = { width: sourceWidth, height: sourceHeight };
    this.closeEncoder();
    this.reset();
    this.epoch = NaN;
    this.decoderConfig = null;
    const size = recordSize(sourceWidth, sourceHeight, MAX_SIZE);
    this.size = size;
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    const base = {
      width: size.width,
      height: size.height,
      // Flat inked art: this is generous, and the export re-encodes anyway.
      bitrate: 10_000_000,
      framerate: FPS,
      latencyMode: 'realtime' as const,
    };
    try {
      this.codec ??= await pickCodec(base);
      if (!this.codec) {
        this.broken = true;
        return;
      }
      const encoder = new VideoEncoder({
        output: (chunk, meta) => this.keep(chunk, meta),
        error: (err) => {
          console.error('agentopia: the clip recorder stopped', err);
          this.broken = true;
        },
      });
      encoder.configure({ ...base, codec: this.codec });
      this.encoder = encoder;
    } catch (err) {
      console.error('agentopia: could not start the clip recorder', err);
      this.broken = true;
    } finally {
      this.configuring = false;
    }
  }

  private keep(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void {
    if (meta?.decoderConfig) {
      this.decoderConfig = meta.decoderConfig;
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    const at = this.epoch + chunk.timestamp / 1000;
    this.chunks.push({ at, key: chunk.type === 'key', data });
    this.chunks = trimChunks(this.chunks, at, CLIP_MS);
  }
}

/** The first codec this browser can both encode and decode at this size. */
async function pickCodec(base: Omit<VideoEncoderConfig, 'codec'>): Promise<string | null> {
  for (const codec of CODECS) {
    try {
      const enc = await VideoEncoder.isConfigSupported({ ...base, codec });
      const dec = await VideoDecoder.isConfigSupported({
        codec,
        codedWidth: base.width,
        codedHeight: base.height,
      });
      if (enc.supported && dec.supported) {
        return codec;
      }
    } catch {
      // Not this one.
    }
  }
  return null;
}
