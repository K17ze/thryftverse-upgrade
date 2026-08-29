import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Keyboard,
  useWindowDimensions,
  LayoutChangeEvent,
  ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, runOnJS, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Space, Radius, Typography, FontFamily, FontSize, Control, IconGrammar, EditorMaterial, EditorRadius, GlyphShadow, Scrim, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../theme/ThemeContext';
import { BlurView } from 'expo-blur';
import { makeStableId } from '../../utils/createStableId';
import { useCreator } from '../CreatorContext';
import type { CreatorInitialMedia } from '../../navigation/types';
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
import { LayoutPreviewRail } from './layout/LayoutPreviewRail';
import { autoCompose } from './layout/autoCompose';
import type { AssetTransform, LayoutPreview, LayoutId } from './layout/layoutTypes';
import { LookAutoLayoutBar } from './LookAutoLayoutBar';
import { autoLayout, type LayoutStyle } from './LookAutoLayout';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';
import { fetchLookByIdFromApi } from '../../services/looksApi';
import { lookToDocument } from '../viewerAdapters';
import type { CreatorTemplate } from '../templates';
import { useLookEffects } from './useLookEffects';
import { useBackendData } from '../../context/BackendDataContext';
import { useLookMultiSelect } from './useLookMultiSelect';
import { deriveLookToolContext, buildLookToolGroups } from './lookToolRailConfig';

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

// ── SlideUpSurface — wraps a bottom surface with a slide-up entrance ──
// Per spec: "Reanimated for surface transitions (slide in/out)." Each
// bottom surface (items, layout, effects) slides up from below when it
// mounts. Under reduced motion, the transition is instant.
function SlideUpSurface({ children }: { children: React.ReactNode }) {
  const motionConfig = useMotionConfig();
  const translateY = useSharedValue(1);
  useEffect(() => {
    if (motionConfig.isReducedMotion) {
      translateY.value = 0;
    } else {
      translateY.value = withSpring(0, motionConfig.spring.entrance);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value * 300 }] }));
  return <Reanimated.View style={animStyle}>{children}</Reanimated.View>;
}

