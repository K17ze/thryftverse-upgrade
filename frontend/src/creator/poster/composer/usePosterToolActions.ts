/**
 * usePosterToolActions — bottom tool rail action handlers for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the object action handlers (delete/duplicate/reorder),
 * the default-rail handlers (text, stickers, product, draw, add frame),
 * the timeline toggle/done handlers, and the media actions that open the
 * effects sheet (add effects, adjust).
 */
import { useCallback, type Dispatch, type SetStateAction } from 'react';

import type { CreatorLayer, CreatorPage } from '../../core/projectStore/composition';
import type { AssetPickerMode } from '../../surfaces/CreatorAssetPicker';
import type { ToastType } from '../../../context/ToastContext';
import type { useHaptic } from '../../../hooks/useHaptic';
import { buildPosterTextLayer } from './buildPosterTextLayer';
import type { PosterBottomSurface } from './usePosterComposerUiState';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The toast `show` function signature from ToastContext.
 */
type ShowToast = (message: string, type?: ToastType) => void;

export interface UsePosterToolActionsInput {
  /** Haptic engine. */
  haptic: Haptic;
  /** Toast show function. */
  show: ShowToast;
  /** The active page being edited. */
  page: CreatorPage;
  /** The currently selected layer (drives context-specific tools). */
  selectedLayer: CreatorLayer | null;
  /** Number of projected timeline clips (timeline toggle guard). */
  timelineClipCount: number;
  /** Whether any page has layers (timeline empty-state guard). */
  hasContent: boolean;
  /** Deletes a layer (from CreatorContext). */
  removeLayer: (id: string) => void;
  /** Duplicates a layer (from CreatorContext). */
  duplicateLayer: (id: string) => void;
  /** Reorders a layer forward or backward (from CreatorContext). */
  reorderLayer: (id: string, direction: 'forward' | 'backward') => void;
  /** Selects a layer (from CreatorContext). */
  selectLayer: (id: string | null) => void;
  /** Adds a layer (from CreatorContext). */
  addLayer: (layer: CreatorLayer) => void;
  /** Adds a new frame/page (from CreatorContext). */
  addPage: () => void;
  /** Enters in-place text editing for a text layer id. */
  setEditingTextLayerId: (id: string | null) => void;
  /** Opens the asset picker in a mode. */
  setPickerMode: (mode: AssetPickerMode | null) => void;
  /** Setter for the user-requested-timeline flag. */
  setUserRequestedTimeline: Dispatch<SetStateAction<boolean>>;
  /** Setter for the bottom surface. */
  setBottomSurface: Dispatch<SetStateAction<PosterBottomSurface>>;
  /** Setter for the transient selected clip id. */
  setSelectedClipId: (id: string | null) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterToolActions({
  haptic,
  show,
  page,
  selectedLayer,
  timelineClipCount,
  hasContent,
  removeLayer,
  duplicateLayer,
  reorderLayer,
  selectLayer,
  addLayer,
  addPage,
  setEditingTextLayerId,
  setPickerMode,
  setUserRequestedTimeline,
  setBottomSurface,
  setSelectedClipId,
}: UsePosterToolActionsInput) {
  // ── Object action handlers (context toolbar) ───────────────────────
  const handleDeleteLayer = useCallback((id: string) => {
    haptic.medium();
    removeLayer(id);
  }, [removeLayer, haptic]);

  const handleDuplicateLayer = useCallback((id: string) => {
    haptic.light();
    duplicateLayer(id);
  }, [duplicateLayer, haptic]);

  const handleReorderLayer = useCallback((id: string, direction: 'forward' | 'backward') => {
    haptic.light();
    reorderLayer(id, direction);
  }, [reorderLayer, haptic]);

  // ── Bottom tool rail handlers (default — no selection) ─────────────
  // Direct-on-canvas text placement (Snapchat/Instagram pattern):
  // tapping Text creates a text layer directly on the canvas — centered,
  // selected, with placeholder copy — then opens the text editor in EDIT
  // mode for that layer so the keyboard opens immediately. The text is
  // already on the canvas when the editor opens; dismissing the editor
  // without typing leaves the layer on the canvas for later editing. This
  // replaces the former "tap Text → open empty picker sheet → type →
  // confirm → layer appears" modal flow where the canvas was hidden and
  // the text only appeared after confirmation.
  const handleAddText = useCallback(() => {
    haptic.light();
    const newLayer = buildPosterTextLayer();
    addLayer(newLayer);
    // Enter in-place text editing immediately — the InlineTextEditor
    // renders AT the layer's position on the canvas so the user can type
    // in place (Snapchat/Instagram pattern). No modal sheet needed.
    setEditingTextLayerId(newLayer.id);
  }, [haptic, addLayer, setEditingTextLayerId]);

  const handleAddStickers = useCallback(() => {
    haptic.light();
    setPickerMode('stickers');
  }, [haptic, setPickerMode]);

  const handleAddProduct = useCallback(() => {
    haptic.light();
    setPickerMode('product');
  }, [haptic, setPickerMode]);

  const handleDraw = useCallback(() => {
    haptic.light();
    setPickerMode('draw');
  }, [haptic, setPickerMode]);

  const handleAddFrame = useCallback(() => {
    haptic.light();
    selectLayer(null);
    addPage();
  }, [haptic, selectLayer, addPage]);

  // ── Timeline toggle (spec: timeline expands on explicit request) ───
  // For single-photo posters the timeline is hidden by default. Tapping
  // "Timeline" in the tool rail expands it; tapping again collapses it.
  // For video posters the timeline auto-expands — this toggle still
  // allows the user to collapse it if desired.
  const handleTimelineToggle = useCallback(() => {
    if (timelineClipCount === 0) {
      if (!hasContent) {
        show("Add a video to use the timeline", 'info');
        return;
      }
      haptic.light();
      setUserRequestedTimeline(true);
      setBottomSurface('timeline');
      return;
    }
    haptic.light();
    setUserRequestedTimeline((prev) => {
      const next = !prev;
      setBottomSurface(next ? 'timeline' : 'tools');
      return next;
    });
  }, [haptic, timelineClipCount, hasContent, show, setUserRequestedTimeline, setBottomSurface]);

  // ── Timeline Done — collapses the timeline, returns to canvas tools ─
  // Per spec: "Done returns to canvas tools." This is the exit from the
  // video state back to the default tool rail. The tool rail re-renders
  // because bottomSurface switches to 'tools'.
  const handleTimelineDone = useCallback(() => {
    haptic.light();
    setUserRequestedTimeline(false);
    setBottomSurface('tools');
    setSelectedClipId(null);
  }, [haptic, setUserRequestedTimeline, setBottomSurface, setSelectedClipId]);

  // ── Effects handler — opens the effects bottom sheet ───────────────
  // Opens the effects bottom sheet for the selected media layer. The
  // sheet shows the EffectPreviewRail (filter thumbnails using the
  // layer's own media as the preview source) and the AdjustPanel
  // (fine-tuning sliders). Effect changes commit to the layer's
  // non-destructive `effects` array (EffectNode[]) via updateLayer.
  const handleAddEffects = useCallback(() => {
    const mediaLayer = selectedLayer?.type === 'media'
      ? selectedLayer
      : page.layers.find((layer) => layer.type === 'media');
    if (!mediaLayer) {
      haptic.light();
      show('Add a photo before applying effects', 'info');
      return;
    }
    haptic.medium();
    selectLayer(mediaLayer.id);
    setBottomSurface('effects');
  }, [selectedLayer, page.layers, haptic, selectLayer, show, setBottomSurface]);

  // ── Adjust action for selected media ───────────────────────────────
  // Opens the effects sheet with the AdjustPanel visible. The adjust
  // panel provides non-destructive exposure/brightness/contrast/saturation
  // adjustments — the same workflow used by LookComposerScreen.
  const handleAdjustAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setBottomSurface('effects');
  }, [selectedLayer, haptic, setBottomSurface]);

  return {
    handleDeleteLayer,
    handleDuplicateLayer,
    handleReorderLayer,
    handleAddText,
    handleAddStickers,
    handleAddProduct,
    handleDraw,
    handleAddFrame,
    handleTimelineToggle,
    handleTimelineDone,
    handleAddEffects,
    handleAdjustAction,
  };
}

export type PosterToolActions = ReturnType<typeof usePosterToolActions>;
