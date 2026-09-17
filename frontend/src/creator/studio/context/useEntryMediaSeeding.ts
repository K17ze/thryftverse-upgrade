import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CreatorDocument } from '../../core/projectStore/composition';
import {
  addLayerToPage,
  computeLookLayout,
} from '../../core/projectStore/composition';
import type { CreatorInitialMedia } from '../../../navigation/types';
import { makeStableId } from '../../../utils/createStableId';
import { MAX_PAGES } from './constants';
import { createMediaLayer } from './mediaBuilders';

export interface UseEntryMediaSeedingOptions {
  initialType: 'look' | 'poster';
  initialMediaUri?: string;
  initialMedia?: CreatorInitialMedia[];
  setDocumentState: Dispatch<SetStateAction<CreatorDocument>>;
  resetHistory: (doc: CreatorDocument) => void;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
}

// Seed initial captured/selected media. The seeding strategy branches on
// `initialType` to respect the two distinct product mental models:
//
//   Poster (Story): a SEQUENCE of frames. Each selected asset becomes its
//     own page (frame) — media[0] → page 0, media[1] → page 1, etc. This
//     preserves the user's tap/selection order so frames play in the
//     order the user chose them.
//
//   Look (collage): a COMPOSED canvas. Multiple selected assets are seeded
//     as stacked media layers on a single page (page 0), preserving the
//     existing collage behavior.
//
// When `initialMedia` is absent, fall back to the legacy single-URI
// `initialMediaUri` path (treated as an image layer on page 0) for
// backward compatibility with existing single-asset entry points (e.g.
// camera capture).
// Seeded entry media must become the history baseline and mark the
// document dirty — otherwise the first undo wipes the captured media and
// autosave (`if (!isDirty) return`) never persists a doc the user hasn't
// edited yet. Guarded so a re-run of the effect can't re-seed or
// double-push history (StrictMode remount).
export function useEntryMediaSeeding({
  initialType,
  initialMediaUri,
  initialMedia,
  setDocumentState,
  resetHistory,
  setIsDirty,
}: UseEntryMediaSeedingOptions): void {
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (initialMedia && initialMedia.length > 0) {
      seededRef.current = true;
      let seededDoc: CreatorDocument | null = null;
      setDocumentState((prev) => {
        if (initialType === 'poster') {
          // ── Poster: one page per selected asset ──
          // Each media item creates a new page with a single base media
          // layer at z=0. The initial empty page (page_1) is replaced by
          // the first frame; subsequent frames are appended. Selection
          // order == page order.
          const pages = initialMedia.slice(0, MAX_PAGES).map((asset, i) => {
            const mediaLayer = createMediaLayer(asset);
            return {
              id: makeStableId(`page_${i}`),
              layers: [mediaLayer],
            };
          });
          seededDoc = { ...prev, pages, updatedAt: new Date().toISOString() };
          return seededDoc;
        }
        // ── Look: multi-media as auto-arranged layers on page 0 ──
        // Per doc 05: "Default should never produce four identical
        // full-bleed images stacked at center." We use computeLookLayout
        // to position assets based on count (hero, pair, dominant,
        // collage) so the canvas is immediately useful.
        const lookLayers = initialMedia.map((asset, i) =>
          createMediaLayer(asset, { zIndex: i }));
        const arrangedLayers = computeLookLayout(lookLayers);
        let lookDoc = prev;
        arrangedLayers.forEach((layer) => {
          lookDoc = addLayerToPage(lookDoc, 0, layer);
        });
        seededDoc = lookDoc;
        return lookDoc;
      });
      if (seededDoc) {
        resetHistory(seededDoc);
        setIsDirty(true);
      }
      return;
    }
    if (!initialMediaUri || seededRef.current) return;
    seededRef.current = true;
    const mediaLayer = createMediaLayer({ uri: initialMediaUri, kind: 'image' });
    let seededDoc: CreatorDocument | null = null;
    setDocumentState((prev) => {
      seededDoc = addLayerToPage(prev, 0, mediaLayer);
      return seededDoc;
    });
    if (seededDoc) {
      resetHistory(seededDoc);
      setIsDirty(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMediaUri, initialMedia, initialType]);
}
