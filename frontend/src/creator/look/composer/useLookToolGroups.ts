/**
 * useLookToolGroups — context-sensitive tool rail for the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * The rail adapts its visible tool set based on the current selection
 * state. Tool group definitions and accessibility labels live in
 * lookToolRailConfig.ts; this hook passes the handlers and state
 * setters to buildLookToolGroups, and derives the active context via
 * deriveLookToolContext.
 */

import { useMemo } from 'react';
import type { CreatorLayer } from '../../core/projectStore/composition';
import {
  type ToolContext,
  type ToolGroup,
  getOverflowTools,
} from '../../core/toolRegistry';
import { deriveLookToolContext, buildLookToolGroups } from '../lookToolRailConfig';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { LookComposerStateResult } from './useLookComposerState';
import type { useLookObjectActions } from './useLookObjectActions';
import type { useLookSurfaceActions } from './useLookSurfaceActions';
import type { useLookTextActions } from './useLookTextActions';
import type { useLookMultiSelectActions } from './useLookMultiSelectActions';
import type { useMultiSelect } from '../../shared/useMultiSelect';
import type { useLookEffects } from '../useLookEffects';

export function useLookToolGroups({
  cs,
  creator,
  selectedLayer,
  objectActions,
  surfaceActions,
  textActions,
  multi,
  multiActions,
  effects,
}: {
  cs: LookComposerStateResult;
  creator: CreatorContextValue;
  selectedLayer: CreatorLayer | null;
  objectActions: ReturnType<typeof useLookObjectActions>;
  surfaceActions: ReturnType<typeof useLookSurfaceActions>;
  textActions: ReturnType<typeof useLookTextActions>;
  multi: ReturnType<typeof useMultiSelect>;
  multiActions: ReturnType<typeof useLookMultiSelectActions>;
  effects: ReturnType<typeof useLookEffects>;
}) {
  const { multiSelectMode, cutoutSupported, setCropTarget, setPickerMode } = cs;
  const { selectedLayerIds, copyLayer, pasteLayer, clipboard } = creator;
  const {
    handleEditLayer,
    handleReplaceMedia,
    handleLinkItem,
    handleDeleteLayer,
    handleDuplicateLayer,
    handleReorderLayer,
  } = objectActions;
  const {
    handleOpenItems,
    handleOpenLayout,
    handleAddPhoto,
    handleAddText,
    handleCutoutAction,
    handleAdjustAction,
    handleEffectsAction,
  } = surfaceActions;
  const {
    handleTextEditAction,
    handleTextFontAction,
    handleTextColorAction,
    handleTextAlignAction,
  } = textActions;
  const { handleMultiFront, handleMultiBack, handleMultiAlign } = multi;
  const { handleMultiDelete } = multiActions;
  const { handleAutoAdjust } = effects;

  const activeToolContext: ToolContext = useMemo(
    () => deriveLookToolContext(multiSelectMode, selectedLayerIds, selectedLayer),
    [multiSelectMode, selectedLayerIds, selectedLayer],
  );

  const toolGroups: ToolGroup[] = useMemo(
    () =>
      buildLookToolGroups({
        selectedLayer,
        cutoutSupported,
        handleAddPhoto,
        handleOpenItems,
        handleAddText,
        handleOpenLayout,
        handleCutoutAction,
        handleReplaceMedia,
        handleAdjustAction,
        handleAutoAdjust,
        handleEffectsAction,
        handleReorderLayer,
        handleDuplicateLayer,
        handleDeleteLayer,
        handleLinkItem,
        handleEditLayer,
        handleTextEditAction,
        handleTextFontAction,
        handleTextColorAction,
        handleTextAlignAction,
        handleCopyLayer: copyLayer,
        handlePasteLayer: pasteLayer,
        canPaste: clipboard !== null,
        handleMultiFront,
        handleMultiBack,
        handleMultiDelete,
        handleMultiAlign,
        setCropTarget,
        handleAddStickers: () => setPickerMode('stickers'),
        handleAddGif: () => setPickerMode('gif'),
        handleAddShape: () => setPickerMode('shape') }),
    [
      selectedLayer,
      cutoutSupported,
      handleAddPhoto,
      handleOpenItems,
      handleAddText,
      handleOpenLayout,
      handleCutoutAction,
      handleReplaceMedia,
      handleAdjustAction,
      handleAutoAdjust,
      handleEffectsAction,
      handleReorderLayer,
      handleDuplicateLayer,
      handleDeleteLayer,
      handleLinkItem,
      handleEditLayer,
      handleTextEditAction,
      handleTextFontAction,
      handleTextColorAction,
      handleTextAlignAction,
      copyLayer,
      pasteLayer,
      clipboard,
      handleMultiFront,
      handleMultiBack,
      handleMultiDelete,
      handleMultiAlign,
      setCropTarget,
      setPickerMode,
    ],
  );

  // ── Context overflow tools ───────────────────────────────────────────
  // Resolved from the active context's tool group — these are the
  // selection-specific actions (Effects, Cutout, Front, Back, Duplicate,
  // Delete, etc.) that belong in the "More" menu ahead of the global
  // editor tools. Each tool's `onPress` is already wired in
  // buildLookToolGroups; we wrap it to also dismiss the overflow menu.
  const contextOverflowTools = useMemo(
    () => getOverflowTools(activeToolContext, toolGroups),
    [activeToolContext, toolGroups],
  );

  return { activeToolContext, toolGroups, contextOverflowTools };
}