function LookComposerInner({ onEntryTypeChange }: { onEntryTypeChange: (type: 'look' | 'poster') => void }) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
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
    undo,
    redo,
    isDirty,
    removeLayer,
    duplicateLayer,
    reorderLayer,
    updateLayer,
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

  // ── Sheet / overlay state ──────────────────────────────────────────
  const [showLayers, setShowLayers] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);
  // ── In-place text content editing (Snapchat/Instagram pattern) ──────
  // When set, an InlineTextEditor renders AT the text layer's position on
  // the canvas so the user can type in place. The bottom contextual rail
  // remains the single styling surface for the selected text layer.
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(Boolean(route.params?.openTemplates));
  const [showOverflow, setShowOverflow] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showBackground, setShowBackground] = useState(false);
  const [entryComplete, setEntryComplete] = useState(Boolean(route.params?.startBlank));
  const [cropTarget, setCropTarget] = useState<CreatorLayer | null>(null);
  const [cutoutTarget, setCutoutTarget] = useState<CreatorLayer | null>(null);
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
  // ── Bottom surface state machine ───────────────────────────────────
  // Controls which bottom surface is visible. Only ONE renders at a time.
  // 'tools' = ContextToolRail (default). 'items' = Items drawer.
  // 'layout' = Layout panel. 'effects' = Effects panel (incl. AI effects).
  const [bottomSurface, setBottomSurface] = useState<BottomSurface>('tools');
  const [showAIEffects, setShowAIEffects] = useState(false);
  const [autoLayoutId, setAutoLayoutId] = useState<LayoutStyle | null>(null);
  const [showA11yMove, setShowA11yMove] = useState(false);
  const [showA11yZOrder, setShowA11yZOrder] = useState(false);
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
  // the tool rail in multi-select mode.
  const [showAlignPicker, setShowAlignPicker] = useState(false);
  // ── Canvas layout ref for drag-to-canvas coordinate conversion ──
  // Stores the canvas container's screen-space position so drag-to-canvas
  // drop coordinates can be converted to normalized (0–1) canvas coordinates.
  const canvasLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const handleCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    canvasLayoutRef.current = e.nativeEvent.layout;
  }, []);

  const sourceDocumentId = route.params?.sourceDocumentId as string | undefined;
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
    fetchLookByIdFromApi(sourceDocumentId)
      .then((res) => {
        if (cancelled || !res.ok || !res.look) return;
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
        // Not a published look — the remix path in CreatorContext handles
        // local-draft sourceDocumentIds. Nothing to do here.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSourceLook(false);
      });
    return () => { cancelled = true; };
  }, [sourceDocumentId, sourceMode, route.params?.draftId, route.params?.templateId, setDocument]);

  // Show entry screen when document is empty and not loading
  const hasContent = document.pages.some((p) => p.layers.length > 0);
  const showEntryScreen = !entryComplete && !hasContent && !isLoadingDraft && !isLoadingSourceLook;

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
    deleteMultiSelected();
    setMultiSelectMode(false);
  }, [deleteMultiSelected, haptic]);

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
        if (editingTextLayerId) setEditingTextLayerId(null);
        else if (showHelp) setShowHelp(false);
        else if (showAIEffects) setShowAIEffects(false);
        else if (bottomSurface !== 'tools') setBottomSurface('tools');
        else if (showA11yMove) setShowA11yMove(false);
        else if (showA11yZOrder) setShowA11yZOrder(false);
        else if (cropTarget) setCropTarget(null);
        else if (cutoutTarget) setCutoutTarget(null);
        else if (cutoutPreviewTarget) setCutoutPreviewTarget(null);
        else if (showPreview) setShowPreview(false);
        else if (showBackground) setShowBackground(false);
        else if (showSafeZone) setShowSafeZone(false);
        else if (showOverflow) setShowOverflow(false);
        else if (showPublish) setShowPublish(false);
        else if (showTemplates) setShowTemplates(false);
        else if (showLayers) setShowLayers(false);
        else if (showSettings) setShowSettings(false);
        else if (pickerMode) { setPickerMode(null); setEditingLayer(null); }
        else if (showAlignPicker) setShowAlignPicker(false);
        else if (multiSelectMode) exitMultiSelect();
        else if (selectedLayerId) selectLayer(null);
        else handleBack();
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
  }, [canUndo, canRedo, undo, redo, editingTextLayerId, showHelp, showAIEffects, bottomSurface, showA11yMove, showA11yZOrder, cropTarget, cutoutTarget, cutoutPreviewTarget, showPreview, showBackground, showSafeZone, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, showAlignPicker, multiSelectMode, selectedLayerIds, exitMultiSelect, handleMultiDelete, selectedLayerId, selectLayer, removeLayer, handleBack]);

  // Hardware back button — intercept to close sheets first
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (editingTextLayerId) { setEditingTextLayerId(null); return true; }
        if (showHelp) { setShowHelp(false); return true; }
        if (showAIEffects) { setShowAIEffects(false); return true; }
        if (bottomSurface !== 'tools') { setBottomSurface('tools'); return true; }
        if (showA11yMove) { setShowA11yMove(false); return true; }
        if (showA11yZOrder) { setShowA11yZOrder(false); return true; }
        if (cropTarget) { setCropTarget(null); return true; }
        if (cutoutTarget) { setCutoutTarget(null); return true; }
        if (cutoutPreviewTarget) { setCutoutPreviewTarget(null); return true; }
        if (showPreview) { setShowPreview(false); return true; }
        if (showBackground) { setShowBackground(false); return true; }
        if (showSafeZone) { setShowSafeZone(false); return true; }
        if (showOverflow) { setShowOverflow(false); return true; }
        if (showPublish) { setShowPublish(false); return true; }
        if (showTemplates) { setShowTemplates(false); return true; }
        if (showLayers) { setShowLayers(false); return true; }
        if (showSettings) { setShowSettings(false); return true; }
        if (pickerMode) { setPickerMode(null); setEditingLayer(null); return true; }
        if (showAlignPicker) { setShowAlignPicker(false); return true; }
        if (multiSelectMode) { exitMultiSelect(); return true; }
        if (selectedLayerId) { selectLayer(null); return true; }
        return false;
      };
      return onBackPress;
    }, [editingTextLayerId, showHelp, showAIEffects, bottomSurface, showA11yMove, showA11yZOrder, cropTarget, cutoutTarget, cutoutPreviewTarget, showPreview, showBackground, showSafeZone, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, showAlignPicker, multiSelectMode, exitMultiSelect, selectedLayerId, selectLayer])
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
  const chromeFadeStyle = useAnimatedStyle(() => ({
    opacity: withSpring(manipulationActiveSV.value === 1 ? 0.15 : 1, { damping: 20, stiffness: 200 }) }));

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
    haptic.medium();
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
    handleEffectFilterSelect,
    handleEffectAdjustChange,
    handleEffectReset,
    autoAdjustActive,
    handleAutoAdjust,
    handleAIEffectApply,
    handleAIEffectRemove } = useLookEffects(selectedLayer, updateLayer);

  // ── Auto layout bar (LookAutoLayoutBar) ─────────────────────────────
  // handleAutoLayoutSelect is declared below, after `mediaLayers` is
  // defined (it depends on mediaLayers in its body + dependency array).

  // ── Text editing actions ────────────────────────────────────────────
  const handleTextEditAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    handleEditLayer(selectedLayer);
  }, [selectedLayer, handleEditLayer, haptic]);

  const handleTextFontAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    handleEditLayer(selectedLayer);
  }, [selectedLayer, handleEditLayer, haptic]);

  const handleTextColorAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    handleEditLayer(selectedLayer);
  }, [selectedLayer, handleEditLayer, haptic]);

  const handleTextAlignAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    handleEditLayer(selectedLayer);
  }, [selectedLayer, handleEditLayer, haptic]);

  // ── Product tag actions ─────────────────────────────────────────────
  const handleProductPriceAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'product') {
      haptic.light();
      return;
    }
    handleLinkItem(selectedLayer);
  }, [selectedLayer, handleLinkItem, haptic]);

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
        setShowAlignPicker,
        setCropTarget,
        navigate: (route: string) => navigation.navigate(route),
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

  // ── Auto layout bar (LookAutoLayoutBar) ─────────────────────────────
  // When a layout is selected from the LookAutoLayoutBar, call autoLayout
  // with the current media layers and canvas size, then commit the new
  // transforms to the composition. Each layout application is a single
  // history entry per layer (matching the LayoutPreviewRail behavior).
  // Declared here (after mediaLayers) to avoid use-before-declaration.
  const handleAutoLayoutSelect = useCallback((layoutId: LayoutStyle) => {
    if (mediaLayers.length === 0) return;
    const arranged = autoLayout(mediaLayers, { width: canvasWidth, height: canvasHeight }, layoutId);
    arranged.forEach((layer) => {
      // Pass isAutoLayout: true so commitLayerTransform does NOT set
      // manuallyPositioned. Auto-layout is an editable starting proposal,
      // not a manual edit (§8.3). Layers the user has already manually
      // positioned are skipped by autoLayout itself.
      commitLayerTransform(layer.id, {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        zIndex: layer.zIndex,
        scale: layer.scale }, `Apply ${layoutId} layout`, true);
    });
    setAutoLayoutId(layoutId);
  }, [mediaLayers, canvasWidth, canvasHeight, commitLayerTransform]);

  const mediaAssetUris = useMemo(
    () => mediaLayers.map((l) => l.type === 'media' ? l.payload.mediaUri : '').filter(Boolean),
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
  useEffect(() => {
    if (previewLayoutId === null) return;
    const layout = allLayouts.find((l) => l.id === previewLayoutId);
    if (!layout) return;
    mediaLayers.forEach((layer, i) => {
      const t = layout.transforms[i];
      if (!t) return;
      updateLayer(layer.id, transformToLayerUpdate(t));
    });
  }, [previewLayoutId, allLayouts, mediaLayers, updateLayer, transformToLayerUpdate]);

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
        <View style={[styles.recoveryBanner, { borderLeftColor: colors.antiqueGold }]}>
          <Ionicons name="alert-circle-outline" size={IconGrammar.standard} color={colors.textPrimary} />
          <Text style={[styles.recoveryText, { color: colors.scrimTextPrimary }]}>Recover your last unsaved project?</Text>
          <PressScale
            onPress={() => { void recoverCrashedProject(); }}
            style={styles.recoveryBtn}
            accessibilityLabel="Recover project"
            accessibilityRole="button"
          >
            <Text style={[styles.recoveryBtnText, { color: colors.antiqueGold }]}>Recover</Text>
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
        <View style={{ position: 'absolute', top: canvasVerticalOffset, left: 0, right: 0 }} onLayout={handleCanvasLayout}>
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
                    payload: { ...editingTextLayer.payload, text } } as Partial<CreatorLayer>, 'Edit text content');
                }}
                onDismiss={() => setEditingTextLayerId(null)}
              />
            );
          })()}
        </View>

        {/* Canvas loading overlay */}
        {(isLoadingSourceLook || isLoadingDraft) && (
          <View style={styles.canvasLoadingOverlay} pointerEvents="none">
            <View style={styles.canvasLoadingPill}>
              {/* Glass plate material — translucent blur over media canvas */}
              <BlurView intensity={EditorMaterial.plate.blurIntensity} tint={EditorMaterial.plate.tint} style={[StyleSheet.absoluteFill, { borderRadius: RadiusRoleValue.pillAvatar }]} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.plate.overlay, borderRadius: RadiusRoleValue.pillAvatar }]} />
              <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
              <Text style={[styles.canvasLoadingText, { color: colors.scrimTextPrimary }]}>Loading…</Text>
            </View>
          </View>
        )}

        {/* Empty canvas hint — capture-first CTA */}
        {!hasContent && !isLoadingSourceLook && !isLoadingDraft && entryComplete && !selectedLayer && (
          <View style={styles.canvasEmptyHint}>
            <PressScale
              onPress={() => { haptic.light(); setPickerMode('media'); }}
              style={styles.canvasEmptyCta}
              accessibilityLabel="Add photos"
              accessibilityHint="Opens the media picker to add photos to your look"
              accessibilityRole="button"
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <Ionicons name="images-outline" size={IconGrammar.hero} color={colors.scrimTextSecondary} />
              <Text style={[styles.canvasEmptyHintTitle, { color: colors.scrimTextTertiary }]}>Add photos to start</Text>
            </PressScale>
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
        <LinearGradient
          colors={Scrim.top.colors}
          locations={Scrim.top.locations}
          style={styles.topBarScrim}
          pointerEvents="none"
        />
        <View style={styles.topBar}>
          <View style={styles.topBarRow}>
            {multiSelectMode ? (
              <>
                <PressScale
                  onPress={exitMultiSelect}
                  style={styles.topBtn}
                  accessibilityLabel="Done"
                  accessibilityHint="Exits multi-select mode"
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
                    accessibilityHint="Selects all objects on the canvas"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="checkmark-done-outline" size={IconGrammar.hero} color={colors.textPrimary} />
                  </PressScale>
                </View>
              </>
            ) : selectedLayer ? (
              <>
                <PressScale
                  onPress={() => { haptic.light(); selectLayer(null); }}
                  style={styles.topBtn}
                  accessibilityLabel="Done"
                  accessibilityHint="Deselects the current object and exits selection mode"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.doneText, { color: colors.textPrimary }]}>Done</Text>
                </PressScale>

                <View style={styles.topCenter}>
                  <Text style={[styles.titleText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {layerTypeLabel(selectedLayer.type, 'look')}
                  </Text>
                </View>

                <View style={styles.topRight}>
                  <PressScale
                    onPress={() => { haptic.light(); setShowOverflow(true); }}
                    style={styles.topBtn}
                    accessibilityLabel="More options"
                    accessibilityHint="Opens layers, preview, drafts and settings"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={IconGrammar.hero} color={colors.textPrimary} />
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
                    accessibilityHint="Closes the composer, offers to save draft if there are unsaved changes"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="close" size={IconGrammar.hero} color={colors.textPrimary} />
                  </PressScale>
                  {isDirty && (
                    <View style={[styles.unsavedDot, { backgroundColor: colors.brand }]} />
                  )}
                </View>

                <View style={styles.topCenterGroup}>
                  <PressScale
                    onPress={handleUndo}
                    disabled={!canUndo}
                    style={[styles.topBtn, { opacity: canUndo ? 1 : 0.3 }]}
                    accessibilityLabel="Undo"
                    accessibilityHint="Reverts the last edit"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canUndo }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="arrow-undo" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                  <PressScale
                    onPress={handleRedo}
                    disabled={!canRedo}
                    style={[styles.topBtn, { opacity: canRedo ? 1 : 0.3 }]}
                    accessibilityLabel="Redo"
                    accessibilityHint="Reapplies the last undone edit"
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
                    accessibilityHint="Opens the publish sheet to review and publish your look"
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
          <LinearGradient
            colors={Scrim.bottom.colors}
            locations={Scrim.bottom.locations}
            style={styles.bottomBarScrim}
            pointerEvents="none"
          />
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
      {/* Replaces the tools rail temporarily. Shows the LookAutoLayoutBar
          (one-tap layout styles) and, when there are 2+ media assets,
          the LayoutPreviewRail (real preview thumbnails). Closing the
          panel returns to 'tools'. */}
      {bottomSurface === 'layout' && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={styles.bottomBar}>
              <LayoutPanel
                title="Layout"
                onClose={handleCloseSurface}
                colors={colors}
              >
                {mediaLayers.length > 0 && (
                  <LookAutoLayoutBar
                    activeStyle={autoLayoutId}
                    onSelect={handleAutoLayoutSelect}
                  />
                )}
                {hasMultipleMedia && (
                  <LayoutPreviewRail
                    assetUris={mediaAssetUris}
                    layouts={allLayouts}
                    selectedId={selectedLayoutId}
                    onSelect={handleLayoutSelect}
                    onPreview={handleLayoutPreview}
                    onPreviewEnd={handleLayoutPreviewEnd}
                  />
                )}
                {mediaLayers.length === 0 && (
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
            <View style={[styles.effectsSurface, { paddingBottom: insets.bottom + Space.sm }]}>
              {/* Glass material — translucent blur over media canvas */}
              <BlurView
                intensity={EditorMaterial.sheet.blurIntensity}
                tint={EditorMaterial.sheet.tint}
                style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
              <View style={[styles.effectsSheetHeader, { borderBottomColor: EditorMaterial.sheet.hairline }]}>
                <Text style={[styles.effectsSheetTitle, { color: colors.textPrimary }]}>
                  Effects
                </Text>
                <PressScale
                  onPress={handleCloseSurface}
                  style={styles.effectsSheetDone}
                  accessibilityLabel="Done"
                  accessibilityHint="Closes the effects panel and returns to tools"
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
              <Text style={[styles.effectsSectionLabel, { color: colors.textMuted }]}>
                Filters
              </Text>
              <EffectPreviewRail
                sourceUri={effectsSourceUri}
                presets={FILTER_PRESETS}
                selectedId={selectedFilterId}
                onSelect={handleEffectFilterSelect}
              />
              {/* ── AI Effects entry (folded under Effects) ── */}
              {/* Opens the AIEffectBrowserSheet from within the effects
                  panel. AI effects are not a separate destination — they
                  live inside the effects surface. */}
              <PressScale
                onPress={() => { haptic.medium(); setShowAIEffects(true); }}
                style={styles.aiEffectsBtn}
                accessibilityLabel="AI Effects"
                accessibilityHint="Opens the effects browser to browse and apply photo effects"
                scale={0.97}
              >
                <Ionicons name="bulb-outline" size={IconGrammar.metadata} color={colors.textPrimary} />
                <Text style={[styles.aiEffectsBtnText, { color: colors.textPrimary }]}>
                  AI Effects
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
                  onReset={handleEffectReset}
                />
              </View>
            </ScrollView>
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
        <View style={[styles.overflowContainer, { top: insets.top + 52 }]}>
          <View style={[styles.overflowMenu, { borderColor: EditorMaterial.plate.hairline }]}>
            {/* Glass material — compact plate treatment */}
            <BlurView
              intensity={EditorMaterial.plate.blurIntensity}
              tint={EditorMaterial.plate.tint}
              style={[StyleSheet.absoluteFill, { borderRadius: EditorRadius.plate }]}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.plate.overlay, borderRadius: EditorRadius.plate }]} />
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
              label="Accessibility Move"
              onPress={() => { setShowA11yMove(true); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon="accessibility-outline"
              label="Accessibility Arrange"
              onPress={() => { setShowA11yZOrder(true); setShowOverflow(false); }}
              colors={colors}
            />
            <OverflowItem
              icon={showSafeZone ? 'scan-circle-outline' : 'scan-outline'}
              label={showSafeZone ? 'Safe Zone On' : 'Safe Zone'}
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
              label="Help & Shortcuts"
              onPress={() => { setShowHelp(true); setShowOverflow(false); }}
              colors={colors}
            />
          </View>
          <Pressable style={styles.overflowBackdrop} onPress={() => setShowOverflow(false)} />
        </View>
      )}

      {/* ── Sheets ────────────────────────────────────────────────────── */}
      <CreatorPreviewOverlay
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        onPublish={() => {
          setShowPreview(false);
          setShowPublish(true);
        }}
      />
      <CreatorLayersSheet visible={showLayers} onClose={() => setShowLayers(false)} />
      <CreatorPublishSheet visible={showPublish} onClose={() => setShowPublish(false)} editingLookId={editingLookId ?? undefined} />
      <CreatorSettingsSheet visible={showSettings} onClose={() => setShowSettings(false)} />
      <HelpShortcutsSheet visible={showHelp} onClose={() => setShowHelp(false)} />
      {/* ── Background picker sheet ─────────────────────────────────── */}
      {/* Bottom sheet for picking the canvas background (solid, gradient,
          blurred photo, or image). On confirm, commits the selected
          background to document.canvas.background via updateCanvas. */}
      <BackgroundSheet
        visible={showBackground}
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
        visible={showAIEffects}
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
        visible={showA11yMove}
        layerId={selectedLayerId}
        position={selectedLayer ? { x: selectedLayer.x, y: selectedLayer.y } : null}
        onClose={() => setShowA11yMove(false)}
        onMove={(x, y) => {
          if (selectedLayerId) updateLayer(selectedLayerId, { x, y }, 'Move object');
        }}
      />
      <AccessibilityZOrderSheet
        visible={showA11yZOrder}
        layers={(page?.layers ?? []).map((l) => ({
          id: l.id,
          label: layerTypeLabel(l.type, 'look'),
          zIndex: l.zIndex })) as ZOrderLayer[]}
        selectedLayerId={selectedLayerId}
        onClose={() => setShowA11yZOrder(false)}
        onReorder={(layerId, direction) => reorderLayer(layerId, direction)}
      />
      <CreatorTemplateBrowser
        visible={showTemplates}
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
                maskRef: result.maskRef?.uri } as Partial<CreatorLayer>, 'Apply cutout');
            }
            setCutoutPreviewTarget(null);
          }}
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
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
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
  title: string;
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
          accessibilityHint="Closes the layout panel and returns to tools"
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

