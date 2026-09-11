import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// `runFfmpeg` is mocked so tests never spawn the real ffmpeg binary. The mock
// captures the argument vector so assertions can verify the filter chain
// (setpts/atempo) and trim flags (-ss/-t) were emitted correctly.
//
// `probeMedia` is mocked to return controlled dimensions/audio/duration so
// the renderer does not need a real media file on disk.
//
// `node:fs/promises` is mocked so no real temp files are created: writeFile
// is a no-op, readFile returns a synthetic MP4 buffer, and rm is a no-op.
//
// `globalThis.fetch` is spied per-test to supply the source video buffer.

const ffmpegMock = vi.hoisted(() => ({
  runFfmpeg: vi.fn(),
}));

const ffprobeMock = vi.hoisted(() => ({
  probeMedia: vi.fn(),
}));

vi.mock('../lib/media/ffmpeg.js', () => ({
  runFfmpeg: ffmpegMock.runFfmpeg,
}));

vi.mock('../lib/media/ffprobe.js', () => ({
  probeMedia: ffprobeMock.probeMedia,
}));

const fsMock = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: fsMock.writeFile,
  readFile: fsMock.readFile,
  rm: fsMock.rm,
}));

import { isCompositionNonTrivial, getVideoRenderPath, renderComposition, FILTER_PRESET_MATRICES, interpolateMatrix } from '../lib/media/compositionRenderer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_MP4 = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);

/**
 * Build a minimal composition document whose single media layer is a video
 * with the supplied payload overrides (trim/speed/duration).
 */
function videoDoc(payload: Record<string, unknown> = {}): unknown {
  return {
    type: 'look',
    canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#1a1a1a' } },
    pages: [
      {
        id: 'page',
        layers: [
          {
            id: 'media_1',
            type: 'media',
            x: 0.5,
            y: 0.5,
            width: 1,
            height: 1,
            scale: 1,
            rotation: 0,
            zIndex: 0,
            hidden: false,
            opacity: 1,
            payload: { mediaType: 'video', ...payload },
          },
        ],
      },
    ],
  };
}

/**
 * Build a composition document whose single media layer is a video with the
 * supplied payload overrides, plus additional non-media overlay layers
 * (text/stickers) burned into the video render.
 */
function videoDocWithLayers(
  layers: Array<Record<string, unknown>>,
  mediaPayload: Record<string, unknown> = {},
): unknown {
  return {
    type: 'look',
    canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#1a1a1a' } },
    pages: [
      {
        id: 'page',
        layers: [
          {
            id: 'media_1',
            type: 'media',
            x: 0.5,
            y: 0.5,
            width: 1,
            height: 1,
            scale: 1,
            rotation: 0,
            zIndex: 0,
            hidden: false,
            opacity: 1,
            payload: { mediaType: 'video', ...mediaPayload },
          },
          ...layers,
        ],
      },
    ],
  };
}

