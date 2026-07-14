import { describe, it, expect } from 'vitest';
import {
  createEmptyDocument,
  validateDocument,
  safeValidateDocument,
  addLayerToPage,
  updateLayerInPage,
  removeLayerFromPage,
  reorderLayerZ,
  duplicateLayerInPage,
  getVisibleLayersSorted,
  getAllLayersSorted,
  migrateLookToDocument,
  migratePosterFramesToDocument,
  type CreatorDocument,
  type CreatorLayer,
} from '../creator/composition';
import { HistoryStack } from '../creator/history';
import type { OutfitTag } from '../components/look/LookMediaComposer';
import type { ComposerFrame } from '../components/poster/PosterFrameStrip';

describe('CreatorDocument schema', () => {
  it('creates a valid empty look document', () => {
    const doc = createEmptyDocument('look');
    expect(doc.type).toBe('look');
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].layers).toHaveLength(0);
    expect(doc.canvas.aspectRatio).toBe(0.8);
    expect(doc.metadata.visibility).toBe('public');
  });

  it('creates a valid empty poster document', () => {
    const doc = createEmptyDocument('poster');
    expect(doc.type).toBe('poster');
    // P0.1: Poster defaults to 9:16 portrait (0.5625), not legacy 16:9 landscape
    expect(doc.canvas.aspectRatio).toBeCloseTo(9 / 16);
    expect(doc.metadata.expiresInHours).toBe(24);
  });

  it('validates a well-formed document', () => {
    const doc = createEmptyDocument('look');
    const validated = validateDocument(doc);
    expect(validated.id).toBe(doc.id);
  });

  it('safeValidateDocument returns error for invalid document', () => {
    const result = safeValidateDocument({ id: '', type: 'look', version: 1, canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#000' } }, pages: [], metadata: {} });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('Layer operations', () => {
  const makeDoc = (): CreatorDocument => createEmptyDocument('look');
  const makeLayer = (id: string, zIndex: number): CreatorLayer => ({
    id,
    type: 'text',
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.1,
    scale: 1,
    rotation: 0,
    zIndex,
    locked: false,
    hidden: false,
    opacity: 1,
    payload: { text: 'Hello', textStyle: 'clean', textColor: '#fff', alignment: 'center', opacity: 1 },
  });

  it('addLayerToPage adds a layer with auto-incremented zIndex', () => {
    const doc = makeDoc();
    const layer = makeLayer('l1', 0);
    const updated = addLayerToPage(doc, 0, layer);
    expect(updated.pages[0].layers).toHaveLength(1);
    expect(updated.pages[0].layers[0].zIndex).toBe(1);
  });

  it('updateLayerInPage updates specific fields', () => {
    const doc = addLayerToPage(makeDoc(), 0, makeLayer('l1', 0));
    const updated = updateLayerInPage(doc, 0, 'l1', { x: 0.3, y: 0.7 });
    expect(updated.pages[0].layers[0].x).toBe(0.3);
    expect(updated.pages[0].layers[0].y).toBe(0.7);
  });

  it('removeLayerFromPage removes the correct layer', () => {
    let doc = addLayerToPage(makeDoc(), 0, makeLayer('l1', 0));
    doc = addLayerToPage(doc, 0, makeLayer('l2', 0));
    doc = removeLayerFromPage(doc, 0, 'l1');
    expect(doc.pages[0].layers).toHaveLength(1);
    expect(doc.pages[0].layers[0].id).toBe('l2');
  });

  it('reorderLayerZ brings layer to front', () => {
    let doc = addLayerToPage(makeDoc(), 0, makeLayer('l1', 0));
    doc = addLayerToPage(doc, 0, makeLayer('l2', 0));
    doc = addLayerToPage(doc, 0, makeLayer('l3', 0));
    doc = reorderLayerZ(doc, 0, 'l1', 'front');
    const sorted = getAllLayersSorted(doc.pages[0]);
    expect(sorted[sorted.length - 1].id).toBe('l1');
  });

  it('reorderLayerZ sends layer to back', () => {
    let doc = addLayerToPage(makeDoc(), 0, makeLayer('l1', 0));
    doc = addLayerToPage(doc, 0, makeLayer('l2', 0));
    doc = addLayerToPage(doc, 0, makeLayer('l3', 0));
    doc = reorderLayerZ(doc, 0, 'l3', 'back');
    const sorted = getAllLayersSorted(doc.pages[0]);
    expect(sorted[0].id).toBe('l3');
  });

  it('duplicateLayerInPage creates a copy with new id', () => {
    let doc = addLayerToPage(makeDoc(), 0, makeLayer('l1', 0));
    doc = duplicateLayerInPage(doc, 0, 'l1');
    expect(doc.pages[0].layers).toHaveLength(2);
    expect(doc.pages[0].layers[1].id).not.toBe('l1');
  });

  it('getVisibleLayersSorted filters hidden layers', () => {
    let doc = addLayerToPage(makeDoc(), 0, makeLayer('l1', 0));
    doc = addLayerToPage(doc, 0, makeLayer('l2', 0));
    doc = updateLayerInPage(doc, 0, 'l1', { hidden: true });
    const visible = getVisibleLayersSorted(doc.pages[0]);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('l2');
  });
});

describe('HistoryStack', () => {
  it('initializes with one entry and cannot undo', () => {
    const doc = createEmptyDocument('look');
    const h = new HistoryStack(doc);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.current()).toEqual(doc);
  });

  it('pushes entries and undoes', () => {
    const doc = createEmptyDocument('look');
    const h = new HistoryStack(doc);
    const doc2 = { ...doc, metadata: { ...doc.metadata, caption: 'test' } };
    h.push(doc2, 'Edit caption');
    expect(h.canUndo()).toBe(true);
    const undone = h.undo();
    expect(undone).toEqual(doc);
    expect(h.canRedo()).toBe(true);
  });

  it('redoes after undo', () => {
    const doc = createEmptyDocument('look');
    const h = new HistoryStack(doc);
    const doc2 = { ...doc, metadata: { ...doc.metadata, caption: 'test' } };
    h.push(doc2, 'Edit caption');
    h.undo();
    const redone = h.redo();
    expect(redone).toEqual(doc2);
  });

  it('clears redo stack on new push', () => {
    const doc = createEmptyDocument('look');
    const h = new HistoryStack(doc);
    h.push({ ...doc, metadata: { ...doc.metadata, caption: 'a' } }, 'a');
    h.push({ ...doc, metadata: { ...doc.metadata, caption: 'b' } }, 'b');
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.push({ ...doc, metadata: { ...doc.metadata, caption: 'c' } }, 'c');
    expect(h.canRedo()).toBe(false);
  });

  it('limits history to MAX_HISTORY', () => {
    const doc = createEmptyDocument('look');
    const h = new HistoryStack(doc);
    for (let i = 0; i < 60; i++) {
      h.push({ ...doc, metadata: { ...doc.metadata, caption: `edit ${i}` } }, `edit ${i}`);
    }
    let count = 0;
    while (h.canUndo()) { h.undo(); count++; }
    expect(count).toBeLessThanOrEqual(50);
  });
});

describe('Migration helpers', () => {
  it('migrates a look with image and tags', () => {
    const tags: OutfitTag[] = [
      { id: 't1', label: 'Jacket', listingId: 'listing1', x: 0.3, y: 0.4 },
      { id: 't2', label: 'Shoes', listingId: 'listing2', x: 0.7, y: 0.8 },
    ];
    const doc = migrateLookToDocument({
      id: 'look1',
      imageUri: 'file:///photo.jpg',
      caption: 'My outfit',
      tags,
      visibility: 'public',
    });
    expect(doc.type).toBe('look');
    expect(doc.pages[0].layers).toHaveLength(3); // 1 media + 2 product tags
    expect(doc.pages[0].layers[0].type).toBe('media');
    expect(doc.pages[0].layers[1].type).toBe('product');
    expect(doc.metadata.caption).toBe('My outfit');
  });

  it('migrates poster frames with stickers', () => {
    const frames: ComposerFrame[] = [
      {
        id: 'f1',
        mediaType: 'image',
        mediaUri: 'file:///photo.jpg',
        backgroundColor: null,
        caption: 'Hello',
        durationMs: 5000,
        stickers: [
          {
            id: 's1',
            type: 'text',
            x: 0.5,
            y: 0.5,
            scale: 1,
            rotation: 0,
            payload: { text: 'Cool', textStyle: 'editorial', textColor: '#fff', alignment: 'center' },
            sortOrder: 0,
          },
          {
            id: 's2',
            type: 'mention',
            x: 0.3,
            y: 0.3,
            scale: 1,
            rotation: 0,
            payload: { userId: 'u1', username: 'user1' },
            sortOrder: 1,
          },
        ],
      },
    ];
    const doc = migratePosterFramesToDocument({
      id: 'poster1',
      frames,
      audience: 'public',
      allowReplies: true,
      allowReactions: true,
    });
    expect(doc.type).toBe('poster');
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].layers.length).toBeGreaterThanOrEqual(3); // media + caption + 2 stickers
    expect(doc.metadata.visibility).toBe('public');
    expect(doc.metadata.allowReplies).toBe(true);
  });
});
