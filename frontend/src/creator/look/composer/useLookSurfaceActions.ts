/**
 * useLookSurfaceActions — bottom-surface switching + default-toolbar
 * action handlers for the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * Each handler swaps the bottom surface to the requested panel and fires
 * a haptic. Closing a panel returns to 'tools' (the ContextToolRail).
 */

import { useCallback } from 'react';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { LookComposerStateResult } from './useLookComposerState';
import type { HapticApi } from './useLookMultiSelectActions';

export function useLookSurfaceActions({
  cs,
  selectedLayer,
  haptic,
}: {
  cs: LookComposerStateResult;
  selectedLayer: CreatorLayer | null;
  haptic: HapticApi;
}) {
  const {
    setBottomSurface,
    setPickerMode,
    cutoutSupported,
    setCutoutPreviewTarget,
    setCutoutTarget,
  } = cs;

  // ── Bottom surface switching ─────────────────────────────────────────
  const handleOpenItems = useCallback(() => {
    haptic.light();
    setBottomSurface('items');
  }, [haptic, setBottomSurface]);

  const handleOpenLayout = useCallback(() => {
    haptic.light();
    setBottomSurface('layout');
  }, [haptic, setBottomSurface]);

  const handleCloseSurface = useCallback(() => {
    haptic.light();
    setBottomSurface('tools');
  }, [haptic, setBottomSurface]);

  const handleAddPhoto = useCallback(() => {
    haptic.light();
    setPickerMode('media');
  }, [haptic, setPickerMode]);

  const handleAddText = useCallback(() => {
    haptic.light();
    setPickerMode('text');
  }, [haptic, setPickerMode]);

  // Cutout from the default toolbar — opens true subject segmentation
  // (CutoutPreviewSheet) when the native backend is available, or falls
  // back to the manual crop workflow (CreatorCutoutSheet) when it is not.
  // Per spec 07 §7: true cutout uses segmentation, not a trace bounding
  // box. Per AGENTS.md §11: never fake a cutout success.
  const handleCutoutAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    if (cutoutSupported) {
      // Native segmentation available — open the true cutout preview.
      setCutoutPreviewTarget(selectedLayer);
    } else {
      // Fallback — manual rectangular crop (truthful label is "Crop").
      setCutoutTarget(selectedLayer);
    }
  }, [selectedLayer, haptic, cutoutSupported, setCutoutPreviewTarget, setCutoutTarget]);

  // ── Adjust action for selected media ─────────────────────────────────
  // Opens the effects bottom surface which contains the AdjustPanel
  // (fine-tuning sliders for brightness, contrast, saturation, etc).
  // This is the correct surface for "Adjust" — not the cutout sheet
  // (which is background removal, a separate tool in overflow).
  const handleAdjustAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setBottomSurface('effects');
  }, [selectedLayer, haptic, setBottomSurface]);

  // ── Effects action for selected media ────────────────────────────────
  // Opens the effects bottom surface for the selected media layer. The
  // surface shows the EffectPreviewRail (filter thumbnails using the
  // layer's own media as the preview source), AI effects, and the
  // AdjustPanel (fine-tuning sliders). Effect changes commit to the
  // layer's non-destructive `effects` array (EffectNode[]) via updateLayer.
  const handleEffectsAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setBottomSurface('effects');
  }, [selectedLayer, haptic, setBottomSurface]);

  return {
    handleOpenItems,
    handleOpenLayout,
    handleCloseSurface,
    handleAddPhoto,
    handleAddText,
    handleCutoutAction,
    handleAdjustAction,
    handleEffectsAction,
  };
}
