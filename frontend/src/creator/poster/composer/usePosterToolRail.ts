/**
 * usePosterToolRail — tool rail + overflow cluster for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the toolGroups memo (buildPosterToolRail), the active
 * ToolContext resolution, the dynamic overflow tool list, the draft
 * export wiring (usePosterDraftExport), and the overflow sections memo.
 */
import { useMemo } from 'react';

import type { CreatorDocument, CreatorPage } from '../../core/projectStore/composition';
import type { ToolContext, ToolGroup } from '../../core/toolRegistry';
import { getOverflowTools } from '../../core/toolRegistry';
import { buildPosterToolRail } from '../posterToolRailConfig';
import type { BuildPosterToolRailInput } from '../posterToolRailConfig';
import { derivePosterToolContext } from './posterDerived';
import { usePosterDraftExport } from '../usePosterDraftExport';
import { buildPosterOverflowSections } from './PosterOverflowSurface';
import type { PosterOverflowSection } from './PosterOverflowSurface';

export interface UsePosterToolRailInput extends BuildPosterToolRailInput {
  /** Whether multi-select mode is active. */
  multiSelectMode: boolean;
  /** Selected layer ids (from CreatorContext). */
  selectedLayerIds: string[];
  /** Whether any page carries video media. */
  hasVideoContent: boolean;
  /** Whether the document has more than one page. */
  hasMultipleFrames: boolean;
  /** Opens the frame organizer tray. */
  setShowFrameTray: (visible: boolean) => void;
  /** The composition document (draft export target). */
  document: CreatorDocument;
  /** The active page (draft export target). */
  page: CreatorPage | undefined;
}

export function usePosterToolRail(input: UsePosterToolRailInput) {
  const {
    haptic,
    openSheet,
    selectedLayer,
    updateLayer,
    show,
    navigation,
    pageCount,
    cutoutSupported,
    showSafeZone,
    bottomSurface,
    onEntryTypeChange,
    setShowPreview,
    setShowSafeZone,
    setShowTemplates,
    setSelectedClipId,
    setUserRequestedTimeline,
    setBottomSurface,
    setPickerMode,
    setShowTextColorPicker,
    handleAddText,
    handleAddStickers,
    handleAddProduct,
    handleAddEffects,
    handleDraw,
    handleAddFrame,
    handleTimelineToggle,
    handleEditLayer,
    handleReorderLayer,
    handleDuplicateLayer,
    handleDeleteLayer,
    handleCropAction,
    handleCutoutAction,
    handleAdjustAction,
    handleAutoAdjust,
    handleMultiFront,
    handleMultiBack,
    handleMultiDelete,
    handleMultiAlign,
    multiSelectMode,
    selectedLayerIds,
    hasVideoContent,
    hasMultipleFrames,
    setShowFrameTray,
    document,
    page,
  } = input;

  // ── Tool groups for ContextToolRail (posterToolRailConfig) ─────────
  // Pure config builder — no React hooks. All onPress handlers wire to
  // EXISTING handlers — no new actions.
  const toolGroups = useMemo<ToolGroup[]>(() => buildPosterToolRail({
    haptic,
    openSheet,
    selectedLayer,
    updateLayer,
    show,
    navigation,
    pageCount,
    cutoutSupported,
    showSafeZone,
    bottomSurface,
    onEntryTypeChange,
    setShowPreview,
    setShowSafeZone,
    setShowTemplates,
    setSelectedClipId,
    setUserRequestedTimeline,
    setBottomSurface,
    setPickerMode,
    setShowTextColorPicker,
    handleAddText,
    handleAddStickers,
    handleAddProduct,
    handleAddEffects,
    handleDraw,
    handleAddFrame,
    handleTimelineToggle,
    handleEditLayer,
    handleReorderLayer,
    handleDuplicateLayer,
    handleDeleteLayer,
    handleCropAction,
    handleCutoutAction,
    handleAdjustAction,
    handleAutoAdjust,
    handleMultiFront,
    handleMultiBack,
    handleMultiDelete,
    handleMultiAlign,
  }), [
    handleAddText, handleAddStickers, handleAddProduct, handleAddEffects, handleDraw,
    handleAddFrame, handleTimelineToggle, handleEditLayer, handleReorderLayer, handleDuplicateLayer,
    handleDeleteLayer, handleCropAction, handleCutoutAction, handleAdjustAction, handleAutoAdjust,
    handleMultiFront, handleMultiBack, handleMultiDelete, handleMultiAlign,
    selectedLayer, updateLayer, haptic, show, navigation,
    pageCount, cutoutSupported, showSafeZone, bottomSurface, openSheet, onEntryTypeChange,
    setShowPreview, setShowSafeZone, setShowTemplates, setSelectedClipId,
    setUserRequestedTimeline, setBottomSurface, setPickerMode, setShowTextColorPicker,
  ]);

  // ── Active context resolution ──────────────────────────────────────
  // Determine which tool context is active based on selection state and
  // whether the document contains video content.
  const activeToolContext: ToolContext = useMemo(
    () =>
      derivePosterToolContext({
        multiSelectMode,
        selectedLayerIds,
        selectedLayer,
        hasVideoContent,
      }),
    [multiSelectMode, selectedLayerIds, selectedLayer, hasVideoContent],
  );

  // ── Dynamic overflow tools for the active context ──────────────────
  // The overflow menu renders the actual overflow tools from the active
  // context's ToolGroup (not a hardcoded list). This ensures tools moved
  // to overflow (Draw, Timeline, Stickers, Effects, Cutout, Animation, etc.)
  // are actually accessible. Context-only items that aren't in the tool
  // groups (Accessibility, Help) are appended as persistent overflow items.
  const activeOverflowTools = useMemo(
    () => getOverflowTools(activeToolContext, toolGroups),
    [activeToolContext, toolGroups],
  );

  const overflowDestructive = useMemo(
    () => activeOverflowTools.filter((tool) => tool.id === 'delete'),
    [activeOverflowTools],
  );

  // ── Draft export (Edits parity: export without posting) ────────────
  const { canExportDraft, handleExportDraftImage } = usePosterDraftExport({
    document,
    page,
    haptic,
    show,
  });

  const overflowSections = useMemo<PosterOverflowSection[]>(() => {
    return buildPosterOverflowSections({
      activeOverflowTools,
      hasMultipleFrames,
      canExportDraft,
      handleExportDraftImage,
      setShowFrameTray,
    });
  }, [activeOverflowTools, hasMultipleFrames, canExportDraft, handleExportDraftImage, setShowFrameTray]);

  return {
    toolGroups,
    activeToolContext,
    activeOverflowTools,
    overflowDestructive,
    canExportDraft,
    handleExportDraftImage,
    overflowSections,
  };
}

export type PosterToolRail = ReturnType<typeof usePosterToolRail>;
