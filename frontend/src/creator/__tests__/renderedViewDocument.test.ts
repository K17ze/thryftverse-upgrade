import { describe, expect, it } from 'vitest';
import { pageWithRenderedMedia } from '../renderedViewDocument';
import type { CreatorLayer, CreatorPage } from '../composition';

function mediaLayer(overrides: Record<string, unknown> = {}): CreatorLayer {
  return {
    id: 'media_1',
    type: 'media',
    x: 0.6,
    y: 0.4,
    width: 0.8,
    height: 0.7,
    scale: 1.4,
    rotation: 12,
    zIndex: 0,
    locked: false,
    hidden: false,
    opacity: 0.8,
    payload: {
      mediaUri: 'file:///raw/source.mp4',
      mediaType: 'video',
      contentFit: 'cover',
      trimStartMs: 500,
      trimEndMs: 3000,
      speed: 2,
      speedCurve: {
        points: [
          { id: 'p0', position: 0, speed: 0.5 },
          { id: 'p1', position: 1, speed: 3 },
        ],
        easing: 'smooth',
      },
      reversed: true,
      freezeFrameMs: 1000,
      freezeDurationMs: 800,
      volume: 0.4,
      fadeInMs: 300,
      fadeOutMs: 400,
      filterId: 'noir',
      effects: [{ id: 'e1', type: 'filter', filterId: 'noir', intensity: 0.8 }],
      focalPoint: { x: 0.3, y: 0.7 },
      videoDurationMs: 5000,
      ...overrides,
    },
  } as unknown as CreatorLayer;
}

function overlayLayer(type: string, id: string): CreatorLayer {
  return {
    id,
    type,
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.2,
    scale: 1,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    opacity: 1,
    payload: {},
  } as unknown as CreatorLayer;
}

const basePage = (layers: CreatorLayer[]): CreatorPage =>
  ({ id: 'page_1', layers, durationMs: 5000 }) as unknown as CreatorPage;

describe('pageWithRenderedMedia', () => {
  it('substitutes the rendered artifact and strips baked edit fields', () => {
    const page = basePage([mediaLayer()]);
    const out = pageWithRenderedMedia(page, 'https://cdn.example.com/render.mp4', 'video');

    const media = out.layers.find((l) => l.type === 'media');
    expect(media).toBeDefined();
    expect(media!.payload.mediaUri).toBe('https://cdn.example.com/render.mp4');
    expect(media!.payload.mediaType).toBe('video');
    // Every baked edit must be cleared — re-applying them would double-apply.
    expect(media!.payload.trimStartMs).toBeUndefined();
    expect(media!.payload.trimEndMs).toBeUndefined();
    expect(media!.payload.speed).toBeUndefined();
    expect(media!.payload.speedCurve).toBeUndefined();
    expect(media!.payload.reversed).toBeUndefined();
    expect(media!.payload.freezeFrameMs).toBeUndefined();
    expect(media!.payload.volume).toBeUndefined();
    expect(media!.payload.filterId).toBeUndefined();
    expect(media!.payload.effects).toBeUndefined();
    expect(media!.payload.focalPoint).toBeUndefined();
    // Identity geometry — the artifact is a full-canvas render.
    expect(media!.x).toBe(0.5);
    expect(media!.rotation).toBe(0);
    expect(media!.scale).toBe(1);
    expect(media!.opacity).toBe(1);
  });

  it('drops baked static overlays, keeps interactive/live layers', () => {
    const page = basePage([
      mediaLayer(),
      overlayLayer('text', 't1'),
      overlayLayer('draw', 'd1'),
      overlayLayer('gif', 'g1'),
      overlayLayer('vote', 'v1'),
      overlayLayer('question', 'q1'),
      overlayLayer('link', 'l1'),
      overlayLayer('time', 'tm1'),
    ]);
    const out = pageWithRenderedMedia(page, 'https://cdn.example.com/render.mp4', 'video');
    const types = out.layers.map((l) => l.type);
    expect(types).toContain('vote');
    expect(types).toContain('question');
    expect(types).toContain('link');
    expect(types).toContain('time');
    expect(types).not.toContain('text');
    expect(types).not.toContain('draw');
    expect(types).not.toContain('gif');
  });

  it('keeps additional media layers verbatim (renderer bakes only the first)', () => {
    const second = mediaLayer();
    (second as { id: string }).id = 'media_2';
    const page = basePage([mediaLayer(), second]);
    const out = pageWithRenderedMedia(page, 'https://cdn.example.com/render.mp4', 'video');
    const medias = out.layers.filter((l) => l.type === 'media');
    expect(medias).toHaveLength(2);
    expect(medias[1]!.payload.mediaUri).toBe('file:///raw/source.mp4');
  });

  it('does not mutate the input page', () => {
    const page = basePage([mediaLayer(), overlayLayer('text', 't1')]);
    pageWithRenderedMedia(page, 'https://cdn.example.com/r.mp4', 'video');
    expect(page.layers).toHaveLength(2);
    const original = page.layers[0] as Extract<CreatorLayer, { type: 'media' }>;
    expect(original.payload.mediaUri).toBe('file:///raw/source.mp4');
  });
});
