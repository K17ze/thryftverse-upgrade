import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Alert,
  Keyboard,
  useWindowDimensions,
  LayoutChangeEvent,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, runOnJS, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Space, Radius, Type, Typography, FontFamily, FontSize, Control } from '../../theme/designTokens';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../theme/ThemeContext';
import { makeStableId } from '../../utils/createStableId';
import { useCreator } from '../CreatorContext';
import type { CreatorInitialMedia } from '../../navigation/types';
import type { CreatorLayer, EffectNode } from '../composition';
import { computeLookLayout, LOOK_DEFAULT_ASPECT_RATIO } from '../composition';
import { CreatorCanvas } from '../CreatorCanvas';
import { CreatorLayersSheet } from '../CreatorLayersSheet';
import { CreatorPublishSheet } from '../CreatorPublishSheet';
import { CreatorSettingsSheet } from '../CreatorSettingsSheet';
import { CreatorAssetPicker, type AssetPickerMode } from '../CreatorAssetPicker';
import { CreatorTemplateBrowser } from '../CreatorTemplateBrowser';
import { CreatorPreviewOverlay } from '../CreatorPreviewOverlay';
import { CreatorEntryScreen } from '../CreatorEntryScreen';
import { CreatorCropSheet } from '../CreatorCropSheet';
import { InCanvasCropOverlay } from '../surfaces/InCanvasCropOverlay';
import { CreatorCutoutSheet } from '../CreatorCutoutSheet';
import { CutoutPreviewSheet } from '../surfaces/CutoutPreviewSheet';
import { AccessibilityMoveSheet } from '../surfaces/AccessibilityMoveSheet';
import { AccessibilityZOrderSheet, type ZOrderLayer } from '../surfaces/AccessibilityZOrderSheet';
import { isCutoutSupportedAsync, type CutoutResult } from '../core/cutout/CutoutService';
import { PressScale } from '../CreatorAnimations';
import { BackgroundSheet } from './BackgroundSheet';
import type { CreatorBackground } from '../composition';
import { LookSourceTray } from './LookSourceTray';
import { ContextToolRail } from '../surfaces/ContextToolRail';
import { HelpShortcutsSheet } from '../surfaces/HelpShortcutsSheet';
import {
  type ToolContext,
  type ToolGroup,
} from '../core/toolRegistry';
import { EffectPreviewRail, AdjustPanel, FILTER_PRESETS, AutoAdjustButton, computeAutoAdjust, isAutoAdjustNode } from '../tools/effects';
import { AIEffectBrowserSheet } from '../tools/effects/AIEffectBrowserSheet';
import type { AdjustNode } from '../tools/effects';
import { LayoutPreviewRail } from './layout/LayoutPreviewRail';
import { autoCompose } from './layout/autoCompose';
import type { AssetTransform, LayoutPreview, LayoutId } from './layout/layoutTypes';
import { LookAutoLayoutBar } from './LookAutoLayoutBar';
import { autoLayout, type LayoutStyle } from './LookAutoLayout';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { fetchLookByIdFromApi } from '../../services/looksApi';
import { lookToDocument } from '../viewerAdapters';
import type { CreatorTemplate } from '../templates';

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

function layerTypeLabel(type: CreatorLayer['type']): string {
  switch (type) {
    case 'media': return 'Photo';
    case 'text': return 'Text';
    case 'product': return 'Item';
    case 'mention': return 'Mention';
    case 'look': return 'Look';
    case 'vote': return 'Vote';
    case 'quiz': return 'Quiz';
    case 'question': return 'Question';
    case 'emojiSlider': return 'Slider';
    case 'countdown': return 'Countdown';
    case 'decorative': return 'Shape';
    case 'draw': return 'Drawing';
    case 'gif': return 'GIF';
    case 'music': return 'Music';
    case 'link': return 'Link';
    case 'location': return 'Location';
    case 'hashtag': return 'Hashtag';
    case 'time': return 'Time';
    case 'weather': return 'Weather';
    default: return 'Object';
  }
}

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
    transform: [{ translateY: translateY.value * 300 }],
  }));
  return <Reanimated.View style={animStyle}>{children}</Reanimated.View>;
}

