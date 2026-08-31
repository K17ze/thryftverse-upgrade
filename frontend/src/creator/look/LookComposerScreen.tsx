import React, { useState, useReducer, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Keyboard,
  BackHandler,
  useWindowDimensions,
  LayoutChangeEvent,
  ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, runOnJS, useAnimatedStyle, useAnimatedReaction, withTiming } from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { Space, Radius, Typography, FontFamily, FontSize, Control, IconGrammar, Stroke, Elevation} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../theme/ThemeContext';
import { makeStableId } from '../../utils/createStableId';
import { useCreator } from '../CreatorContext';
import type { CreatorInitialMedia, NativeStackNavigationProp, RootStackParamList } from '../../navigation/types';
import type { CreatorLayer } from '../composition';
import { computeLookLayout, LOOK_DEFAULT_ASPECT_RATIO, safeValidateDocument } from '../composition';
import { layerTypeLabel } from '../shared/layerUtils';
import { CreatorCanvas } from '../CreatorCanvas';
import { CreatorLayersSheet } from '../CreatorLayersSheet';
import { CreatorPublishSheet } from '../CreatorPublishSheet';
import { CreatorSettingsSheet } from '../CreatorSettingsSheet';
import { CreatorAssetPicker, type AssetPickerMode } from '../CreatorAssetPicker';
import { CreatorTemplateBrowser } from '../CreatorTemplateBrowser';
import { CreatorPreviewOverlay } from '../CreatorPreviewOverlay';
import { CreatorEntryScreen } from '../CreatorEntryScreen';
import { CreatorEntryEditorCrossfade, type CreatorContentTransform } from '../CreatorEntryEditorCrossfade';
import { CreatorCropSheet } from '../CreatorCropSheet';
import { CreatorCutoutSheet } from '../CreatorCutoutSheet';
import { CutoutPreviewSheet } from '../surfaces/CutoutPreviewSheet';
import { AccessibilityMoveSheet } from '../surfaces/AccessibilityMoveSheet';
import { AccessibilityZOrderSheet, type ZOrderLayer } from '../surfaces/AccessibilityZOrderSheet';
import { cutoutService, type CutoutResult } from '../core/cutout/CutoutService';
import { PressScale } from '../CreatorAnimations';
import type { CaptureViewport } from '../capture/CaptureViewport';
import { InlineTextEditor } from '../tools/text/InlineTextEditor';
import { TEXT_STYLE_PRESETS } from '../tools/text/textStylePresets';
import { TrashZone } from '../surfaces/TrashZone';
import { BackgroundSheet } from './BackgroundSheet';
import type { CreatorBackground } from '../composition';
import { OverflowItem } from '../studio/OverflowMenu';
import { LookSourceTray, SourceTrayPeek } from './LookSourceTray';
import { ContextToolRail } from '../surfaces/ContextToolRail';
import { HelpShortcutsSheet } from '../surfaces/HelpShortcutsSheet';
import {
  type ToolContext,
  type ToolGroup,
  getOverflowTools,
} from '../core/toolRegistry';
import { EffectPreviewRail, AdjustPanel, FILTER_PRESETS, AutoAdjustButton } from '../tools/effects';
import { AIEffectBrowserSheet } from '../tools/effects/AIEffectBrowserSheet';
import {
  CreatorColorPicker,
  useCreatorColorHistory,
  toHexString,
  fromHexString,
  type CreatorColor,
} from '../color';
import { LayoutPreviewRail } from './layout/LayoutPreviewRail';
import { autoCompose } from './layout/autoCompose';
import type { AssetTransform, LayoutPreview, LayoutId } from './layout/layoutTypes';
// LookAutoLayout icon bar removed — LayoutPreviewRail is the single
// layout surface now (one engine, one coordinate convention, one commit path).
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Motion } from '../../theme/motionTokens';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';
import { fetchLookByIdFromApi } from '../../services/looksApi';
import { lookToDocument } from '../viewerAdapters';
import type { CreatorTemplate } from '../templates';
import { useLookEffects } from './useLookEffects';
import { useBackendData } from '../../context/BackendDataContext';
import { useLookMultiSelect } from './useLookMultiSelect';
import { deriveLookToolContext, buildLookToolGroups } from './lookToolRailConfig';
import { lookEditorReducer, initialLookEditorState, type LookEditorAction } from './lookEditorState';

// ── Look Composer V3 — Collage-Native Workspace ─────────────────────
// Per spec 10 (Look Architecture V3):
//   Poster is temporal. Look is spatial.
//   This screen is a dedicated collage-native workspace — NOT a shared
//   editor with isPoster/isLook branching. The mental model is direct
//   object manipulation on a 4:5 canvas.
//
// Canvas:
//   - 4:5 primary canvas (LOOK_DEFAULT_ASPECT_RATIO = 0.8)
//   - neutral workspace (dark, not full-bleed story)
//   - direct object manipulation via CreatorCanvas
//
// Default bottom actions (spec 10):
//   Add item · Add photo · Crop · Text · Layout
//
// Selected object produces a context toolbar (not a permanent dock).
// Global Layers remains More/Advanced.

// ── Bottom surface state machine ──────────────────────────────────────
// Per spec: "One lower interaction surface at a time." The Look screen
// shows exactly ONE bottom surface at any moment. The default is 'tools'
// (the ContextToolRail). Tapping "Items" / "Layout" / "Effects" swaps
// the bottom surface to that panel; closing the panel returns to 'tools'.
// This replaces the old pattern of multiple permanent rails (AutoLayoutBar,
// LayoutPreviewRail, LookSourceTray) competing with the canvas.
type BottomSurface = 'tools' | 'items' | 'layout' | 'effects' | null;

// ── Text color cycling palette ──────────────────────────────────────
// ── SlideUpSurface — wraps a bottom surface with a slide-up entrance ──
// Per spec: "Reanimated for surface transitions (slide in/out)." Each
// bottom surface (items, layout, effects) slides up from below when it
// mounts. Under reduced motion, the transition is instant.
// Per §5.14: entrance uses timing (ease-out), not spring — spring is
// reserved for direct manipulation or mode selection.
function SlideUpSurface({ children }: { children: React.ReactNode }) {
  const motionConfig = useMotionConfig();
  const translateY = useSharedValue(1);
  useEffect(() => {
    if (motionConfig.isReducedMotion) {
      translateY.value = 0;
    } else {
      translateY.value = withTiming(0, { duration: Motion.tier.deliberate, easing: Motion.easing.entrance });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value * 300 }] }));
  return <Reanimated.View style={animStyle}>{children}</Reanimated.View>;
}

// ── Typed navigation props ──────────────────────────────────────────
// The Look composer is registered as the 'CreatorStudio' route in the
// root stack. These types give useNavigation/useRoute full param
// inference instead of erasing to `any`.
type LookComposerRouteProp = RouteProp<RootStackParamList, 'CreatorStudio'>;
type LookComposerNavProp = NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>;

