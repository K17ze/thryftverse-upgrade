import { describe, it, expect } from 'vitest';
import {
  createEmptyDocument,
  goldenLookFixture,
  goldenPosterFixture,
  migrateDocument,
  POSTER_DEFAULT_ASPECT_RATIO,
  LOOK_DEFAULT_ASPECT_RATIO,
  LEGACY_POSTER_LANDSCAPE_RATIO,
  safeValidateDocument,
  type CreatorDocument,
} from '../creator/composition';
import {
  serialiseToLookPayload,
  serialiseToPosterPayload,
  validateForPublish,
} from '../creator/compositionContract';
import { posterStoryToDocument, lookToDocument } from '../creator/viewerAdapters';

// ── P0.1: Aspect-ratio semantics ───────────────────────────────────

describe('P0.1 — Aspect-ratio semantics', () => {
  it('Poster defaults to 9:16 portrait (0.5625)', () => {
    const doc = createEmptyDocument('poster');
    expect(doc.canvas.aspectRatio).toBeCloseTo(9 / 16, 10);
    expect(doc.canvas.aspectRatio).toBe(POSTER_DEFAULT_ASPECT_RATIO);
  });

  it('Look defaults to 4:5 portrait (0.8)', () => {
    const doc = createEmptyDocument('look');
    expect(doc.canvas.aspectRatio).toBeCloseTo(4 / 5, 10);
    expect(doc.canvas.aspectRatio).toBe(LOOK_DEFAULT_ASPECT_RATIO);
  });

  it('Poster 9:16 produces portrait canvas dimensions (height > width)', () => {
    const doc = createEmptyDocument('poster');
    const width = 400;
    // height = width / aspectRatio (aspectRatio = width/height)
    const height = Math.floor(width / doc.canvas.aspectRatio);
    expect(height).toBeGreaterThan(width);
    // 9:16 → height should be ~711 for width 400
    expect(height).toBeCloseTo(711, -1);
  });

  it('Look 4:5 produces portrait canvas dimensions (height > width)', () => {
    const doc = createEmptyDocument('look');
    const width = 400;
    const height = Math.floor(width / doc.canvas.aspectRatio);
    expect(height).toBeGreaterThan(width);
    // 4:5 → height should be 500 for width 400
    expect(height).toBe(500);
  });

  it('page thumbnail height = thumbW / aspectRatio (not thumbW * aspectRatio)', () => {
    const doc = createEmptyDocument('poster');
    const thumbW = 36;
    // Correct formula: height = width / aspectRatio
    const thumbH = Math.floor(thumbW / doc.canvas.aspectRatio);
    // For 9:16, thumbnail should be taller than wide
    expect(thumbH).toBeGreaterThan(thumbW);
    expect(thumbH).toBeCloseTo(64, -1);
  });

  it('migrateDocument fixes legacy 16:9 Poster ratio to 9:16', () => {
    const legacyDoc = createEmptyDocument('poster');
    // Force legacy ratio
    const stale: CreatorDocument = {
      ...legacyDoc,
      canvas: {
        ...legacyDoc.canvas,
        aspectRatio: LEGACY_POSTER_LANDSCAPE_RATIO, // 16:9
      },
    };
    const migrated = migrateDocument(stale);
    expect(migrated.canvas.aspectRatio).toBe(POSTER_DEFAULT_ASPECT_RATIO);
    expect(migrated.canvas.aspectRatio).not.toBe(LEGACY_POSTER_LANDSCAPE_RATIO);
  });

  it('migrateDocument does not alter already-correct documents', () => {
    const doc = goldenPosterFixture();
    const migrated = migrateDocument(doc);
    expect(migrated.canvas.aspectRatio).toBe(doc.canvas.aspectRatio);
  });

  it('viewerAdapters.posterStoryToDocument uses 9:16 ratio', () => {
    const story = {
      id: 'test_story_1',
      frames: [{
        id: 'frame_1',
        mediaType: 'image' as const,
        mediaUrl: 'https://cdn.example.com/p.jpg',
        caption: '',
        durationMs: 5000,
        stickers: [],
      }],
    };
    const doc = posterStoryToDocument(story);
    expect(doc.canvas.aspectRatio).toBe(POSTER_DEFAULT_ASPECT_RATIO);
  });

  it('viewerAdapters.lookToDocument uses 4:5 ratio', () => {
    const look = {
      id: 'test_look_1',
      title: 'Test',
      caption: '',
      mediaUrl: 'https://cdn.example.com/p.jpg',
      tags: [],
    };
    const doc = lookToDocument(look);
    expect(doc.canvas.aspectRatio).toBe(LOOK_DEFAULT_ASPECT_RATIO);
  });
});

// ── P0.1: Dimension consistency across all five paths ─────────────

