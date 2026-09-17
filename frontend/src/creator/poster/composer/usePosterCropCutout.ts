/**
 * usePosterCropCutout — crop / cutout sheet flow for the Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the crop-mode flag, the true-cutout (segmentation)
 * preview target + capability probe, and the rail actions that open the
 * crop editor and cutout preview for the selected media layer.
 */
import { useCallback, useEffect, useState } from 'react';

import type { CreatorLayer } from '../../core/projectStore/composition';
import { cutoutService } from '../../core/cutout/CutoutService';
import type { useHaptic } from '../../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

export interface UsePosterCropCutoutInput {
  /** The currently selected layer (crop/cutout are scoped to it). */
  selectedLayer: CreatorLayer | null;
  /** Haptic engine. */
  haptic: Haptic;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterCropCutout({
  selectedLayer,
  haptic,
}: UsePosterCropCutoutInput) {
  // `cutoutPreviewTarget` holds the media layer being previewed in the
  // CutoutPreviewSheet (true segmentation). `cutoutSupported` is probed
  // once on mount so the overflow tool can honestly show "Cutout" when
  // the native backend is available.
  const [cutoutPreviewTarget, setCutoutPreviewTarget] = useState<CreatorLayer | null>(null);
  const [cutoutSupported, setCutoutSupported] = useState(false);
  useEffect(() => {
    const cap = cutoutService.getCapability();
    setCutoutSupported(cap.brushRefinement);
  }, []);
  const [cropMode, setCropMode] = useState(false);

  // Crop action for selected media. CreatorCropSheet performs a real
  // pixel crop and returns a new local asset. Moving/resizing the layer
  // frame is layout, not cropping.
  const handleCropAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setCropMode(true);
  }, [selectedLayer, haptic]);

  // Cutout action for selected media (advanced, overflow only).
  // Opens true subject segmentation (CutoutPreviewSheet) when the native
  // backend is available. Per spec 07 §7: true cutout uses segmentation,
  // not a trace bounding box. Per AGENTS.md §11: never fake a cutout.
  // This is an advanced tool — it lives in the media-selected overflow,
  // not the primary rail.
  const handleCutoutAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setCutoutPreviewTarget(selectedLayer);
  }, [selectedLayer, haptic]);

  return {
    cutoutPreviewTarget,
    setCutoutPreviewTarget,
    cutoutSupported,
    cropMode,
    setCropMode,
    handleCropAction,
    handleCutoutAction,
  };
}

export type PosterCropCutout = ReturnType<typeof usePosterCropCutout>;