function defaultProbeResult() {
  return {
    mediaKind: 'video' as const,
    width: 1920,
    height: 1080,
    durationMs: 10000,
    codec: 'h264',
    container: 'mp4',
    frameRate: 30,
    bitRate: 2000000,
    audioCodec: 'aac' as string | null,
    audioChannels: 2,
    audioSampleRate: 48000,
    hdrMetadata: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isCompositionNonTrivial — video trim/speed', () => {
  it('returns true for a video with trimStartMs > 0', () => {
    expect(isCompositionNonTrivial(videoDoc({ trimStartMs: 1000, videoDurationMs: 10000 }))).toBe(true);
  });

  it('returns true for a video with trimEndMs < duration', () => {
    expect(isCompositionNonTrivial(videoDoc({ trimEndMs: 5000, videoDurationMs: 10000 }))).toBe(true);
  });

  it('returns true for a video with speed != 1.0', () => {
    expect(isCompositionNonTrivial(videoDoc({ speed: 2, videoDurationMs: 10000 }))).toBe(true);
  });

  it('returns false for a plain video with no edits', () => {
    expect(isCompositionNonTrivial(videoDoc({ videoDurationMs: 10000 }))).toBe(false);
  });

  it('returns false for a video whose trimEndMs equals the duration (no trim)', () => {
    expect(isCompositionNonTrivial(videoDoc({ trimEndMs: 10000, videoDurationMs: 10000 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getVideoRenderPath — cheapest-path classification
// ---------------------------------------------------------------------------

describe('getVideoRenderPath', () => {
  it('classifies a plain video with no edits as trivial', () => {
    expect(getVideoRenderPath(videoDoc({ videoDurationMs: 10000 }))).toBe('trivial');
  });

  it('classifies a video with trimStartMs only as remux', () => {
    expect(getVideoRenderPath(videoDoc({ trimStartMs: 1000, videoDurationMs: 10000 }))).toBe('remux');
  });

  it('classifies a video with trimEndMs < duration as remux', () => {
    expect(getVideoRenderPath(videoDoc({ trimEndMs: 5000, videoDurationMs: 10000 }))).toBe('remux');
  });

  it('classifies a video with both trim ends as remux', () => {
    expect(getVideoRenderPath(videoDoc({ trimStartMs: 1000, trimEndMs: 5000, videoDurationMs: 10000 }))).toBe('remux');
  });

  it('classifies a muted video (volume 0) with no other edits as remux', () => {
    expect(getVideoRenderPath(videoDoc({ volume: 0, videoDurationMs: 10000 }))).toBe('remux');
  });

  it('classifies a trimmed + muted video as remux', () => {
    expect(getVideoRenderPath(videoDoc({ trimStartMs: 1000, trimEndMs: 5000, volume: 0, videoDurationMs: 10000 }))).toBe('remux');
  });

  it('classifies a video with speed != 1 as transcode', () => {
    expect(getVideoRenderPath(videoDoc({ speed: 2, videoDurationMs: 10000 }))).toBe('transcode');
  });

  it('classifies a video with reversed=true as transcode', () => {
    expect(getVideoRenderPath(videoDoc({ reversed: true, videoDurationMs: 10000 }))).toBe('transcode');
  });

  it('classifies a video with a freeze frame as transcode', () => {
    expect(getVideoRenderPath(videoDoc({ freezeFrameMs: 1000, freezeDurationMs: 500, videoDurationMs: 10000 }))).toBe('transcode');
  });

  it('classifies a video with a variable speed curve as transcode', () => {
    expect(getVideoRenderPath(videoDoc({
      speedCurve: { points: [{ id: 'p1', position: 0, speed: 1 }, { id: 'p2', position: 1, speed: 2 }], easing: 'linear' },
      videoDurationMs: 10000,
    }))).toBe('transcode');
  });

  it('classifies a video with audio fades as transcode', () => {
    expect(getVideoRenderPath(videoDoc({ fadeInMs: 500, videoDurationMs: 10000 }))).toBe('transcode');
  });

  it('classifies a video with partial volume (0 < v < 1) as transcode', () => {
    expect(getVideoRenderPath(videoDoc({ volume: 0.5, videoDurationMs: 10000 }))).toBe('transcode');
  });

  it('classifies a video with a text overlay as transcode', () => {
    const doc = videoDocWithLayers(
      [{
        id: 'text_1', type: 'text', x: 0.5, y: 0.2, width: 0.8, height: 0.12,
        scale: 1, rotation: 0, zIndex: 1, hidden: false, opacity: 1,
        payload: { text: 'Hello', textColor: '#ffffff', fontSize: 48 },
      }],
      { videoDurationMs: 10000 },
    );
    expect(getVideoRenderPath(doc)).toBe('transcode');
  });

  it('classifies a video with a sticker overlay as transcode', () => {
    const doc = videoDocWithLayers(
      [{
        id: 'sticker_1', type: 'mention', x: 0.5, y: 0.85, width: 0.3, height: 0.08,
        scale: 1, rotation: 0, zIndex: 1, hidden: false, opacity: 1,
        payload: { username: 'creator' },
      }],
      { videoDurationMs: 10000 },
    );
    expect(getVideoRenderPath(doc)).toBe('transcode');
  });

  it('classifies a video with filter effects as transcode', () => {
    expect(getVideoRenderPath(videoDoc({
      effects: [{ type: 'filter', id: 'warm', amount: 0.5 }],
      videoDurationMs: 10000,
    }))).toBe('transcode');
  });

  it('classifies a multi-clip composition as transcode', () => {
    const doc = videoDocWithLayers(
      [{
        id: 'media_2', type: 'media', x: 0.5, y: 0.5, width: 1, height: 1,
        scale: 1, rotation: 0, zIndex: 1, hidden: false, opacity: 1,
        payload: { mediaType: 'video', mediaUri: 'https://cdn.example.com/clip2.mp4' },
      }],
      { videoDurationMs: 10000 },
    );
    expect(getVideoRenderPath(doc)).toBe('transcode');
  });

  it('fails safe to transcode for a malformed document', () => {
    expect(getVideoRenderPath(null)).toBe('transcode');
    expect(getVideoRenderPath({})).toBe('transcode');
    expect(getVideoRenderPath({ type: 'look' })).toBe('transcode');
  });

  it('classifies a plain image composition as transcode (not a video)', () => {
    const doc = {
      type: 'look',
      canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#1a1a1a' } },
      pages: [{
        id: 'page',
        layers: [{
          id: 'media_1', type: 'media', x: 0.5, y: 0.5, width: 1, height: 1,
          scale: 1, rotation: 0, zIndex: 0, hidden: false, opacity: 1,
          payload: { mediaType: 'image' },
        }],
      }],
    };
    expect(getVideoRenderPath(doc)).toBe('transcode');
  });
});

describe('renderComposition — video path', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    ffmpegMock.runFfmpeg.mockReset();
    ffprobeMock.probeMedia.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.readFile.mockReset();
    fsMock.rm.mockReset();

    // Defaults: ffmpeg resolves, probe returns a 1080p clip with audio,
    // fs writes are no-ops, readFile returns a synthetic MP4 buffer, rm is
    // a no-op (temp cleanup is exercised but does not touch disk).
    ffmpegMock.runFfmpeg.mockResolvedValue(undefined);
    ffprobeMock.probeMedia.mockResolvedValue(defaultProbeResult());
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.readFile.mockResolvedValue(FAKE_MP4);
    fsMock.rm.mockResolvedValue(undefined);
    fetchSpy.mockResolvedValue(new Response(FAKE_MP4, { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a video composition and returns an MP4 buffer', async () => {
    const result = await renderComposition(
      videoDoc({ trimStartMs: 1000, trimEndMs: 5000, speed: 2, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('video/mp4');
    expect(result!.buffer).toStrictEqual(FAKE_MP4);
    expect(result!.width).toBe(1920);
    expect(result!.height).toBe(1080);
  });

  it('invokes runFfmpeg with trim and speed filters', async () => {
    await renderComposition(
      videoDoc({ trimStartMs: 1000, trimEndMs: 5000, speed: 2, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    expect(ffmpegMock.runFfmpeg).toHaveBeenCalledTimes(1);
    const args = ffmpegMock.runFfmpeg.mock.calls[0]![0] as string[];
    expect(args).toContain('-y');
    // Input seek trim.
    expect(args).toContain('-ss');
    expect(args[args.indexOf('-ss') + 1]).toBe('1.000');
    expect(args).toContain('-t');
    // Speed video filter.
    expect(args).toContain('-vf');
    expect(args[args.indexOf('-vf') + 1]).toBe('setpts=PTS/2');
    // Audio tempo filter (atempo) for the 2x speed.
    expect(args).toContain('-af');
    expect(args[args.indexOf('-af') + 1]).toContain('atempo=2');
    // H.264 + AAC encoding for web playback.
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    expect(args).toContain('+faststart');
  });

  it('chains atempo factors for speeds outside the 0.5–2.0 range', async () => {
    await renderComposition(
      videoDoc({ speed: 4, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    const args = ffmpegMock.runFfmpeg.mock.calls[0]![0] as string[];
    const af = args[args.indexOf('-af') + 1];
    // 4x → atempo=2,atempo=2 (two chained factors).
    expect(af).toBe('atempo=2.000000,atempo=2.000000');
  });

  it('skips the audio filter when the source has no audio stream', async () => {
    ffprobeMock.probeMedia.mockResolvedValue({ ...defaultProbeResult(), audioCodec: null });

    await renderComposition(
      videoDoc({ speed: 2, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    const args = ffmpegMock.runFfmpeg.mock.calls[0]![0] as string[];
    expect(args).toContain('-vf');
    expect(args).not.toContain('-af');
    expect(args).toContain('-an');
  });

  it('returns null when ffmpeg fails (falls back to source)', async () => {
    ffmpegMock.runFfmpeg.mockRejectedValue(new Error('transcode failed'));

    const result = await renderComposition(
      videoDoc({ speed: 2, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    expect(result).toBeNull();
  });

  it('returns null when the source fetch fails', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));

    const result = await renderComposition(
      videoDoc({ speed: 2, videoDurationMs: 10000 }),
      'https://cdn.example.com/missing.mp4',
    );

    expect(result).toBeNull();
    expect(ffmpegMock.runFfmpeg).not.toHaveBeenCalled();
  });

  it('cleans up temp files even on failure', async () => {
    ffmpegMock.runFfmpeg.mockRejectedValue(new Error('transcode failed'));

    await renderComposition(
      videoDoc({ speed: 2, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    // rm is called for both the input and output temp files.
    expect(fsMock.rm).toHaveBeenCalledTimes(2);
  });

  it('burns text overlays into the video via the drawtext filter', async () => {
    const doc = videoDocWithLayers(
      [
        {
          id: 'text_1',
          type: 'text',
          x: 0.5,
          y: 0.2,
          width: 0.8,
          height: 0.12,
          scale: 1,
          rotation: 0,
          zIndex: 1,
          hidden: false,
          opacity: 1,
          payload: { text: 'Hello world', textColor: '#ffffff', fontSize: 48, alignment: 'center' },
        },
      ],
      { speed: 2, videoDurationMs: 10000 },
    );

    await renderComposition(doc, 'https://cdn.example.com/clip.mp4');

    expect(ffmpegMock.runFfmpeg).toHaveBeenCalledTimes(1);
    const args = ffmpegMock.runFfmpeg.mock.calls[0]![0] as string[];
    // Text-only overlays use a simple -vf chain; setpts leads, drawtext follows.
    expect(args).toContain('-vf');
    const vf = args[args.indexOf('-vf') + 1] as string;
    expect(vf.startsWith('setpts=PTS/2,')).toBe(true);
    expect(vf).toContain('drawtext');
    expect(vf).toContain('Hello world');
  });

  it('burns sticker overlays into the video via the overlay filter', async () => {
    const doc = videoDocWithLayers(
      [
        {
          id: 'sticker_1',
          type: 'mention',
          x: 0.5,
          y: 0.85,
          width: 0.3,
          height: 0.08,
          scale: 1,
          rotation: 0,
          zIndex: 1,
          hidden: false,
          opacity: 1,
          payload: { username: 'creator' },
        },
      ],
      { speed: 2, videoDurationMs: 10000 },
    );

    await renderComposition(doc, 'https://cdn.example.com/clip.mp4');

    expect(ffmpegMock.runFfmpeg).toHaveBeenCalledTimes(1);
    const args = ffmpegMock.runFfmpeg.mock.calls[0]![0] as string[];
    // Sticker overlays need a second input, so the graph uses -filter_complex.
    expect(args).toContain('-filter_complex');
    const fc = args[args.indexOf('-filter_complex') + 1] as string;
    expect(fc).toContain('overlay=0:0');
    // The composited sticker PNG is supplied as a second input.
    const inputCount = args.filter((a) => a === '-i').length;
    expect(inputCount).toBe(2);
  });

  it('retries without overlays when the overlay burn-in fails', async () => {
    const doc = videoDocWithLayers(
      [
        {
          id: 'text_1',
          type: 'text',
          x: 0.5,
          y: 0.2,
          width: 0.8,
          height: 0.12,
          scale: 1,
          rotation: 0,
          zIndex: 1,
          hidden: false,
          opacity: 1,
          payload: { text: 'Overlay', textColor: '#ffffff', fontSize: 48 },
        },
      ],
      { speed: 2, videoDurationMs: 10000 },
    );

    // First render (with overlays) fails; the default mock resolves the retry.
    ffmpegMock.runFfmpeg.mockRejectedValueOnce(new Error('drawtext font not found'));

    const result = await renderComposition(doc, 'https://cdn.example.com/clip.mp4');

    // The video still publishes (retry without overlays succeeds).
    expect(result).not.toBeNull();
    expect(ffmpegMock.runFfmpeg).toHaveBeenCalledTimes(2);

    // The retry args contain no drawtext — trim/speed only.
    const retryArgs = ffmpegMock.runFfmpeg.mock.calls[1]![0] as string[];
    expect(retryArgs).toContain('-vf');
    const retryVf = retryArgs[retryArgs.indexOf('-vf') + 1] as string;
    expect(retryVf).toBe('setpts=PTS/2');
    expect(retryVf).not.toContain('drawtext');
  });

  it('remuxes a trim-only video with -c copy (no re-encode)', async () => {
    await renderComposition(
      videoDoc({ trimStartMs: 1000, trimEndMs: 5000, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    expect(ffmpegMock.runFfmpeg).toHaveBeenCalledTimes(1);
    const args = ffmpegMock.runFfmpeg.mock.calls[0]![0] as string[];
    // Stream copy: no re-encode.
    expect(args).toContain('-c');
    expect(args[args.indexOf('-c') + 1]).toBe('copy');
    // Input-seek trim is still applied.
    expect(args).toContain('-ss');
    expect(args[args.indexOf('-ss') + 1]).toBe('1.000');
    expect(args).toContain('-t');
    // No video filter chain / speed filter on the remux path.
    expect(args).not.toContain('-vf');
    expect(args).not.toContain('-af');
    expect(args.some((a) => a.includes('setpts'))).toBe(false);
    expect(args.some((a) => a.includes('atempo'))).toBe(false);
    expect(args.some((a) => a.includes('drawtext'))).toBe(false);
    expect(args.some((a) => a.includes('overlay'))).toBe(false);
    // No re-encode codecs.
    expect(args).not.toContain('libx264');
    expect(args).not.toContain('aac');
  });

  it('remuxes a muted video (volume 0) with -an', async () => {
    await renderComposition(
      videoDoc({ volume: 0, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    expect(ffmpegMock.runFfmpeg).toHaveBeenCalledTimes(1);
    const args = ffmpegMock.runFfmpeg.mock.calls[0]![0] as string[];
    expect(args[args.indexOf('-c') + 1]).toBe('copy');
    // Mute drops the audio stream.
    expect(args).toContain('-an');
    // No re-encode.
    expect(args).not.toContain('-vf');
    expect(args).not.toContain('libx264');
  });

  it('remuxes a trimmed + muted video with -ss/-t and -an', async () => {
    await renderComposition(
      videoDoc({ trimStartMs: 2000, trimEndMs: 8000, volume: 0, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    const args = ffmpegMock.runFfmpeg.mock.calls[0]![0] as string[];
    expect(args[args.indexOf('-c') + 1]).toBe('copy');
    expect(args[args.indexOf('-ss') + 1]).toBe('2.000');
    expect(args).toContain('-an');
    expect(args).not.toContain('-vf');
  });

  it('still transcodes (re-encodes) when speed is set', async () => {
    await renderComposition(
      videoDoc({ trimStartMs: 1000, trimEndMs: 5000, speed: 2, videoDurationMs: 10000 }),
      'https://cdn.example.com/clip.mp4',
    );

    const args = ffmpegMock.runFfmpeg.mock.calls[0]![0] as string[];
    // Speed requires a re-encode: -c copy must NOT be the codec.
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args).toContain('-vf');
    expect(args.some((a) => a.includes('setpts'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Filter preset matrices
// ---------------------------------------------------------------------------

describe('FILTER_PRESET_MATRICES', () => {
  it('contains all 10 flagship filter presets', () => {
    const expected = ['normal', 'warm', 'cool', 'vintage', 'bw', 'cinematic', 'fade', 'vivid', 'noir', 'golden'];
    for (const name of expected) {
      expect(FILTER_PRESET_MATRICES[name]).toBeDefined();
      expect(FILTER_PRESET_MATRICES[name].length).toBe(20);
    }
  });

  it('normal filter is the identity matrix', () => {
    const m = FILTER_PRESET_MATRICES['normal'];
    expect(m).toEqual([
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ]);
  });

  it('all matrices have identity alpha rows', () => {
    for (const [name, m] of Object.entries(FILTER_PRESET_MATRICES)) {
      // Alpha row: [0, 0, 0, 1, 0]
      expect(m[15]).toBe(0);
      expect(m[16]).toBe(0);
      expect(m[17]).toBe(0);
      expect(m[18]).toBe(1);
      expect(m[19]).toBe(0);
    }
  });
});

describe('interpolateMatrix', () => {
  it('returns identity at intensity 0', () => {
    const target = FILTER_PRESET_MATRICES['warm'];
    const result = interpolateMatrix(target, 0);
    expect(result).toEqual([
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ]);
  });

  it('returns the target matrix at intensity 1', () => {
    const target = FILTER_PRESET_MATRICES['bw'];
    const result = interpolateMatrix(target, 1);
    // Use toBeCloseTo per-element to avoid floating-point precision diffs.
    for (let i = 0; i < 20; i++) {
      expect(result[i]).toBeCloseTo(target[i], 6);
    }
  });

  it('interpolates linearly at intensity 0.5', () => {
    const target = FILTER_PRESET_MATRICES['warm'];
    const result = interpolateMatrix(target, 0.5);
    // Each element should be halfway between identity and target.
    const identity = [
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ];
    for (let i = 0; i < 20; i++) {
      const expected = identity[i] + (target[i] - identity[i]) * 0.5;
      expect(result[i]).toBeCloseTo(expected, 6);
    }
  });

  it('clamps intensity below 0 to identity', () => {
    const target = FILTER_PRESET_MATRICES['vivid'];
    const result = interpolateMatrix(target, -1);
    expect(result).toEqual([
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ]);
  });

  it('clamps intensity above 1 to the target', () => {
    const target = FILTER_PRESET_MATRICES['noir'];
    const result = interpolateMatrix(target, 2);
    // Use toBeCloseTo per-element to avoid floating-point precision diffs.
    for (let i = 0; i < 20; i++) {
      expect(result[i]).toBeCloseTo(target[i], 6);
    }
  });
});

// ---------------------------------------------------------------------------
// isCompositionNonTrivial — filter effects
// ---------------------------------------------------------------------------

describe('isCompositionNonTrivial — filter effects', () => {
  /**
   * Build a minimal composition document whose single media layer has
   * the supplied effect nodes.
   */
  function imageDocWithEffects(effects: unknown[]): unknown {
    return {
      type: 'look',
      canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#1a1a1a' } },
      pages: [
        {
          id: 'page',
          layers: [
            {
              id: 'media_1',
              type: 'media',
              x: 0.5,
              y: 0.5,
              width: 1,
              height: 1,
              scale: 1,
              rotation: 0,
              zIndex: 0,
              hidden: false,
              opacity: 1,
              payload: { mediaType: 'image', effects },
            },
          ],
        },
      ],
    };
  }

  it('returns true when a filter effect is present', () => {
    expect(isCompositionNonTrivial(imageDocWithEffects([
      { type: 'filter', id: 'warm', amount: 0.5 },
    ]))).toBe(true);
  });

  it('returns true when a filter effect has amount 0 (still non-trivial)', () => {
    expect(isCompositionNonTrivial(imageDocWithEffects([
      { type: 'filter', id: 'normal', amount: 0 },
    ]))).toBe(true);
  });

  it('returns false for a plain image with no effects', () => {
    expect(isCompositionNonTrivial(imageDocWithEffects([]))).toBe(false);
  });
});