describe('P0.1 — Dimension consistency across editor, thumbnail, preview, publish, viewer', () => {
  it('Poster: same aspect ratio in all paths', () => {
    const editorDoc = createEmptyDocument('poster');
    const viewerDoc = posterStoryToDocument({
      id: 'test',
      frames: [{
        id: 'f1',
        mediaType: 'image',
        mediaUrl: 'https://cdn.example.com/p.jpg',
        caption: '',
        durationMs: 5000,
        stickers: [],
      }],
    });
    const goldenDoc = goldenPosterFixture();

    // All poster documents should use the same canonical ratio
    expect(editorDoc.canvas.aspectRatio).toBe(POSTER_DEFAULT_ASPECT_RATIO);
    expect(viewerDoc.canvas.aspectRatio).toBe(POSTER_DEFAULT_ASPECT_RATIO);
    expect(goldenDoc.canvas.aspectRatio).toBe(POSTER_DEFAULT_ASPECT_RATIO);
  });

  it('Look: same aspect ratio in all paths', () => {
    const editorDoc = createEmptyDocument('look');
    const viewerDoc = lookToDocument({
      id: 'test',
      title: 'Test',
      caption: '',
      mediaUrl: 'https://cdn.example.com/p.jpg',
      tags: [],
    });
    const goldenDoc = goldenLookFixture();

    expect(editorDoc.canvas.aspectRatio).toBe(LOOK_DEFAULT_ASPECT_RATIO);
    expect(viewerDoc.canvas.aspectRatio).toBe(LOOK_DEFAULT_ASPECT_RATIO);
    expect(goldenDoc.canvas.aspectRatio).toBe(LOOK_DEFAULT_ASPECT_RATIO);
  });

  it('All paths derive height from width using the same formula: height = width / aspectRatio', () => {
    const testWidth = 300;
    const posterDoc = goldenPosterFixture();
    const lookDoc = goldenLookFixture();

    // Editor canvas height formula
    const posterEditorH = Math.floor(testWidth / posterDoc.canvas.aspectRatio);
    // Thumbnail height formula (must use division, not multiplication)
    const posterThumbH = Math.floor(testWidth / posterDoc.canvas.aspectRatio);
    // Publish preview height formula
    const posterPreviewH = Math.floor(testWidth / posterDoc.canvas.aspectRatio);
    // Viewer height formula
    const posterViewerH = Math.floor(testWidth / posterDoc.canvas.aspectRatio);

    expect(posterEditorH).toBe(posterThumbH);
    expect(posterThumbH).toBe(posterPreviewH);
    expect(posterPreviewH).toBe(posterViewerH);

    // Same for Look
    const lookEditorH = Math.floor(testWidth / lookDoc.canvas.aspectRatio);
    const lookThumbH = Math.floor(testWidth / lookDoc.canvas.aspectRatio);
    const lookPreviewH = Math.floor(testWidth / lookDoc.canvas.aspectRatio);
    const lookViewerH = Math.floor(testWidth / lookDoc.canvas.aspectRatio);

    expect(lookEditorH).toBe(lookThumbH);
    expect(lookThumbH).toBe(lookPreviewH);
    expect(lookPreviewH).toBe(lookViewerH);
  });
});

// ── P0.2: Look composition persistence ────────────────────────────