function LookComposerInner() {
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
    dismissRecovery,
  } = useCreator();

  // ── Sheet / overlay state ──────────────────────────────────────────
  const [showLayers, setShowLayers] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);
  const [showTemplates, setShowTemplates] = useState(Boolean(route.params?.openTemplates));
  const [showOverflow, setShowOverflow] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showBackground, setShowBackground] = useState(false);
  const [entryComplete, setEntryComplete] = useState(Boolean(route.params?.startBlank));
  const [cropTarget, setCropTarget] = useState<CreatorLayer | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [cutoutTarget, setCutoutTarget] = useState<CreatorLayer | null>(null);
  // ── True cutout (segmentation) state ───────────────────────────────
  // `cutoutPreviewTarget` holds the media layer being previewed in the
  // CutoutPreviewSheet (true segmentation). `cutoutSupported` is probed
  // once on mount so the tool label can honestly say "Cutout" when the
  // native backend is available, and "Crop" when it is not.
  const [cutoutPreviewTarget, setCutoutPreviewTarget] = useState<CreatorLayer | null>(null);
  const [cutoutSupported, setCutoutSupported] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = await isCutoutSupportedAsync();
      if (!cancelled) setCutoutSupported(supported);
    })();
    return () => { cancelled = true; };
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

  // ── Multi-select mode ──────────────────────────────────────────────
  // Long-press enters multi-select mode. In multi-select, tapping a layer
  // toggles it in the selection set. Dragging any selected layer moves all
  // selected layers together. A "Done" button and selection count badge
  // appear at the top. Tapping empty canvas exits multi-select.
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  // Align sub-menu state — toggles a small horizontal align picker above
  // the tool rail in multi-select mode.
  const [showAlignPicker, setShowAlignPicker] = useState(false);
  // Snapshot of selected layers' start positions at drag begin — used to
  // apply the drag delta to all peers in real-time and commit on drag end.
  const multiDragSnapshotRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // ── Canvas layout ref for drag-to-canvas coordinate conversion ──
  // Stores the canvas container's screen-space position so drag-to-canvas
  // drop coordinates can be converted to normalized (0–1) canvas coordinates.
  const canvasLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const handleCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    canvasLayoutRef.current = e.nativeEvent.layout;
  }, []);

  const sourceDocumentId = route.params?.sourceDocumentId as string | undefined;

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
        const doc = lookToDocument({
          id: res.look.id,
          title: res.look.title,
          caption: res.look.caption,
          mediaUrl: res.look.mediaUrl,
          tags: res.look.tags.map((t) => ({
            id: t.id,
            label: t.label,
            listingId: t.listingId,
            x: t.x,
            y: t.y,
          })),
        });
        setDocument(doc);
        setEditingLookId(sourceDocumentId);
      })
      .catch(() => {
        // Not a published look — the remix path in CreatorContext handles
        // local-draft sourceDocumentIds. Nothing to do here.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSourceLook(false);
      });
    return () => { cancelled = true; };
  }, [sourceDocumentId, route.params?.draftId, route.params?.templateId, setDocument]);

  // Show entry screen when document is empty and not loading
  const hasContent = document.pages.some((p) => p.layers.length > 0);
  const showEntryScreen = !entryComplete && !hasContent && !isLoadingDraft && !isLoadingSourceLook;

  const page = document.pages[0]; // Look is always single-page

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ── 4:5 canvas geometry ────────────────────────────────────────────
  // Look is spatial, not full-bleed story. The 4:5 canvas sits in a
  // neutral workspace with breathing room above and below. The canvas
  // width fills the screen; height = width / aspectRatio (0.8).
  // It centers vertically in the available space between top bar and
  // bottom actions.
  const canvasWidth = screenWidth;
  const canvasHeight = useMemo(() => {
    return Math.floor(screenWidth / document.canvas.aspectRatio);
  }, [screenWidth, document.canvas.aspectRatio]);

  // Canvas is vertically centered in the viewport
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
    Alert.alert(
      'Save draft?',
      'Your changes haven\'t been published yet.',
      [
        {
          text: 'Save draft',
          onPress: async () => {
            try {
              await saveDraft();
              navigation.goBack();
            } catch {
              Alert.alert('Could not save draft', 'Try again.');
            }
          },
        },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        { text: 'Keep editing', style: 'cancel' },
      ],
    );
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
        if (showHelp) setShowHelp(false);
        else if (showAIEffects) setShowAIEffects(false);
        else if (bottomSurface !== 'tools') setBottomSurface('tools');
        else if (showA11yMove) setShowA11yMove(false);
        else if (showA11yZOrder) setShowA11yZOrder(false);
        else if (cropMode) setCropMode(false);
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
  }, [canUndo, canRedo, undo, redo, showHelp, showAIEffects, bottomSurface, showA11yMove, showA11yZOrder, cropMode, cropTarget, cutoutTarget, cutoutPreviewTarget, showPreview, showBackground, showSafeZone, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, showAlignPicker, multiSelectMode, selectedLayerIds, exitMultiSelect, handleMultiDelete, selectedLayerId, selectLayer, removeLayer, handleBack]);

  // Hardware back button — intercept to close sheets first
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showHelp) { setShowHelp(false); return true; }
        if (showAIEffects) { setShowAIEffects(false); return true; }
        if (bottomSurface !== 'tools') { setBottomSurface('tools'); return true; }
        if (showA11yMove) { setShowA11yMove(false); return true; }
        if (showA11yZOrder) { setShowA11yZOrder(false); return true; }
        if (cropMode) { setCropMode(false); return true; }
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
    }, [showHelp, showAIEffects, bottomSurface, showA11yMove, showA11yZOrder, cropMode, cropTarget, cutoutTarget, cutoutPreviewTarget, showPreview, showBackground, showSafeZone, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, showAlignPicker, multiSelectMode, exitMultiSelect, selectedLayerId, selectLayer])
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

  // ── Entry screen media handling ────────────────────────────────────
  // For Look, each asset becomes an auto-arranged media layer on page 0
  // via computeLookLayout — never N identical full-bleed overlaps.
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
        // Apply camera effect post-capture: store as a filter node in
        // the effect stack so the renderer applies the color matrix.
        // The effect ID matches the filter system's ImageFilter names.
        ...(asset.cameraEffect ? {
          effects: [{ type: 'filter' as const, id: asset.cameraEffect, amount: 1 }],
        } : {}),
      },
    }));
    const arranged = computeLookLayout(mediaLayers);
    const newDoc = {
      ...document,
      pages: [{ id: document.pages[0]?.id ?? 'page_1', layers: arranged }],
      updatedAt: new Date().toISOString(),
    };
    setDocument(newDoc);
    setEntryComplete(true);
  }, [document, setDocument]);

  const handleEntryBlankStart = useCallback(() => {
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
      snapshotPriceGbp: item.snapshotPriceGbp,
    });
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
      y,
    });
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
  // Enters in-canvas crop mode — crop handles render directly over the
  // selected layer while the composition stays visible (spec 04 §1).
  // The old CreatorCropSheet remains as a fallback path.
  const handleCropAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setCropMode(true);
  }, [selectedLayer, haptic]);

  // ── Adjust (opacity) action for selected media ──────────────────────
  // Opens the crop sheet which provides manual cropping; the adjust
  // concept maps to the existing crop/opacity workflow.
  const handleAdjustAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setCutoutTarget(selectedLayer);
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

  // ── Effects sheet — derived state & handlers ───────────────────────
  const selectedMediaLayer = selectedLayer?.type === 'media' ? selectedLayer : null;
  const effectsSourceUri = selectedMediaLayer?.payload.mediaUri ?? '';
  const currentEffects: EffectNode[] = selectedMediaLayer?.payload.effects ?? [];

  const selectedFilterId = useMemo(() => {
    const filterNode = currentEffects.find((n) => n.type === 'filter');
    return filterNode?.type === 'filter' ? filterNode.id : null;
  }, [currentEffects]);

  // Derive the active AI effect ID from the current effect stack. AI
  // effects are stored as filter nodes with IDs prefixed `ai:`.
  const activeAIEffectId = useMemo(() => {
    const aiNode = currentEffects.find(
      (n) => n.type === 'filter' && n.id.startsWith('ai:'),
    );
    return aiNode?.type === 'filter' ? aiNode.id.slice(3) : null;
  }, [currentEffects]);

  const currentAdjustments = useMemo<Partial<Omit<AdjustNode, 'type'>>>(() => {
    const adjustNode = currentEffects.find((n) => n.type === 'adjust');
    if (adjustNode?.type !== 'adjust') return {};
    const { type: _t, ...rest } = adjustNode;
    return rest;
  }, [currentEffects]);

  const handleEffectFilterSelect = useCallback((presetId: string) => {
    if (!selectedMediaLayer) return;
    const newEffects: EffectNode[] = [
      ...currentEffects.filter((n) => n.type !== 'filter'),
      { type: 'filter', id: presetId, amount: 1 },
    ];
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    }, 'Apply filter');
  }, [selectedMediaLayer, currentEffects, updateLayer]);

  const handleEffectAdjustChange = useCallback((parameter: string, value: number) => {
    if (!selectedMediaLayer) return;
    const existingAdjust = currentEffects.find((n) => n.type === 'adjust');
    const base = existingAdjust?.type === 'adjust'
      ? { ...existingAdjust }
      : { type: 'adjust' as const };
    (base as Record<string, unknown>)[parameter] = value;
    const newAdjust = base as Extract<EffectNode, { type: 'adjust' }>;
    const newEffects: EffectNode[] = [
      ...currentEffects.filter((n) => n.type !== 'adjust'),
      newAdjust,
    ];
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    });
  }, [selectedMediaLayer, currentEffects, updateLayer]);

  const handleEffectReset = useCallback(() => {
    if (!selectedMediaLayer) return;
    const newEffects = currentEffects.filter((n) => n.type !== 'adjust');
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    }, 'Reset adjustments');
  }, [selectedMediaLayer, currentEffects, updateLayer]);

  // ── Auto-adjust (one-tap color correction) ─────────────────────────
  // Toggles the conservative auto-adjust preset on the selected media
  // layer. If the existing adjust node was produced by computeAutoAdjust,
  // tapping removes it; otherwise the auto preset replaces any manual
  // adjust node (Instagram Edits August 2026 parity).
  const autoAdjustActive = useMemo(() => {
    const adjust = currentEffects.find((n) => n.type === 'adjust');
    return adjust ? isAutoAdjustNode(adjust) : false;
  }, [currentEffects]);

  const handleAutoAdjust = useCallback(async () => {
    if (!selectedMediaLayer) return;
    const existing = currentEffects.find((n) => n.type === 'adjust');
    if (existing && isAutoAdjustNode(existing)) {
      const newEffects = currentEffects.filter((n) => n.type !== 'adjust');
      updateLayer(selectedMediaLayer.id, {
        type: 'media',
        payload: { ...selectedMediaLayer.payload, effects: newEffects },
      }, 'Remove auto-adjust');
      return;
    }
    const autoNode = await computeAutoAdjust(effectsSourceUri);
    const newEffects: EffectNode[] = [
      ...currentEffects.filter((n) => n.type !== 'adjust'),
      autoNode,
    ];
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    }, 'Apply auto-adjust');
  }, [selectedMediaLayer, currentEffects, updateLayer, effectsSourceUri]);

  // ── AI Effects ──────────────────────────────────────────────────────
  // AI effects are now folded under the Effects bottom surface (no
  // standalone AI destination). The AIEffectBrowserSheet is launched
  // from within the effects panel via the "AI Effects" button.
  const handleAIEffectApply = useCallback((effectId: string, intensity: number) => {
    if (!selectedMediaLayer) return;
    // Store the AI effect as a composition-schema filter node with a
    // namespaced ID (`ai:<effectId>`) so the renderer can resolve it
    // via the AIEffectRegistry at draw time. The `amount` field carries
    // the user-chosen intensity (0..1) so the renderer can scale the
    // effect's render stack. This preserves the existing effect stack
    // semantics (filter + adjust nodes) while enabling rich multi-node
    // AI effect graphs.
    const newEffects: EffectNode[] = [
      ...currentEffects.filter((n) => n.type !== 'filter' || !n.id.startsWith('ai:')),
      { type: 'filter', id: `ai:${effectId}`, amount: intensity },
    ];
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    }, `Apply AI effect`);
  }, [selectedMediaLayer, currentEffects, updateLayer]);

  const handleAIEffectRemove = useCallback((effectId: string) => {
    if (!selectedMediaLayer) return;
    const newEffects = currentEffects.filter(
      (n) => !(n.type === 'filter' && n.id === `ai:${effectId}`),
    );
    updateLayer(selectedMediaLayer.id, {
      type: 'media',
      payload: { ...selectedMediaLayer.payload, effects: newEffects },
    }, 'Remove AI effect');
  }, [selectedMediaLayer, currentEffects, updateLayer]);

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
  const handleProductTagStyleAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'product') {
      haptic.light();
      return;
    }
    handleEditLayer(selectedLayer);
  }, [selectedLayer, handleEditLayer, haptic]);

  const handleProductPriceAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'product') {
      haptic.light();
      return;
    }
    handleLinkItem(selectedLayer);
  }, [selectedLayer, handleLinkItem, haptic]);

  // ── Multi-select drag: move all selected layers together ───────────
  // On drag start, snapshot all selected layers' positions. During drag,
  // apply the normalized delta to peers via updateLayersLive (no history).
  // On drag end, commit all selected layers' new positions in a single
  // history entry via commitMultiLayerTransform.
  const handleMultiDragStart = useCallback(() => {
    const snapshot = new Map<string, { x: number; y: number }>();
    const layers = page?.layers ?? [];
    for (const id of selectedLayerIds) {
      const l = layers.find((x) => x.id === id);
      if (l) snapshot.set(id, { x: l.x, y: l.y });
    }
    multiDragSnapshotRef.current = snapshot;
  }, [selectedLayerIds, page]);

  const handleMultiDragUpdate = useCallback((deltaXNorm: number, deltaYNorm: number) => {
    const snapshot = multiDragSnapshotRef.current;
    if (snapshot.size === 0) return;
    const updates: Array<{ id: string; x?: number; y?: number }> = [];
    for (const [id, start] of snapshot) {
      updates.push({ id, x: start.x + deltaXNorm, y: start.y + deltaYNorm });
    }
    updateLayersLive(updates);
  }, [updateLayersLive]);

  const handleMultiDragCommit = useCallback((deltaXNorm: number, deltaYNorm: number) => {
    const snapshot = multiDragSnapshotRef.current;
    if (snapshot.size === 0) return;
    const layers = page?.layers ?? [];
    const updates: Array<{ id: string; updates: Partial<CreatorLayer> }> = [];
    for (const [id, start] of snapshot) {
      let nx = start.x + deltaXNorm;
      let ny = start.y + deltaYNorm;
      // Snap to center
      if (Math.abs(nx - 0.5) < 0.02) nx = 0.5;
      if (Math.abs(ny - 0.5) < 0.02) ny = 0.5;
      // Safe-zone clamping
      const layer = layers.find((x) => x.id === id);
      if (layer) {
        const halfW = (layer.width * layer.scale) / 2;
        const halfH = (layer.height * layer.scale) / 2;
        const minX = Math.max(0.05, halfW);
        const maxX = Math.min(0.95, 1 - halfW);
        const minY = Math.max(0.05, halfH);
        const maxY = Math.min(0.95, 1 - halfH);
        nx = Math.max(minX, Math.min(maxX, nx));
        ny = Math.max(minY, Math.min(maxY, ny));
      }
      updates.push({ id, updates: { x: nx, y: ny } });
    }
    commitMultiLayerTransform(updates, 'Move objects');
    multiDragSnapshotRef.current = new Map();
    haptic.light();
  }, [page, commitMultiLayerTransform, haptic]);

  // ── Overlap cycle selection ────────────────────────────────────────
  // Double-tap in an overlap area cycles to the next layer down in
  // z-order. We find all layers whose bounding box overlaps the tapped
  // layer, then select the next one below the current selection.
  const handleOverlapCycle = useCallback((tappedLayerId: string) => {
    const layers = page?.layers ?? [];
    const visible = layers.filter((l) => !l.hidden).sort((a, b) => b.zIndex - a.zIndex);
    const tapped = visible.find((l) => l.id === tappedLayerId);
    if (!tapped) return;
    // Bounding box of the tapped layer (normalized, center-based)
    const halfW = (tapped.width * tapped.scale) / 2;
    const halfH = (tapped.height * tapped.scale) / 2;
    const tLeft = tapped.x - halfW;
    const tRight = tapped.x + halfW;
    const tTop = tapped.y - halfH;
    const tBottom = tapped.y + halfH;
    // Find overlapping layers (below in z-order = higher index in descending sort)
    const tappedIdx = visible.findIndex((l) => l.id === tappedLayerId);
    const overlapping = visible.filter((l, i) => {
      if (i <= tappedIdx) return false;
      const lHalfW = (l.width * l.scale) / 2;
      const lHalfH = (l.height * l.scale) / 2;
      const lLeft = l.x - lHalfW;
      const lRight = l.x + lHalfW;
      const lTop = l.y - lHalfH;
      const lBottom = l.y + lHalfH;
      return tLeft < lRight && tRight > lLeft && tTop < lBottom && tBottom > lTop;
    });
    if (overlapping.length === 0) {
      // No overlap below — wrap to the topmost layer
      if (multiSelectMode) {
        toggleLayerInSelection(visible[0].id);
      } else {
        selectLayer(visible[0].id);
      }
    } else {
      const next = overlapping[0];
      if (multiSelectMode) {
        toggleLayerInSelection(next.id);
      } else {
        selectLayer(next.id);
      }
    }
    haptic.selection();
  }, [page, multiSelectMode, toggleLayerInSelection, selectLayer, haptic]);

  // ── Bulk action handlers (multi-select) ────────────────────────────
  const handleMultiFront = useCallback(() => {
    haptic.light();
    bringSelectedToFront();
  }, [bringSelectedToFront, haptic]);

  const handleMultiBack = useCallback(() => {
    haptic.light();
    sendSelectedToBack();
  }, [sendSelectedToBack, haptic]);

  // Align all selected layers. Computes the bounding box of the selection
  // set and aligns each layer to the specified edge/center of that box.
  const handleMultiAlign = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const layers = page?.layers ?? [];
    const selected = selectedLayerIds
      .map((id) => layers.find((l) => l.id === id))
      .filter((l): l is CreatorLayer => !!l);
    if (selected.length === 0) return;
    // Compute bounding box edges (normalized, center-based coords)
    const edges = selected.map((l) => {
      const halfW = (l.width * l.scale) / 2;
      const halfH = (l.height * l.scale) / 2;
      return {
        left: l.x - halfW,
        right: l.x + halfW,
        top: l.y - halfH,
        bottom: l.y + halfH,
        cx: l.x,
        cy: l.y,
      };
    });
    const boxLeft = Math.min(...edges.map((e) => e.left));
    const boxRight = Math.max(...edges.map((e) => e.right));
    const boxTop = Math.min(...edges.map((e) => e.top));
    const boxBottom = Math.max(...edges.map((e) => e.bottom));
    const boxCenterX = (boxLeft + boxRight) / 2;
    const boxCenterY = (boxTop + boxBottom) / 2;
    const updates: Array<{ id: string; updates: Partial<CreatorLayer> }> = [];
    for (const l of selected) {
      const halfW = (l.width * l.scale) / 2;
      const halfH = (l.height * l.scale) / 2;
      let newX = l.x;
      let newY = l.y;
      switch (alignment) {
        case 'left': newX = boxLeft + halfW; break;
        case 'center': newX = boxCenterX; break;
        case 'right': newX = boxRight - halfW; break;
        case 'top': newY = boxTop + halfH; break;
        case 'middle': newY = boxCenterY; break;
        case 'bottom': newY = boxBottom - halfH; break;
      }
      updates.push({ id: l.id, updates: { x: newX, y: newY } });
    }
    commitMultiLayerTransform(updates, `Align ${alignment}`);
    haptic.light();
  }, [page, selectedLayerIds, commitMultiLayerTransform, haptic]);

  // ── Context-sensitive tool rail (ContextToolRail) ───────────────────
  // Replaces the static bottom action bar. The rail adapts its visible
  // tool set based on the current selection state. Each tool's onPress
  // calls an EXISTING handler — no new capabilities are fabricated.
  //
  // Contexts:
  //   look-default         → no selection
  //   look-media-selected  → media layer selected
  //   look-text-selected   → text layer selected
  //   look-product-selected → product layer selected
  //   look-multi-select    → multiple layers selected (future)

  const activeToolContext: ToolContext = useMemo(() => {
    if (multiSelectMode && selectedLayerIds.length > 0) return 'look-multi-select';
    if (!selectedLayer) return 'look-default';
    switch (selectedLayer.type) {
      case 'media': return 'look-media-selected';
      case 'text': return 'look-text-selected';
      case 'product': return 'look-product-selected';
      default: return 'look-default';
    }
  }, [multiSelectMode, selectedLayerIds, selectedLayer]);

  const toolGroups: ToolGroup[] = useMemo(() => {
    const groups: ToolGroup[] = [];

    // ── look-default: Add, Items, Text, Layout, More ──
    groups.push({
      context: 'look-default',
      primary: [
        {
          id: 'look-add-photo',
          label: 'Add',
          icon: 'images-outline',
          onPress: handleAddPhoto,
          accessibilityLabel: 'Add photo',
          accessibilityHint: 'Opens the media picker to add a photo to the canvas',
          hapticFeedback: 'light',
        },
        {
          id: 'look-items',
          label: 'Items',
          icon: 'bag-outline',
          onPress: handleOpenItems,
          accessibilityLabel: 'Items',
          accessibilityHint: 'Opens the items drawer to add products from your closet, listings, or search',
          hapticFeedback: 'light',
        },
        {
          id: 'look-text',
          label: 'Text',
          icon: 'text',
          onPress: handleAddText,
          accessibilityLabel: 'Add text',
          accessibilityHint: 'Opens the text picker to add a text layer',
          hapticFeedback: 'light',
        },
        {
          id: 'look-layout',
          label: 'Layout',
          icon: 'grid-outline',
          onPress: handleOpenLayout,
          accessibilityLabel: 'Layout',
          accessibilityHint: 'Opens the layout panel to arrange your photos with grid, masonry, or collage presets',
          hapticFeedback: 'light',
        },
      ],
      overflow: [
        {
          id: 'look-cutout',
          label: cutoutSupported ? 'Cutout' : 'Crop',
          icon: cutoutSupported ? 'sparkles-outline' : 'crop-outline',
          onPress: handleCutoutAction,
          accessibilityLabel: cutoutSupported ? 'Cutout' : 'Crop',
          accessibilityHint: cutoutSupported
            ? 'Removes the background using on-device subject segmentation'
            : 'Crops the selected media to a rectangle',
          hapticFeedback: 'medium',
          disabled: !selectedLayer || selectedLayer.type !== 'media',
        },
        {
          id: 'look-layers',
          label: 'Layers',
          icon: 'layers-outline',
          onPress: () => { haptic.light(); setShowLayers(true); },
          accessibilityLabel: 'Layers',
          accessibilityHint: 'Opens the layers panel to reorder, lock, or hide objects',
          hapticFeedback: 'light',
        },
        {
          id: 'look-preview',
          label: 'Preview',
          icon: 'eye-outline',
          onPress: () => { haptic.light(); setShowPreview(true); },
          accessibilityLabel: 'Preview',
          accessibilityHint: 'Previews the look as it will appear when published',
          hapticFeedback: 'light',
        },
        {
          id: 'look-drafts',
          label: 'Drafts',
          icon: 'document-outline',
          onPress: () => { haptic.light(); navigation.navigate('CreatorDraftList'); },
          accessibilityLabel: 'Drafts',
          accessibilityHint: 'Opens the drafts list to resume a saved draft',
          hapticFeedback: 'light',
        },
        {
          id: 'look-settings',
          label: 'Settings',
          icon: 'settings-outline',
          onPress: () => { haptic.light(); setShowSettings(true); },
          accessibilityLabel: 'Settings',
          accessibilityHint: 'Opens the look settings sheet',
          hapticFeedback: 'light',
        },
      ],
    });

    // ── look-media-selected: Replace, Crop, Auto, Adjust, Effects, More ──
    groups.push({
      context: 'look-media-selected',
      primary: [
        {
          id: 'look-media-replace',
          label: 'Replace',
          icon: 'swap-horizontal-outline',
          onPress: () => selectedLayer && handleReplaceMedia(selectedLayer),
          accessibilityLabel: 'Replace media',
          accessibilityHint: 'Opens the media picker to swap the selected photo',
          hapticFeedback: 'light',
        },
        {
          id: 'look-media-crop',
          label: 'Crop',
          icon: 'crop-outline',
          onPress: () => selectedLayer && setCropTarget(selectedLayer),
          accessibilityLabel: 'Crop',
          accessibilityHint: 'Opens the crop sheet to adjust the aspect ratio',
          hapticFeedback: 'medium',
        },
        {
          id: 'look-media-auto',
          label: 'Auto',
          icon: 'bulb-outline',
          onPress: handleAutoAdjust,
          accessibilityLabel: 'Auto',
          accessibilityHint: 'Applies one-tap intelligent color correction',
          hapticFeedback: 'medium',
        },
        {
          id: 'look-media-adjust',
          label: 'Adjust',
          icon: 'contrast-outline',
          onPress: handleAdjustAction,
          accessibilityLabel: 'Adjust',
          accessibilityHint: 'Opens background removal for the selected media',
          hapticFeedback: 'medium',
        },
        {
          id: 'look-media-effects',
          label: 'Effects',
          icon: 'color-wand-outline',
          onPress: handleEffectsAction,
          accessibilityLabel: 'Effects',
          accessibilityHint: 'Opens the effects panel for the selected media',
          hapticFeedback: 'medium',
        },
      ],
      overflow: [
        {
          id: 'look-media-front',
          label: 'Front',
          icon: 'arrow-up',
          onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
          accessibilityLabel: 'Bring forward',
          accessibilityHint: 'Moves the selected object forward in the layer stack',
          hapticFeedback: 'light',
        },
        {
          id: 'look-media-back',
          label: 'Back',
          icon: 'arrow-down',
          onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
          accessibilityLabel: 'Send backward',
          accessibilityHint: 'Moves the selected object backward in the layer stack',
          hapticFeedback: 'light',
        },
        {
          id: 'look-media-duplicate',
          label: 'Duplicate',
          icon: 'copy-outline',
          onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
          accessibilityLabel: 'Duplicate',
          accessibilityHint: 'Duplicates the selected object',
          hapticFeedback: 'light',
        },
        {
          id: 'look-media-delete',
          label: 'Delete',
          icon: 'trash-outline',
          onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
          accessibilityLabel: 'Delete',
          accessibilityHint: 'Deletes the selected object',
          hapticFeedback: 'medium',
        },
      ],
    });

    // ── look-text-selected: Edit, Font, Color, Align, More ──
    groups.push({
      context: 'look-text-selected',
      primary: [
        {
          id: 'look-text-edit',
          label: 'Edit',
          icon: 'create-outline',
          onPress: handleTextEditAction,
          accessibilityLabel: 'Edit text',
          accessibilityHint: 'Opens the text editor for the selected text layer',
          hapticFeedback: 'light',
        },
        {
          id: 'look-text-font',
          label: 'Font',
          icon: 'text-outline',
          onPress: handleTextFontAction,
          accessibilityLabel: 'Font',
          accessibilityHint: 'Opens the text editor to change the font style',
          hapticFeedback: 'light',
        },
        {
          id: 'look-text-color',
          label: 'Color',
          icon: 'color-palette-outline',
          onPress: handleTextColorAction,
          accessibilityLabel: 'Color',
          accessibilityHint: 'Opens the text editor to change the text color',
          hapticFeedback: 'light',
        },
        {
          id: 'look-text-align',
          label: 'Align',
          icon: 'list-outline',
          onPress: handleTextAlignAction,
          accessibilityLabel: 'Align',
          accessibilityHint: 'Opens the text editor to change the text alignment',
          hapticFeedback: 'light',
        },
      ],
      overflow: [
        {
          id: 'look-text-front',
          label: 'Front',
          icon: 'arrow-up',
          onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
          accessibilityLabel: 'Bring forward',
          accessibilityHint: 'Moves the selected text forward in the layer stack',
          hapticFeedback: 'light',
        },
        {
          id: 'look-text-back',
          label: 'Back',
          icon: 'arrow-down',
          onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
          accessibilityLabel: 'Send backward',
          accessibilityHint: 'Moves the selected text backward in the layer stack',
          hapticFeedback: 'light',
        },
        {
          id: 'look-text-duplicate',
          label: 'Duplicate',
          icon: 'copy-outline',
          onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
          accessibilityLabel: 'Duplicate',
          accessibilityHint: 'Duplicates the selected text',
          hapticFeedback: 'light',
        },
        {
          id: 'look-text-delete',
          label: 'Delete',
          icon: 'trash-outline',
          onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
          accessibilityLabel: 'Delete',
          accessibilityHint: 'Deletes the selected text',
          hapticFeedback: 'medium',
        },
      ],
    });

    // ── look-product-selected: Item, Tag Style, Price, Duplicate, More ──
    groups.push({
      context: 'look-product-selected',
      primary: [
        {
          id: 'look-product-item',
          label: 'Item',
          icon: 'pricetag-outline',
          onPress: () => selectedLayer && handleLinkItem(selectedLayer),
          accessibilityLabel: 'Change item',
          accessibilityHint: 'Opens the product picker to link a different listing',
          hapticFeedback: 'light',
        },
        {
          id: 'look-product-tag-style',
          label: 'Tag Style',
          icon: 'pricetags-outline',
          onPress: handleProductTagStyleAction,
          accessibilityLabel: 'Tag style',
          accessibilityHint: 'Opens the editor to change the product tag style',
          hapticFeedback: 'light',
        },
        {
          id: 'look-product-price',
          label: 'Price',
          icon: 'cash-outline',
          onPress: handleProductPriceAction,
          accessibilityLabel: 'Price',
          accessibilityHint: 'Opens the product picker to update the linked listing price',
          hapticFeedback: 'light',
        },
        {
          id: 'look-product-duplicate',
          label: 'Duplicate',
          icon: 'copy-outline',
          onPress: () => selectedLayer && handleDuplicateLayer(selectedLayer.id),
          accessibilityLabel: 'Duplicate',
          accessibilityHint: 'Duplicates the selected product tag',
          hapticFeedback: 'light',
        },
      ],
      overflow: [
        {
          id: 'look-product-front',
          label: 'Front',
          icon: 'arrow-up',
          onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'forward'),
          accessibilityLabel: 'Bring forward',
          accessibilityHint: 'Moves the selected product tag forward in the layer stack',
          hapticFeedback: 'light',
        },
        {
          id: 'look-product-back',
          label: 'Back',
          icon: 'arrow-down',
          onPress: () => selectedLayer && handleReorderLayer(selectedLayer.id, 'backward'),
          accessibilityLabel: 'Send backward',
          accessibilityHint: 'Moves the selected product tag backward in the layer stack',
          hapticFeedback: 'light',
        },
        {
          id: 'look-product-delete',
          label: 'Delete',
          icon: 'trash-outline',
          onPress: () => selectedLayer && handleDeleteLayer(selectedLayer.id),
          accessibilityLabel: 'Delete',
          accessibilityHint: 'Deletes the selected product tag',
          hapticFeedback: 'medium',
        },
      ],
    });

    // ── look-multi-select: Align, Front, Back, Delete ──
    groups.push({
      context: 'look-multi-select',
      primary: [
        {
          id: 'look-multi-align',
          label: 'Align',
          icon: 'grid-outline',
          onPress: () => { haptic.light(); setShowAlignPicker((p) => !p); },
          accessibilityLabel: 'Align',
          accessibilityHint: 'Aligns the selected objects — left, center, right, top, middle, bottom',
          hapticFeedback: 'light',
        },
        {
          id: 'look-multi-front',
          label: 'Front',
          icon: 'arrow-up',
          onPress: handleMultiFront,
          accessibilityLabel: 'Bring to front',
          accessibilityHint: 'Brings all selected objects to the front of the layer stack',
          hapticFeedback: 'light',
        },
        {
          id: 'look-multi-back',
          label: 'Back',
          icon: 'arrow-down',
          onPress: handleMultiBack,
          accessibilityLabel: 'Send to back',
          accessibilityHint: 'Sends all selected objects to the back of the layer stack',
          hapticFeedback: 'light',
        },
        {
          id: 'look-multi-delete',
          label: 'Delete',
          icon: 'trash-outline',
          onPress: handleMultiDelete,
          accessibilityLabel: 'Delete',
          accessibilityHint: 'Deletes all selected objects',
          hapticFeedback: 'medium',
        },
      ],
      overflow: [],
    });

    return groups;
  }, [
    selectedLayer,
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
    handleProductTagStyleAction,
    handleProductPriceAction,
    handleCropAction,
    cutoutSupported,
    handleMultiFront,
    handleMultiBack,
    handleMultiDelete,
    haptic,
    navigation,
  ]);

  // ── Layout preview rail (autoCompose) ───────────────────────────────
  // Replaces the blind "Try arrangement" cycling button. When the user
  // has 2+ media assets on the canvas, the LayoutPreviewRail shows real
  // preview thumbnails computed by autoCompose. Selecting a layout
  // commits the transforms to the current document's media layers.
  const mediaLayers = useMemo(
    () => page?.layers.filter((l) => l.type === 'media') ?? [],
    [page],
  );

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
      commitLayerTransform(layer.id, {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        zIndex: layer.zIndex,
        scale: layer.scale,
      }, `Apply ${layoutId} layout`);
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
    scale: 1,
  }), []);

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
      commitLayerTransform(layer.id, transformToLayerUpdate(t), `Apply ${layout.name} layout`);
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

  if (showEntryScreen) {
    return (
      <CreatorEntryScreen
        documentType="look"
        onClose={handleEntryClose}
        onMediaSelected={handleEntryMediaSelected}
        onBlankStart={handleEntryBlankStart}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Crash recovery banner ────────────────────────────────────── */}
      {/* When a pending crash journal entry is detected, show a recovery
          prompt at the top of the composer. The user can recover the
          last saved project or dismiss the prompt. */}
      {hasPendingRecovery && (
        <View style={styles.recoveryBanner}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.textPrimary} />
          <Text style={styles.recoveryText}>Recover your last unsaved project?</Text>
          <PressScale
            onPress={() => { void recoverCrashedProject(); }}
            style={styles.recoveryBtn}
            accessibilityLabel="Recover project"
            accessibilityRole="button"
          >
            <Text style={styles.recoveryBtnText}>Recover</Text>
          </PressScale>
          <PressScale
            onPress={dismissRecovery}
            style={styles.recoveryDismiss}
            accessibilityLabel="Dismiss recovery prompt"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
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
                setEditingLayer(l);
                setPickerMode('text');
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
            showSafeZone={showSafeZone}
            safeZoneTop={insets.top + 56}
            safeZoneBottom={insets.bottom + 120}
          />
        </View>

        {/* Canvas loading overlay */}
        {(isLoadingSourceLook || isLoadingDraft) && (
          <View style={styles.canvasLoadingOverlay} pointerEvents="none">
            <View style={styles.canvasLoadingPill}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.canvasLoadingText}>Loading…</Text>
            </View>
          </View>
        )}

        {/* Empty canvas hint */}
        {!hasContent && !isLoadingSourceLook && !isLoadingDraft && entryComplete && !selectedLayer && (
          <View style={styles.canvasEmptyHint} pointerEvents="none">
            <Text style={styles.canvasEmptyHintTitle}>Add photos to start</Text>
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
      <View style={[styles.topBarContainer, { paddingTop: insets.top }]}>
        <View style={[styles.topBar, { backgroundColor: colors.surface }]}>
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
                    <Ionicons name="checkmark-done-outline" size={24} color={colors.textPrimary} />
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
                    {layerTypeLabel(selectedLayer.type)}
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
                    <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
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
                    <Ionicons name="close" size={26} color={colors.textPrimary} />
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
                    <Ionicons name="arrow-undo" size={22} color={colors.textPrimary} />
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
                    <Ionicons name="arrow-redo" size={22} color={colors.textPrimary} />
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
      </View>

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
        <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
          <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <ContextToolRail
              context={activeToolContext}
              groups={toolGroups}
              onOverflowPress={() => { haptic.selection(); setShowOverflow(true); }}
              style={styles.toolRail}
            />
          </View>
        </View>
      )}

      {/* ── 'items' surface: Items drawer (LookSourceTray expanded) ── */}
      {/* Replaces the tools rail temporarily. Shows Closet / Listings /
          Search tabs. Tapping an item adds it to the canvas. Closing
          the drawer returns to 'tools'. The LookSourceTray's peek bar
          acts as the drawer header with a close chevron. */}
      {bottomSurface === 'items' && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <LookSourceTray
                expanded={true}
                onToggle={handleCloseSurface}
                onAddItem={handleSourceTrayAddItem}
                onDropProduct={handleDropProduct}
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
            <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
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
            <View style={[styles.effectsSurface, { backgroundColor: colors.surface, paddingBottom: insets.bottom + Space.sm }]}>
              <View style={[styles.effectsSheetHeader, { borderBottomColor: colors.border }]}>
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
                style={[styles.aiEffectsBtn, { borderColor: colors.border }]}
                accessibilityLabel="AI Effects"
                accessibilityHint="Opens the AI effects browser to browse and apply AI-powered effects"
                scale={0.97}
              >
                <Ionicons name="sparkles" size={18} color={colors.textPrimary} />
                <Text style={[styles.aiEffectsBtnText, { color: colors.textPrimary }]}>
                  AI Effects
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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

      {/* ── Overflow menu (compact) ───────────────────────────────────── */}
      {showOverflow && (
        <View style={[styles.overflowContainer, { top: insets.top + 52 }]}>
          <View style={[styles.overflowMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
              icon={showSafeZone ? 'shield-checkmark-outline' : 'shield-outline'}
              label={showSafeZone ? 'Safe Zone On' : 'Safe Zone'}
              onPress={() => { setShowSafeZone(!showSafeZone); setShowOverflow(false); haptic.light(); }}
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
      {/* Bottom sheet for browsing and applying AI-powered effects from
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
          label: layerTypeLabel(l.type),
          zIndex: l.zIndex,
        })) as ZOrderLayer[]}
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
      {cropMode && selectedLayer && selectedLayer.type === 'media' && (
        <InCanvasCropOverlay
          visible={cropMode}
          layerBounds={{
            x: selectedLayer.x,
            y: selectedLayer.y,
            width: selectedLayer.width,
            height: selectedLayer.height,
          }}
          onConfirm={(cropRect) => {
            if (selectedLayer && selectedLayer.type === 'media') {
              updateLayer(selectedLayer.id, {
                x: cropRect.x,
                y: cropRect.y,
                width: cropRect.width,
                height: cropRect.height,
              });
            }
            setCropMode(false);
          }}
          onCancel={() => setCropMode(false)}
        />
      )}
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
                payload: { ...cropTarget.payload, mediaUri: newUri },
              });
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
                  contentFit: 'contain',
                },
              });
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
                  contentFit: 'contain',
                },
                maskRef: result.maskRef?.uri,
              } as Partial<CreatorLayer>, 'Apply cutout');
            }
            setCutoutPreviewTarget(null);
          }}
        />
      )}
      <CreatorAssetPicker
        visible={pickerMode !== null}
        mode={pickerMode ?? 'media'}
        editingLayer={editingLayer}
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
                contentFit: layer.payload.contentFit,
              });
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
    </View>
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
  children,
}: {
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

// ── Overflow menu item ───────────────────────────────────────────────
const OverflowItem = React.memo(function OverflowItem({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <PressScale
      onPress={onPress}
      style={styles.overflowItem}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
    >
      <Ionicons name={icon} size={20} color={colors.textPrimary} />
      <Text style={[styles.overflowItemText, { color: colors.textPrimary }]}>{label}</Text>
    </PressScale>
  );
});

// ── Opacity bar — drag-based slider for object opacity ───────────────
const OpacityBar = React.memo(function OpacityBar({ value, onChange, onCommit }: { value: number; onChange: (v: number) => void; onCommit: (v: number) => void }) {
  const widthSV = useSharedValue(0);
  const haptic = useHaptic();

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    widthSV.value = e.nativeEvent.layout.width;
  }, [widthSV]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        const w = widthSV.value;
        if (w <= 0) return;
        const ratio = Math.max(0, Math.min(1, e.x / w));
        const snapped = Math.round(ratio * 20) / 20;
        runOnJS(haptic.selection)();
        runOnJS(onChange)(snapped);
      })
      .onChange((e) => {
        'worklet';
        const w = widthSV.value;
        if (w <= 0) return;
        const ratio = Math.max(0, Math.min(1, e.x / w));
        const snapped = Math.round(ratio * 20) / 20;
        runOnJS(haptic.selection)();
        runOnJS(onChange)(snapped);
      })
      .onEnd(() => {
        'worklet';
        runOnJS(onCommit)(value);
      })
      .onFinalize(() => {
        'worklet';
        runOnJS(onCommit)(value);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, onChange, onCommit]
  );

  const pct = Math.round(value * 100);

  return (
    <View style={styles.opacityBar}>
      <Ionicons name="contrast-outline" size={16} color="rgba(255,255,255,0.7)" />
      <GestureDetector gesture={panGesture}>
        <View style={styles.opacitySliderTrack} onLayout={handleLayout}>
          <View style={styles.opacitySliderTrackBg} />
          <View style={[styles.opacitySliderFill, { width: `${pct}%` }]} />
          <View style={[styles.opacitySliderThumb, { left: `${pct}%` }]} />
        </View>
      </GestureDetector>
      <Text style={styles.opacityLabel}>{pct}%</Text>
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
      <LookComposerInner />
    </CreatorProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  // ── Crash recovery banner ──
  recoveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(201, 164, 106, 0.15)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(201, 164, 106, 0.3)',
    paddingTop: 50,
  },
  recoveryText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    marginLeft: 8,
  },
  recoveryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#C9A46A',
    borderRadius: 8,
  },
  recoveryBtnText: {
    color: '#0a0a0a',
    fontSize: 13,
    fontWeight: '600',
  },
  recoveryDismiss: {
    padding: 8,
    marginLeft: 4,
  },
  // ── Canvas stage ──
  canvasStage: {
    ...StyleSheet.absoluteFill,
  },
  // ── Top bar ──
  topBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topBar: {
    height: 56,
    paddingHorizontal: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  topCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  doneText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  topCenterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flex: 1,
    justifyContent: 'center',
  },
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  publishBtn: {
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  unsavedDot: {
    width: 7,
    height: 7,
    borderRadius: RadiusRoleValue.pillAvatar,
    marginLeft: -Space.xs,
    marginTop: Space.xs + 2,
  },
  // ── Canvas loading overlay ──
  canvasLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  canvasLoadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  canvasLoadingText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: 'rgba(255,255,255,0.85)',
  },
  // ── Empty canvas hint ──
  canvasEmptyHint: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 40,
    gap: Space.xs,
  },
  canvasEmptyHintTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    color: 'rgba(255,255,255,0.4)',
  },
  // ── AI Effects button (inside the effects surface) ──
  aiEffectsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Space.sm,
    minHeight: Control.hit,
  },
  aiEffectsBtnText: {
    flex: 1,
    fontSize: FontSize.body,
    fontFamily: FontFamily.semibold,
  },
  // ── Bottom surface container (shared by all surfaces) ──
  bottomBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.xs,
  },
  toolRail: {
    flex: 1,
  },
  // ── Layout panel ──
  layoutPanel: {
    maxHeight: '70%',
  },
  layoutPanelContent: {
    paddingVertical: Space.sm,
  },
  layoutEmptyText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    textAlign: 'center',
    paddingVertical: Space.lg,
    paddingHorizontal: Space.md,
  },
  // ── Effects surface ──
  effectsSurface: {
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
    maxHeight: '85%',
  },
  // ── Overflow menu ──
  overflowContainer: {
    position: 'absolute',
    right: Space.sm,
    zIndex: 120,
  },
  overflowMenu: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.xs,
    minWidth: 180,
  },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  overflowItemText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: -1,
  },
  // ── Opacity bar ──
  opacityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.xs,
  },
  opacitySliderTrack: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  opacitySliderTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: RadiusRoleValue.compactControl,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  opacitySliderFill: {
    height: 4,
    borderRadius: RadiusRoleValue.compactControl,
    backgroundColor: '#C9A46A',
  },
  opacitySliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: '#fff',
    marginLeft: -9,
  },
  opacityLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: 'rgba(255,255,255,0.8)',
    minWidth: 36,
    textAlign: 'right',
  },
  // ── Effects surface (shared header styles) ──
  effectsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  effectsSheetTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  effectsSheetDone: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  effectsSheetDoneText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  effectsSheetScroll: {
    paddingVertical: Space.sm,
  },
  effectsSectionLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
    paddingHorizontal: Space.md,
    marginBottom: Space.xs,
    marginTop: Space.xs,
  },
  effectsAdjustWrap: {
    marginTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.xs,
  },
  effectsAutoRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  // ── Multi-select ──
  selectionCountBadge: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  selectionCountText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  canvasDimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 35,
  },
  // ── Align picker ──
  alignPickerContainer: {
    position: 'absolute',
    left: Space.sm,
    right: Space.sm,
    zIndex: 101,
    alignItems: 'center',
  },
  alignPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  alignPickerItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minWidth: 48,
    minHeight: 48,
    gap: 2,
  },
  alignPickerLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
  },
});
