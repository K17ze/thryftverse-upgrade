import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../theme/ThemeContext';
import { makeStableId } from '../../utils/createStableId';
import { useCreator } from '../CreatorContext';
import type { CreatorInitialMedia } from '../../navigation/types';
import type { CreatorLayer } from '../composition';
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
import { CreatorCutoutSheet } from '../CreatorCutoutSheet';
import { PressScale } from '../CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
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
//   Add item · Add photo · Cutout · Text · Layout
//
// Selected object produces a context toolbar (not a permanent dock).
// Global Layers remains More/Advanced.

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

function LookComposerInner() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const {
    document,
    selectedLayerId,
    selectLayer,
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
    autoArrangeLook,
    swapLookAsset,
    addLookProduct,
  } = useCreator();

  // ── Sheet / overlay state ──────────────────────────────────────────
  const [showLayers, setShowLayers] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);
  const [showTemplates, setShowTemplates] = useState(Boolean(route.params?.openTemplates));
  const [showOverflow, setShowOverflow] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [entryComplete, setEntryComplete] = useState(Boolean(route.params?.startBlank));
  const [cropTarget, setCropTarget] = useState<CreatorLayer | null>(null);
  const [cutoutTarget, setCutoutTarget] = useState<CreatorLayer | null>(null);
  const [editingLookId, setEditingLookId] = useState<string | null>(null);
  const [isLoadingSourceLook, setIsLoadingSourceLook] = useState(false);

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
        if (cropTarget) setCropTarget(null);
        else if (cutoutTarget) setCutoutTarget(null);
        else if (showPreview) setShowPreview(false);
        else if (showOverflow) setShowOverflow(false);
        else if (showPublish) setShowPublish(false);
        else if (showTemplates) setShowTemplates(false);
        else if (showLayers) setShowLayers(false);
        else if (showSettings) setShowSettings(false);
        else if (pickerMode) { setPickerMode(null); setEditingLayer(null); }
        else if (selectedLayerId) selectLayer(null);
        else handleBack();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerId) {
        e.preventDefault();
        removeLayer(selectedLayerId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canUndo, canRedo, undo, redo, cropTarget, cutoutTarget, showPreview, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, selectedLayerId, selectLayer, removeLayer, handleBack]);

  // Hardware back button — intercept to close sheets first
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (cropTarget) { setCropTarget(null); return true; }
        if (cutoutTarget) { setCutoutTarget(null); return true; }
        if (showPreview) { setShowPreview(false); return true; }
        if (showOverflow) { setShowOverflow(false); return true; }
        if (showPublish) { setShowPublish(false); return true; }
        if (showTemplates) { setShowTemplates(false); return true; }
        if (showLayers) { setShowLayers(false); return true; }
        if (showSettings) { setShowSettings(false); return true; }
        if (pickerMode) { setPickerMode(null); setEditingLayer(null); return true; }
        if (selectedLayerId) { selectLayer(null); return true; }
        return false;
      };
      return onBackPress;
    }, [cropTarget, cutoutTarget, showPreview, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, selectedLayerId, selectLayer])
  );

  const handleCanvasPress = useCallback(() => {
    Keyboard.dismiss();
    selectLayer(null);
    haptic.light();
  }, [selectLayer, haptic]);

  const handleLayerPress = useCallback((layerId: string) => {
    selectLayer(layerId);
    haptic.light();
  }, [selectLayer, haptic]);

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

  // ── "Try arrangement" — reversible AI/layout assistance ────────────
  // Per spec 10: Vision/AI may propose arrangement or pairings as a
  // reversible layout. Copy: "Try arrangement" NOT "AI Magic".
  // This cycles through layout presets (hero → pair → dominant → collage)
  // using the existing autoArrangeLook from CreatorContext. Each call is
  // a single history entry, fully reversible via undo.
  const [arrangementIndex, setArrangementIndex] = useState(0);
  const arrangements: Array<{ label: string; layout: 'hero' | 'pair' | 'dominant' | 'collage' }> = [
    { label: 'Hero', layout: 'hero' },
    { label: 'Pair', layout: 'pair' },
    { label: 'Dominant', layout: 'dominant' },
    { label: 'Collage', layout: 'collage' },
  ];

  const handleTryArrangement = useCallback(() => {
    const next = (arrangementIndex + 1) % arrangements.length;
    autoArrangeLook(arrangements[next].layout);
    setArrangementIndex(next);
    haptic.selection();
  }, [arrangementIndex, arrangements, autoArrangeLook, haptic]);

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

  // ── Bottom action handlers (default toolbar) ───────────────────────
  // Per spec 10: Add item, Add photo, Cutout, Text, Layout
  const handleAddItem = useCallback(() => {
    haptic.light();
    setPickerMode('product');
  }, [haptic]);

  const handleAddPhoto = useCallback(() => {
    haptic.light();
    setPickerMode('media');
  }, [haptic]);

  const handleAddText = useCallback(() => {
    haptic.light();
    setPickerMode('text');
  }, [haptic]);

  const handleOpenLayout = useCallback(() => {
    haptic.light();
    setShowTemplates(true);
  }, [haptic]);

  // Cutout from the default toolbar — opens the cutout sheet for the
  // currently selected media layer. If no media is selected, this is
  // a no-op (truthful UI — the action requires a media selection).
  const handleCutoutAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setCutoutTarget(selectedLayer);
  }, [selectedLayer, haptic]);

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
      {/* ── Neutral workspace canvas ─────────────────────────────────── */}
      {/* Look is spatial. The 4:5 canvas sits in a neutral dark workspace
          with breathing room. Media objects are directly manipulated. */}
      <View style={styles.canvasStage}>
        <View style={{ position: 'absolute', top: canvasVerticalOffset, left: 0, right: 0 }}>
          <CreatorCanvas
            document={document}
            page={page}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            mode="edit"
            selectedLayerId={selectedLayerId}
            onLayerPress={handleLayerPress}
            onCanvasPress={handleCanvasPress}
            onLayerTransformChange={(layerId, updates) => commitLayerTransform(layerId, updates, 'Transform object')}
            onLayerDoubleTap={(layerId) => {
              const l = page?.layers.find((x) => x.id === layerId);
              if (l?.type === 'text') {
                setEditingLayer(l);
                setPickerMode('text');
              }
            }}
            onLayerLongPress={(layerId) => {
              selectLayer(layerId);
              setShowLayers(true);
            }}
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
            <Ionicons name="images-outline" size={40} color="rgba(255,255,255,0.2)" />
            <Text style={styles.canvasEmptyHintTitle}>Start your look</Text>
            <Text style={styles.canvasEmptyHintBody}>
              Add photos, items, or text to compose your collage
            </Text>
          </View>
        )}
      </View>

      {/* ── Top bar — minimal, neutral ────────────────────────────────── */}
      {/* Look uses a neutral top bar (not the full-bleed gradient scrim
          of Poster). Close · Undo · Redo on the left; Next on the right.
          During selection: Done · object label · More. */}
      <View style={[styles.topBarContainer, { paddingTop: insets.top }]}>
        <View style={[styles.topBar, { backgroundColor: colors.surface }]}>
          <View style={styles.topBarRow}>
            {selectedLayer ? (
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

      {/* ── Context toolbar (selected object only) ────────────────────── */}
      {/* Per spec 10: "Selected object produces a context toolbar (not a
          permanent dock)." This appears only when an object is selected
          and provides object-specific actions: delete, duplicate, replace,
          front/back, crop, remove background, link/change item. */}
      {selectedLayer && (
        <View style={[styles.contextToolbarContainer, { bottom: insets.bottom + 88 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.contextToolbarContent}
          >
            {/* Type-specific primary action */}
            {selectedLayer.type === 'media' && (
              <>
                <ContextTool
                  icon="swap-horizontal-outline"
                  label="Replace"
                  onPress={() => handleReplaceMedia(selectedLayer)}
                  colors={colors}
                />
                <ContextTool
                  icon="cut-outline"
                  label="Cut out"
                  onPress={() => { haptic.medium(); setCutoutTarget(selectedLayer); }}
                  colors={colors}
                />
                <ContextTool
                  icon="crop-outline"
                  label="Crop"
                  onPress={() => { haptic.medium(); setCropTarget(selectedLayer); }}
                  colors={colors}
                />
              </>
            )}
            {selectedLayer.type === 'text' && (
              <ContextTool
                icon="create-outline"
                label="Edit"
                onPress={() => handleEditLayer(selectedLayer)}
                colors={colors}
              />
            )}
            {selectedLayer.type === 'product' && (
              <ContextTool
                icon="pricetag-outline"
                label="Change item"
                onPress={() => handleLinkItem(selectedLayer)}
                colors={colors}
              />
            )}

            {/* Z-order: front / back */}
            <ContextTool
              icon="arrow-up"
              label="Front"
              onPress={() => handleReorderLayer(selectedLayer.id, 'forward')}
              colors={colors}
            />
            <ContextTool
              icon="arrow-down"
              label="Back"
              onPress={() => handleReorderLayer(selectedLayer.id, 'backward')}
              colors={colors}
            />

            {/* Duplicate */}
            <ContextTool
              icon="copy-outline"
              label="Duplicate"
              onPress={() => handleDuplicateLayer(selectedLayer.id)}
              colors={colors}
            />

            {/* Delete — danger, separated */}
            <View style={[styles.contextDivider, { backgroundColor: colors.border }]} />
            <ContextTool
              icon="trash-outline"
              label="Delete"
              onPress={() => handleDeleteLayer(selectedLayer.id)}
              colors={colors}
              danger
            />
          </ScrollView>
        </View>
      )}

      {/* ── Bottom action bar (default — no selection) ────────────────── */}
      {/* Per spec 10: Add item · Add photo · Cutout · Text · Layout
          These are the five default bottom actions for the collage-native
          workspace. They are flat, transparent targets — no glass dock,
          no card-on-card. The "Try arrangement" assistance button sits
          at the end per spec 10. */}
      {!selectedLayer && (
        <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
          <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bottomBarContent}
            >
              <BottomAction
                icon="pricetag-outline"
                label="Add item"
                onPress={handleAddItem}
                colors={colors}
              />
              <BottomAction
                icon="images-outline"
                label="Add photo"
                onPress={handleAddPhoto}
                colors={colors}
              />
              <BottomAction
                icon="cut-outline"
                label="Cutout"
                onPress={handleCutoutAction}
                colors={colors}
                disabled={!selectedLayer}
              />
              <BottomAction
                icon="text"
                label="Text"
                onPress={handleAddText}
                colors={colors}
              />
              <BottomAction
                icon="grid-outline"
                label="Layout"
                onPress={handleOpenLayout}
                colors={colors}
              />
              {/* "Try arrangement" — reversible layout assistance per spec 10 */}
              {hasContent && (
                <>
                  <View style={[styles.bottomDivider, { backgroundColor: colors.border }]} />
                  <BottomAction
                    icon="shuffle-outline"
                    label="Try arrangement"
                    onPress={handleTryArrangement}
                    colors={colors}
                    accent
                  />
                </>
              )}
            </ScrollView>

            {/* More — opens overflow with Layers, Preview, Drafts, Settings */}
            <View style={[styles.bottomActions, { borderLeftColor: colors.border }]}>
              <PressScale
                onPress={() => { haptic.selection(); setShowOverflow(true); }}
                style={styles.bottomActionBtn}
                accessibilityLabel="More options"
                accessibilityHint="Opens layers, preview, drafts and settings"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="ellipsis-horizontal" size={24} color={colors.textSecondary} />
              </PressScale>
            </View>
          </View>
        </View>
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
              icon="settings-outline"
              label="Settings"
              onPress={() => { setShowSettings(true); setShowOverflow(false); }}
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
      {/* Crop sheet — aspect ratio crop for media objects */}
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
      {/* Cutout sheet — background removal as a real visual operation.
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
              // Replace the media layer's URI with the cutout result.
              // The cutout sheet only calls this with a real processed URI.
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

// ── Context toolbar button ───────────────────────────────────────────
// Flat, transparent 44pt target with a 22pt glyph. No card, no pill.
// The label sits below the icon. Danger uses the danger color.
const ContextTool = React.memo(function ContextTool({
  icon,
  label,
  onPress,
  colors,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  danger?: boolean;
}) {
  const haptic = useHaptic();
  return (
    <PressScale
      onPress={() => { haptic.light(); onPress(); }}
      style={styles.contextTool}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      <Ionicons
        name={icon}
        size={22}
        color={danger ? colors.danger : colors.textPrimary}
      />
      <Text
        style={[
          styles.contextToolLabel,
          { color: danger ? colors.danger : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressScale>
  );
});

// ── Bottom action button ─────────────────────────────────────────────
// Flat, transparent 44pt target with a 24pt glyph and label below.
// Accent uses the brand color for the "Try arrangement" assistance.
const BottomAction = React.memo(function BottomAction({
  icon,
  label,
  onPress,
  colors,
  disabled,
  accent,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      style={[styles.bottomAction, { opacity: disabled ? 0.3 : 1 }]}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      <Ionicons
        name={icon}
        size={24}
        color={accent ? colors.brand : colors.textPrimary}
      />
      <Text
        style={[
          styles.bottomActionLabel,
          { color: accent ? colors.brand : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressScale>
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
    marginTop: Space.sm,
  },
  canvasEmptyHintBody: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
  },
  // ── Context toolbar (selection mode) ──
  contextToolbarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 95,
  },
  contextToolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    gap: Space.sm,
  },
  contextTool: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    paddingHorizontal: Space.xs,
  },
  contextToolLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    marginTop: 2,
  },
  contextDivider: {
    width: 1,
    height: 28,
    marginHorizontal: Space.xs,
  },
  // ── Bottom action bar (default mode) ──
  bottomBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.xs,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    gap: Space.md,
  },
  bottomAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    paddingHorizontal: Space.xs,
  },
  bottomActionLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    marginTop: 2,
  },
  bottomDivider: {
    width: 1,
    height: 28,
    marginHorizontal: Space.xs,
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginLeft: 'auto',
    paddingLeft: Space.sm,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  bottomActionBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
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
});