function LookComposerInner({ onEntryTypeChange }: { onEntryTypeChange: (type: 'look' | 'poster') => void }) {
  const navigation = useNavigation<LookComposerNavProp>();
  const route = useRoute<LookComposerRouteProp>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const {
    document,
    selectedLayerId,
    selectedLayerIds,
    selectLayer,
    selectLayers,
    toggleLayerInSelection,
    clearMultiSelect,
    deleteMultiSelected,
    commitMultiLayerTransform,
    updateLayersLive,
    bringSelectedToFront,
    sendSelectedToBack,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    undo,
    redo,
    isDirty,
    removeLayer,
    duplicateLayer,
    reorderLayer,
    updateLayer,
    updateLayerLive,
    addLayer,
    commitLayerTransform,
    isLoadingDraft,
    setDocument,
    saveDraft,
    swapLookAsset,
    addLookProduct,
    updateCanvas,
    hasPendingRecovery,
    recoverCrashedProject,
    dismissRecovery } = useCreator();

  // ── Sheet / overlay state (single state machine) ──────────────────
  // Replaces 13 parallel `show*` booleans with one discriminated-union
  // mode. Only one non-idle mode is active at a time. `showSafeZone` and
  // `showOverflow` are orthogonal (can be on in any mode).
  const [editorState, dispatch] = useReducer(
    lookEditorReducer,
    { ...initialLookEditorState, mode: route.params?.openTemplates ? { type: 'choosingTemplate' as const } : { type: 'idle' as const } },
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
  const [entryComplete, setEntryComplete] = useState(Boolean(route.params?.startBlank));
  const [cropTarget, setCropTarget] = useState<CreatorLayer | null>(null);
  const [cutoutTarget, setCutoutTarget] = useState<CreatorLayer | null>(null);
  // ── Text color picker sheet (local state) ──
  // Opens a CreatorColorPicker sheet for the selected text layer's fill
  // color. Replaces the former hardcoded palette cycling.
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const { recents: colorRecents, commitColor: commitRecentColor } = useCreatorColorHistory();
  // ── True cutout (segmentation) state ───────────────────────────────
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
  // ── Bottom surface state machine ───────────────────────────────────
  // Controls which bottom surface is visible. Only ONE renders at a time.
  // 'tools' = ContextToolRail (default). 'items' = Items drawer.
  // 'layout' = Layout panel. 'effects' = Effects panel (incl. AI effects).
  const [bottomSurface, setBottomSurface] = useState<BottomSurface>('tools');
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  // ── Multi-select mode ──────────────────────────────────────────────
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

  // ── State machine dispatch wrappers ────────────────────────────────
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
  const setShowSafeZone = useCallback((show: boolean) => {
    if (show !== state.showSafeZone) dispatch({ type: 'TOGGLE_SAFE_ZONE' });
  }, [state.showSafeZone]);
  const setShowOverflow = useCallback((show: boolean) => {
    if (show !== state.showOverflow) dispatch({ type: 'TOGGLE_OVERFLOW' });
  }, [state.showOverflow]);

  const sourceDocumentId = route.params?.sourceDocumentId;
  const sourceMode = route.params?.sourceMode ?? 'edit';

  // ── Edit mode: load an existing published look for editing ────────
  // When sourceDocumentId refers to a published look (not a local draft),
  // fetch it from the API and load it into the canvas as the working
  // document. The remix path in CreatorContext handles local-draft
  // sourceDocumentIds via CreatorDraftService.
  useEffect(() => {
    if (!sourceDocumentId || route.params?.draftId || route.params?.templateId) return;
    let cancelled = false;
    setIsLoadingSourceLook(true);
    setSourceLookError(false);
    fetchLookByIdFromApi(sourceDocumentId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.look) {
          setSourceLookError(true);
          return;
        }
        const persisted = safeValidateDocument(res.look.compositionDocument);
        const baseDoc = persisted.success && persisted.data
          ? persisted.data
          : lookToDocument({
              id: res.look.id,
              title: res.look.title,
              caption: res.look.caption,
              mediaUrl: res.look.mediaUrl,
              mediaType: res.look.mediaType,
              visibility: res.look.visibility,
              tags: res.look.tags.map((t) => ({
                id: t.id,
                label: t.label,
                listingId: t.listingId,
                x: t.x,
                y: t.y })) });
        if (sourceMode === 'remix') {
          setDocument({
            ...baseDoc,
            id: makeStableId('look'),
            metadata: {
              ...baseDoc.metadata,
              sourceDocumentId: res.look.id,
              sourceCreatorId: res.look.creatorId },
            updatedAt: new Date().toISOString() });
          setEditingLookId(null);
        } else {
          setDocument(baseDoc);
          setEditingLookId(sourceDocumentId);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSourceLookError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSourceLook(false);
      });
    return () => { cancelled = true; };
  }, [sourceDocumentId, sourceMode, route.params?.draftId, route.params?.templateId, setDocument, sourceLookRetryNonce]);

  // Show entry screen when document is empty and not loading
  const hasContent = document.pages.some((p) => p.layers.length > 0);
  const showEntryScreen = !entryComplete && !hasContent && !isLoadingDraft && !isLoadingSourceLook;

  const handleRetrySourceLook = useCallback(() => {
    setSourceLookRetryNonce((n) => n + 1);
  }, []);

  const page = document.pages[0]; // Look is always single-page

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ── Canvas geometry ───────────────────────────────────────────────
  // The authored coordinate space is always the document's canvas aspect
  // ratio (4:5 for looks). The edit surface letterboxes around this
  // authored space — it never mutates the document geometry to match the
  // physical screen. Full-bleed media is achieved by the media layer's
  // contentFit="cover" filling the authored canvas, not by changing the
  // canvas dimensions. This ensures editor, viewer, thumbnail, and export
  // all use the same coordinate space.
  const canvasWidth = screenWidth;
  const canvasHeight = useMemo(() => {
    // Always use the authored aspect ratio — never the physical screen ratio.
    return Math.floor(screenWidth / document.canvas.aspectRatio);
  }, [screenWidth, document.canvas.aspectRatio]);

  // Canvas vertical position: vertically centered in the viewport.
  const canvasVerticalOffset = useMemo(() => {
    if (canvasHeight >= screenHeight) return 0;
    return Math.floor((screenHeight - canvasHeight) / 2);
  }, [canvasHeight, screenHeight]);

  // ── Truthful back — offers Save Draft / Discard / Keep Editing ─────
  const handleBack = useCallback(() => {
    if (!isDirty) {
      navigation.goBack();
      return;
    }
    setConfirmSheet({
      visible: true,
      title: 'Save draft?',
      message: 'Your changes haven\'t been published yet.',
      confirmLabel: 'Save draft',
      variant: 'default',
      onConfirm: async () => {
        try {
          await saveDraft();
          navigation.goBack();
        } catch {
          setConfirmSheet({
            visible: true,
            title: 'Could not save draft',
            message: 'Try again.',
            confirmLabel: 'OK',
            variant: 'default',
            onConfirm: () => {} });
        }
      } });
  }, [isDirty, navigation, saveDraft]);

  // ── Periodic autosave (30s debounce) ────────────────────────────────
  // The Look composer previously only saved on back press. A crash between
  // edits would lose everything. This 30-second debounce timer fires
  // whenever the document is dirty, saving silently in the background.
  // The CreatorContext also has its own 5s autosave + AppState listener,
  // but this ensures the Look composer's saveDraft is called even if the
  // context's internal save path has a gap.
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      saveDraft().catch(() => {
        // Silent failure — the user will be prompted to save on back
      });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isDirty, saveDraft]);

  // ── Multi-select: exit helper ──────────────────────────────────────
  // Defined early so it's available to the keyboard shortcut handler and
  // hardware back button handler below.
  const exitMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    selectLayers(null);
    haptic.light();
  }, [selectLayers, haptic]);

  // Multi-select bulk delete — defined early for keyboard shortcut access.
  const handleMultiDelete = useCallback(() => {
    haptic.medium();
    haptic.warning();
    deleteMultiSelected();
    setMultiSelectMode(false);
  }, [deleteMultiSelected, haptic]);

  // ── Shared back-button priority cascade ─────────────────────────────
  // Single source of truth for the "close topmost surface" priority order
  // used by BOTH the hardware back button (useFocusEffect) and the keyboard
  // Escape handler. Returns true if a surface was closed (caller should
  // swallow the back press); false if nothing remains to close (caller
  // should let the system back / navigation proceed).
  const closeTopmostSurface = useCallback((): boolean => {
    if (editingTextLayerId) { setEditingTextLayerId(null); return true; }
    if (state.mode.type !== 'idle') { dispatch({ type: 'BACK' }); return true; }
    if (bottomSurface !== 'tools') { setBottomSurface('tools'); return true; }
    if (cropTarget) { setCropTarget(null); return true; }
    if (cutoutTarget) { setCutoutTarget(null); return true; }
    if (cutoutPreviewTarget) { setCutoutPreviewTarget(null); return true; }
    if (showTextColorPicker) { setShowTextColorPicker(false); return true; }
    if (state.showSafeZone) { dispatch({ type: 'TOGGLE_SAFE_ZONE' }); return true; }
    if (state.showOverflow) { dispatch({ type: 'TOGGLE_OVERFLOW' }); return true; }
    if (pickerMode) { setPickerMode(null); setEditingLayer(null); return true; }
    if (multiSelectMode) { exitMultiSelect(); return true; }
    if (selectedLayerId) { selectLayer(null); return true; }
    return false;
  }, [editingTextLayerId, state, bottomSurface, cropTarget, cutoutTarget, cutoutPreviewTarget, showTextColorPicker, pickerMode, multiSelectMode, exitMultiSelect, selectedLayerId, selectLayer]);

  // Keyboard shortcuts (web/tablet only)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      } else if ((isMeta && e.key === 'z' && e.shiftKey) || (isMeta && e.key === 'y')) {
        e.preventDefault();
        if (canRedo) redo();
      } else if (e.key === 'Escape') {
        if (!closeTopmostSurface()) handleBack();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && multiSelectMode && selectedLayerIds.length > 0) {
        e.preventDefault();
        handleMultiDelete();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerId) {
        e.preventDefault();
        removeLayer(selectedLayerId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canUndo, canRedo, undo, redo, closeTopmostSurface, handleBack, multiSelectMode, selectedLayerIds, handleMultiDelete, selectedLayerId, removeLayer]);

  // Hardware back button — intercept to close sheets first
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        return closeTopmostSurface();
      });
      return () => subscription.remove();
    }, [closeTopmostSurface])
  );

  const handleCanvasPress = useCallback(() => {
    Keyboard.dismiss();
    if (multiSelectMode) {
      exitMultiSelect();
      return;
    }
    selectLayer(null);
    haptic.light();
  }, [multiSelectMode, exitMultiSelect, selectLayer, haptic]);

  // Auto-exit multi-select mode when all layers are toggled off.
  useEffect(() => {
    if (multiSelectMode && selectedLayerIds.length === 0) {
      setMultiSelectMode(false);
    }
  }, [multiSelectMode, selectedLayerIds.length]);

  // ── Reset bottom surface to 'tools' when the selection changes ──
  // When the user selects or deselects a layer, any open bottom surface
  // (items / layout / effects) closes so the ContextToolRail can adapt to
  // the new selection context. This ensures only one surface is visible
  // and the rail always reflects the current selection state.
  const prevSelectionRef = useRef<string | null>(selectedLayerId);
  useEffect(() => {
    if (prevSelectionRef.current !== selectedLayerId) {
      prevSelectionRef.current = selectedLayerId;
      setBottomSurface('tools');
    }
  }, [selectedLayerId]);

  const handleLayerPress = useCallback((layerId: string) => {
    if (multiSelectMode) {
      // In multi-select mode, tapping a layer toggles it in the selection
      toggleLayerInSelection(layerId);
      haptic.selection();
      return;
    }
    selectLayer(layerId);
    haptic.light();
  }, [multiSelectMode, toggleLayerInSelection, selectLayer, haptic]);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    haptic.light();
    undo();
  }, [canUndo, undo, haptic]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    haptic.light();
    redo();
  }, [canRedo, redo, haptic]);

  const selectedLayer = page?.layers.find((l) => l.id === selectedLayerId) ?? null;

  // Background media URI for draw-on-media (Snapchat/Instagram pattern)
  const backgroundMediaUri = useMemo(() => {
    const mediaLayer = page?.layers
      .filter((l) => l.type === 'media' && !l.hidden)
      .sort((a, b) => a.zIndex - b.zIndex)[0];
    return mediaLayer?.type === 'media' ? mediaLayer.payload.mediaUri : undefined;
  }, [page]);

  // Chrome-recedes-during-manipulation (Snapchat/Instagram pattern)
  const manipulationActiveSV = useSharedValue(0);
  const [isManipulating, setIsManipulating] = useState(false);
  // Drag-to-trash: set to 1 by CreatorCanvas while the dragged layer's
  // center is inside the bottom trash zone. Drives the TrashZone overlay
  // highlight.
  const isInTrashZoneSV = useSharedValue(0);
  // Chrome opacity is driven by a reaction on manipulationActiveSV so
  // the timing animation only starts when the manipulation state changes,
  // not on every frame of useAnimatedStyle.
  const chromeOpacitySV = useSharedValue(1);
  useAnimatedReaction(
    () => manipulationActiveSV.value,
    (active, prev) => {
      if (active === prev) return;
      chromeOpacitySV.value = withTiming(
        active === 1 ? 0.15 : 1,
        { duration: Motion.tier.deliberate, easing: Motion.easing.entrance },
      );
    },
  );
  const chromeFadeStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacitySV.value }));

  // ── Entry screen media handling ────────────────────────────────────
  // For Look, each asset becomes an auto-arranged media layer on page 0
  // via computeLookLayout — never N identical full-bleed overlaps.
  const [entryPinnedUri, setEntryPinnedUri] = useState<string | null>(null);
  const [entryPinnedKind, setEntryPinnedKind] = useState<'image' | 'video'>('image');
  const [entryPinnedDestination, setEntryPinnedDestination] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  // Source content transform — the camera viewport guide rect captured at
  // the moment of capture. The transition animates the pinned media from
  // this frame to the editor canvas frame, preserving the focal point.
  const [entrySourceTransform, setEntrySourceTransform] = useState<CreatorContentTransform | null>(null);
  const cameraViewportRef = useRef<CaptureViewport | null>(null);
  const handleEntryMediaSelected = useCallback((media: CreatorInitialMedia[]) => {
    const mediaLayers: CreatorLayer[] = media.map((asset, i) => ({
      id: makeStableId(`media_${i}`),
      type: 'media' as const,
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      scale: 1,
      rotation: 0,
      zIndex: i,
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        mediaUri: asset.uri,
        mediaType: asset.kind,
        contentFit: 'cover' as const,
        videoDurationMs: asset.kind === 'video' ? asset.durationMs : undefined,
        opacity: 1,
        ...(asset.speed ? { speed: asset.speed } : {}),
        // Apply camera effect post-capture: store as a filter node in
        // the effect stack so the renderer applies the color matrix.
        // The effect ID matches the filter system's ImageFilter names.
        ...(asset.cameraEffect ? {
          effects: [{ type: 'filter' as const, id: asset.cameraEffect, amount: 1 }] } : {}) } }));
    const arranged = computeLookLayout(mediaLayers);
    const firstMedia = arranged.find((layer) => layer.type === 'media');
    setEntryPinnedUri(media[0]?.uri ?? null);
    setEntryPinnedKind(media[0]?.kind ?? 'image');
    // Build the source content transform from the measured camera viewport
    // so the transition animates from the guide frame, not full-screen.
    const vp = cameraViewportRef.current;
    if (vp) {
      setEntrySourceTransform({
        frame: {
          left: vp.viewRect.x,
          top: vp.viewRect.y,
          width: vp.viewRect.width,
          height: vp.viewRect.height },
        aspectRatio: vp.authoredAspectRatio });
    } else {
      setEntrySourceTransform(null);
    }
    setEntryPinnedDestination(firstMedia ? {
      left: (firstMedia.x - firstMedia.width / 2) * canvasWidth,
      top: canvasVerticalOffset + (firstMedia.y - firstMedia.height / 2) * canvasHeight,
      width: firstMedia.width * canvasWidth,
      height: firstMedia.height * canvasHeight } : null);
    const newDoc = {
      ...document,
      pages: [{ id: document.pages[0]?.id ?? 'page_1', layers: arranged }],
      updatedAt: new Date().toISOString() };
    setDocument(newDoc);
    setEntryComplete(true);
  }, [canvasHeight, canvasVerticalOffset, canvasWidth, document, setDocument]);

  const handleEntryBlankStart = useCallback(() => {
    setEntryPinnedUri(null);
    setEntryPinnedKind('image');
    setEntryPinnedDestination(null);
    setEntrySourceTransform(null);
    setEntryComplete(true);
  }, []);

  const handleEntryClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

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

  const handleEditLayer = useCallback((layer: CreatorLayer) => {
    setEditingLayer(layer);
    if (layer.type === 'text') setPickerMode('text');
    else if (layer.type === 'media') setPickerMode('media');
    else if (layer.type === 'product') setPickerMode('product');
    else if (layer.type === 'mention') setPickerMode('mention');
  }, []);

  // Replace media — opens the asset picker to swap the photo
  const handleReplaceMedia = useCallback((layer: CreatorLayer) => {
    setEditingLayer(layer);
    setPickerMode('media');
  }, []);

  // Link/change item — opens the product picker to link a marketplace listing
  const handleLinkItem = useCallback((layer: CreatorLayer) => {
    setEditingLayer(layer);
    setPickerMode('product');
  }, []);

  // ── Source tray: add item from closet/listings/search ──
  // Tapping an item in the items drawer adds it as a product tag layer
  // via addLookProduct. The tray stays open so the user can add multiple
  // items in quick succession.
  const handleSourceTrayAddItem = useCallback((item: {
    listingId: string;
    snapshotTitle: string;
    snapshotImageUrl?: string;
    snapshotPriceGbp?: number;
  }) => {
    addLookProduct({
      listingId: item.listingId,
      snapshotTitle: item.snapshotTitle,
      snapshotImageUrl: item.snapshotImageUrl,
      snapshotPriceGbp: item.snapshotPriceGbp });
  }, [addLookProduct]);

  // ── Source tray: drag-to-canvas product drop ──
  // When the user drags a product from the source tray and releases over
  // the canvas, the product is placed at the drop position (normalized to
  // 0–1 canvas coordinates). Falls back to center placement if the canvas
  // layout hasn't been measured yet.
  const handleDropProduct = useCallback((item: {
    listingId: string;
    snapshotTitle: string;
    snapshotImageUrl?: string;
    snapshotPriceGbp?: number;
  }, dropPosition: { x: number; y: number }) => {
    const layout = canvasLayoutRef.current;
    let x = 0.5;
    let y = 0.5;
    if (layout && layout.width > 0 && layout.height > 0) {
      x = Math.max(0, Math.min(1, (dropPosition.x - layout.x) / layout.width));
      y = Math.max(0, Math.min(1, (dropPosition.y - layout.y) / layout.height));
    }
    addLookProduct({
      listingId: item.listingId,
      snapshotTitle: item.snapshotTitle,
      snapshotImageUrl: item.snapshotImageUrl,
      snapshotPriceGbp: item.snapshotPriceGbp,
      x,
      y });
    haptic.light();
  }, [addLookProduct, haptic]);

  // ── Bottom surface switching ──────────────────────────────────────
  // Each handler swaps the bottom surface to the requested panel and fires
  // a haptic. Closing a panel returns to 'tools' (the ContextToolRail).
  const handleOpenItems = useCallback(() => {
    haptic.light();
    setBottomSurface('items');
  }, [haptic]);

  const handleOpenLayout = useCallback(() => {
    haptic.light();
    setBottomSurface('layout');
  }, [haptic]);

  const handleCloseSurface = useCallback(() => {
    haptic.light();
    setBottomSurface('tools');
  }, [haptic]);

  const handleAddPhoto = useCallback(() => {
    haptic.light();
    setPickerMode('media');
  }, [haptic]);

  const handleAddText = useCallback(() => {
    haptic.light();
    setPickerMode('text');
  }, [haptic]);

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
  }, [selectedLayer, haptic, cutoutSupported]);

  // ── Crop action for selected media ──────────────────────────────────
  // Perform a real pixel crop. Resizing the layer frame would only change
  // the collage layout and must never be labelled as cropping.
  const handleCropAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setCropTarget(selectedLayer);
  }, [selectedLayer, haptic]);

  // ── Adjust action for selected media ───────────────────────────────
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
  }, [selectedLayer, haptic]);

  // ── Effects action for selected media ───────────────────────────────
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
  }, [selectedLayer, haptic]);

  // ── Effects sheet — derived state & handlers (extracted to useLookEffects) ──
  const {
    selectedMediaLayer,
    effectsSourceUri,
    currentEffects,
    selectedFilterId,
    activeAIEffectId,
    currentAdjustments,
    filterAmount,
    handleEffectFilterSelect,
    handleEffectIntensityChange,
    handleEffectIntensityCommit,
    handleEffectAdjustChange,
    handleEffectAdjustCommit,
    handleEffectReset,
    autoAdjustActive,
    handleAutoAdjust,
    handleAIEffectApply,
    handleAIEffectRemove } = useLookEffects(selectedLayer, updateLayer, updateLayerLive);

  // ── Text editing actions ────────────────────────────────────────────
  const handleTextEditAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    handleEditLayer(selectedLayer);
  }, [selectedLayer, handleEditLayer, haptic]);

  // Font tool — cycles through curated text style presets with haptic
  // feedback. Each tap advances to the next preset and updates the layer
  // in real-time so the user sees the change immediately.
  const handleTextFontAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    haptic.light();
    const presets = TEXT_STYLE_PRESETS;
    const currentIdx = presets.findIndex(p => p.id === (selectedLayer.payload.textStyle ?? 'clean'));
    const nextPreset = presets[(currentIdx + 1) % presets.length];
    updateLayer(selectedLayer.id, {
      type: 'text',
      payload: { ...selectedLayer.payload, textStyle: nextPreset.id as typeof selectedLayer.payload.textStyle },
    }, 'Change font style');
  }, [selectedLayer, updateLayer, haptic]);

  // Color tool — opens the CreatorColorPicker sheet for the selected
  // text layer. Replaces the former hardcoded palette cycling.
  const handleTextColorAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    haptic.light();
    setShowTextColorPicker(true);
  }, [selectedLayer, haptic]);

  // Align tool — cycles left → center → right → left. The tool rail
  // glyph updates to reflect the current alignment.
  const handleTextAlignAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    haptic.light();
    const current = selectedLayer.payload.alignment ?? 'center';
    const next = current === 'left' ? 'center' : current === 'center' ? 'right' : 'left';
    updateLayer(selectedLayer.id, {
      type: 'text',
      payload: { ...selectedLayer.payload, alignment: next },
    }, 'Change alignment');
  }, [selectedLayer, updateLayer, haptic]);

  // ── Product tag actions ─────────────────────────────────────────────
  // Price tool — opens the inline text editor focused on the price field.
  // Distinct from the Item tool which opens the product link picker.
  const handleProductPriceAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'product') {
      haptic.light();
      return;
    }
    handleEditLayer(selectedLayer);
  }, [selectedLayer, handleEditLayer, haptic]);

  // ── Multi-select operations (extracted to useLookMultiSelect) ──────
  const {
    handleMultiDragStart,
    handleMultiDragUpdate,
    handleMultiDragCommit,
    handleOverlapCycle,
    handleMultiFront,
    handleMultiBack,
    handleMultiAlign } = useLookMultiSelect(
    page,
    selectedLayerIds,
    multiSelectMode,
    {
      updateLayersLive,
      commitMultiLayerTransform,
      bringSelectedToFront,
      sendSelectedToBack,
      toggleLayerInSelection,
      selectLayer },
    haptic,
  );

  // ── Context-sensitive tool rail (extracted to lookToolRailConfig) ──
  // The rail adapts its visible tool set based on the current selection
  // state. Tool group definitions and accessibility labels live in
  // lookToolRailConfig.ts; the screen passes its handlers and state
  // setters to buildLookToolGroups, and derives the active context via
  // deriveLookToolContext.

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
        handleEditLayer,
        handleLinkItem,
        handleTextEditAction,
        handleTextFontAction,
        handleTextColorAction,
        handleTextAlignAction,
        handleProductPriceAction,
        handleCropAction,
        handleMultiFront,
        handleMultiBack,
        handleMultiDelete,
        setShowLayers,
        setShowPreview,
        setShowSettings,
        setShowOverflow,
        setCropTarget,
        navigate: (route: string) => (navigation.navigate as (r: string) => void)(route),
        haptic }),
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
      handleEditLayer,
      handleLinkItem,
      handleTextEditAction,
      handleTextFontAction,
      handleTextColorAction,
      handleTextAlignAction,
      handleProductPriceAction,
      handleCropAction,
      handleMultiFront,
      handleMultiBack,
      handleMultiDelete,
      setShowLayers,
      setShowPreview,
      setShowSettings,
      setShowOverflow,
      haptic,
      navigation,
    ],
  );

  // ── Context overflow tools ──────────────────────────────────────────
  // Resolved from the active context's tool group — these are the
  // selection-specific actions (Effects, Cutout, Front, Back, Duplicate,
  // Delete, etc.) that belong in the "More" menu ahead of the global
  // editor tools. Each tool's `onPress` is already wired in
  // buildLookToolGroups; we wrap it to also dismiss the overflow menu.
  const contextOverflowTools = useMemo(
    () => getOverflowTools(activeToolContext, toolGroups),
    [activeToolContext, toolGroups],
  );

  // ── Layout preview rail (autoCompose) ───────────────────────────────
  // Replaces the blind "Try arrangement" cycling button. When the user
  // has 2+ media assets on the canvas, the LayoutPreviewRail shows real
  // preview thumbnails computed by autoCompose. Selecting a layout
  // commits the transforms to the current document's media layers.
  const mediaLayers = useMemo(
    () => page?.layers.filter((l) => l.type === 'media') ?? [],
    [page],
  );

  // ── Canvas listing IDs for source tray dedup (§8.3) ────────────────
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
  // committing. We store the preview layout id and revert on release.
  const [previewLayoutId, setPreviewLayoutId] = useState<LayoutId | null>(null);

  const handleLayoutPreview = useCallback((id: LayoutId) => {
    setPreviewLayoutId(id);
  }, []);

  const handleLayoutPreviewEnd = useCallback(() => {
    setPreviewLayoutId(null);
  }, []);

  // Apply preview transforms to the document without committing to
  // history. Uses updateLayer (no history entry) for a live preview.
  // NOTE: mediaLayers is intentionally excluded from the dependency array.
  // Including it would cause an infinite loop: the effect calls updateLayer
  // → document changes → page changes → mediaLayers changes (new array from
  // .filter()) → effect re-runs → updateLayer again → ...
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
      updateLayer(layer.id, transformToLayerUpdate(t));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewLayoutId, allLayouts, updateLayer, transformToLayerUpdate]);

  // ── Camera → Editor crossfade ─────────────────────────────────────
  // Per the human-flow reconstruction spec, the captured/selected media
  // should appear to stay in place while editor chrome fades in around it.
  // Both the entry (camera) and editor are mounted simultaneously during a
  // 200ms crossfade so the media reads as continuous. See
  // CreatorEntryEditorCrossfade for the transition implementation.
  const entryContent = showEntryScreen ? (
    <CreatorEntryScreen
      documentType="look"
      onDocumentTypeChange={onEntryTypeChange}
      onClose={handleEntryClose}
      onMediaSelected={handleEntryMediaSelected}
      onBlankStart={handleEntryBlankStart}
      onViewportChange={(vp) => { cameraViewportRef.current = vp; }}
      onVisualSearchCapture={(uri: string) => {
        navigation.navigate('VisualSearch', { initialImageUri: uri });
      }}
    />
  ) : null;

  const editorContent = (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Crash recovery banner ────────────────────────────────────── */}
      {/* When a pending crash journal entry is detected, show a recovery
          prompt at the top of the composer. The user can recover the
          last saved project or dismiss the prompt. */}
      {hasPendingRecovery && (
        <View style={[styles.recoveryBanner, { borderLeftColor: colors.brand, backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="alert-circle-outline" size={IconGrammar.standard} color={colors.textPrimary} />
          <Text style={[styles.recoveryText, { color: colors.textPrimary }]}>Recover draft?</Text>
          <PressScale
            onPress={() => { void recoverCrashedProject(); }}
            style={[styles.recoveryBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Recover project"
            accessibilityRole="button"
          >
            <Text style={[styles.recoveryBtnText, { color: colors.textInverse }]}>Recover</Text>
          </PressScale>
          <PressScale
            onPress={dismissRecovery}
            style={styles.recoveryDismiss}
            accessibilityLabel="Dismiss recovery prompt"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={IconGrammar.metadata} color={colors.textSecondary} />
          </PressScale>
        </View>
      )}
      {/* ── Neutral workspace canvas ─────────────────────────────────── */}
      {/* Look is spatial. The 4:5 canvas sits in a neutral dark workspace
          with breathing room. Media objects are directly manipulated. */}
      <View style={styles.canvasStage}>
        <View style={[{ position: 'absolute', top: canvasVerticalOffset, left: 0, right: 0 }, Elevation.subtle]} onLayout={handleCanvasLayout}>
          <CreatorCanvas
            document={document}
            page={page}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            mode="edit"
            selectedLayerId={selectedLayerId}
            selectedLayerIds={selectedLayerIds}
            onLayerPress={handleLayerPress}
            onCanvasPress={handleCanvasPress}
            onLayerTransformChange={(layerId, updates) => commitLayerTransform(layerId, updates, 'Transform object')}
            onLayerDoubleTap={(layerId) => {
              if (multiSelectMode) {
                handleOverlapCycle(layerId);
                return;
              }
              const l = page?.layers.find((x) => x.id === layerId);
              if (l?.type === 'text') {
                // In-place content editing — the TextInput renders AT the
                // layer's position on the canvas. The canvas stays visible.
                setEditingTextLayerId(l.id);
              }
            }}
            onLayerLongPress={(layerId) => {
              // Long-press enters multi-select mode and selects the layer.
              haptic.medium();
              setMultiSelectMode(true);
              selectLayers([layerId]);
            }}
            onMultiDragStart={handleMultiDragStart}
            onMultiDragUpdate={handleMultiDragUpdate}
            onMultiDragCommit={handleMultiDragCommit}
            onLayerDelete={removeLayer}
            onTrashZoneEnter={() => {
              // Medium haptic when the dragged layer enters the trash
              // zone — "you're about to delete" feedback.
              haptic.medium();
              haptic.warning();
            }}
            showSafeZone={showSafeZone}
            safeZoneTop={insets.top + 56}
            safeZoneBottom={insets.bottom + 120}
            manipulationActiveSV={manipulationActiveSV}
            onManipulationChange={setIsManipulating}
            isInTrashZoneSV={isInTrashZoneSV}
          />

          {/* Drag-to-trash overlay — fades in during layer drag, highlights
              when the dragged layer enters the bottom zone. Visual-only. */}
          <TrashZone
            manipulationActiveSV={manipulationActiveSV}
            isInTrashZoneSV={isInTrashZoneSV}
          />

          {/* ── In-place text content editor (Snapchat/Instagram pattern) ── */}
          {/* Renders a TextInput AT the text layer's position so the user can
              type in place while the canvas stays visible. The modal
              TextEditorSheet is reserved for advanced styling (More button). */}
          {editingTextLayerId && (() => {
            const editingTextLayer = page?.layers.find((l) => l.id === editingTextLayerId);
            if (!editingTextLayer || editingTextLayer.type !== 'text') return null;
            return (
              <InlineTextEditor
                layer={editingTextLayer}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                canvasTopOffset={canvasVerticalOffset}
                screenWidth={screenWidth}
                screenHeight={screenHeight}
                onCommit={(text) => {
                  updateLayer(editingTextLayer.id, {
                    type: 'text',
                    payload: { ...editingTextLayer.payload, text } }, 'Edit text content');
                }}
                onDismiss={() => setEditingTextLayerId(null)}
              />
            );
          })()}
        </View>

        {/* Canvas loading overlay */}
        {(isLoadingSourceLook || isLoadingDraft) && (
          <View style={styles.canvasLoadingOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={colors.textSecondary} />
          </View>
        )}

        {/* Source look error banner — minimal, one line + retry button */}
        {sourceLookError && !isLoadingSourceLook && (
          <View style={[styles.sourceLookErrorBanner, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.sourceLookErrorText, { color: colors.danger }]}>
              Couldn't load source look
            </Text>
            <Pressable
              onPress={handleRetrySourceLook}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              accessibilityLabel="Retry loading source look"
              accessibilityRole="button"
            >
              <Text style={[styles.sourceLookErrorRetry, { color: colors.danger }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {/* Canvas dim overlay — emphasises selected layers in multi-select */}
        {multiSelectMode && (
          <View style={styles.canvasDimOverlay} pointerEvents="none" />
        )}
      </View>

      {/* ── Top bar — minimal, neutral ────────────────────────────────── */}
      {/* Look uses a neutral top bar (not the full-bleed gradient scrim
          of Poster). Close · Undo · Redo on the left; Next on the right.
          During selection: Done · object label · More. */}
      <Reanimated.View style={[styles.topBarContainer, { paddingTop: insets.top }, chromeFadeStyle]} pointerEvents={isManipulating ? 'none' : 'auto'}>
        <View style={styles.topBar}>
          <View style={styles.topBarRow}>
            {multiSelectMode ? (
              <>
                <PressScale
                  onPress={exitMultiSelect}
                  style={styles.topBtn}
                  accessibilityLabel="Done"
                  accessibilityHint="Exit multi-select"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.doneText, { color: colors.textPrimary }]}>Done</Text>
                </PressScale>

                <View style={styles.topCenter}>
                  <View style={[styles.selectionCountBadge, { backgroundColor: colors.brand }]}>
                    <Text style={[styles.selectionCountText, { color: colors.textInverse }]}>
                      {selectedLayerIds.length} selected
                    </Text>
                  </View>
                </View>

                <View style={styles.topRight}>
                  <PressScale
                    onPress={() => {
                      haptic.light();
                      // Select all visible layers
                      const visible = (page?.layers ?? []).filter((l) => !l.hidden);
                      selectLayers(visible.map((l) => l.id));
                    }}
                    style={styles.topBtn}
                    accessibilityLabel="Select all"
                    accessibilityHint="Select all objects"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="checkmark-done-outline" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                </View>
              </>
            ) : selectedLayer ? (
              <>
                <PressScale
                  onPress={() => { haptic.light(); selectLayer(null); }}
                  style={styles.topBtn}
                  accessibilityLabel="Done"
                  accessibilityHint="Deselect object"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.doneText, { color: colors.textPrimary }]}>Done</Text>
                </PressScale>

                <View style={styles.topCenter} />

                <View style={styles.topRight}>
                  <PressScale
                    onPress={() => { haptic.light(); setShowOverflow(true); }}
                    style={styles.topBtn}
                    accessibilityLabel="More options"
                    accessibilityHint="Open more options"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                </View>
              </>
            ) : (
              <>
                <View style={styles.topLeftGroup}>
                  <PressScale
                    onPress={handleBack}
                    style={styles.topBtn}
                    accessibilityLabel="Close editor"
                    accessibilityHint="Close and save draft"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="close" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                  {isDirty && (
                    <View style={[styles.unsavedDot, { backgroundColor: colors.brand }]} />
                  )}
                </View>

                <View style={styles.topCenterGroup}>
                  <PressScale
                    onPress={handleUndo}
                    disabled={!canUndo}
                    style={[styles.topBtn, { opacity: canUndo ? 0.6 : 0.2 }]}
                    accessibilityLabel="Undo"
                    accessibilityHint={undoLabel ? `Undo ${undoLabel}` : 'Undo last edit'}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canUndo }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="arrow-undo" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                  <PressScale
                    onPress={handleRedo}
                    disabled={!canRedo}
                    style={[styles.topBtn, { opacity: canRedo ? 0.6 : 0.2 }]}
                    accessibilityLabel="Redo"
                    accessibilityHint={redoLabel ? `Redo ${redoLabel}` : 'Redo last edit'}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canRedo }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="arrow-redo" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                </View>

                <View style={styles.topRightGroup}>
                  <PressScale
                    onPress={() => { haptic.medium(); setShowPublish(true); }}
                    style={[styles.publishBtn, { backgroundColor: colors.brand }]}
                    accessibilityLabel="Next"
                    accessibilityHint="Review and publish"
                    scale={0.97}
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  >
                    <Text style={[styles.publishBtnText, { color: colors.textInverse }]}>Next</Text>
                  </PressScale>
                </View>
              </>
            )}
          </View>
        </View>
      </Reanimated.View>

      {/* ── Bottom surface state machine ────────────────────────────────── */}
      {/* Per spec: "One lower interaction surface at a time." Only ONE of
          the following surfaces renders at any moment. The default is
          'tools' (the ContextToolRail). Tapping Items / Layout / Effects
          swaps the surface; closing returns to 'tools'. No permanent
          rails compete with the canvas. */}

      {/* ── 'tools' surface: ContextToolRail ── */}
      {/* The rail adapts its visible tool set based on the current selection
          state. No selection → look-default (Add, Items, Text, Layout, More).
          Media selected → look-media-selected (Replace, Crop, Auto, Adjust, Effects).
          Text selected → look-text-selected (Edit, Font, Color, Align).
          Product selected → look-product-selected (Item, Tag Style, Price, Duplicate).
          Each tool's onPress calls an EXISTING handler — no new capabilities. */}
      {bottomSurface === 'tools' && (
        <Reanimated.View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }, chromeFadeStyle]} pointerEvents={isManipulating ? 'none' : 'auto'}>
          <View style={styles.bottomBar}>
            {/* ── Source tray peek strip (§8.3: source tray peeking from bottom) ── */}
            {/* A thin strip of item thumbnails above the tool rail, making
                the source tray always visible as "creative supply." Tapping
                opens the full items surface. Only shown when no layer is
                selected so it doesn't compete with selection-specific tools. */}
            {sourcePeekThumbs.length > 0 && !selectedLayerId && (
              <SourceTrayPeek
                thumbnailUris={sourcePeekThumbs}
                onPress={handleOpenItems}
              />
            )}
            <ContextToolRail
              context={activeToolContext}
              groups={toolGroups}
              onOverflowPress={() => { haptic.selection(); setShowOverflow(true); }}
              style={styles.toolRail}
            />
          </View>
        </Reanimated.View>
      )}

      {/* ── 'items' surface: Items drawer (LookSourceTray expanded) ── */}
      {/* Replaces the tools rail temporarily. Shows Closet / Listings /
          Search tabs. Tapping an item adds it to the canvas. Closing
          the drawer returns to 'tools'. The LookSourceTray's peek bar
          acts as the drawer header with a close chevron. */}
      {bottomSurface === 'items' && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={styles.bottomBar}>
              <LookSourceTray
                expanded={true}
                onToggle={handleCloseSurface}
                onAddItem={handleSourceTrayAddItem}
                onDropProduct={handleDropProduct}
                onCanvasListingIds={onCanvasListingIds}
              />
            </View>
          </View>
        </SlideUpSurface>
      )}

      {/* ── 'layout' surface: Layout panel ── */}
      {/* Layout panel — single surface using LayoutPreviewRail with real
          preview thumbnails. The legacy icon-only LookAutoLayoutBar has
          been removed: the thumbnail rail IS the style picker now, which
          is the Instagram/Canva pattern. One engine, one coordinate
          convention, one commit path. Closing the panel returns to 'tools'. */}
      {bottomSurface === 'layout' && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={styles.bottomBar}>
              <LayoutPanel
                title="Layout"
                onClose={handleCloseSurface}
                colors={colors}
              >
                {mediaLayers.length > 0 ? (
                  <LayoutPreviewRail
                    assetUris={mediaAssetUris}
                    assetFocalPoints={mediaFocalPoints}
                    layouts={allLayouts}
                    selectedId={selectedLayoutId}
                    onSelect={handleLayoutSelect}
                    onPreview={handleLayoutPreview}
                    onPreviewEnd={handleLayoutPreviewEnd}
                  />
                ) : (
                  <Text style={[styles.layoutEmptyText, { color: colors.textMuted }]}>
                    Add photos first
                  </Text>
                )}
              </LayoutPanel>
            </View>
          </View>
        </SlideUpSurface>
      )}

      {/* ── 'effects' surface: Effects panel (includes AI effects) ── */}
      {/* Replaces the tools rail temporarily. Shows the EffectPreviewRail
          (filter thumbnails), an AI Effects entry button, the AutoAdjust
          button, and the AdjustPanel (fine-tuning sliders). AI effects
          are folded in here — no separate AI destination. */}
      {bottomSurface === 'effects' && selectedMediaLayer && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={[styles.effectsSurface, { paddingBottom: insets.bottom + Space.sm, backgroundColor: colors.surface }]}>
              <View style={[styles.effectsSheetHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.effectsSheetTitle, { color: colors.textPrimary }]}>
                  Effects
                </Text>
                <PressScale
                  onPress={handleCloseSurface}
                  style={styles.effectsSheetDone}
                  accessibilityLabel="Done"
                  accessibilityHint="Close effects panel"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.effectsSheetDoneText, { color: colors.brand }]}>
                    Done
                  </Text>
                </PressScale>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
              style={styles.effectsSheetScroll}
            >
              <EffectPreviewRail
                sourceUri={effectsSourceUri}
                presets={FILTER_PRESETS}
                selectedId={selectedFilterId}
                onSelect={handleEffectFilterSelect}
                intensity={filterAmount}
                onIntensityChange={handleEffectIntensityChange}
                onIntensityCommit={handleEffectIntensityCommit}
              />
              {/* ── AI Effects entry (folded under Effects) ── */}
              {/* Opens the AIEffectBrowserSheet from within the effects
                  panel. AI effects are not a separate destination — they
                  live inside the effects surface. */}
              <PressScale
                onPress={() => { haptic.medium(); setShowAIEffects(true); }}
                style={[styles.aiEffectsBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                accessibilityLabel="AI Effects"
                accessibilityHint="Browse photo effects"
                scale={0.97}
              >
                <Ionicons name="bulb-outline" size={IconGrammar.metadata} color={colors.textPrimary} />
                <Text style={[styles.aiEffectsBtnText, { color: colors.textPrimary }]}>
                  AI Styles
                </Text>
                <Ionicons name="chevron-forward" size={IconGrammar.metadata} color={colors.textMuted} />
              </PressScale>
              <View style={[styles.effectsAdjustWrap, { borderTopColor: colors.border }]}>
                <View style={styles.effectsAutoRow}>
                  <AutoAdjustButton
                    isActive={autoAdjustActive}
                    onApply={handleAutoAdjust}
                  />
                </View>
                <AdjustPanel
                  values={currentAdjustments}
                  onChange={handleEffectAdjustChange}
                  onCommit={handleEffectAdjustCommit}
                  onReset={handleEffectReset}
                />
              </View>
            </ScrollView>
          </View>
        </View>
        </SlideUpSurface>
      )}

      {/* ── 'effects' surface empty state ── */}
      {/* When the user opens Effects without a media layer selected, show a
          minimal prompt instead of the full effects panel. */}
      {bottomSurface === 'effects' && !selectedMediaLayer && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={[styles.effectsSurface, { paddingBottom: insets.bottom + Space.sm, backgroundColor: colors.surface }]}>
              <View style={[styles.effectsSheetHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.effectsSheetTitle, { color: colors.textPrimary }]}>
                  Effects
                </Text>
                <PressScale
                  onPress={handleCloseSurface}
                  style={styles.effectsSheetDone}
                  accessibilityLabel="Done"
                  accessibilityHint="Close effects panel"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.effectsSheetDoneText, { color: colors.brand }]}>
                    Done
                  </Text>
                </PressScale>
              </View>
              <View style={styles.effectsEmptyState}>
                <Text style={[styles.effectsEmptyText, { color: colors.textMuted }]}>
                  Select a photo
                </Text>
              </View>
            </View>
          </View>
        </SlideUpSurface>
      )}

      {/* ── Overflow menu (context tools + global tools) ───────────────── */}
      {/* Context-specific overflow tools (Effects, Cutout, Front, Back,
          Duplicate, Delete, etc.) appear first, followed by a hairline
          separator, then the global editor tools (Layers, Background,
          Preview, Drafts, Accessibility, Safe Zone, Settings, Help). */}
      {showOverflow && (
        <View style={[styles.overflowContainer, { top: insets.top + 48 }]}>
          <View style={[styles.overflowMenu, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {/* ── Context-specific overflow tools ── */}
            {contextOverflowTools.map((tool) => (
              <OverflowItem
                key={tool.id}
                icon={tool.icon}
                glyph={tool.glyph}
                label={tool.label}
                disabled={tool.disabled}
                colors={colors}
                onPress={() => { tool.onPress(); setShowOverflow(false); }}
              />
            ))}
            {/* ── Hairline separator ── */}
            {contextOverflowTools.length > 0 && (
              <View style={[styles.overflowSectionDivider, { backgroundColor: colors.border }]} />
            )}
            {/* ── Global editor tools ── */}
            <OverflowItem
              icon="layers-outline"
              label="Layers"
              onPress={() => { setShowLayers(true); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon="color-palette-outline"
              label="Background"
              onPress={() => { setShowBackground(true); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon="eye-outline"
              label="Preview"
              onPress={() => { setShowPreview(true); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon="document-outline"
              label="Drafts"
              onPress={() => { navigation.navigate('CreatorDraftList'); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon="accessibility-outline"
              label="Move"
              onPress={() => { setShowA11yMove(true); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon="accessibility-outline"
              label="Arrange"
              onPress={() => { setShowA11yZOrder(true); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon={showSafeZone ? 'scan-circle-outline' : 'scan-outline'}
              label={showSafeZone ? 'Safe Area On' : 'Safe Area'}
              onPress={() => { setShowSafeZone(!showSafeZone); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon="settings-outline"
              label="Settings"
              onPress={() => { setShowSettings(true); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon="help-circle-outline"
              label="Help"
              onPress={() => { setShowHelp(true); setShowOverflow(false); }}
              colors={colors}
            />
          </View>
          <Pressable style={styles.overflowBackdrop} onPress={() => setShowOverflow(false)} />
        </View>
      )}

      {/* ── Sheets ────────────────────────────────────────────────────── */}
      {state.mode.type === 'previewing' && (
        <CreatorPreviewOverlay
          visible={true}
          onClose={() => setShowPreview(false)}
          onPublish={() => {
            setShowPreview(false);
            setShowPublish(true);
          }}
        />
      )}
      <CreatorLayersSheet visible={state.mode.type === 'arrangingLayers'} onClose={() => setShowLayers(false)} />
      <CreatorPublishSheet visible={state.mode.type === 'publishing'} onClose={() => setShowPublish(false)} editingLookId={editingLookId ?? undefined} />
      <CreatorSettingsSheet visible={state.mode.type === 'settings'} onClose={() => setShowSettings(false)} />
      <HelpShortcutsSheet visible={state.mode.type === 'help'} onClose={() => setShowHelp(false)} />
      {/* ── Background picker sheet ─────────────────────────────────── */}
      {/* Bottom sheet for picking the canvas background (solid, gradient,
          blurred photo, or image). On confirm, commits the selected
          background to document.canvas.background via updateCanvas. */}
      <BackgroundSheet
        visible={state.mode.type === 'background'}
        currentBackground={document.canvas.background}
        mediaLayers={mediaLayers}
        onConfirm={(bg: CreatorBackground) => {
          updateCanvas({ background: bg });
          setShowBackground(false);
        }}
        onClose={() => setShowBackground(false)}
      />
      {/* ── AI Effects browser sheet ──────────────────────────────────── */}
      {/* Bottom sheet for browsing and applying photo effects from
          the AIEffectRegistry. Each effect is a composed stack of real
          Skia render nodes. When applied, the effect is stored as a
          filter node in the selected media layer's effect stack. */}
      <AIEffectBrowserSheet
        visible={state.mode.type === 'aiEffects'}
        initialEffectId={activeAIEffectId}
        sourceImageUri={effectsSourceUri}
        onApply={handleAIEffectApply}
        onRemove={handleAIEffectRemove}
        onClose={() => setShowAIEffects(false)}
      />
      {/* ── Accessibility sheets (drag alternatives) ─────────────────── */}
      {/* Per spec 09: keyboard/button-based alternatives for users who
          cannot perform drag gestures. onMove wires to updateLayer;
          onReorder wires to reorderLayer. */}
      <AccessibilityMoveSheet
        visible={state.mode.type === 'a11yMove'}
        layerId={selectedLayerId}
        position={selectedLayer ? { x: selectedLayer.x, y: selectedLayer.y } : null}
        onClose={() => setShowA11yMove(false)}
        onMove={(x, y) => {
          if (selectedLayerId) updateLayer(selectedLayerId, { x, y }, 'Move object');
        }}
      />
      <AccessibilityZOrderSheet
        visible={state.mode.type === 'a11yZOrder'}
        layers={(page?.layers ?? []).map((l) => ({
          id: l.id,
          label: layerTypeLabel(l.type, 'look'),
          zIndex: l.zIndex })) as ZOrderLayer[]}
        selectedLayerId={selectedLayerId}
        onClose={() => setShowA11yZOrder(false)}
        onReorder={(layerId, direction) => reorderLayer(layerId, direction)}
      />
      <CreatorTemplateBrowser
        visible={state.mode.type === 'choosingTemplate'}
        documentType="look"
        hasExistingWork={document.pages.some((p) => p.layers.length > 0)}
        onClose={() => setShowTemplates(false)}
        onApply={(template: CreatorTemplate) => {
          const doc = template.build();
          setDocument(doc);
        }}
      />
      {/* In-canvas crop overlay — non-destructive crop handles rendered
          directly over the canvas (spec 07 §6, spec 04 §1). The
          composition remains visible while the user adjusts the crop. */}
      {/* Crop sheet — legacy fallback for aspect-ratio crop (kept as
          fallback per spec — not removed). */}
      {cropTarget && cropTarget.type === 'media' && (
        <CreatorCropSheet
          visible={!!cropTarget}
          imageUri={cropTarget.payload.mediaUri}
          focalPoint={cropTarget.payload.focalPoint}
          onFocalPointChange={(point) => {
            if (cropTarget && cropTarget.type === 'media') {
              updateLayer(cropTarget.id, {
                type: 'media',
                payload: {
                  ...cropTarget.payload,
                  focalPoint: point } });
            }
          }}
          onClose={() => setCropTarget(null)}
          onCropComplete={(newUri) => {
            if (cropTarget && cropTarget.type === 'media') {
              updateLayer(cropTarget.id, {
                type: 'media',
                payload: {
                  ...cropTarget.payload,
                  mediaUri: newUri,
                  mediaFinalizationId: undefined,
                  mediaAssetId: undefined } });
            }
            setCropTarget(null);
          }}
        />
      )}
      {/* Crop sheet — manual rectangular cropping as a real visual operation.
          Per spec 10: if high-quality removal is unavailable, keep the
          original media rectangle. NEVER pretend a cutout succeeded.
          The CreatorCutoutSheet handles this truthfully — it only calls
          onCutoutComplete with a real result URI. */}
      {cutoutTarget && cutoutTarget.type === 'media' && (
        <CreatorCutoutSheet
          visible={!!cutoutTarget}
          imageUri={cutoutTarget.payload.mediaUri}
          onClose={() => setCutoutTarget(null)}
          onCutoutComplete={(newUri) => {
            if (cutoutTarget && cutoutTarget.type === 'media') {
              // Replace the media layer's URI with the crop result.
              // The crop sheet only calls this with a real processed URI.
              updateLayer(cutoutTarget.id, {
                type: 'media',
                payload: {
                  ...cutoutTarget.payload,
                  mediaUri: newUri,
                  contentFit: 'contain' } });
            }
            setCutoutTarget(null);
          }}
        />
      )}
      {/* True cutout preview sheet — native subject segmentation.
          Opens when the user taps "Cutout" and the native backend is
          available. Shows a before/after preview over a checkerboard.
          On confirm, replaces the media URI with the transparent PNG
          and stores the alpha mask reference on the layer. */}
      {cutoutPreviewTarget && cutoutPreviewTarget.type === 'media' && (
        <CutoutPreviewSheet
          visible={!!cutoutPreviewTarget}
          imageUri={cutoutPreviewTarget.payload.mediaUri}
          onClose={() => setCutoutPreviewTarget(null)}
          onConfirm={(result: CutoutResult) => {
            if (cutoutPreviewTarget && cutoutPreviewTarget.type === 'media') {
              // Replace the media layer's URI with the transparent PNG
              // result. Store the maskRef id on the layer so the render
              // pipeline can composite with the alpha mask (spec 07 §7).
              updateLayer(cutoutPreviewTarget.id, {
                type: 'media',
                payload: {
                  ...cutoutPreviewTarget.payload,
                  mediaUri: result.uri,
                  contentFit: 'contain' },
                maskRef: result.maskRef?.uri }, 'Apply cutout');
            }
            setCutoutPreviewTarget(null);
          }}
        />
      )}
      {/* ── Text color picker sheet ──────────────────────────────────── */}
      {showTextColorPicker && selectedLayer && selectedLayer.type === 'text' && (
        <CreatorColorPicker
          color={selectedLayer.payload.fill ?? fromHexString(selectedLayer.payload.textColor ?? '#ffffff') ?? { space: 'srgb', r: 1, g: 1, b: 1, a: 1 }}
          onChange={(c: CreatorColor) => {
            updateLayer(selectedLayer.id, {
              type: 'text',
              payload: {
                ...selectedLayer.payload,
                fill: c,
                textColor: toHexString(c),
              },
            }, 'Change text color');
          }}
          onCommit={(c: CreatorColor) => {
            updateLayer(selectedLayer.id, {
              type: 'text',
              payload: {
                ...selectedLayer.payload,
                fill: c,
                textColor: toHexString(c),
              },
            }, 'Change text color');
            commitRecentColor(c);
            haptic.light();
          }}
          mode="expanded"
          recents={colorRecents}
          onCommitRecent={commitRecentColor}
          accessibilityLabel="Text color picker"
        />
      )}
      <CreatorAssetPicker
        visible={pickerMode !== null}
        mode={pickerMode ?? 'media'}
        editingLayer={editingLayer}
        backgroundUri={backgroundMediaUri}
        onClose={() => { setPickerMode(null); setEditingLayer(null); }}
        onAddLayer={(layer) => {
          if (editingLayer) {
            // Editing existing layer — for media, use swapLookAsset to
            // preserve position (stable position when replacing media
            // per spec 10). For other types, update in place.
            if (editingLayer.type === 'media' && layer.type === 'media') {
              swapLookAsset(editingLayer.id, {
                mediaUri: layer.payload.mediaUri,
                mediaType: layer.payload.mediaType,
                contentFit: layer.payload.contentFit });
            } else if (editingLayer.type === 'product' && layer.type === 'product') {
              // Link/change item — update the product layer in place
              updateLayer(editingLayer.id, layer, 'Change item');
            } else {
              updateLayer(editingLayer.id, layer, 'Edit object');
            }
          } else {
            addLayer(layer);
          }
        }}
      />
      {confirmSheet.visible && (
        <ConfirmationSheet
          visible={true}
          onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
          title={confirmSheet.title}
          message={confirmSheet.message}
          confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
          variant={confirmSheet.variant ?? 'default'}
          onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
        />
      )}
    </View>
  );

  return (
    <CreatorEntryEditorCrossfade
      showEntry={showEntryScreen}
      entryElement={entryContent}
      editorElement={editorContent}
      pinnedMediaUri={entryPinnedUri}
      pinnedMediaKind={entryPinnedKind}
      pinnedMediaDestination={entryPinnedDestination}
      sourceContentTransform={entrySourceTransform}
      destinationContentTransform={entryPinnedDestination ? {
        frame: entryPinnedDestination } : null}
    />
  );
}

// ── LayoutPanel — bottom surface for layout selection ─────────────────
// A panel with a header (title + Done button) that wraps the
// LookAutoLayoutBar and LayoutPreviewRail. Replaces the ContextToolRail
// temporarily when the user taps "Layout".
const LayoutPanel = React.memo(function LayoutPanel({
  title,
  onClose,
  colors,
  children }: {
  title?: string;
  onClose: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.layoutPanel}>
      <View style={[styles.effectsSheetHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.effectsSheetTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
        <PressScale
          onPress={onClose}
          style={styles.effectsSheetDone}
          accessibilityLabel="Done"
          accessibilityHint="Close layout panel"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.effectsSheetDoneText, { color: colors.brand }]}>
            Done
          </Text>
        </PressScale>
      </View>
      <View style={styles.layoutPanelContent}>
        {children}
      </View>
    </View>
  );
});

// ── Screen — wraps in CreatorProvider (shared state) ────────────────
// This is the full screen with CreatorProvider. It is used by the
// CreatorStudioScreen wrapper in CreatorStudioShell which branches on
// document type. The wrapper there passes route params to this component.
export function LookComposerScreen(props: {
  draftId?: string;
  templateId?: string;
  sourceDocumentId?: string;
  initialMediaUri?: string;
  initialMedia?: CreatorInitialMedia[];
  startBlank?: boolean;
  openTemplates?: boolean;
  onEntryTypeChange: (type: 'look' | 'poster') => void;
}) {
  // Lazy import to avoid circular dependency at module load time
  const { CreatorProvider } = require('../CreatorContext');
  return (
    <CreatorProvider
      initialType="look"
      draftId={props.draftId}
      templateId={props.templateId}
      sourceDocumentId={props.sourceDocumentId}
      initialMediaUri={props.initialMediaUri}
      initialMedia={props.initialMedia}
    >
      <LookComposerInner onEntryTypeChange={props.onEntryTypeChange} />
    </CreatorProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  // ── Crash recovery banner (inline notification, not a card) ──
  // Calm but noticeable: soft tinted background + left accent bar gives the
  // banner proper visual hierarchy (accent → text → action) without heavy chrome.
  recoveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    paddingTop: 50,
    borderLeftWidth: 3 },
  recoveryText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    marginLeft: 8 },
  recoveryBtn: {
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 6 },
  recoveryBtnText: {
    fontSize: TypographyV2.body.size,
    fontWeight: '600' },
  recoveryDismiss: {
    padding: 8,
    marginLeft: 4 },
  // ── Canvas stage ──
  canvasStage: {
    ...StyleSheet.absoluteFill },
  // ── Top bar ──
  topBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100 },
  topBar: {
    height: 52,
    paddingHorizontal: Space.sm },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RadiusRoleValue.pillAvatar },
  topCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center' },
  doneText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  topCenterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flex: 1,
    justifyContent: 'center' },
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  publishBtn: {
    height: 36,
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center' },
  publishBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  unsavedDot: {
    width: 7,
    height: 7,
    borderRadius: RadiusRoleValue.pillAvatar,
    marginLeft: -Space.xs,
    marginTop: Space.xs + 2 },
  // ── Canvas loading overlay ──
  canvasLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50 },
  // ── Source look error banner ──
  sourceLookErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginHorizontal: Space.md,
    borderRadius: Radius.md,
    zIndex: 50 },
  sourceLookErrorText: {
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontWeight: TypographyV2.body.weight },
  sourceLookErrorRetry: {
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontWeight: TypographyV2.bodyStrong.weight },
  // ── AI Effects button (inline button, not a card) ──
  // Premium button: subtle tinted fill + refined hairline border + radius.
  aiEffectsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginTop: Space.sm,
    minHeight: Control.hit,
    borderWidth: Stroke.standard,
    borderRadius: Radius.md },
  aiEffectsBtnText: {
    flex: 1,
    fontSize: FontSize.body,
    fontFamily: FontFamily.semibold },
  // ── Bottom surface container (shared by all surfaces) ──
  bottomBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100 },
  bottomBar: {
    paddingVertical: Space.xs },
  toolRail: {
    flex: 1 },
  // ── Layout panel ──
  layoutPanel: {
    maxHeight: '70%' },
  layoutPanelContent: {
    paddingVertical: Space.sm },
  layoutEmptyText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    textAlign: 'center',
    paddingVertical: Space.lg,
    paddingHorizontal: Space.md },
  // ── Effects surface ──
  effectsSurface: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
    overflow: 'hidden' },
  // ── Overflow menu ──
  overflowContainer: {
    position: 'absolute',
    right: Space.sm,
    zIndex: 120 },
  overflowMenu: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.xs,
    minWidth: 180,
    overflow: 'hidden' },
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: -1 },
  overflowSectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xs,
    marginHorizontal: Space.sm },
  // ── Effects surface (shared header styles) ──
  effectsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth },
  effectsSheetTitle: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size },
  effectsSheetDone: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end' },
  effectsSheetDoneText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size },
  effectsSheetScroll: {
    paddingVertical: Space.sm },
  effectsEmptyState: {
    paddingVertical: Space.xl * 2,
    alignItems: 'center' },
  effectsEmptyText: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size },
  effectsAdjustWrap: {
    marginTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.xs },
  effectsAutoRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  // ── Multi-select ──
  selectionCountBadge: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar },
  selectionCountText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size },
  canvasDimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 35 } });
