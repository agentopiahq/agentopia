// The declaration travels with the import, so a workspace that compiles this file (the site) has it too.
/// <reference path="./gifenc.d.ts" />
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
} from 'mediabunny';

import { frameGate, gifDelay, maskUnchanged, recordSize } from './clip';
import { RecordedClip } from './recorder';

/**
 * A recorded clip of the office made into a file: an animated GIF or a video.
 *
 * Both decode the recorder's chunks frame by frame, lay the page's corners
 * (the title block, the small print) over each the way the picture does, and
 * encode the result. Frames are closed as soon as they are drawn, so only a
 * handful are ever held at once.
 */

/** Frames a GIF shows each second: 50 ms a frame, which GIF's centiseconds hold exactly. */
const GIF_FPS = 20;
/** A GIF is 1080p at most, as the video is: 1080 pixels on its shorter side, 1920 on its longer. */
const GIF_SIZE = { short: 1080, long: 1920 };
/** How near a colour must be to the one shown to count as unchanged, per channel. */
const GIF_TOLERANCE = 10;
/** Frames a video shows each second (all the recorder keeps). */
const VIDEO_FPS = 30;
const HIGH = new Quality('high');

/** How far along an export is, 0 to 1. */
export type Progress = (done: number) => void;

/** A file made from a clip. */
export interface ClipFile {
  blob: Blob;
  extension: string;
}

/** Decode `clip` in order, handing each frame from its start on to `use`, which must not keep it. */
async function eachFrame(
  clip: RecordedClip,
  use: (frame: VideoFrame, at: number) => Promise<void> | void
): Promise<void> {
  const ready: VideoFrame[] = [];
  let failure: unknown = null;
  let poke: (() => void) | null = null;
  const decoder = new VideoDecoder({
    output: (frame) => {
      ready.push(frame);
      poke?.();
    },
    error: (err) => {
      failure = err;
      poke?.();
    },
  });
  decoder.configure(clip.config);
  // Timestamps count from the first chunk, in microseconds.
  const base = clip.chunks[0].at;
  const drain = async (): Promise<void> => {
    while (ready.length > 0) {
      const frame = ready.shift() as VideoFrame;
      try {
        const at = base + frame.timestamp / 1000;
        if (at + 0.5 >= clip.from) {
          await use(frame, at);
        }
      } finally {
        frame.close();
      }
    }
  };
  const check = (): void => {
    if (failure !== null) {
      throw failure;
    }
  };
  try {
    for (const chunk of clip.chunks) {
      decoder.decode(
        new EncodedVideoChunk({
          type: chunk.key ? 'key' : 'delta',
          timestamp: Math.round((chunk.at - base) * 1000),
          data: chunk.data,
        })
      );
      // Keep the decoder only a few chunks ahead of what has been used.
      while (decoder.decodeQueueSize > 2 && failure === null) {
        await new Promise<void>((resolve) => {
          poke = resolve;
          setTimeout(resolve, 20);
        });
      }
      await drain();
      check();
    }
    await decoder.flush();
    await drain();
    check();
  } finally {
    for (const frame of ready) {
      frame.close();
    }
    if (decoder.state !== 'closed') {
      decoder.close();
    }
  }
}

/** A canvas that draws a decoded frame with the corners over it, at `width` by `height`. */
function compositor(
  width: number,
  height: number,
  corners: HTMLCanvasElement | null
): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; draw: (frame: VideoFrame) => void } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!g) {
    throw new Error('no 2d context for the clip');
  }
  return {
    canvas,
    g,
    draw: (frame) => {
      g.drawImage(frame, 0, 0, width, height);
      if (corners) {
        g.drawImage(corners, 0, 0, width, height);
      }
    },
  };
}

/** Let the office paint a frame between pieces of work, so it never stalls. */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The clip as an animated GIF, looping. One palette for the whole clip, from
 * its first frame (the office's colours barely move in ten seconds), and every
 * frame after the first stores only the pixels that changed.
 */
export async function clipToGif(
  clip: RecordedClip,
  corners: HTMLCanvasElement | null,
  progress: Progress
): Promise<ClipFile> {
  const { width, height } = recordSize(clip.width, clip.height, GIF_SIZE);
  const { g, draw } = compositor(width, height, corners);
  const gif = GIFEncoder();
  const span = Math.max(1, clip.to - clip.from);
  const step = 1000 / GIF_FPS;
  const due = frameGate(clip.from, GIF_FPS);
  let palette: number[][] | null = null;
  let transparent = 0;
  let shown: Uint8Array | null = null;
  // Each frame is written once the next is drawn: its delay is the time between them.
  let pending = null as { pixels: Uint8Array; at: number; first: boolean } | null;
  const write = (until: number): void => {
    if (!pending || !palette) {
      return;
    }
    const delay = gifDelay(clip.from, pending.at, until);
    gif.writeFrame(
      pending.pixels,
      width,
      height,
      pending.first
        ? { palette, delay, repeat: 0 }
        : { delay, transparent: true, transparentIndex: transparent, dispose: 1 }
    );
  };
  await eachFrame(clip, async (frame, at) => {
    if (!due(at)) {
      return;
    }
    draw(frame);
    const rgba = g.getImageData(0, 0, width, height).data;
    if (!palette) {
      // 255 colours, and one more slot for "unchanged".
      palette = quantize(rgba, 255);
      transparent = palette.length;
      palette.push([0, 0, 0]);
    }
    const index = applyPalette(rgba, palette);
    write(at);
    if (shown) {
      pending = {
        pixels: maskUnchanged(index, shown, palette, transparent, GIF_TOLERANCE),
        at,
        first: false,
      };
    } else {
      pending = { pixels: index, at, first: true };
      shown = index;
    }
    progress(Math.min(0.99, (at - clip.from) / span));
    await breathe();
  });
  // The last frame holds for one tick.
  write((pending?.at ?? clip.to) + step);
  gif.finish();
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), extension: 'gif' };
}

/**
 * The clip as a video: MP4 in H.264 where the browser can encode it (it plays
 * everywhere), otherwise whatever MP4 or WebM codec it can.
 */
export async function clipToVideo(
  clip: RecordedClip,
  corners: HTMLCanvasElement | null,
  progress: Progress
): Promise<ClipFile> {
  const { width, height } = clip;
  const size = { width, height, quality: HIGH };
  const mp4 = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'hevc'], size);
  const codec = mp4 ?? (await getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], size));
  if (!codec) {
    throw new Error('this browser cannot encode video');
  }
  const format = mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
  const target = new BufferTarget();
  const output = new Output({ format, target });
  const { canvas, draw } = compositor(width, height, corners);
  const source = new CanvasSource(canvas, { codec, quality: HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: VIDEO_FPS });
  await output.start();
  const span = Math.max(1, clip.to - clip.from);
  let last: number | null = null;
  try {
    await eachFrame(clip, async (frame, at) => {
      draw(frame);
      const t = (at - clip.from) / 1000;
      await source.add(Math.max(0, t), 1 / VIDEO_FPS);
      last = t;
      progress(Math.min(0.99, (at - clip.from) / span));
    });
    if (last === null) {
      throw new Error('the clip had no frames');
    }
    await output.finalize();
  } catch (err) {
    await output.cancel();
    throw err;
  }
  const buffer = target.buffer;
  if (!buffer) {
    throw new Error('the video came out empty');
  }
  return {
    blob: new Blob([buffer], { type: format.mimeType }),
    extension: format.fileExtension.slice(1),
  };
}
