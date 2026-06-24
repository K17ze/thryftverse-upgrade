import { describe, it, expect, vi, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createEmptyDocument,
  addLayerToPage,
  type CreatorDocument,
  type CreatorLayer,
} from '../creator/composition';
import {
  validateForPublish,
  serialiseToLookPayload,
  serialiseToPosterPayload,
  PublishGuard,
  COMPOSITION_SCHEMA_VERSION,
  MIN_SUPPORTED_SCHEMA_VERSION,
  MAX_SUPPORTED_SCHEMA_VERSION,
} from '../creator/compositionContract';
import { CreatorDraftService } from '../creator/drafts';

// ── Helpers ───────────────────────────────────────────────────────

function makeMediaLayer(id: string, uri: string = 'https://cdn.example.com/photo.jpg'): CreatorLayer {
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
    locked: false,
    hidden: false,
    opacity: 1,
    payload: { mediaUri: uri, mediaType: 'image', contentFit: 'cover', opacity: 1 },
  };
}

function makeTextLayer(id: string, text: string = 'Hello'): CreatorLayer {
  return {
    id,
    type: 'text',
    x: 0.5,
    y: 0.85,
    width: 0.9,
    height: 0.15,
    scale: 1,
    rotation: 0,
    zIndex: 10,
    locked: false,
    hidden: false,
    opacity: 1,
    payload: { text, textStyle: 'clean', textColor: '#ffffff', alignment: 'center', opacity: 1 },
  };
}

function makeProductLayer(id: string): CreatorLayer {
  return {
    id,
    type: 'product',
    x: 0.3,
    y: 0.3,
    width: 0.2,
    height: 0.1,
    scale: 1,
    rotation: 0,
    zIndex: 5,
    locked: false,
    hidden: false,
    opacity: 1,
    payload: {
      listingId: 'listing_123',
      snapshotTitle: 'Vintage Jacket',
      snapshotImageUrl: 'https://cdn.example.com/jacket.jpg',
      snapshotPriceGbp: 45,
      availability: 'active',
    },
  };
}

function makeMentionLayer(id: string): CreatorLayer {
  return {
    id,
    type: 'mention',
    x: 0.5,
    y: 0.2,
    width: 0.15,
    height: 0.06,
    scale: 1,
    rotation: 0,
    zIndex: 8,
    locked: false,
    hidden: false,
    opacity: 1,
    payload: { userId: 'user_456', username: 'fashionista' },
  };
}

function makeVoteLayer(id: string): CreatorLayer {
  return {
    id,
    type: 'vote',
    x: 0.5,
    y: 0.5,
    width: 0.3,
    height: 0.15,
    scale: 1,
    rotation: 0,
    zIndex: 12,
    locked: false,
    hidden: false,
    opacity: 1,
    payload: {
      question: 'Which looks better?',
      options: [
        { id: 'opt_a', label: 'Option A' },
        { id: 'opt_b', label: 'Option B' },
      ],
    },
  };
}

function makeLookDoc(): CreatorDocument {
  const doc = createEmptyDocument('look');
  let working = addLayerToPage(doc, 0, makeMediaLayer('media_primary'));
  working = addLayerToPage(working, 0, makeProductLayer('prod_1'));
  working = addLayerToPage(working, 0, makeMentionLayer('mention_1'));
  return working;
}

function makePosterDoc(): CreatorDocument {
  const doc = createEmptyDocument('poster');
  let working = addLayerToPage(doc, 0, makeMediaLayer('media_p1', 'https://cdn.example.com/poster1.jpg'));
  working = addLayerToPage(working, 0, makeTextLayer('caption_p1', 'My caption'));
  working = addLayerToPage(working, 0, makeMentionLayer('mention_p1'));
  return working;
}

// ── Schema version ────────────────────────────────────────────────

describe('Composition contract — schema version', () => {
  it('exports a valid schema version range', () => {
    expect(COMPOSITION_SCHEMA_VERSION).toBe(1);
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MAX_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBeLessThanOrEqual(MAX_SUPPORTED_SCHEMA_VERSION);
  });
});

// ── validateForPublish ────────────────────────────────────────────

