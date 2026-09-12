import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// `compositionRenderer` is mocked so tests never touch sharp/ffmpeg — the
// service wiring under test is page classification, expected-media lookup,
// fail-closed propagation, and per-frame parallelism. The renderer itself is
// covered by compositionRenderer.test.ts.
//
// `s3` is mocked so no S3 client is constructed and no objects are uploaded;
// the mock captures the object key/buffer/content-type so assertions can
// verify the renders/<docId>/composition_<uuid>.<ext> contract and the
// immutable cache-control header.
//
// `compositionValidation` is mocked to keep the service import hermetic —
// the envelope validator is exercised inside the DB transaction path, which
// is out of scope for these tests.

const rendererMock = vi.hoisted(() => ({
  renderComposition: vi.fn(),
  isCompositionNonTrivial: vi.fn(),
  getVideoRenderPath: vi.fn(),
}));

const s3Mock = vi.hoisted(() => ({
  putBinaryObject: vi.fn(),
}));

const validationMock = vi.hoisted(() => ({
  validateCompositionDocument: vi.fn(),
}));

vi.mock('../lib/media/compositionRenderer.js', () => ({
  renderComposition: rendererMock.renderComposition,
  isCompositionNonTrivial: rendererMock.isCompositionNonTrivial,
  getVideoRenderPath: rendererMock.getVideoRenderPath,
}));

vi.mock('../lib/s3.js', () => ({
  putBinaryObject: s3Mock.putBinaryObject,
}));

vi.mock('../lib/compositionValidation.js', () => ({
  validateCompositionDocument: validationMock.validateCompositionDocument,
}));

import { __testables } from '../services/creatorPublicationService.js';

const {
  renderCompositionMedia,
  renderPosterFrameCompositions,
  videoPageRenderPath,
} = __testables;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const FAKE_MP4 = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);

const JPEG_RENDER = { buffer: FAKE_JPEG, contentType: 'image/jpeg', width: 1080, height: 1350 };
const MP4_RENDER = { buffer: FAKE_MP4, contentType: 'video/mp4', width: 1080, height: 1920 };

/** Build a media layer matching the composition document layer shape. */
function mediaLayer(
  id: string,
  mediaType: 'image' | 'video',
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
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
    payload: { mediaType, ...payload },
  };
}

/** Build a non-media (text) layer — a page with no media layer at all. */
function textLayer(id: string): Record<string, unknown> {
  return {
    id,
    type: 'text',
    x: 0.5,
    y: 0.5,
    width: 0.8,
    height: 0.12,
    scale: 1,
    rotation: 0,
    zIndex: 1,
    hidden: false,
    opacity: 1,
    payload: { text: 'caption', textColor: '#ffffff', fontSize: 48 },
  };
}

function page(id: string, layers: Array<Record<string, unknown>>): Record<string, unknown> {
  return { id, layers };
}

/** Minimal single-page look composition document. */
function lookDoc(layer: Record<string, unknown>): unknown {
  return {
    type: 'look',
    canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#1a1a1a' } },
    pages: [page('page-0', [layer])],
  };
}

/** Minimal multi-page poster composition document. */
function posterDoc(pages: Array<Record<string, unknown>>): unknown {
  return {
    type: 'poster',
    canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#1a1a1a' } },
    pages,
  };
}

function expectedMediaEntry(
  layerId: string,
  mediaType: 'image' | 'video',
  suppliedUrl: string,
): { layerId: string; role: string; mediaType: 'image' | 'video'; suppliedUrl: string } {
  return { layerId, role: 'primary', mediaType, suppliedUrl };
}

beforeEach(() => {
  rendererMock.renderComposition.mockReset();
  rendererMock.isCompositionNonTrivial.mockReset();
  rendererMock.getVideoRenderPath.mockReset();
  s3Mock.putBinaryObject.mockReset();
  validationMock.validateCompositionDocument.mockReset();

  // Default: uploads echo the object key back as a CDN URL.
  s3Mock.putBinaryObject.mockImplementation((key: string) =>
    Promise.resolve(`https://cdn.example.com/media/${key}`),
  );
  validationMock.validateCompositionDocument.mockReturnValue({ ok: true });
});

// ---------------------------------------------------------------------------
// renderCompositionMedia — single-media render + upload wiring
// ---------------------------------------------------------------------------

