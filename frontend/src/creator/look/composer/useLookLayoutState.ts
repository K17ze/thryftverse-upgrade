/**
 * useLookLayoutState — layout preview rail + canvas-derived tray data for
 * the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * Owns the derived media-layer lists, the source-tray dedup set and peek
 * thumbnails, the autoCompose layout previews, and the long-press layout
 * preview machinery (snapshot → updateLayerLive → restore).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBackendData } from '../../../context/BackendDataContext';
import { autoCompose } from '../layout/autoCompose';
import type { AssetTransform, LayoutPreview, LayoutId } from '../layout/layoutTypes';
import type { CreatorLayer, CreatorPage } from '../../core/projectStore/composition';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { HapticApi } from './useLookMultiSelectActions';

const PREVIEW_FIELDS = ['x', 'y', 'width', 'height', 'rotation', 'zIndex', 'scale'] as const;

export function useLookLayoutState({
  page,
  canvasWidth,
  canvasHeight,
  commitLayerTransform,
  updateLayerLive,
  haptic,
}: {
  page: CreatorPage | undefined;
  canvasWidth: number;
  canvasHeight: number;
  commitLayerTransform: CreatorContextValue['commitLayerTransform'];
  updateLayerLive: CreatorContextValue['updateLayerLive'];
  haptic: HapticApi;
}) {
  // ── Layout preview rail (autoCompose) ────────────────────────────────
  // Replaces the blind "Try arrangement" cycling button. When the user
  // has 2+ media assets on the canvas, the LayoutPreviewRail shows real
  // preview thumbnails computed by autoCompose. Selecting a layout
  // commits the transforms to the current document's media layers.
  const mediaLayers = useMemo(
    () => page?.layers.filter((l) => l.type === 'media') ?? [],
    [page],
  );

  // ── Canvas listing IDs for source tray dedup (§8.3) ──────────────────
  // The set of listing IDs already on the canvas as product layers.
  // Passed to LookSourceTray so items already on canvas show a dedup
  // indicator and offer "Add again" instead of silent duplication.
  const onCanvasListingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const layer of page?.layers ?? []) {
      if (layer.type === 'product' && layer.payload?.listingId) {
        ids.add(layer.payload.listingId);
      }
    }
    return ids;
  }, [page]);

  // ── Source tray peek thumbnails (§8.3: source tray peeking from bottom) ──
  // A few recent listing thumbnails shown as a thin peek strip above the
  // tool rail, making the source tray always visible as "creative supply."
  const { listings: backendListings } = useBackendData();
  const sourcePeekThumbs = useMemo(() => {
    return backendListings
      .filter((l) => l.status !== 'sold' && l.images?.[0])
      .slice(0, 8)
      .map((l) => l.images[0])
      .filter((uri): uri is string => !!uri);
  }, [backendListings]);

  const mediaAssetUris = useMemo(
    () => mediaLayers.map((l) => l.type === 'media' ? l.payload.mediaUri : '').filter(Boolean),
    [mediaLayers],
  );
  const mediaFocalPoints = useMemo(
    () => mediaLayers
      .filter((l): l is typeof l & { type: 'media' } => l.type === 'media' && !!l.payload.mediaUri)
      .map((l) => l.payload.focalPoint),
    [mediaLayers],
  );
  const hasMultipleMedia = mediaAssetUris.length >= 2;

  const { defaultLayout, alternatives } = useMemo(
    () => autoCompose(mediaAssetUris, canvasWidth, canvasHeight),
    [mediaAssetUris, canvasWidth, canvasHeight],
  );

  const allLayouts: LayoutPreview[] = useMemo(
    () => [defaultLayout, ...alternatives],
    [defaultLayout, alternatives],
  );

  const [selectedLayoutId, setSelectedLayoutId] = useState<LayoutId | null>(null);

  // Convert an AssetTransform (top-left normalized coords) to the
  // center-based coordinates used by CreatorLayer.
  const transformToLayerUpdate = useCallback((t: AssetTransform) => ({
    x: t.x + t.width / 2,
    y: t.y + t.height / 2,
    width: t.width,
    height: t.height,
    rotation: t.rotation,
    zIndex: t.zIndex,
    scale: 1 }), []);

  const handleLayoutSelect = useCallback((id: LayoutId) => {
    const layout = allLayouts.find((l) => l.id === id);
    if (!layout || mediaLayers.length === 0) return;

    // Apply transforms to each media layer. The autoCompose engine
    // produces transforms in asset order; we map them to the media
    // layers in their current order. Each update is a committed
    // transform (single history entry per layout application).
    const updates = layout.transforms;
    mediaLayers.forEach((layer, i) => {
      const t = updates[i];
      if (!t) return;
      commitLayerTransform(layer.id, transformToLayerUpdate(t), `Apply ${layout.name} layout`, true);
    });
    setSelectedLayoutId(id);
    haptic.selection();
  }, [allLayouts, mediaLayers, commitLayerTransform, transformToLayerUpdate, haptic]);

  // Temporary preview state — long-press shows the layout without
  // committing. We snapshot the media layers' current transforms on
  // preview start and restore them on release. Everything goes through
  // updateLayerLive so no history entries are pushed and nothing is
  // persisted unless the user taps the layout to actually apply it.
  const [previewLayoutId, setPreviewLayoutId] = useState<LayoutId | null>(null);
  const previewSnapshotRef = useRef<Map<string, Partial<CreatorLayer>> | null>(null);

  const handleLayoutPreview = useCallback((id: LayoutId) => {
    // Snapshot current transforms so release can restore them.
    const snapshot = new Map<string, Partial<CreatorLayer>>();
    mediaLayers.forEach((layer) => {
      const s: Partial<CreatorLayer> = {};
      PREVIEW_FIELDS.forEach((f) => { (s as Record<string, unknown>)[f] = layer[f]; });
      snapshot.set(layer.id, s);
    });
    previewSnapshotRef.current = snapshot;
    setPreviewLayoutId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaLayers]);

  const handleLayoutPreviewEnd = useCallback(() => {
    const snapshot = previewSnapshotRef.current;
    previewSnapshotRef.current = null;
    setPreviewLayoutId(null);
    if (snapshot) {
      snapshot.forEach((restore, id) => updateLayerLive(id, restore));
    }
  }, [updateLayerLive]);

  // Apply preview transforms to the document without committing to
  // history. Uses updateLayerLive (no history entry) for a live preview.
  // NOTE: mediaLayers is intentionally excluded from the dependency array.
  // Including it would cause an infinite loop: the effect calls
  // updateLayerLive → document changes → page changes → mediaLayers
  // changes (new array from .filter()) → effect re-runs → ...
  // Instead, we read mediaLayers via a ref so the effect only re-runs when
  // previewLayoutId or allLayouts changes (the actual triggers for a
  // preview application).
  const mediaLayersRef = useRef(mediaLayers);
  mediaLayersRef.current = mediaLayers;
  useEffect(() => {
    if (previewLayoutId === null) return;
    const layout = allLayouts.find((l) => l.id === previewLayoutId);
    if (!layout) return;
    mediaLayersRef.current.forEach((layer, i) => {
      const t = layout.transforms[i];
      if (!t) return;
      updateLayerLive(layer.id, transformToLayerUpdate(t));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewLayoutId, allLayouts, updateLayerLive, transformToLayerUpdate]);

  return {
    mediaLayers,
    onCanvasListingIds,
    sourcePeekThumbs,
    mediaAssetUris,
    mediaFocalPoints,
    hasMultipleMedia,
    allLayouts,
    selectedLayoutId,
    handleLayoutSelect,
    handleLayoutPreview,
    handleLayoutPreviewEnd,
  };
}
