/**
 * usePosterComposerKeys — dismissal-keys wiring adapter for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Maps the composer's hook groups onto the flat input contract
 * of usePosterDismissalKeys (keyboard shortcuts + hardware back button,
 * "dismiss the topmost surface first, else deselect, else navigate back").
 */
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { UsePosterTopBarActionsResult } from '../usePosterTopBarActions';
import { usePosterDismissalKeys } from '../usePosterDismissalKeys';
import type { PosterComposerUiState } from './usePosterComposerUiState';
import type { PosterLayerEditFlow } from './usePosterLayerEditFlow';
import type { PosterCropCutout } from './usePosterCropCutout';
import type { PosterMultiSelectOps } from './usePosterMultiSelectOps';

export interface UsePosterComposerKeysInput {
  creator: CreatorContextValue;
  ui: PosterComposerUiState;
  edit: PosterLayerEditFlow;
  crop: PosterCropCutout;
  multi: PosterMultiSelectOps;
  topBar: UsePosterTopBarActionsResult;
}

export function usePosterComposerKeys({
  creator,
  ui,
  edit,
  crop,
  multi,
  topBar,
}: UsePosterComposerKeysInput): void {
  usePosterDismissalKeys({
    canUndo: creator.canUndo,
    canRedo: creator.canRedo,
    undo: creator.undo,
    redo: creator.redo,
    editingTextLayerId: ui.editingTextLayerId,
    setEditingTextLayerId: ui.setEditingTextLayerId,
    showTextColorPicker: ui.showTextColorPicker,
    setShowTextColorPicker: ui.setShowTextColorPicker,
    activeSheet: ui.activeSheet,
    closeSheet: ui.closeSheet,
    bottomSurface: ui.bottomSurface,
    setBottomSurface: ui.setBottomSurface,
    setUserRequestedTimeline: ui.setUserRequestedTimeline,
    cropMode: crop.cropMode,
    setCropMode: crop.setCropMode,
    cutoutPreviewTarget: crop.cutoutPreviewTarget,
    setCutoutPreviewTarget: crop.setCutoutPreviewTarget,
    pageMenuIndex: ui.pageMenuIndex,
    setPageMenuIndex: ui.setPageMenuIndex,
    showPreview: ui.showPreview,
    setShowPreview: ui.setShowPreview,
    showTemplates: ui.showTemplates,
    setShowTemplates: ui.setShowTemplates,
    pickerMode: edit.pickerMode,
    setPickerMode: edit.setPickerMode,
    setEditingLayer: edit.setEditingLayer,
    selectedLayerId: creator.selectedLayerId,
    selectLayer: creator.selectLayer,
    removeLayer: creator.removeLayer,
    handleBack: topBar.handleBack,
    multiSelectMode: ui.multiSelectMode,
    selectedLayerIds: creator.selectedLayerIds,
    exitMultiSelect: multi.exitMultiSelect,
    handleMultiDelete: multi.handleMultiDelete,
  });
}
