import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateForPublish,
  serialiseToLookPayload,
  serialiseToPosterPayload,
} from '../creator/compositionContract';
import {
  uploadAllLocalMedia,
  hasLocalUris,
} from '../creator/mediaUploadPipeline';
import {
  createEmptyDocument,
  addLayerToPage,
  type CreatorDocument,
  type CreatorLayer,
} from '../creator/composition';
import {
  ALL_TEMPLATES,
  getTemplateById,
  getTemplatesByType,
} from '../creator/templates';

// ── Helpers ────────────────────────────────────────────────────────

function makeMediaLayer(id: string, uri: string = 'https://cdn.example.com/photo.jpg'): CreatorLayer {
  return {
    id,
    type: 'media',
    x: 0.5,
    y: 0.5,
    width: 0.8,
    height: 0.8,
    scale: 1,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    hidden: false,
    payload: {
      mediaUri: uri,
      mediaType: 'image',
      contentFit: 'cover',
      opacity: 1,
    },
  } as any;
}

function makeProductLayer(id: string, imageUrl?: string): CreatorLayer {
  return {
    id,
    type: 'product',
    x: 0.3,
    y: 0.3,
    width: 0.2,
    height: 0.1,
    scale: 1,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
    locked: false,
    hidden: false,
    payload: {
      listingId: 'listing_123',
      snapshotTitle: 'Vintage Jacket',
      snapshotPriceGbp: 49,
      availability: 'active',
      ...(imageUrl ? { snapshotImageUrl: imageUrl } : {}),
    },
  } as any;
}

function makeTextLayer(id: string): CreatorLayer {
  return {
    id,
    type: 'text',
    x: 0.5,
    y: 0.9,
    width: 0.8,
    height: 0.1,
    scale: 1,
    rotation: 0,
    opacity: 1,
    zIndex: 3,
    locked: false,
    hidden: false,
    payload: {
      text: 'Hello',
      textStyle: 'clean',
      textColor: '#ffffff',
      alignment: 'center',
      opacity: 1,
    },
  } as any;
}

function makeLookDoc(layers: CreatorLayer[] = [makeMediaLayer('m1')]): CreatorDocument {
  let doc = createEmptyDocument('look');
  for (const layer of layers) {
    doc = addLayerToPage(doc, 0, layer);
  }
  return doc;
}

function makePosterDoc(pages: { layers: CreatorLayer[]; durationMs?: number }[] = [{ layers: [makeMediaLayer('m1')] }]): CreatorDocument {
  let doc = createEmptyDocument('poster');
  // Remove default page and add our own
  doc = { ...doc, pages: pages.map((p, i) => ({ id: `page_${i}`, layers: p.layers, durationMs: p.durationMs })) };
  return doc;
}

// ── Media pipeline URI scheme tests ────────────────────────────────

describe('Media pipeline URI schemes', () => {
  it('detects file:// URIs', () => {
    const doc = makeLookDoc([makeMediaLayer('m1', 'file://test.jpg')]);
    expect(hasLocalUris(doc)).toBe(true);
  });

  it('detects ph:// URIs', () => {
    const doc = makeLookDoc([makeMediaLayer('m1', 'ph://test.jpg')]);
    expect(hasLocalUris(doc)).toBe(true);
  });

  it('detects content:// URIs', () => {
    const doc = makeLookDoc([makeMediaLayer('m1', 'content://test.jpg')]);
    expect(hasLocalUris(doc)).toBe(true);
  });

  it('detects assets-library:// URIs', () => {
    const doc = makeLookDoc([makeMediaLayer('m1', 'assets-library://test.jpg')]);
    expect(hasLocalUris(doc)).toBe(true);
  });

  it('detects data: URIs', () => {
    const doc = makeLookDoc([makeMediaLayer('m1', 'data:image/png;base64,abc')]);
    expect(hasLocalUris(doc)).toBe(true);
  });

  it('does not detect https:// URIs', () => {
    const doc = makeLookDoc([makeMediaLayer('m1', 'https://cdn.example.com/photo.jpg')]);
    expect(hasLocalUris(doc)).toBe(false);
  });

  it('detects local URIs in product snapshotImageUrl', () => {
    const doc = makeLookDoc([makeMediaLayer('m1'), makeProductLayer('p1', 'file://product.jpg')]);
    expect(hasLocalUris(doc)).toBe(true);
  });

  it('rejects content:// URIs in publish validation', () => {
    const doc = makeLookDoc([makeMediaLayer('m1', 'content://photo.jpg')]);
    const result = validateForPublish(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('local URI'))).toBe(true);
  });

  it('rejects assets-library:// URIs in publish validation', () => {
    const doc = makeLookDoc([makeMediaLayer('m1', 'assets-library://photo.jpg')]);
    const result = validateForPublish(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('local URI'))).toBe(true);
  });
});