describe('validateForPublish', () => {
  it('validates a well-formed look document', () => {
    const doc = makeLookDoc();
    const result = validateForPublish(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sanitizedDoc).toBeDefined();
  });

  it('validates a well-formed poster document', () => {
    const doc = makePosterDoc();
    const result = validateForPublish(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects look document without media layer', () => {
    const doc = createEmptyDocument('look');
    const result = validateForPublish(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('media layer'))).toBe(true);
  });

  it('rejects look document with more than one page', () => {
    const doc = createEmptyDocument('look');
    const twoPageDoc = {
      ...doc,
      pages: [
        { id: 'p1', layers: [makeMediaLayer('m1')] },
        { id: 'p2', layers: [makeMediaLayer('m2')] },
      ],
    };
    const result = validateForPublish(twoPageDoc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exactly one page'))).toBe(true);
  });

  it('rejects document with local file:// media URI', () => {
    const doc = makeLookDoc();
    const localDoc = {
      ...doc,
      pages: doc.pages.map((p) => ({
        ...p,
        layers: p.layers.map((l) =>
          l.id === 'media_primary' && l.type === 'media'
            ? { ...l, payload: { ...l.payload, mediaUri: 'file:///local/photo.jpg' } }
            : l
        ),
      })),
    };
    const result = validateForPublish(localDoc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('local URI'))).toBe(true);
  });

  it('rejects document with data: URI in product snapshot', () => {
    const doc = makeLookDoc();
    const localDoc = {
      ...doc,
      pages: doc.pages.map((p) => ({
        ...p,
        layers: p.layers.map((l) =>
          l.id === 'prod_1' && l.type === 'product'
            ? { ...l, payload: { ...l.payload, snapshotImageUrl: 'data:image/png;base64,abc' } }
            : l
        ),
      })),
    };
    const result = validateForPublish(localDoc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('local URI'))).toBe(true);
  });

  it('rejects look with ph:// URI in media', () => {
    const doc = makeLookDoc();
    const localDoc = {
      ...doc,
      pages: doc.pages.map((p) => ({
        ...p,
        layers: p.layers.map((l) =>
          l.id === 'media_primary' && l.type === 'media'
            ? { ...l, payload: { ...l.payload, mediaUri: 'ph:///asset.jpg' } }
            : l
        ),
      })),
    };
    const result = validateForPublish(localDoc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('local URI'))).toBe(true);
  });

  it('rejects vote layer with wrong number of options', () => {
    const doc = createEmptyDocument('look');
    const docWithBadVote = addLayerToPage(doc, 0, makeMediaLayer('m1'));
    const badVoteLayer: CreatorLayer = {
      ...makeVoteLayer('vote_1'),
      payload: {
        question: 'Pick one',
        options: [{ id: 'a', label: 'Only one' }],
      },
    } as any;
    const finalDoc = addLayerToPage(docWithBadVote, 0, badVoteLayer);
    const result = validateForPublish(finalDoc);
    expect(result.valid).toBe(false);
  });

  it('rejects poster page with no content', () => {
    const doc = createEmptyDocument('poster');
    const emptyPageDoc = {
      ...doc,
      pages: [{ id: 'p1', layers: [] }],
    };
    const result = validateForPublish(emptyPageDoc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('media or text layer'))).toBe(true);
  });

  it('rejects document with unsupported schema version', () => {
    const doc = makeLookDoc();
    const futureDoc = { ...doc, version: 999 };
    const result = validateForPublish(futureDoc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unsupported schema version'))).toBe(true);
  });

  it('accepts remote https URIs', () => {
    const doc = makeLookDoc();
    const result = validateForPublish(doc);
    expect(result.valid).toBe(true);
  });
});

// ── serialiseToLookPayload ────────────────────────────────────────

