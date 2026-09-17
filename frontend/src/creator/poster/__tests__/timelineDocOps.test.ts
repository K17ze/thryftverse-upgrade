import { describe, it, expect } from 'vitest';
import {
  splitPageClip,
  duplicateClipPage,
  deleteClipPage,
} from '../timeline/TimelineDocOps';
import type {
  CreatorDocument,
  CreatorLayer,
  CreatorPage,
} from '../../core/projectStore/composition';

// ── Factories ────────────────────────────────────────────────────────
// Structurally plausible document objects — the doc ops don't run schema
// validation, so only the fields they read/write need to be real.

function makeMediaLayer(id: string, overrides: Record<string, unknown> = {}): CreatorLayer {
  return {
    id,
    type: 'media',
    x: 0, y: 0, width: 1, height: 1,
    scale: 1, rotation: 0, zIndex: 1,
    locked: false, hidden: false, opacity: 1,
    payload: {
      mediaUri: `file:///media/${id}.mp4`,
      mediaType: 'video',
      videoDurationMs: 10000,
      trimStartMs: 0,
      trimEndMs: 10000,
      speed: 1,
      volume: 1,
      ...overrides,
    },
  } as CreatorLayer;
}

function makeTextLayer(id: string, overrides: Record<string, unknown> = {}): CreatorLayer {
  return {
    id,
    type: 'text',
    x: 0.5, y: 0.5, width: 0.5, height: 0.1,
    scale: 1, rotation: 0, zIndex: 2,
    locked: false, hidden: false, opacity: 1,
    payload: { text: 'hello' },
    ...overrides,
  } as CreatorLayer;
}

function makePage(id: string, layers: CreatorLayer[], extra: Partial<CreatorPage> = {}): CreatorPage {
  return { id, layers, durationMs: 5000, ...extra };
}