// ── Collage Look export tests ──────────────────────────────────────

describe('Collage Look export', () => {
  it('serialises single-media look with mediaUrl', () => {
    const doc = makeLookDoc([makeMediaLayer('m1', 'https://cdn.example.com/photo.jpg')]);
    const { payload } = serialiseToLookPayload(doc);
    expect(payload.mediaUrl).toBe('https://cdn.example.com/photo.jpg');
    expect(payload.compositionDocument).toBeUndefined();
  });

  it('includes compositionDocument for collage looks with multiple media layers', () => {
    const doc = makeLookDoc([
      { ...makeMediaLayer('m1', 'https://cdn.example.com/photo1.jpg'), width: 0.4, height: 0.4, x: 0.3, y: 0.3 },
      { ...makeMediaLayer('m2', 'https://cdn.example.com/photo2.jpg'), width: 0.4, height: 0.4, x: 0.7, y: 0.3 },
      { ...makeMediaLayer('m3', 'https://cdn.example.com/photo3.jpg'), width: 0.4, height: 0.4, x: 0.5, y: 0.7 },
    ]);
    const { payload } = serialiseToLookPayload(doc);
    expect(payload.mediaUrl).toBeTruthy();
    expect(payload.compositionDocument).toBeDefined();
    const compDoc = payload.compositionDocument as CreatorDocument;
    expect(compDoc.pages[0].layers.filter((l) => l.type === 'media')).toHaveLength(3);
  });

  it('selects the largest media layer as primary mediaUrl for collage', () => {
    const doc = makeLookDoc([
      { ...makeMediaLayer('small', 'https://cdn.example.com/small.jpg'), width: 0.3, height: 0.3 },
      { ...makeMediaLayer('large', 'https://cdn.example.com/large.jpg'), width: 0.9, height: 0.9 },
    ]);
    const { payload } = serialiseToLookPayload(doc);
    expect(payload.mediaUrl).toBe('https://cdn.example.com/large.jpg');
  });
});

// ── Template tests ─────────────────────────────────────────────────