describe('serialiseToLookPayload', () => {
  it('serialises a look document to API payload', () => {
    const doc = makeLookDoc();
    const { payload, remixAttribution } = serialiseToLookPayload(doc);
    expect(payload.id).toBe(doc.id);
    expect(payload.title).toBe('Untitled Look');
    expect(payload.caption).toBe(doc.metadata.caption);
    expect(payload.mediaUrl).toBe('https://cdn.example.com/photo.jpg');
    expect(payload.visibility).toBe('public');
    expect(payload.status).toBe('published');
    expect(payload.tags).toHaveLength(1);
    expect(payload.tags![0].listingId).toBe('listing_123');
    expect(payload.tags![0].label).toBe('Vintage Jacket');
    expect(remixAttribution.sourceDocumentId).toBeUndefined();
  });

  it('throws when serialising non-look document', () => {
    const doc = makePosterDoc();
    expect(() => serialiseToLookPayload(doc)).toThrow('non-look');
  });

  it('throws when look has no media layer', () => {
    const doc = createEmptyDocument('look');
    expect(() => serialiseToLookPayload(doc)).toThrow('media layer');
  });

  it('preserves remix attribution', () => {
    const doc = makeLookDoc();
    const remixedDoc: CreatorDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        sourceDocumentId: 'source_doc_123',
        sourceCreatorId: 'creator_abc',
        allowRemix: true,
      },
    };
    const { remixAttribution } = serialiseToLookPayload(remixedDoc);
    expect(remixAttribution.sourceDocumentId).toBe('source_doc_123');
    expect(remixAttribution.sourceCreatorId).toBe('creator_abc');
  });

  it('uses title from metadata when provided', () => {
    const doc = makeLookDoc();
    const titledDoc: CreatorDocument = {
      ...doc,
      metadata: { ...doc.metadata, title: 'My Styled Look' },
    };
    const { payload } = serialiseToLookPayload(titledDoc);
    expect(payload.title).toBe('My Styled Look');
  });
});

// ── serialiseToPosterPayload ──────────────────────────────────────

describe('serialiseToPosterPayload', () => {
  it('serialises a poster document to API payload', () => {
    const doc = makePosterDoc();
    const { payload, remixAttribution } = serialiseToPosterPayload(doc);
    expect(payload.id).toBe(doc.id);
    expect(payload.audience).toBe('public');
    expect(payload.allowReplies).toBe(true);
    expect(payload.allowReactions).toBe(true);
    expect(payload.expiresInHours).toBe(24);
    expect(payload.frames).toHaveLength(1);
    expect(payload.frames[0].mediaType).toBe('image');
    expect(payload.frames[0].mediaUrl).toBe('https://cdn.example.com/poster1.jpg');
    expect(payload.frames[0].caption).toBe('My caption');
    expect(payload.frames[0].stickers).toHaveLength(1);
    expect(payload.frames[0].stickers[0].type).toBe('mention');
    expect(remixAttribution.sourceDocumentId).toBeUndefined();
  });

  it('throws when serialising non-poster document', () => {
    const doc = makeLookDoc();
    expect(() => serialiseToPosterPayload(doc)).toThrow('non-poster');
  });

  it('maps vote layer to style_vote sticker type', () => {
    const doc = createEmptyDocument('poster');
    let working = addLayerToPage(doc, 0, makeMediaLayer('m1', 'https://cdn.example.com/p.jpg'));
    working = addLayerToPage(working, 0, makeVoteLayer('vote_1'));
    const { payload } = serialiseToPosterPayload(working);
    const voteSticker = payload.frames[0].stickers.find((s) => s.type === 'style_vote');
    expect(voteSticker).toBeDefined();
    expect(voteSticker!.id).toBe('vote_1');
  });

  it('maps product layer to listing sticker type', () => {
    const doc = createEmptyDocument('poster');
    let working = addLayerToPage(doc, 0, makeMediaLayer('m1', 'https://cdn.example.com/p.jpg'));
    working = addLayerToPage(working, 0, makeProductLayer('prod_1'));
    const { payload } = serialiseToPosterPayload(working);
    const listingSticker = payload.frames[0].stickers.find((s) => s.type === 'listing');
    expect(listingSticker).toBeDefined();
    expect(listingSticker!.id).toBe('prod_1');
  });

  it('excludes caption_ prefixed text layers from stickers', () => {
    const doc = makePosterDoc();
    const { payload } = serialiseToPosterPayload(doc);
    const textStickers = payload.frames[0].stickers.filter((s) => s.type === 'text');
    expect(textStickers).toHaveLength(0);
  });

  it('preserves remix attribution', () => {
    const doc = makePosterDoc();
    const remixedDoc: CreatorDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        sourceDocumentId: 'source_poster_456',
        sourceCreatorId: 'creator_xyz',
        allowRemix: true,
      },
    };
    const { remixAttribution } = serialiseToPosterPayload(remixedDoc);
    expect(remixAttribution.sourceDocumentId).toBe('source_poster_456');
    expect(remixAttribution.sourceCreatorId).toBe('creator_xyz');
  });
});

