/**
 * useLookComposerState — sheet/overlay state machine + local UI state for
 * the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * Owns the editor mode reducer (mutually-exclusive sheet modes), the
 * local target/picker state, the bottom-surface mode, the confirm sheet,
 * multi-select mode, the canvas layout ref, and the (show: boolean)
 * mode setters that preserve the signatures expected by
 * lookToolRailConfig and sheet onClose handlers.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { AssetPickerMode } from '../../surfaces/CreatorAssetPicker';
import { useCreatorColorHistory } from '../../color';
import { cutoutService } from '../../core/cutout/CutoutService';
import {
  lookEditorReducer,
  initialLookEditorState,
  type LookEditorAction,
} from '../lookEditorState';
import type { BottomSurface } from './LookBottomSurfaces';

export type ConfirmSheetState = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
};

export function useLookComposerState({
  openTemplates,
  startBlank,
}: {
  openTemplates?: boolean;
  startBlank?: boolean;
}) {
  // ── Sheet / overlay state (single state machine) ─────────────────────
  // Replaces 13 parallel `show*` booleans with one discriminated-union
  // mode. Only one non-idle mode is active at a time. `showSafeZone` and
  // `showOverflow` are orthogonal (can be on in any mode).
  const [editorState, dispatch] = useReducer(
    lookEditorReducer,
    { ...initialLookEditorState, mode: openTemplates ? { type: 'choosingTemplate' as const } : { type: 'idle' as const } },
  );
  const state = editorState;
  const showSafeZone = state.showSafeZone;
  const showOverflow = state.showOverflow;
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);
  // ── In-place text content editing (Snapchat/Instagram pattern) ──────
  // When set, an InlineTextEditor renders AT the text layer's position on
  // the canvas so the user can type in place. The bottom contextual rail
  // remains the single styling surface for the selected text layer.
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const [entryComplete, setEntryComplete] = useState(Boolean(startBlank));
  const [cropTarget, setCropTarget] = useState<CreatorLayer | null>(null);
  const [cutoutTarget, setCutoutTarget] = useState<CreatorLayer | null>(null);
  // ── Text color picker sheet (local state) ──
  // Opens a CreatorColorPicker sheet for the selected text layer's fill
  // color. Replaces the former hardcoded palette cycling.
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const { recents: colorRecents, commitColor: commitRecentColor } = useCreatorColorHistory();
  // ── True cutout (segmentation) state ─────────────────────────────────
  // `cutoutPreviewTarget` holds the media layer being previewed in the
  // CutoutPreviewSheet (true segmentation). `cutoutSupported` is probed
  // once on mount so the tool label can honestly say "Cutout" when the
  // native backend is available, and "Crop" when it is not.
  const [cutoutPreviewTarget, setCutoutPreviewTarget] = useState<CreatorLayer | null>(null);
  const [cutoutSupported, setCutoutSupported] = useState(false);
  useEffect(() => {
    // Check if the Skia-based brush cutout is available. This is an
    // honest capability check — brushRefinement is true when Skia is
    // linked (AGENTS.md §11: never fake a capability).
    const cap = cutoutService.getCapability();
    setCutoutSupported(cap.brushRefinement);
  }, []);
  const [editingLookId, setEditingLookId] = useState<string | null>(null);
  const [isLoadingSourceLook, setIsLoadingSourceLook] = useState(false);
  const [sourceLookError, setSourceLookError] = useState(false);
  const [sourceLookRetryNonce, setSourceLookRetryNonce] = useState(0);
  // ── Bottom surface state machine ─────────────────────────────────────
  // Controls which bottom surface is visible. Only ONE renders at a time.
  // 'tools' = ContextToolRail (default). 'items' = Items drawer.
  // 'layout' = Layout panel. 'effects' = Effects panel (incl. AI effects).
  const [bottomSurface, setBottomSurface] = useState<BottomSurface>('tools');
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetState>({ visible: false, title: '', message: '', onConfirm: () => {} });

  // ── Multi-select mode ────────────────────────────────────────────────
  // Long-press enters multi-select mode. In multi-select, tapping a layer
  // toggles it in the selection set. Dragging any selected layer moves all
  // selected layers together. A "Done" button and selection count badge
  // appear at the top. Tapping empty canvas exits multi-select.
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  // Align sub-menu state — toggles a small horizontal align picker above
  // the tool rail in multi-select mode. (Now part of the editor state machine.)
  // ── Canvas layout ref for drag-to-canvas coordinate conversion ──
  // Stores the canvas container's screen-space position so drag-to-canvas
  // drop coordinates can be converted to normalized (0–1) canvas coordinates.
  const canvasLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const handleCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    canvasLayoutRef.current = e.nativeEvent.layout;
  }, []);

  // ── State machine dispatch wrappers ──────────────────────────────────
  // These preserve the (show: boolean) => void signatures expected by
  // lookToolRailConfig and sheet onClose handlers, while routing through
  // the reducer for mutually-exclusive modes. A single factory generates
  // all the mode-switching wrappers — one pattern, not 10 copies.
  const modeSetter = useCallback(
    (enterAction: LookEditorAction) => (show: boolean) => {
      dispatch(show ? enterAction : { type: 'BACK' });
    },
    [],
  );
  const setShowLayers = useMemo(() => modeSetter({ type: 'ARRANGE_LAYERS' }), [modeSetter]);
  const setShowPreview = useMemo(() => modeSetter({ type: 'SHOW_PREVIEW' }), [modeSetter]);
  const setShowPublish = useMemo(() => modeSetter({ type: 'SHOW_PUBLISH' }), [modeSetter]);
  const setShowSettings = useMemo(() => modeSetter({ type: 'SHOW_SETTINGS' }), [modeSetter]);
  const setShowHelp = useMemo(() => modeSetter({ type: 'SHOW_HELP' }), [modeSetter]);
  const setShowBackground = useMemo(() => modeSetter({ type: 'SHOW_BACKGROUND' }), [modeSetter]);
  const setShowTemplates = useMemo(() => modeSetter({ type: 'CHOOSE_TEMPLATE' }), [modeSetter]);
  const setShowAIEffects = useMemo(() => modeSetter({ type: 'SHOW_AI_EFFECTS' }), [modeSetter]);
  const setShowA11yMove = useMemo(() => modeSetter({ type: 'SHOW_A11Y_MOVE' }), [modeSetter]);
  const setShowA11yZOrder = useMemo(() => modeSetter({ type: 'SHOW_A11Y_ZORDER' }), [modeSetter]);
  const setShowA11yTransform = useMemo(() => modeSetter({ type: 'SHOW_A11Y_TRANSFORM' }), [modeSetter]);
  const setShowSafeZone = useCallback((show: boolean) => {
    if (show !== state.showSafeZone) dispatch({ type: 'TOGGLE_SAFE_ZONE' });
  }, [state.showSafeZone]);
  const setShowOverflow = useCallback((show: boolean) => {
    if (show !== state.showOverflow) dispatch({ type: 'TOGGLE_OVERFLOW' });
  }, [state.showOverflow]);

  return {
    state,
    dispatch,
    showSafeZone,
    showOverflow,
    pickerMode,
    setPickerMode,
    editingLayer,
    setEditingLayer,
    editingTextLayerId,
    setEditingTextLayerId,
    entryComplete,
    setEntryComplete,
    cropTarget,
    setCropTarget,
    cutoutTarget,
    setCutoutTarget,
    showTextColorPicker,
    setShowTextColorPicker,
    colorRecents,
    commitRecentColor,
    cutoutPreviewTarget,
    setCutoutPreviewTarget,
    cutoutSupported,
    editingLookId,
    setEditingLookId,
    isLoadingSourceLook,
    setIsLoadingSourceLook,
    sourceLookError,
    setSourceLookError,
    sourceLookRetryNonce,
    setSourceLookRetryNonce,
    bottomSurface,
    setBottomSurface,
    confirmSheet,
    setConfirmSheet,
    multiSelectMode,
    setMultiSelectMode,
    canvasLayoutRef,
    handleCanvasLayout,
    setShowLayers,
    setShowPreview,
    setShowPublish,
    setShowSettings,
    setShowHelp,
    setShowBackground,
    setShowTemplates,
    setShowAIEffects,
    setShowA11yMove,
    setShowA11yZOrder,
    setShowA11yTransform,
    setShowSafeZone,
    setShowOverflow,
  };
}

export type LookComposerStateResult = ReturnType<typeof useLookComposerState>;