describe('Templates', () => {
  it('has 5 look templates', () => {
    expect(getTemplatesByType('look')).toHaveLength(5);
  });

  it('has 5 poster templates', () => {
    expect(getTemplatesByType('poster')).toHaveLength(5);
  });

  it('all templates produce valid CreatorDocuments', () => {
    for (const template of ALL_TEMPLATES) {
      const doc = template.build();
      expect(doc.type).toBe(template.type);
      expect(doc.pages.length).toBeGreaterThan(0);
      expect(doc.id).toBeTruthy();
    }
  });

  it('all template layers have unique IDs', () => {
    for (const template of ALL_TEMPLATES) {
      const doc = template.build();
      const allLayerIds = doc.pages.flatMap((p) => p.layers.map((l) => l.id));
      const uniqueIds = new Set(allLayerIds);
      expect(allLayerIds.length).toBe(uniqueIds.size);
    }
  });

  it('look templates have exactly 1 page', () => {
    for (const template of getTemplatesByType('look')) {
      const doc = template.build();
      expect(doc.pages).toHaveLength(1);
    }
  });

  it('poster templates have at least 1 page', () => {
    for (const template of getTemplatesByType('poster')) {
      const doc = template.build();
      expect(doc.pages.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('templates generate new IDs on each build', () => {
    const template = getTemplateById('tpl_look_single_photo');
    if (!template) throw new Error('Template not found');
    const doc1 = template.build();
    const doc2 = template.build();
    expect(doc1.id).not.toBe(doc2.id);
  });

  it('template documents contain editable layers', () => {
    for (const template of ALL_TEMPLATES) {
      const doc = template.build();
      const totalLayers = doc.pages.reduce((sum, p) => sum + p.layers.length, 0);
      expect(totalLayers).toBeGreaterThan(0);
    }
  });

  it('template names match expected set for looks', () => {
    const names = getTemplatesByType('look').map((t) => t.name);
    expect(names).toContain('Single Photo');
    expect(names).toContain('Outfit Board');
    expect(names).toContain('Product Grid');
    expect(names).toContain('Magazine');
    expect(names).toContain('Colour Story');
  });

  it('template names match expected set for posters', () => {
    const names = getTemplatesByType('poster').map((t) => t.name);
    expect(names).toContain('Announcement');
    expect(names).toContain('Product Spotlight');
    expect(names).toContain('Style Vote');
    expect(names).toContain('New Listing');
    expect(names).toContain('Behind the Scenes');
  });
});

// ── Poster page persistence tests ──────────────────────────────────

describe('Poster page persistence', () => {
  it('serialises all pages in poster payload', () => {
    const doc = makePosterDoc([
      { layers: [makeMediaLayer('m1', 'https://cdn.example.com/p1.jpg')] },
      { layers: [makeMediaLayer('m2', 'https://cdn.example.com/p2.jpg')] },
      { layers: [makeMediaLayer('m3', 'https://cdn.example.com/p3.jpg')] },
    ]);
    const { payload } = serialiseToPosterPayload(doc);
    expect(payload.frames).toHaveLength(3);
    expect(payload.frames[0].mediaUrl).toBe('https://cdn.example.com/p1.jpg');
    expect(payload.frames[1].mediaUrl).toBe('https://cdn.example.com/p2.jpg');
    expect(payload.frames[2].mediaUrl).toBe('https://cdn.example.com/p3.jpg');
  });

  it('preserves page duration in poster payload', () => {
    const doc = makePosterDoc([
      { layers: [makeMediaLayer('m1')], durationMs: 3000 },
      { layers: [makeMediaLayer('m2')], durationMs: 7000 },
    ]);
    const { payload } = serialiseToPosterPayload(doc);
    expect(payload.frames[0].durationMs).toBe(3000);
    expect(payload.frames[1].durationMs).toBe(7000);
  });

  it('preserves layer transforms in poster stickers', () => {
    const textLayer = { ...makeTextLayer('txt_1'), x: 0.3, y: 0.7, scale: 1.5, rotation: 15 };
    const doc = makePosterDoc([{ layers: [makeMediaLayer('m1'), textLayer] }]);
    const { payload } = serialiseToPosterPayload(doc);
    const sticker = payload.frames[0].stickers.find((s) => s.id === 'txt_1');
    expect(sticker).toBeDefined();
    expect(sticker!.x).toBe(0.3);
    expect(sticker!.y).toBe(0.7);
    expect(sticker!.scale).toBe(1.5);
    expect(sticker!.rotation).toBe(15);
  });
});

// ── Remix attribution tests ────────────────────────────────────────

describe('Remix attribution in serialization', () => {
  it('preserves sourceDocumentId in look payload', () => {
    const doc = makeLookDoc([makeMediaLayer('m1')]);
    doc.metadata.sourceDocumentId = 'source_doc_123';
    doc.metadata.sourceCreatorId = 'creator_456';
    const { remixAttribution } = serialiseToLookPayload(doc);
    expect(remixAttribution.sourceDocumentId).toBe('source_doc_123');
    expect(remixAttribution.sourceCreatorId).toBe('creator_456');
  });

  it('preserves sourceDocumentId in poster payload', () => {
    const doc = makePosterDoc([{ layers: [makeMediaLayer('m1')] }]);
    doc.metadata.sourceDocumentId = 'source_doc_789';
    doc.metadata.sourceCreatorId = 'creator_012';
    const { remixAttribution } = serialiseToPosterPayload(doc);
    expect(remixAttribution.sourceDocumentId).toBe('source_doc_789');
    expect(remixAttribution.sourceCreatorId).toBe('creator_012');
  });

  it('returns undefined attribution when no remix source', () => {
    const doc = makeLookDoc([makeMediaLayer('m1')]);
    const { remixAttribution } = serialiseToLookPayload(doc);
    expect(remixAttribution.sourceDocumentId).toBeUndefined();
    expect(remixAttribution.sourceCreatorId).toBeUndefined();
  });
});