describe('renderCompositionMedia', () => {
  it('returns {renderedUrl: null} without rendering when the composition is trivial', async () => {
    rendererMock.isCompositionNonTrivial.mockReturnValue(false);

    const result = await renderCompositionMedia(
      'doc-1',
      lookDoc(mediaLayer('media_1', 'image')),
      'https://cdn.example.com/src.jpg',
      'image',
    );

    expect(result).toEqual({ renderedUrl: null });
    expect(rendererMock.renderComposition).not.toHaveBeenCalled();
    expect(s3Mock.putBinaryObject).not.toHaveBeenCalled();
  });

  it('renders a non-trivial image composition and uploads a .jpg render', async () => {
    rendererMock.isCompositionNonTrivial.mockReturnValue(true);
    rendererMock.renderComposition.mockResolvedValue(JPEG_RENDER);

    const result = await renderCompositionMedia(
      'doc-1',
      lookDoc(mediaLayer('media_1', 'image')),
      'https://cdn.example.com/src.jpg',
      'image',
    );

    expect(rendererMock.renderComposition).toHaveBeenCalledTimes(1);
    expect(s3Mock.putBinaryObject).toHaveBeenCalledTimes(1);
    const [key, buffer, contentType, options] = s3Mock.putBinaryObject.mock.calls[0]!;
    expect(key).toMatch(/^renders\/doc-1\/composition_[0-9a-f-]+\.jpg$/);
    expect(buffer).toBe(FAKE_JPEG);
    expect(contentType).toBe('image/jpeg');
    expect(options).toEqual({ cacheControl: 'public, max-age=31536000, immutable' });
    expect(result.renderedUrl).toBe(`https://cdn.example.com/media/${key}`);
  });

  it('uploads a .mp4 render when the rendered content type is video/mp4', async () => {
    rendererMock.isCompositionNonTrivial.mockReturnValue(true);
    rendererMock.renderComposition.mockResolvedValue(MP4_RENDER);

    const result = await renderCompositionMedia(
      'doc-1',
      lookDoc(mediaLayer('media_1', 'video', { speed: 2, videoDurationMs: 8000 })),
      'https://cdn.example.com/src.mp4',
      'video',
    );

    const [key, , contentType] = s3Mock.putBinaryObject.mock.calls[0]!;
    expect(key).toMatch(/^renders\/doc-1\/composition_[0-9a-f-]+\.mp4$/);
    expect(contentType).toBe('video/mp4');
    expect(result.renderedUrl).toBe(`https://cdn.example.com/media/${key}`);
  });

  it('signals fail-closed when a non-trivial render returns null', async () => {
    rendererMock.isCompositionNonTrivial.mockReturnValue(true);
    rendererMock.renderComposition.mockResolvedValue(null);

    const result = await renderCompositionMedia(
      'doc-1',
      lookDoc(mediaLayer('media_1', 'image')),
      'https://cdn.example.com/src.jpg',
      'image',
    );

    expect(result).toEqual({ renderedUrl: null, renderFailed: true, nonTrivial: true });
    expect(s3Mock.putBinaryObject).not.toHaveBeenCalled();
  });

  it('signals fail-closed when a non-trivial render throws', async () => {
    rendererMock.isCompositionNonTrivial.mockReturnValue(true);
    rendererMock.renderComposition.mockRejectedValue(new Error('transcode failed'));

    const result = await renderCompositionMedia(
      'doc-1',
      lookDoc(mediaLayer('media_1', 'video', { speed: 2, videoDurationMs: 8000 })),
      'https://cdn.example.com/src.mp4',
      'video',
    );

    expect(result).toEqual({ renderedUrl: null, renderFailed: true, nonTrivial: true });
    expect(s3Mock.putBinaryObject).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// videoPageRenderPath — per-page classification
// ---------------------------------------------------------------------------

describe('videoPageRenderPath', () => {
  it('builds a single-page document containing only the requested page', () => {
    rendererMock.getVideoRenderPath.mockReturnValue('remux');

    const doc = posterDoc([
      page('page-0', [mediaLayer('m0', 'video', { videoDurationMs: 8000 })]),
      page('page-1', [mediaLayer('m1', 'video', { trimStartMs: 1000, videoDurationMs: 8000 })]),
      page('page-2', [mediaLayer('m2', 'image')]),
    ]);

    const result = videoPageRenderPath(doc, 1);

    expect(result).toBe('remux');
    expect(rendererMock.getVideoRenderPath).toHaveBeenCalledTimes(1);
    const passed = rendererMock.getVideoRenderPath.mock.calls[0]![0] as {
      type: string;
      pages: Array<{ id: string }>;
    };
    // Exactly one page — the requested index — reaches the classifier.
    expect(passed.pages).toHaveLength(1);
    expect(passed.pages[0]!.id).toBe('page-1');
    // Document-level envelope fields are preserved.
    expect(passed.type).toBe('poster');
  });
});

// ---------------------------------------------------------------------------
// renderPosterFrameCompositions — per-frame render orchestration
// ---------------------------------------------------------------------------

describe('renderPosterFrameCompositions', () => {
  it('renders edited video + image frames and skips a trivial video frame', async () => {
    const doc = posterDoc([
      page('page-edited-video', [
        mediaLayer('layer-edited-video', 'video', { speed: 2, videoDurationMs: 8000 }),
      ]),
      page('page-plain-video', [
        mediaLayer('layer-plain-video', 'video', { videoDurationMs: 8000 }),
      ]),
      page('page-image', [mediaLayer('layer-image', 'image')]),
    ]);

    const expectedMedia = [
      expectedMediaEntry('layer-edited-video', 'video', 'https://cdn.example.com/edited.mp4'),
      expectedMediaEntry('layer-plain-video', 'video', 'https://cdn.example.com/plain.mp4'),
      expectedMediaEntry('layer-image', 'image', 'https://cdn.example.com/frame.jpg'),
    ];

    // Per-page classification: the edited video transcodes, the unedited
    // video is trivial and keeps the cheap source path.
    rendererMock.getVideoRenderPath.mockImplementation((d: unknown) => {
      const only = (d as { pages: Array<{ id: string }> }).pages[0]!;
      return only.id === 'page-plain-video' ? 'trivial' : 'transcode';
    });
    rendererMock.isCompositionNonTrivial.mockReturnValue(true);
    rendererMock.renderComposition.mockImplementation(
      (_doc: unknown, _url: string, options?: { pageIndex?: number }) =>
        Promise.resolve(options?.pageIndex === 0 ? MP4_RENDER : JPEG_RENDER),
    );

    const outcome = await renderPosterFrameCompositions('doc-9', doc, expectedMedia);

    expect(outcome.renderFailed).toBe(false);
    expect(outcome.nonTrivial).toBe(false);

    // Only the edited video page and the image page entered the renderer;
    // the trivial video page never reached renderComposition.
    expect(rendererMock.renderComposition).toHaveBeenCalledTimes(2);
    const renderedPages = rendererMock.renderComposition.mock.calls.map(
      (call) => (call[2] as { pageIndex?: number }).pageIndex,
    );
    expect(renderedPages).toContain(0);
    expect(renderedPages).not.toContain(1);
    expect(renderedPages).toContain(2);

    // Each frame rendered with its own page index and expected-media URL.
    const pageZeroCall = rendererMock.renderComposition.mock.calls.find(
      (call) => (call[2] as { pageIndex?: number }).pageIndex === 0,
    )!;
    expect(pageZeroCall[1]).toBe('https://cdn.example.com/edited.mp4');

    expect(outcome.renders.get(0)).toMatch(/\.mp4$/);
    expect(outcome.renders.get(1)).toBeNull();
    expect(outcome.renders.get(2)).toMatch(/\.jpg$/);
    expect(s3Mock.putBinaryObject).toHaveBeenCalledTimes(2);
  });

  it('propagates renderFailed + nonTrivial when a non-trivial frame render fails', async () => {
    const doc = posterDoc([
      page('page-video', [
        mediaLayer('layer-video', 'video', { speed: 2, videoDurationMs: 8000 }),
      ]),
      page('page-image', [mediaLayer('layer-image', 'image')]),
    ]);

    const expectedMedia = [
      expectedMediaEntry('layer-video', 'video', 'https://cdn.example.com/clip.mp4'),
      expectedMediaEntry('layer-image', 'image', 'https://cdn.example.com/frame.jpg'),
    ];

    rendererMock.getVideoRenderPath.mockReturnValue('transcode');
    rendererMock.isCompositionNonTrivial.mockReturnValue(true);
    rendererMock.renderComposition.mockImplementation(
      (_doc: unknown, _url: string, options?: { pageIndex?: number }) =>
        options?.pageIndex === 0
          ? Promise.reject(new Error('transcode failed'))
          : Promise.resolve(JPEG_RENDER),
    );

    const outcome = await renderPosterFrameCompositions('doc-9', doc, expectedMedia);

    // The non-trivial frame failure fails closed so the caller aborts the
    // publication rather than publishing unedited source media.
    expect(outcome.renderFailed).toBe(true);
    expect(outcome.nonTrivial).toBe(true);
    expect(outcome.renders.get(0)).toBeNull();
    // The healthy frame still renders — failures do not poison siblings.
    expect(outcome.renders.get(1)).toMatch(/\.jpg$/);
  });

  it('skips pages with no media layer and pages missing expected media', async () => {
    const doc = posterDoc([
      page('page-text', [textLayer('text-1')]),
      page('page-uncovered-media', [mediaLayer('layer-uncovered', 'image')]),
      page('page-image', [mediaLayer('layer-image', 'image')]),
    ]);

    // expectedMedia covers only the third page's primary layer.
    const expectedMedia = [
      expectedMediaEntry('layer-image', 'image', 'https://cdn.example.com/frame.jpg'),
    ];

    rendererMock.isCompositionNonTrivial.mockReturnValue(true);
    rendererMock.renderComposition.mockResolvedValue(JPEG_RENDER);

    const outcome = await renderPosterFrameCompositions('doc-9', doc, expectedMedia);

    expect(outcome.renderFailed).toBe(false);
    expect(outcome.nonTrivial).toBe(false);
    expect(outcome.renders.get(0)).toBeNull();
    expect(outcome.renders.get(1)).toBeNull();
    expect(outcome.renders.get(2)).toMatch(/\.jpg$/);

    // Only the covered image page reached the renderer.
    expect(rendererMock.renderComposition).toHaveBeenCalledTimes(1);
    expect(
      (rendererMock.renderComposition.mock.calls[0]![2] as { pageIndex?: number }).pageIndex,
    ).toBe(2);
    // No video expected media → the page classifier was never consulted.
    expect(rendererMock.getVideoRenderPath).not.toHaveBeenCalled();
  });
});