function makeDoc(pages: CreatorPage[]): CreatorDocument {
  return {
    id: 'doc-1',
    type: 'poster',
    canvas: { width: 1080, height: 1920, fps: 30 },
    pages,
    metadata: {},
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as CreatorDocument;
}

// ── splitPageClip ────────────────────────────────────────────────────

describe('splitPageClip', () => {
  it('trims the owning page media layer and inserts a second-half page', () => {
    const doc = makeDoc([makePage('p1', [makeMediaLayer('m1')])]);
    const result = splitPageClip(doc, 0, 'm1', 4000);
    expect(result).not.toBeNull();
    const { document: next } = result!;

    expect(next.pages).toHaveLength(2);

    const firstLayer = next.pages[0].layers[0];
    expect(firstLayer.id).toBe('m1');
    expect(firstLayer.type).toBe('media');
    if (firstLayer.type === 'media') {
      expect(firstLayer.payload.trimStartMs).toBe(0);
      expect(firstLayer.payload.trimEndMs).toBe(4000);
    }
    expect(next.pages[0].durationMs).toBe(4000);

    const secondLayer = next.pages[1].layers[0];
    expect(secondLayer.type).toBe('media');
    expect(secondLayer.id).toBe(result!.secondClipLayerId);
    expect(secondLayer.id).not.toBe('m1');
    if (secondLayer.type === 'media') {
      expect(secondLayer.payload.trimStartMs).toBe(4000);
      expect(secondLayer.payload.trimEndMs).toBe(10000);
      expect(secondLayer.payload.thumbnailUri).toBeUndefined();
    }
    expect(next.pages[1].durationMs).toBe(6000);
  });

  it('moves the page transitionId to the new second-half page', () => {
    const doc = makeDoc([
      makePage('p1', [makeMediaLayer('m1')], { transitionId: 'fade' }),
      makePage('p2', [makeMediaLayer('m2')]),
    ]);
    const result = splitPageClip(doc, 0, 'm1', 4000);
    expect(result).not.toBeNull();
    const pages = result!.document.pages;
    // transitionId marks the boundary AFTER the page — after the split
    // the original boundary sits after the second-half page.
    expect(pages[0].transitionId).toBeUndefined();
    expect(pages[1].transitionId).toBe('fade');
    expect(pages[2].transitionId).toBeUndefined();
    expect(pages[2].id).toBe('p2');
  });

  it('recomputes page durations speed-adjusted', () => {
    const doc = makeDoc([
      makePage('p1', [makeMediaLayer('m1', { speed: 2 })]),
    ]);
    const result = splitPageClip(doc, 0, 'm1', 4000);
    const pages = result!.document.pages;
    // (4000-0)/2 = 2000 ; (10000-4000)/2 = 3000
    expect(pages[0].durationMs).toBe(2000);
    expect(pages[1].durationMs).toBe(3000);
  });

  it('re-anchors keyframes past the split and drops earlier ones', () => {
    const layer = makeMediaLayer('m1') as Extract<CreatorLayer, { type: 'media' }>;
    const withKeyframes = {
      ...layer,
      keyframes: [
        { timeMs: 500, x: 0.2, y: 0.5 },
        { timeMs: 6000, x: 0.8, y: 0.5 },
      ],
    } as unknown as CreatorLayer;
    const doc = makeDoc([makePage('p1', [withKeyframes])]);
    const result = splitPageClip(doc, 0, 'm1', 4000);
    const second = result!.document.pages[1].layers[0];
    expect(second.keyframes).toEqual([{ timeMs: 2000, x: 0.8, y: 0.5 }]);
  });

  it('clears a freeze offset inside the discarded first half, shifts the rest', () => {
    const inside = makeDoc([
      makePage('p1', [makeMediaLayer('m1', { freezeFrameMs: 2000, freezeDurationMs: 500 })]),
    ]);
    const r1 = splitPageClip(inside, 0, 'm1', 4000);
    const l1 = r1!.document.pages[1].layers[0];
    if (l1.type === 'media') expect(l1.payload.freezeFrameMs).toBeUndefined();

    const past = makeDoc([
      makePage('p1', [makeMediaLayer('m1', { freezeFrameMs: 7000, freezeDurationMs: 500 })]),
    ]);
    const r2 = splitPageClip(past, 0, 'm1', 4000);
    const l2 = r2!.document.pages[1].layers[0];
    if (l2.type === 'media') expect(l2.payload.freezeFrameMs).toBe(3000);
  });

  it('does not duplicate non-media overlays onto the second half', () => {
    const doc = makeDoc([
      makePage('p1', [makeMediaLayer('m1'), makeTextLayer('t1')]),
    ]);
    const result = splitPageClip(doc, 0, 'm1', 4000);
    expect(result!.document.pages[0].layers).toHaveLength(2);
    expect(result!.document.pages[1].layers).toHaveLength(1);
  });

  it('returns null for out-of-range splits, missing layers, non-media layers', () => {
    const doc = makeDoc([makePage('p1', [makeMediaLayer('m1')])]);
    expect(splitPageClip(doc, 0, 'm1', 0)).toBeNull();
    expect(splitPageClip(doc, 0, 'm1', 10000)).toBeNull();
    expect(splitPageClip(doc, 0, 'nope', 4000)).toBeNull();
    expect(splitPageClip(doc, 9, 'm1', 4000)).toBeNull();
    const textDoc = makeDoc([makePage('p1', [makeTextLayer('t1')])]);
    expect(splitPageClip(textDoc, 0, 't1', 4000)).toBeNull();
  });
});

// ── duplicateClipPage ────────────────────────────────────────────────

describe('duplicateClipPage', () => {
  it('clones the owning page with fresh layer ids (no ghost media layer)', () => {
    const doc = makeDoc([
      makePage('p1', [makeMediaLayer('m1'), makeTextLayer('t1')]),
      makePage('p2', [makeMediaLayer('m2')]),
    ]);
    const result = duplicateClipPage(doc, 0, 'm1', 'x1');
    expect(result).not.toBeNull();
    const pages = result!.document.pages;
    expect(pages).toHaveLength(3);

    const clone = pages[1];
    expect(clone.id).toBe(result!.newPageId);
    expect(clone.layers).toHaveLength(2);
    // The cloned media layer carries the returned clip id — one media
    // layer per page, so the duplicate is a real visible clip.
    expect(clone.layers[0].id).toBe(result!.duplicateClipLayerId);
    expect(clone.layers[0].type).toBe('media');
    expect(clone.layers[1].id).toBe('t1_dup_x1');
    // Source page untouched.
    expect(pages[0].layers[0].id).toBe('m1');
    expect(pages[2].layers[0].id).toBe('m2');
  });

  it('returns null when the clip layer is missing or not media', () => {
    const doc = makeDoc([makePage('p1', [makeMediaLayer('m1')])]);
    expect(duplicateClipPage(doc, 0, 'nope')).toBeNull();
    const textDoc = makeDoc([makePage('p1', [makeTextLayer('t1')])]);
    expect(duplicateClipPage(textDoc, 0, 't1')).toBeNull();
  });
});

// ── deleteClipPage ───────────────────────────────────────────────────

describe('deleteClipPage', () => {
  it('removes the owning page so no dead duration gap remains', () => {
    const doc = makeDoc([
      makePage('p1', [makeMediaLayer('m1')]),
      makePage('p2', [makeMediaLayer('m2')]),
      makePage('p3', [makeMediaLayer('m3')]),
    ]);
    const next = deleteClipPage(doc, 1);
    expect(next).not.toBeNull();
    expect(next!.pages.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('refuses to remove the last page (document requires ≥1 page)', () => {
    const doc = makeDoc([makePage('p1', [makeMediaLayer('m1')])]);
    expect(deleteClipPage(doc, 0)).toBeNull();
  });

  it('returns null for an out-of-range index', () => {
    const doc = makeDoc([
      makePage('p1', [makeMediaLayer('m1')]),
      makePage('p2', [makeMediaLayer('m2')]),
    ]);
    expect(deleteClipPage(doc, 5)).toBeNull();
  });
});