// ── Screen wrapper — wraps in CreatorProvider (shared state) ─────────
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
  return (
    <LookComposerScreenWithProvider {...props} />
  );
}

// This is the full screen with CreatorProvider. It is used by the
// CreatorStudioScreen wrapper in CreatorStudioShell which branches on
// document type. The wrapper there passes route params to this component.
function LookComposerScreenWithProvider(props: {
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
    flex: 1,
    backgroundColor: '#0a0a0a' },
  // ── Crash recovery banner (inline notification, not a card) ──
  // Calm but noticeable: soft tinted background + left accent bar gives the
  // banner proper visual hierarchy (accent → text → action) without heavy chrome.
  recoveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    paddingTop: 50,
    backgroundColor: 'rgba(201, 164, 106, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#C9A46A' },
  recoveryText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    marginLeft: 8 },
  recoveryBtn: {
    backgroundColor: 'rgba(201, 164, 106, 0.15)',
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 6 },
  recoveryBtnText: {
    color: '#C9A46A',
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
  // Gradient scrim behind the top bar so chrome reads over the canvas
  // without a hard edge — "Liquid Glass" translucent separation.
  topBarScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: -1 },
  topBar: {
    height: 56,
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
  titleText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    ...GlyphShadow.title },
  doneText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    ...GlyphShadow.glyph },
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
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    justifyContent: 'center',
    alignItems: 'center' },
  publishBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size },
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
  canvasLoadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: EditorRadius.plate,
    borderWidth: Stroke.standard,
    borderColor: EditorMaterial.plate.hairline,
    overflow: 'hidden' },
  canvasLoadingText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size },
  // ── Empty canvas hint ──
  canvasEmptyHint: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 40,
    gap: Space.xs },
  canvasEmptyCta: {
    alignItems: 'center',
    gap: Space.sm },
  canvasEmptyHintTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
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
    backgroundColor: 'rgba(201, 164, 106, 0.08)',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(201, 164, 106, 0.2)',
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
  // Gradient scrim above the bottom bar content gives the tools visual
  // separation from the canvas without a hard border.
  bottomBarScrim: {
    position: 'absolute',
    top: -80,
    left: 0,
    right: 0,
    height: 80,
    zIndex: -1 },
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
    borderTopLeftRadius: EditorRadius.sheet,
    borderTopRightRadius: EditorRadius.sheet,
    maxHeight: '85%',
    overflow: 'hidden' },
  // ── Overflow menu ──
  overflowContainer: {
    position: 'absolute',
    right: Space.sm,
    zIndex: 120 },
  overflowMenu: {
    borderRadius: EditorRadius.plate,
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
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  effectsSheetTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
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
  effectsSectionLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    paddingHorizontal: Space.md,
    marginBottom: Space.xs,
    marginTop: Space.xs },
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
    zIndex: 35 },
  // ── Align picker ──
  alignPickerContainer: {
    position: 'absolute',
    left: Space.sm,
    right: Space.sm,
    zIndex: 101,
    alignItems: 'center' },
  alignPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth },
  alignPickerItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minWidth: 48,
    minHeight: 48,
    gap: 2 },
  alignPickerLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size } });
