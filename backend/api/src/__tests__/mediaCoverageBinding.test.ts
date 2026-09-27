import { describe, it, expect, vi } from 'vitest';
import { Buffer } from 'node:buffer';

// ---------------------------------------------------------------------------
// Mocks — keep the service import hermetic. The coverage walker and matcher
// under test are pure functions; the heavy render/storage modules are mocked
// so importing the service never touches sharp/ffmpeg/S3.
// ---------------------------------------------------------------------------

vi.mock('../lib/media/compositionRenderer.js', () => ({
  renderComposition: vi.fn(),
  isCompositionNonTrivial: vi.fn(),
  getVideoRenderPath: vi.fn(),
}));

vi.mock('../lib/s3.js', () => ({
  putBinaryObject: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock('../lib/media/pipeline.js', () => ({
  generateRenderedVideoHls: vi.fn(),
}));

vi.mock('../lib/compositionValidation.js', () => ({
  validateCompositionDocument: vi.fn(),
}));

import { __testables } from '../services/creatorPublicationService.js';

const { extractMediaReferences, validateMediaCoverage } = __testables;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function gifLayer(id: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { id, type: 'gif', payload };
}

function mediaLayer(id: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { id, type: 'media', payload };
}

function docWithLayers(layers: Array<Record<string, unknown>>): unknown {
  return {
    type: 'look',
    canvas: { aspectRatio: 1, background: { type: 'color', value: '#1a1a1a' } },
    pages: [{ id: 'page-0', layers }],
  };
}

function expected(layerId: string, role: string, suppliedUrl: string) {
  return { layerId, finalizationId: `fin_${layerId}_${role}`, role, suppliedUrl };
}

// ---------------------------------------------------------------------------
// extractMediaReferences — gif stillUrl walk (F3/F4 repair)
// ---------------------------------------------------------------------------

describe('extractMediaReferences — gif stillUrl', () => {
  it('walks a gif layer stillUrl as a gif-still ref', () => {
    const refs = extractMediaReferences(
      docWithLayers([
        gifLayer('gif_1', {
          gifUrl: 'https://media.giphy.com/x.gif',
          stillUrl: 'https://cdn.example.com/still.png',
          stillFinalizationId: 'fin_gif_1',
        }),
      ]),
    );

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      layerId: 'gif_1',
      field: 'stillUrl',
      role: 'gif-still',
      uri: 'https://cdn.example.com/still.png',
      finalizationId: 'fin_gif_1',
    });
  });

  it('emits no ref for a gif layer without stillUrl or receipt fields', () => {
    const refs = extractMediaReferences(
      docWithLayers([gifLayer('gif_1', { gifUrl: 'https://media.giphy.com/x.gif' })]),
    );
    expect(refs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateMediaCoverage — URL binding per (layerId, role)
// ---------------------------------------------------------------------------

describe('validateMediaCoverage — URL binding', () => {
  it('passes when the document URL equals the receipt suppliedUrl', () => {
    const refs = extractMediaReferences(
      docWithLayers([
        mediaLayer('m1', {
          mediaUri: 'https://cdn.example.com/a.jpg',
          mediaFinalizationId: 'fin_m1_primary',
        }),
      ]),
    );

    const result = validateMediaCoverage(refs, [
      expected('m1', 'primary', 'https://cdn.example.com/a.jpg'),
    ]);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects MEDIA_URL_MISMATCH when the document URL diverges from the receipt URL', () => {
    // The substitution attack: a valid receipt for a.jpg covers the binding
    // while the document fetches attacker-controlled b.jpg.
    const refs = extractMediaReferences(
      docWithLayers([
        mediaLayer('m1', {
          mediaUri: 'https://attacker.example.com/b.jpg',
          mediaFinalizationId: 'fin_m1_primary',
        }),
      ]),
    );

    const result = validateMediaCoverage(refs, [
      expected('m1', 'primary', 'https://cdn.example.com/a.jpg'),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      layerId: 'm1',
      field: 'mediaUri',
      code: 'MEDIA_URL_MISMATCH',
    });
  });

  it('rejects a stillUrl that carries no receipt binding', () => {
    const refs = extractMediaReferences(
      docWithLayers([
        gifLayer('gif_1', { stillUrl: 'https://attacker.example.com/still.png' }),
      ]),
    );

    const result = validateMediaCoverage(refs, []);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code).toBe('MEDIA_RECEIPT_MISSING');
  });

  it('rejects a stillUrl whose URL does not match its gif-still receipt', () => {
    const refs = extractMediaReferences(
      docWithLayers([
        gifLayer('gif_1', {
          stillUrl: 'https://attacker.example.com/still.png',
          stillFinalizationId: 'fin_gif_1',
        }),
      ]),
    );

    const result = validateMediaCoverage(refs, [
      expected('gif_1', 'gif-still', 'https://cdn.example.com/still.png'),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code).toBe('MEDIA_URL_MISMATCH');
  });

  it('catches divergence when the same (layerId, role) appears in both documents with different URLs', () => {
    // The caller concatenates stored-doc and compositionDocument refs —
    // a compositionDocument URL must not hide behind the stored ref.
    const storedRefs = extractMediaReferences(
      docWithLayers([
        mediaLayer('m1', {
          mediaUri: 'https://cdn.example.com/a.jpg',
          mediaFinalizationId: 'fin_m1_primary',
        }),
      ]),
    );
    const compRefs = extractMediaReferences(
      docWithLayers([
        mediaLayer('m1', {
          mediaUri: 'http://169.254.169.254/latest/meta-data',
          mediaFinalizationId: 'fin_m1_primary',
        }),
      ]),
    );

    const result = validateMediaCoverage([...storedRefs, ...compRefs], [
      expected('m1', 'primary', 'https://cdn.example.com/a.jpg'),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'MEDIA_URL_MISMATCH')).toBe(true);
  });
});
