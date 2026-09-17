import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CreatorDocument, CreatorLayer } from '../../core/projectStore/composition';
import { CreatorAnalytics } from '../../shared/creatorAnalytics';
import { haptics } from '../../../utils/haptics';
import { createLookProductLayer, createMediaLayer } from './mediaBuilders';
import type { LookProductParams } from './mediaBuilders';

export interface UseLookIntentsOptions {
  document: CreatorDocument;
  setDocumentState: Dispatch<SetStateAction<CreatorDocument>>;
  pushHistory: (doc: CreatorDocument, label: string) => void;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  addLayer: (layer: CreatorLayer) => void;
  updateLayer: (id: string, updates: Partial<CreatorLayer>, label?: string) => void;
}

export interface UseLookIntents {
  addLookCutout: (params: {
    mediaUri: string;
    sourceLayerId?: string;
    contentFit?: 'cover' | 'contain' | 'fill';
  }) => void;
  addLookProduct: (params: LookProductParams) => void;
  swapLookAsset: (layerId: string, replacement: {
    mediaUri: string;
    mediaType?: 'image' | 'video';
    contentFit?: 'cover' | 'contain' | 'fill';
  }) => void;
  autoArrangeLook: (layout?: 'hero' | 'pair' | 'dominant' | 'collage') => void;
}

// ─── Look-specific intent methods ────────────────────────────────────
// Look is a single-page 4:5 collage. These methods encode the collage
// mental model (cutouts, product tags, asset swap, auto arrangement)
// and are no-ops for Poster documents. They always target page 0.
export function useLookIntents({
  document,
  setDocumentState,
  pushHistory,
  setIsDirty,
  addLayer,
  updateLayer,
}: UseLookIntentsOptions): UseLookIntents {
  const addLookCutout = useCallback((params: {
    mediaUri: string;
    sourceLayerId?: string;
    contentFit?: 'cover' | 'contain' | 'fill';
  }) => {
    if (document.type !== 'look') return;
    const page0 = document.pages[0];
    const maxZ = page0 ? page0.layers.reduce((max, l) => Math.max(max, l.zIndex), 0) : 0;
    const layer = createMediaLayer(
      { uri: params.mediaUri, kind: 'image' },
      {
        zIndex: maxZ + 1,
        width: 0.4,
        height: 0.4,
        contentFit: params.contentFit ?? 'contain',
      },
    );
    addLayer(layer);
    CreatorAnalytics.layerAdd('look', 'media');
  }, [document.type, document.pages, addLayer]);

  const addLookProduct = useCallback((params: LookProductParams) => {
    if (document.type !== 'look') return;
    const page0 = document.pages[0];
    const maxZ = page0 ? page0.layers.reduce((max, l) => Math.max(max, l.zIndex), 0) : 0;
    const layer = createLookProductLayer(params, maxZ + 1);
    addLayer(layer);
    CreatorAnalytics.layerAdd('look', 'product');
  }, [document.type, document.pages, addLayer]);

  const swapLookAsset = useCallback((layerId: string, replacement: {
    mediaUri: string;
    mediaType?: 'image' | 'video';
    contentFit?: 'cover' | 'contain' | 'fill';
  }) => {
    if (document.type !== 'look') return;
    const page0 = document.pages[0];
    const layer = page0?.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'media') return;
    updateLayer(layerId, {
      type: 'media',
      payload: {
        ...layer.payload,
        mediaUri: replacement.mediaUri,
        mediaType: replacement.mediaType ?? layer.payload.mediaType,
        contentFit: replacement.contentFit ?? layer.payload.contentFit,
      },
    }, 'Swap asset');
  }, [document.type, document.pages, updateLayer]);

  const autoArrangeLook = useCallback((layout: 'hero' | 'pair' | 'dominant' | 'collage' = 'collage') => {
    if (document.type !== 'look') return;
    setDocumentState((prev) => {
      const page0 = prev.pages[0];
      if (!page0) return prev;
      const mediaLayers = page0.layers.filter((l) => l.type === 'media' && !l.hidden);
      const otherLayers = page0.layers.filter((l) => l.type !== 'media');
      if (mediaLayers.length === 0) return prev;

      let arranged: CreatorLayer[];
      const n = mediaLayers.length;

      if (layout === 'hero' || n === 1) {
        // 1 → hero composition
        arranged = [{
          ...mediaLayers[0],
          x: 0.5, y: 0.5, width: 0.9, height: 0.9, scale: 1, rotation: 0,
        }];
      } else if (layout === 'pair' || n === 2) {
        // 2 → balanced editorial pairing
        arranged = [
          { ...mediaLayers[0], x: 0.27, y: 0.5, width: 0.44, height: 0.8, scale: 1, rotation: 0 },
          { ...mediaLayers[1], x: 0.73, y: 0.5, width: 0.44, height: 0.8, scale: 1, rotation: 0 },
        ];
      } else if (layout === 'dominant' || n === 3) {
        // 3 → dominant + two supporting
        arranged = [
          { ...mediaLayers[0], x: 0.5, y: 0.42, width: 0.7, height: 0.7, scale: 1, rotation: 0 },
          { ...mediaLayers[1], x: 0.22, y: 0.82, width: 0.3, height: 0.3, scale: 1, rotation: 0 },
          { ...mediaLayers[2], x: 0.78, y: 0.82, width: 0.3, height: 0.3, scale: 1, rotation: 0 },
        ];
      } else {
        // 4+ → scattered collage with collision avoidance
        // Distribute around the canvas with slight overlap but no full overlap
        arranged = mediaLayers.map((layer, i) => {
          const angle = (i / n) * Math.PI * 2;
          const radius = 0.28;
          const cx = 0.5 + Math.cos(angle) * radius;
          const cy = 0.5 + Math.sin(angle) * radius;
          const size = 0.34;
          return {
            ...layer,
            x: Math.max(0.18, Math.min(0.82, cx)),
            y: Math.max(0.18, Math.min(0.82, cy)),
            width: size,
            height: size,
            scale: 1,
            rotation: (i % 2 === 0 ? 1 : -1) * 4,
          };
        });
      }

      // Reassign zIndex in order
      const allLayers = [...arranged, ...otherLayers].map((l, i) => ({ ...l, zIndex: i }));
      const newPages = [...prev.pages];
      newPages[0] = { ...page0, layers: allLayers };
      const doc = { ...prev, pages: newPages, updatedAt: new Date().toISOString() };
      pushHistory(doc, 'Auto-arrange look');
      setIsDirty(true);
      return doc;
    });
    haptics.selection();
  }, [document.type, pushHistory, setDocumentState, setIsDirty]);

  return {
    addLookCutout,
    addLookProduct,
    swapLookAsset,
    autoArrangeLook,
  };
}
