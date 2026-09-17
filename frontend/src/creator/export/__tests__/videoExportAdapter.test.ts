/**
 * videoExportAdapter tests — the CreatorDocument → VideoExportRequest
 * flattening for the single-clip native path.
 *
 * `thryft-media-export`'s `jsExportImage` is mocked — the adapter calls it
 * to rasterise overlay layers to a transparent PNG.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const jsExportImageMock = vi.fn();
vi.mock('../../../../modules/thryft-media-export/src', () => ({
  isJsExportAvailable: vi.fn(() => true),
  jsExportImage: (...args: unknown[]) => jsExportImageMock(...args),
}));

import { buildSingleClipVideoRequest } from '../videoExportAdapter';
import type { CreatorDocument, CreatorLayer } from '../../core/projectStore/composition';

function mediaLayer(overrides: Record<string, unknown> = {}): CreatorLayer {
  return {
    id: 'media_1',
    type: 'media',
    x: 0.5, y: 0.5, width: 1, height: 1,
    scale: 1, rotation: 0, zIndex: 0,
    locked: false, hidden: false, opacity: 1,
    payload: {
      mediaUri: 'file:///cache/clip.mp4',
      mediaType: 'video',
      contentFit: 'cover',
      opacity: 1,
      ...overrides,
    },
  } as CreatorLayer;
}

function textLayer(id = 'text_1'): CreatorLayer {
  return {
    id,
    type: 'text',
    x: 0.5, y: 0.2, width: 0.8, height: 0.1,
    scale: 1, rotation: 0, zIndex: 10,
    locked: false, hidden: false, opacity: 1,
    payload: {
      text: 'Hello', textColor: '#ffffff', alignment: 'center',
      opacity: 1, fontSize: 48,
    },
  } as CreatorLayer;
}

function doc(layers: CreatorLayer[], pages?: number): CreatorDocument {
  const page = { id: 'page_1', layers };
  return {
    id: 'doc_1',
    type: 'poster',
    version: 1,
    canvas: { aspectRatio: 9 / 16, background: { type: 'color', value: 'transparent' } },
    pages: pages && pages > 1 ? [page, { id: 'page_2', layers }] : [page],
    metadata: { caption: '', title: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
    updatedAt: new Date().toISOString(),
  } as CreatorDocument;
}

describe('buildSingleClipVideoRequest', () => {
  beforeEach(() => {
    jsExportImageMock.mockReset();
    jsExportImageMock.mockResolvedValue({ uri: 'file:///cache/overlay.png' });
  });

  it('maps a bare video clip with no overlays', async () => {
    const request = await buildSingleClipVideoRequest(
      doc([mediaLayer()]), 'page_1', { width: 1080, height: 1920 }, 's1');
    expect(request).not.toBeNull();
    expect(request!.sourceUri).toBe('file:///cache/clip.mp4');
    expect(request!.overlays).toBeUndefined();
    expect(request!.outputWidth).toBe(1080);
    expect(request!.outputHeight).toBe(1920);
    expect(request!.sessionId).toBe('s1');
  });

  it('forwards trim/speed/reverse/freeze edits', async () => {
    const request = await buildSingleClipVideoRequest(
      doc([mediaLayer({
        trimStartMs: 1000, trimEndMs: 5000, speed: 2,
        reversed: true, freezeFrameMs: 500, freezeDurationMs: 800,
      })]),
      'page_1', { width: 1080, height: 1920 }, 's2');
    expect(request).toMatchObject({
      trimStartMs: 1000, trimEndMs: 5000, speed: 2,
      reversed: true, freezeFrameMs: 500, freezeDurationMs: 800,
    });
  });

  it('rasterises overlay layers to a full-frame sticker PNG', async () => {
    const request = await buildSingleClipVideoRequest(
      doc([mediaLayer(), textLayer()]),
      'page_1', { width: 1080, height: 1920 }, 's3');
    expect(jsExportImageMock).toHaveBeenCalledOnce();
    // The overlay document must strip the media layer + background.
    const overlayDoc = JSON.parse(jsExportImageMock.mock.calls[0][0]);
    expect(overlayDoc.pages[0].layers).toHaveLength(1);
    expect(overlayDoc.pages[0].layers[0].type).toBe('text');
    expect(overlayDoc.canvas.background.value).toBe('transparent');
    expect(request!.overlays).toHaveLength(1);
    expect(request!.overlays![0]).toMatchObject({
      kind: 'sticker', x: 0, y: 0, width: 1, height: 1,
      stickerImageUri: 'file:///cache/overlay.png',
    });
  });

  it('returns null for remote sources (native path needs local files)', async () => {
    const request = await buildSingleClipVideoRequest(
      doc([mediaLayer({ mediaUri: 'https://cdn.example.com/clip.mp4' })]),
      'page_1', { width: 1080, height: 1920 }, 's4');
    expect(request).toBeNull();
  });

  it('returns null for multiple media layers (multi-track → backend render)', async () => {
    const request = await buildSingleClipVideoRequest(
      doc([mediaLayer(), mediaLayer()]),
      'page_1', { width: 1080, height: 1920 }, 's5');
    expect(request).toBeNull();
  });

  it('returns null for image media (not a video clip)', async () => {
    const request = await buildSingleClipVideoRequest(
      doc([mediaLayer({ mediaType: 'image', mediaUri: 'file:///cache/pic.jpg' })]),
      'page_1', { width: 1080, height: 1920 }, 's6');
    expect(request).toBeNull();
  });

  it('returns null for a missing page', async () => {
    const request = await buildSingleClipVideoRequest(
      doc([mediaLayer()]), 'nope', { width: 1080, height: 1920 }, 's7');
    expect(request).toBeNull();
  });

  it('mutes audio when volume is 0', async () => {
    const muted = await buildSingleClipVideoRequest(
      doc([mediaLayer({ volume: 0 })]),
      'page_1', { width: 1080, height: 1920 }, 's8');
    expect(muted!.muteAudio).toBe(true);
  });

  it('refuses authored edits the contract cannot express (no silent drops)', async () => {
    // Partial volume — the contract carries a mute flag, not a scalar.
    const partial = await buildSingleClipVideoRequest(
      doc([mediaLayer({ volume: 0.5 })]),
      'page_1', { width: 1080, height: 1920 }, 's9');
    expect(partial).toBeNull();

    // Audio fades — a mixdown concern.
    const faded = await buildSingleClipVideoRequest(
      doc([mediaLayer({ fadeInMs: 300 })]),
      'page_1', { width: 1080, height: 1920 }, 's10');
    expect(faded).toBeNull();

    // Effects recipe — a render-graph concern.
    const filtered = await buildSingleClipVideoRequest(
      doc([mediaLayer({ filterId: 'mono' })]),
      'page_1', { width: 1080, height: 1920 }, 's11');
    expect(filtered).toBeNull();
  });
});