// ── PublishGuard ──────────────────────────────────────────────────

describe('PublishGuard', () => {
  it('allows first begin for a document', () => {
    const guard = new PublishGuard();
    expect(guard.begin('doc_1')).toBe(true);
    expect(guard.isInFlight).toBe(true);
  });

  it('prevents duplicate begin while in flight', () => {
    const guard = new PublishGuard();
    guard.begin('doc_1');
    expect(guard.begin('doc_1')).toBe(false);
    expect(guard.begin('doc_2')).toBe(false);
  });

  it('prevents re-publish after completion', () => {
    const guard = new PublishGuard();
    guard.begin('doc_1');
    guard.complete('doc_1');
    expect(guard.begin('doc_1')).toBe(false);
  });

  it('allows retry after fail', () => {
    const guard = new PublishGuard();
    guard.begin('doc_1');
    guard.fail();
    expect(guard.isInFlight).toBe(false);
    expect(guard.begin('doc_1')).toBe(true);
  });

  it('allows new document after reset', () => {
    const guard = new PublishGuard();
    guard.begin('doc_1');
    guard.complete('doc_1');
    guard.reset();
    expect(guard.begin('doc_1')).toBe(true);
  });
});

// ── CreatorDraftService ───────────────────────────────────────────

describe('CreatorDraftService', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.mocked(AsyncStorage.setItem).mockImplementation((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    });
    vi.mocked(AsyncStorage.getItem).mockImplementation((key: string) => {
      return Promise.resolve(store.get(key) ?? null);
    });
    vi.mocked(AsyncStorage.removeItem).mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve();
    });
  });

  it('saves and loads a draft', async () => {
    const doc = makeLookDoc();
    await CreatorDraftService.saveDraft(doc);
    const loaded = await CreatorDraftService.loadDraft(doc.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(doc.id);
    expect(loaded!.type).toBe('look');
  });

  it('returns null for non-existent draft', async () => {
    const loaded = await CreatorDraftService.loadDraft('nonexistent_id');
    expect(loaded).toBeNull();
  });

  it('lists saved drafts sorted by updatedAt desc', async () => {
    const doc1 = { ...makeLookDoc(), id: 'draft_a', updatedAt: '2024-01-01T00:00:00Z' };
    const doc2 = { ...makeLookDoc(), id: 'draft_b', updatedAt: '2024-06-01T00:00:00Z' };
    await CreatorDraftService.saveDraft(doc1);
    await CreatorDraftService.saveDraft(doc2);
    const drafts = await CreatorDraftService.listDrafts();
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    const ids = drafts.map((d) => d.id);
    expect(ids).toContain('draft_a');
    expect(ids).toContain('draft_b');
    const bIdx = ids.indexOf('draft_b');
    const aIdx = ids.indexOf('draft_a');
    expect(bIdx).toBeLessThan(aIdx);
  });

  it('deletes a draft', async () => {
    const doc = { ...makeLookDoc(), id: 'draft_to_delete' };
    await CreatorDraftService.saveDraft(doc);
    await CreatorDraftService.deleteDraft(doc.id);
    const loaded = await CreatorDraftService.loadDraft(doc.id);
    expect(loaded).toBeNull();
  });

  it('updates existing draft index entry on re-save', async () => {
    const doc = { ...makeLookDoc(), id: 'draft_update', metadata: { ...makeLookDoc().metadata, title: 'Original' } };
    await CreatorDraftService.saveDraft(doc);
    const updatedDoc = { ...doc, metadata: { ...doc.metadata, title: 'Updated Title' } };
    await CreatorDraftService.saveDraft(updatedDoc);
    const drafts = await CreatorDraftService.listDrafts();
    const entry = drafts.find((d) => d.id === 'draft_update');
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Updated Title');
  });
});