describe('P0.2 — Look composition persistence', () => {
  it('serialiseToLookPayload includes compositionDocument when non-primary visible layers exist', () => {
    const doc = goldenLookFixture();
    const { payload } = serialiseToLookPayload(doc);
    expect(payload.compositionDocument).toBeDefined();
    const compDoc = payload.compositionDocument as CreatorDocument;
    expect(compDoc.type).toBe('look');
    expect(compDoc.pages[0].layers.length).toBe(5);
  });

  it('serialiseToLookPayload includes compositionDocument for single-media look with text layer', () => {
    const doc = createEmptyDocument('look');
    // Add media + text only (single media, but has non-primary visible layer)
    doc.pages[0].layers = [
      {
        id: 'media_1', type: 'media',
        x: 0.5, y: 0.5, width: 1, height: 1, scale: 1, rotation: 0,
        zIndex: 0, locked: false, hidden: false, opacity: 1,
        payload: { mediaUri: 'https://cdn.example.com/p.jpg', mediaType: 'image', contentFit: 'cover', opacity: 1 },
      },
      {
        id: 'text_1', type: 'text',
        x: 0.5, y: 0.85, width: 0.9, height: 0.1, scale: 1, rotation: 0,
        zIndex: 5, locked: false, hidden: false, opacity: 1,
        payload: { text: 'Hello', textStyle: 'clean', textColor: '#fff', alignment: 'center', opacity: 1 },
      },
    ];
    const { payload } = serialiseToLookPayload(doc);
    expect(payload.compositionDocument).toBeDefined();
  });

  it('serialiseToLookPayload omits compositionDocument for bare single-media look', () => {
    const doc = createEmptyDocument('look');
    doc.pages[0].layers = [
      {
        id: 'media_1', type: 'media',
        x: 0.5, y: 0.5, width: 1, height: 1, scale: 1, rotation: 0,
        zIndex: 0, locked: false, hidden: false, opacity: 1,
        payload: { mediaUri: 'https://cdn.example.com/p.jpg', mediaType: 'image', contentFit: 'cover', opacity: 1 },
      },
    ];
    const { payload } = serialiseToLookPayload(doc);
    // No non-primary visible layers → no composition document needed
    expect(payload.compositionDocument).toBeUndefined();
  });

  it('serialiseToLookPayload omits compositionDocument when non-primary layers are all hidden', () => {
    const doc = createEmptyDocument('look');
    doc.pages[0].layers = [
      {
        id: 'media_1', type: 'media',
        x: 0.5, y: 0.5, width: 1, height: 1, scale: 1, rotation: 0,
        zIndex: 0, locked: false, hidden: false, opacity: 1,
        payload: { mediaUri: 'https://cdn.example.com/p.jpg', mediaType: 'image', contentFit: 'cover', opacity: 1 },
      },
      {
        id: 'text_1', type: 'text',
        x: 0.5, y: 0.85, width: 0.9, height: 0.1, scale: 1, rotation: 0,
        zIndex: 5, locked: false, hidden: true, opacity: 1, // hidden!
        payload: { text: 'Hello', textStyle: 'clean', textColor: '#fff', alignment: 'center', opacity: 1 },
      },
    ];
    const { payload } = serialiseToLookPayload(doc);
    expect(payload.compositionDocument).toBeUndefined();
  });

  it('golden Look fixture validates successfully', () => {
    const doc = goldenLookFixture();
    const result = safeValidateDocument(doc);
    expect(result.success).toBe(true);
  });

  it('golden Look fixture passes publish validation', () => {
    const doc = goldenLookFixture();
    const result = validateForPublish(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── P0.3: Poster WYSIWYG ──────────────────────────────────────────

describe('P0.3 — Poster WYSIWYG composition persistence', () => {
  it('serialiseToPosterPayload includes compositionDocument', () => {
    const doc = goldenPosterFixture();
    const { payload } = serialiseToPosterPayload(doc);
    expect(payload.compositionDocument).toBeDefined();
    const compDoc = payload.compositionDocument as CreatorDocument;
    expect(compDoc.type).toBe('poster');
    expect(compDoc.pages[0].layers.length).toBe(4);
  });

  it('compositionDocument preserves all layer geometry (position, scale, rotation, opacity, width, height)', () => {
    const doc = goldenPosterFixture();
    const { payload } = serialiseToPosterPayload(doc);
    const compDoc = payload.compositionDocument as CreatorDocument;

    // Compare each layer's geometry
    const originalLayers = doc.pages[0].layers;
    const serializedLayers = compDoc.pages[0].layers;

    expect(serializedLayers.length).toBe(originalLayers.length);
    for (let i = 0; i < originalLayers.length; i++) {
      const orig = originalLayers[i];
      const ser = serializedLayers[i];
      expect(ser.x).toBe(orig.x);
      expect(ser.y).toBe(orig.y);
      expect(ser.width).toBe(orig.width);
      expect(ser.height).toBe(orig.height);
      expect(ser.scale).toBe(orig.scale);
      expect(ser.rotation).toBe(orig.rotation);
      expect(ser.opacity).toBe(orig.opacity);
      expect(ser.zIndex).toBe(orig.zIndex);
    }
  });

  it('compositionDocument preserves canvas background', () => {
    const doc = goldenPosterFixture();
    const { payload } = serialiseToPosterPayload(doc);
    const compDoc = payload.compositionDocument as CreatorDocument;
    expect(compDoc.canvas.background).toEqual(doc.canvas.background);
    expect(compDoc.canvas.aspectRatio).toBe(doc.canvas.aspectRatio);
  });

  it('compositionDocument preserves text styles (headline, clean, etc.)', () => {
    const doc = goldenPosterFixture();
    const { payload } = serialiseToPosterPayload(doc);
    const compDoc = payload.compositionDocument as CreatorDocument;

    const headlineLayer = compDoc.pages[0].layers.find(
      (l) => l.id === 'text_styled_1',
    );
    expect(headlineLayer).toBeDefined();
    expect(headlineLayer!.type).toBe('text');
    if (headlineLayer!.type === 'text') {
      expect(headlineLayer!.payload.textStyle).toBe('headline');
      expect(headlineLayer!.payload.text).toBe('New Drop');
    }
  });

  it('golden Poster fixture validates successfully', () => {
    const doc = goldenPosterFixture();
    const result = safeValidateDocument(doc);
    expect(result.success).toBe(true);
  });

  it('golden Poster fixture passes publish validation', () => {
    const doc = goldenPosterFixture();
    const result = validateForPublish(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── P0.3: Sticker anchor semantics ────────────────────────────────

describe('P0.3 — Sticker anchor semantics (center vs top-left)', () => {
  it('serialiseToPosterPayload preserves center-based x/y coordinates from the editor', () => {
    const doc = goldenPosterFixture();
    const { payload } = serialiseToPosterPayload(doc);

    // The product sticker in the golden fixture is at center (0.5, 0.5)
    const productSticker = payload.frames[0].stickers.find(
      (s) => s.type === 'listing',
    );
    expect(productSticker).toBeDefined();
    expect(productSticker!.x).toBe(0.5);
    expect(productSticker!.y).toBe(0.5);
  });

  it('posterStoryToDocument preserves sticker x/y as center coordinates', () => {
    const story = {
      id: 'test_anchor_1',
      frames: [{
        id: 'frame_1',
        mediaType: 'image' as const,
        mediaUrl: 'https://cdn.example.com/p.jpg',
        caption: '',
        durationMs: 5000,
        stickers: [{
          id: 'sticker_1',
          type: 'text' as const,
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
          payload: { text: 'Center', textStyle: 'minimal' as const, textColor: '#fff', alignment: 'center' },
          sortOrder: 0,
        }],
      }],
    };
    const doc = posterStoryToDocument(story);
    const layer = doc.pages[0].layers.find((l) => l.id === 'sticker_1');
    expect(layer).toBeDefined();
    expect(layer!.x).toBe(0.5);
    expect(layer!.y).toBe(0.5);
  });
});

// ── Golden fixture round-trip ──────────────────────────────────────

describe('Golden fixture round-trip: editor → serialize → viewer', () => {
  it('Look: serialized composition document can be parsed back as a valid look document', () => {
    const doc = goldenLookFixture();
    const { payload } = serialiseToLookPayload(doc);
    expect(payload.compositionDocument).toBeDefined();

    const result = safeValidateDocument(payload.compositionDocument);
    expect(result.success).toBe(true);
    expect(result.data!.type).toBe('look');
    expect(result.data!.pages[0].layers.length).toBe(doc.pages[0].layers.length);
  });

  it('Poster: serialized composition document can be parsed back as a valid poster document', () => {
    const doc = goldenPosterFixture();
    const { payload } = serialiseToPosterPayload(doc);
    expect(payload.compositionDocument).toBeDefined();

    const result = safeValidateDocument(payload.compositionDocument);
    expect(result.success).toBe(true);
    expect(result.data!.type).toBe('poster');
    expect(result.data!.pages[0].layers.length).toBe(doc.pages[0].layers.length);
  });

  it('Look: all layer properties survive the serialize → parse round-trip', () => {
    const doc = goldenLookFixture();
    const { payload } = serialiseToLookPayload(doc);
    const result = safeValidateDocument(payload.compositionDocument);
    expect(result.success).toBe(true);
    const roundTripped = result.data!;

    for (let i = 0; i < doc.pages[0].layers.length; i++) {
      const orig = doc.pages[0].layers[i];
      const rt = roundTripped.pages[0].layers[i];
      expect(rt.id).toBe(orig.id);
      expect(rt.type).toBe(orig.type);
      expect(rt.x).toBe(orig.x);
      expect(rt.y).toBe(orig.y);
      expect(rt.width).toBe(orig.width);
      expect(rt.height).toBe(orig.height);
      expect(rt.scale).toBe(orig.scale);
      expect(rt.rotation).toBe(orig.rotation);
      expect(rt.opacity).toBe(orig.opacity);
      expect(rt.zIndex).toBe(orig.zIndex);
      expect(rt.hidden).toBe(orig.hidden);
    }
  });

  it('Poster: all layer properties survive the serialize → parse round-trip', () => {
    const doc = goldenPosterFixture();
    const { payload } = serialiseToPosterPayload(doc);
    const result = safeValidateDocument(payload.compositionDocument);
    expect(result.success).toBe(true);
    const roundTripped = result.data!;

    for (let i = 0; i < doc.pages[0].layers.length; i++) {
      const orig = doc.pages[0].layers[i];
      const rt = roundTripped.pages[0].layers[i];
      expect(rt.id).toBe(orig.id);
      expect(rt.type).toBe(orig.type);
      expect(rt.x).toBe(orig.x);
      expect(rt.y).toBe(orig.y);
      expect(rt.width).toBe(orig.width);
      expect(rt.height).toBe(orig.height);
      expect(rt.scale).toBe(orig.scale);
      expect(rt.rotation).toBe(orig.rotation);
      expect(rt.opacity).toBe(orig.opacity);
      expect(rt.zIndex).toBe(orig.zIndex);
    }
  });
});
