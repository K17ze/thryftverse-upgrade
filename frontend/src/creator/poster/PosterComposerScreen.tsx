import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Keyboard,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../theme/ThemeContext';
import { useCreator } from '../CreatorContext';
import type { CreatorInitialMedia } from '../../navigation/types';
import type { CreatorLayer } from '../composition';
import { CreatorCanvas } from '../CreatorCanvas';
import { CreatorLayersSheet } from '../CreatorLayersSheet';
import { CreatorPublishSheet } from '../CreatorPublishSheet';
import { CreatorSettingsSheet } from '../CreatorSettingsSheet';
import { CreatorAssetPicker, type AssetPickerMode } from '../CreatorAssetPicker';
import { CreatorTemplateBrowser } from '../CreatorTemplateBrowser';
import { CreatorPreviewOverlay } from '../CreatorPreviewOverlay';
import { CreatorEntryScreen } from '../CreatorEntryScreen';
import { PressScale } from '../CreatorAnimations';
import { LiquidGlassBackdrop } from '../../components/LiquidGlassBackdrop';
import { useHaptic } from '../../hooks/useHaptic';
import type { CreatorTemplate } from '../templates';
import { FrameTray } from '../studio/FrameTray';
import { PageMenu } from '../studio/PageMenu';
import { FrameTool, RailTool, OverflowItem, OpacityBar } from './PosterComposerParts';

// ───────────────────────────────────────────────────────────────────────────
// Poster Composer V3 — Frame-Native Composer (spec 09)
//
// Poster is temporal: a sequence of frames. The composer shows ONE
// current frame filling the screen, with frame navigation appearing
// only because there are multiple frames — not because "page
// management" is a permanent toolbar concept.
//
// Default chrome: close, Next, media-specific sound/clip control,
// contextual actions (Text, Stickers, Product, Draw, More).
//
// Frame overview (filmstrip) is invoked intentionally for reorder,
// delete, duplicate, add, select — it does not permanently occupy
// the canvas.
//
// Layers, Safe zone, Z-index, Page duration, Opacity and template
// management live in More/Advanced, not the first-run path.
//
// This screen uses the shared CreatorContext (document model) but
// does NOT import from CreatorStudioShell — it is a dedicated
// frame-native composer.
// ───────────────────────────────────────────────────────────────────────────

function layerTypeLabel(type: CreatorLayer['type']): string {
  switch (type) {
    case 'media': return 'Media';
    case 'text': return 'Text';
    case 'product': return 'Product';
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
    default: return 'Layer';
  }
}

function PosterComposerInner() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const {
    document,
    activePageIndex,
    setActivePageIndex,
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
    addPage,
    removePage,
    duplicatePage,
    updatePageDuration,
    reorderPages,
    commitLayerTransform,
    isLoadingDraft,
    setDocument,
    saveDraft,
    addPosterFrames,
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
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [entryComplete, setEntryComplete] = useState(Boolean(route.params?.startBlank));
  const [pageMenuIndex, setPageMenuIndex] = useState<number | null>(null);
  const [showFrameTray, setShowFrameTray] = useState(false);

  const page = document.pages[activePageIndex];
  const pageCount = document.pages.length;
  const hasMultipleFrames = pageCount > 1;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ── Full-screen 9:16 canvas geometry ───────────────────────────────
  // Poster is temporal and full-bleed (Instagram Stories pattern).
  // Canvas = full screen width, height = width / ratio (9:16).
  // On most phones this fills the full height. The canvas IS the stage.
  const canvasWidth = screenWidth;
  const canvasHeight = useMemo(() => {
    const h = Math.floor(screenWidth / document.canvas.aspectRatio);
    return Math.min(h, screenHeight);
  }, [screenWidth, document.canvas.aspectRatio, screenHeight]);

  const canvasVerticalOffset = useMemo(() => {
    if (canvasHeight >= screenHeight) return 0;
    return Math.floor((screenHeight - canvasHeight) / 2);
  }, [canvasHeight, screenHeight]);

  // ── Auto-show frame tray on frame change (doc 04) ──────────────────
  // "show a bottom frame tray that appears when frame change occurs or
  // user adds another frame." Auto-collapses after 3.5s to restore
  // full-screen canvas.
  useEffect(() => {
    if (!hasMultipleFrames) return;
    setShowFrameTray(true);
    const timer = setTimeout(() => setShowFrameTray(false), 3500);
    return () => clearTimeout(timer);
  }, [hasMultipleFrames, activePageIndex, pageCount]);

  // ── Truthful back — Save Draft / Discard / Keep Editing ────────────
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

  // ── Keyboard shortcuts (web/tablet only) ───────────────────────────
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
        if (pageMenuIndex !== null) setPageMenuIndex(null);
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
  }, [canUndo, canRedo, undo, redo, pageMenuIndex, showPreview, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, selectedLayerId, selectLayer, removeLayer, handleBack]);

  // ── Hardware back button — intercept to close sheets first ─────────
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (pageMenuIndex !== null) { setPageMenuIndex(null); return true; }
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
    }, [pageMenuIndex, showPreview, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, selectedLayerId, selectLayer])
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

  const hasContent = document.pages.some((p) => p.layers.length > 0);
  const showEntryScreen = !entryComplete && !hasContent && !isLoadingDraft;

  // ── Entry screen media handling ────────────────────────────────────
  // For Poster, each asset becomes its own frame via addPosterFrames.
  const handleEntryMediaSelected = useCallback((media: CreatorInitialMedia[]) => {
    addPosterFrames(media);
    setEntryComplete(true);
  }, [addPosterFrames]);

  const handleEntryBlankStart = useCallback(() => {
    setEntryComplete(true);
  }, []);

  const handleEntryClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // ── Frame navigation (swipe horizontal) ────────────────────────────
  // One current frame fills the viewport. Swipe horizontally to go to
  // the next/prev frame. The gesture only acts when there are multiple
  // frames and no layer is being dragged.
  const goToFrame = useCallback((index: number) => {
    if (index < 0 || index >= pageCount) return;
    if (index === activePageIndex) return;
    selectLayer(null);
    setActivePageIndex(index);
    haptic.light();
  }, [pageCount, activePageIndex, selectLayer, setActivePageIndex, haptic]);

  const frameSwipeGesture = useMemo(() => {
    let startX = 0;
    return Gesture.Pan()
      .activateAfterLongPress(300)
      .onBegin((e) => {
        'worklet';
        startX = e.x;
      })
      .onEnd((e) => {
        'worklet';
        const dx = e.x - startX;
        const threshold = screenWidth * 0.18;
        if (Math.abs(dx) < threshold) return;
        if (dx < 0) {
          // Swipe left → next frame
          runOnJS(goToFrame)(activePageIndex + 1);
        } else {
          // Swipe right → prev frame
          runOnJS(goToFrame)(activePageIndex - 1);
        }
      });
  }, [screenWidth, activePageIndex, goToFrame]);

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

  // ── Bottom tool rail handlers (default — no selection) ─────────────
  // Per spec 09: Text, Stickers, Product, Draw, More
  const handleAddText = useCallback(() => {
    haptic.light();
    setPickerMode('text');
  }, [haptic]);

  const handleAddStickers = useCallback(() => {
    haptic.light();
    setPickerMode('stickers');
  }, [haptic]);

  const handleAddProduct = useCallback(() => {
    haptic.light();
    setPickerMode('product');
  }, [haptic]);

  const handleDraw = useCallback(() => {
    haptic.light();
    setPickerMode('draw');
  }, [haptic]);

  const handleAddFrame = useCallback(() => {
    haptic.light();
    selectLayer(null);
    addPage();
  }, [haptic, selectLayer, addPage]);

  if (showEntryScreen) {
    return (
      <CreatorEntryScreen
        documentType="poster"
        onClose={handleEntryClose}
        onMediaSelected={handleEntryMediaSelected}
        onBlankStart={handleEntryBlankStart}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Full-screen frame canvas ─────────────────────────────────── */}
      {/* One current frame fills the viewport. Horizontal swipe navigates
          between frames. Chrome floats over it with gradient/blur. */}
      <GestureDetector gesture={frameSwipeGesture}>
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
              onLayerTransformChange={(layerId, updates) => commitLayerTransform(layerId, updates, 'Transform layer')}
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
          {isLoadingDraft && (
            <View style={styles.canvasLoadingOverlay} pointerEvents="none">
              <View style={styles.canvasLoadingPill}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.canvasLoadingText}>Loading…</Text>
              </View>
            </View>
          )}

          {/* Empty frame hint */}
          {!hasContent && !isLoadingDraft && entryComplete && !selectedLayer && (
            <View style={styles.canvasEmptyHint} pointerEvents="none">
              <Ionicons name="add-circle-outline" size={40} color="rgba(255,255,255,0.25)" />
              <Text style={styles.canvasEmptyHintTitle}>Start your story</Text>
              <Text style={styles.canvasEmptyHintBody}>
                Use the tools below to add text, stickers, and media
              </Text>
            </View>
          )}

          {/* Safe zone overlay (advanced — behind More) */}
          {showSafeZone && (
            <View style={styles.safeZoneOverlay} pointerEvents="none">
              <View style={[styles.safeZoneTop, { top: 0, height: insets.top + 56 }]}>
                <View style={styles.safeZoneLabel}>
                  <Ionicons name="shield-outline" size={10} color="#C9A46A" />
                  <Text style={styles.safeZoneLabelText}>Top chrome</Text>
                </View>
              </View>
              <View style={[styles.safeZoneBottom, { bottom: 0, height: insets.bottom + 120 }]}>
                <View style={styles.safeZoneLabel}>
                  <Ionicons name="shield-outline" size={10} color="#C9A46A" />
                  <Text style={styles.safeZoneLabelText}>Tool dock</Text>
                </View>
              </View>
              <View style={[styles.safeZoneContent, { top: insets.top + 56, bottom: insets.bottom + 120 }]} />
            </View>
          )}
        </View>
      </GestureDetector>

      {/* ── Top bar — BlurView + gradient scrim (Stories pattern) ────── */}
      <View style={[styles.topBarContainer, { paddingTop: insets.top }]}>
        <BlurView intensity={20} tint="dark" style={styles.topBarScrim} />
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']}
          style={styles.topBarScrimOverlay}
        />
        <View style={[styles.topBar, { backgroundColor: 'transparent' }]}>
          <View style={styles.topBarRow}>
            {selectedLayer ? (
              /* During selection: Done · object name · More */
              <>
                <PressScale
                  onPress={() => { haptic.light(); selectLayer(null); }}
                  style={styles.topBtn}
                  accessibilityLabel="Done"
                  accessibilityHint="Deselects the current layer and exits selection mode"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.doneText}>Done</Text>
                </PressScale>

                <View style={styles.topCenter}>
                  <Text style={styles.titleText} numberOfLines={1}>
                    {layerTypeLabel(selectedLayer.type)}
                  </Text>
                </View>

                <View style={styles.topRight}>
                  <PressScale
                    onPress={() => { haptic.light(); setShowOverflow(true); }}
                    style={styles.topBtn}
                    accessibilityLabel="More options"
                    accessibilityHint="Opens the overflow menu with undo, redo, preview and more"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
                  </PressScale>
                </View>
              </>
            ) : (
              /* Default: Close · Undo · Redo · Next (Instagram minimalism) */
              <>
                <View style={styles.topLeftGroup}>
                  <PressScale
                    onPress={handleBack}
                    style={styles.topBtn}
                    accessibilityLabel="Close editor"
                    accessibilityHint="Closes the composer, offers to save draft if there are unsaved changes"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="close" size={26} color="#fff" />
                  </PressScale>
                  {isDirty && <View style={styles.unsavedDot} />}
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
                    <Ionicons name="arrow-undo" size={22} color="#fff" />
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
                    <Ionicons name="arrow-redo" size={22} color="#fff" />
                  </PressScale>
                </View>

                <View style={styles.topRightGroup}>
                  <PressScale
                    onPress={() => { haptic.medium(); setShowPublish(true); }}
                    style={[styles.publishBtn, { backgroundColor: colors.brand }]}
                    accessibilityLabel="Next"
                    accessibilityHint="Opens the publish sheet to review and publish your story"
                    scale={0.97}
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  >
                    <Text style={styles.publishBtnText}>Next</Text>
                  </PressScale>
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      {/* ── Frame progress segments (quieter in editor) ──────────────── */}
      {/* Instagram-style progress segments at the very top, but quieter
          in the editor: thinner tracks, lower contrast. Only shown when
          there are multiple frames. Tapping a segment switches frames;
          long-press opens frame options. The frame-tray toggle and add-
          frame control sit at the end of the row. */}
      {hasMultipleFrames && !selectedLayer && (
        <View style={[styles.pageSegmentsContainer, { top: insets.top + 6 }]}>
          <View style={styles.pageSegmentsRow}>
            {document.pages.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => goToFrame(i)}
                onLongPress={() => { haptic.medium(); setPageMenuIndex(i); }}
                style={styles.pageSegmentTarget}
                accessibilityLabel={`Frame ${i + 1}`}
                accessibilityHint="Switches to this frame. Long press for frame options."
                accessibilityRole="button"
                accessibilityState={{ selected: i === activePageIndex }}
                hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
              >
                <View style={styles.pageSegmentTrack}>
                  <View
                    style={[
                      styles.pageSegmentFill,
                      {
                        flex: i === activePageIndex ? 1 : 0,
                        backgroundColor: i <= activePageIndex ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                      },
                    ]}
                  />
                </View>
              </Pressable>
            ))}
            {/* Frame tray toggle */}
            <PressScale
              onPress={() => { haptic.light(); setShowFrameTray((p) => !p); }}
              style={styles.pageSegmentToggle}
              accessibilityLabel="Toggle frame tray"
              accessibilityHint="Shows or hides the bottom frame thumbnail tray"
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Ionicons name="film-outline" size={14} color={showFrameTray ? '#fff' : 'rgba(255,255,255,0.5)'} />
            </PressScale>
            {/* Add frame */}
            {pageCount < 10 && (
              <PressScale
                onPress={handleAddFrame}
                style={styles.pageSegmentAdd}
                accessibilityLabel="Add frame"
                accessibilityHint="Adds a new frame to the story"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="add" size={14} color="rgba(255,255,255,0.8)" />
              </PressScale>
            )}
          </View>
        </View>
      )}

      {/* ── Bottom gradient scrim ────────────────────────────────────── */}
      <View style={styles.bottomScrimContainer} pointerEvents="none">
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.6)']}
          style={styles.bottomScrim}
        />
      </View>

      {/* ── Context toolbar (selected layer only) ────────────────────── */}
      {/* Per spec 09: selected object produces a context toolbar, not a
          permanent dock. Object-specific actions: edit, front/back,
          duplicate, delete. Opacity lives here too (not permanent chrome). */}
      {selectedLayer && (
        <View style={[styles.contextToolbarContainer, { bottom: insets.bottom + 88 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.contextToolbarContent}
          >
            {/* Type-specific primary action */}
            {selectedLayer.type === 'text' && (
              <FrameTool
                icon="create-outline"
                label="Edit"
                onPress={() => handleEditLayer(selectedLayer)}
              />
            )}
            {selectedLayer.type === 'media' && (
              <FrameTool
                icon="swap-horizontal-outline"
                label="Replace"
                onPress={() => handleEditLayer(selectedLayer)}
              />
            )}
            {selectedLayer.type === 'product' && (
              <FrameTool
                icon="pricetag-outline"
                label="Change"
                onPress={() => handleEditLayer(selectedLayer)}
              />
            )}

            {/* Z-order: front / back (advanced, but useful in context) */}
            <FrameTool
              icon="arrow-up"
              label="Front"
              onPress={() => handleReorderLayer(selectedLayer.id, 'forward')}
            />
            <FrameTool
              icon="arrow-down"
              label="Back"
              onPress={() => handleReorderLayer(selectedLayer.id, 'backward')}
            />

            {/* Duplicate */}
            <FrameTool
              icon="copy-outline"
              label="Duplicate"
              onPress={() => handleDuplicateLayer(selectedLayer.id)}
            />

            {/* Opacity — drag slider, not permanent chrome */}
            <View style={styles.opacityInline}>
              <OpacityBar
                value={selectedLayer.opacity ?? 1}
                onChange={(v) => updateLayer(selectedLayer.id, { opacity: v }, 'Adjust opacity')}
                onCommit={(v) => commitLayerTransform(selectedLayer.id, { opacity: v }, 'Adjust opacity')}
              />
            </View>

            {/* Delete — danger, separated */}
            <View style={styles.contextDivider} />
            <FrameTool
              icon="trash-outline"
              label="Delete"
              onPress={() => handleDeleteLayer(selectedLayer.id)}
              danger
            />
          </ScrollView>
        </View>
      )}

      {/* ── Bottom tool rail (default — no selection) ────────────────── */}
      {/* Per spec 09: Text, Stickers, Product, Draw, More.
          Flat, transparent targets on a glass surface — no card-on-card.
          Frame count indicator sits at the start when multiple frames. */}
      {!selectedLayer && (
        <View style={[styles.bottomRailContainer, { paddingBottom: insets.bottom }]}>
          <View style={styles.bottomRailHairline} />
          <LiquidGlassBackdrop intensity={50} tint="dark" absoluteFill={false} style={styles.bottomRailGlass}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bottomRailContent}
            >
              {/* Frame count — tappable to open frame tray */}
              {hasMultipleFrames && (
                <>
                  <PressScale
                    onPress={() => { haptic.light(); setShowFrameTray((p) => !p); }}
                    style={styles.frameCountBtn}
                    accessibilityLabel={`Frame ${activePageIndex + 1} of ${pageCount}`}
                    accessibilityHint="Opens the frame tray to reorder, delete, or add frames"
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <Text style={styles.frameCountText}>
                      {activePageIndex + 1}/{pageCount}
                    </Text>
                  </PressScale>
                  <View style={styles.railDivider} />
                </>
              )}

              <RailTool icon="text" label="Text" onPress={handleAddText} />
              <RailTool icon="happy-outline" label="Stickers" onPress={handleAddStickers} />
              <RailTool icon="pricetag-outline" label="Product" onPress={handleAddProduct} />
              <RailTool icon="brush-outline" label="Draw" onPress={handleDraw} />

              <View style={styles.railDivider} />

              {/* Add frame — only when room */}
              {pageCount < 10 && (
                <RailTool icon="add-circle-outline" label="Add frame" onPress={handleAddFrame} />
              )}

              {/* More — opens overflow with Layers, Preview, Drafts, Settings */}
              <View style={styles.railDivider} />
              <PressScale
                onPress={() => { haptic.selection(); setShowOverflow(true); }}
                style={styles.railMoreBtn}
                accessibilityLabel="More options"
                accessibilityHint="Opens layers, preview, drafts and settings"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="ellipsis-horizontal" size={24} color="rgba(255,255,255,0.85)" />
              </PressScale>
            </ScrollView>
          </LiquidGlassBackdrop>
        </View>
      )}

      {/* ── Frame tray (collapsible filmstrip) ───────────────────────── */}
      {/* Per doc 04: appears when frame change occurs or user adds another
          frame. Auto-collapses after 3.5s. Sits above the tool rail. */}
      {hasMultipleFrames && showFrameTray && (
        <FrameTray
          pages={document.pages}
          activePageIndex={activePageIndex}
          onSelectPage={(i) => { selectLayer(null); setActivePageIndex(i); }}
          onLongPressPage={(i) => setPageMenuIndex(i)}
          onAddPage={handleAddFrame}
          onCollapse={() => setShowFrameTray(false)}
          bottomOffset={insets.bottom + 120}
        />
      )}

      {/* ── Overflow menu (More) ─────────────────────────────────────── */}
      {/* Advanced controls: Layers, Preview, Safe Zone, Templates, Drafts,
          Settings. These are NOT first-run chrome per spec 09. */}
      {showOverflow && (
        <View style={[styles.overflowContainer, { top: insets.top + 52 }]}>
          <View style={styles.overflowMenu}>
            <OverflowItem
              icon="layers-outline"
              label="Layers"
              onPress={() => { setShowLayers(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="eye-outline"
              label="Preview"
              onPress={() => { setShowPreview(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon={showSafeZone ? 'shield-checkmark-outline' : 'shield-outline'}
              label={showSafeZone ? 'Safe Zone On' : 'Safe Zone'}
              onPress={() => { setShowSafeZone((p) => !p); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="grid-outline"
              label="Templates"
              onPress={() => { setShowTemplates(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="document-text-outline"
              label="Drafts"
              onPress={() => { navigation.navigate('CreatorDraftList'); setShowOverflow(false); }}
            />
            <View style={styles.overflowDivider} />
            <OverflowItem
              icon="settings-outline"
              label="Settings"
              onPress={() => { setShowSettings(true); setShowOverflow(false); }}
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
      <CreatorPublishSheet visible={showPublish} onClose={() => setShowPublish(false)} />
      <CreatorSettingsSheet visible={showSettings} onClose={() => setShowSettings(false)} />
      <CreatorTemplateBrowser
        visible={showTemplates}
        documentType="poster"
        hasExistingWork={document.pages.some((p) => p.layers.length > 0)}
        onClose={() => setShowTemplates(false)}
        onApply={(template: CreatorTemplate) => {
          const doc = template.build();
          setDocument(doc);
        }}
      />
      <CreatorAssetPicker
        visible={pickerMode !== null}
        mode={pickerMode ?? 'media'}
        editingLayer={editingLayer}
        onClose={() => { setPickerMode(null); setEditingLayer(null); }}
        onAddLayer={(layer) => {
          if (editingLayer) {
            updateLayer(editingLayer.id, layer, 'Edit layer');
          } else {
            addLayer(layer);
          }
        }}
      />
      {/* Frame options sheet (duration + duplicate + reorder + delete) */}
      {pageMenuIndex !== null && (
        <PageMenu
          pageIndex={pageMenuIndex}
          pageCount={pageCount}
          currentDuration={document.pages[pageMenuIndex]?.durationMs ?? 5000}
          onClose={() => setPageMenuIndex(null)}
          onSetDuration={(ms) => { updatePageDuration(pageMenuIndex, ms); }}
          onDuplicate={() => { duplicatePage(pageMenuIndex); setPageMenuIndex(null); }}
          onDelete={() => { removePage(pageMenuIndex); setPageMenuIndex(null); }}
          onMoveLeft={() => { if (pageMenuIndex > 0) { reorderPages(pageMenuIndex, pageMenuIndex - 1); setActivePageIndex(pageMenuIndex - 1); } setPageMenuIndex(null); }}
          onMoveRight={() => { if (pageMenuIndex < pageCount - 1) { reorderPages(pageMenuIndex, pageMenuIndex + 1); setActivePageIndex(pageMenuIndex + 1); } setPageMenuIndex(null); }}
        />
      )}
    </View>
  );
}

// ── Screen wrapper — wraps in CreatorProvider (shared state) ─────────
export function PosterComposerScreen(props: {
  draftId?: string;
  templateId?: string;
  sourceDocumentId?: string;
  initialMediaUri?: string;
  initialMedia?: CreatorInitialMedia[];
  startBlank?: boolean;
  openTemplates?: boolean;
}) {
  return (
    <PosterComposerScreenWithProvider {...props} />
  );
}

// This is the full screen with CreatorProvider. It is used by the
// CreatorStudioScreen wrapper in CreatorStudioShell which branches on
// document type. The wrapper there passes route params to this component.
function PosterComposerScreenWithProvider(props: {
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
      initialType="poster"
      draftId={props.draftId}
      templateId={props.templateId}
      sourceDocumentId={props.sourceDocumentId}
      initialMediaUri={props.initialMediaUri}
      initialMedia={props.initialMedia}
    >
      <PosterComposerInner />
    </CreatorProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // ── Full-screen canvas stage ──
  canvasStage: {
    ...StyleSheet.absoluteFill,
  },
  // ── Top bar (BlurView + gradient scrim) ──
  topBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topBarScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    zIndex: -1,
  },
  topBarScrimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    zIndex: -1,
  },
  topBar: {
    height: 56,
    paddingHorizontal: Space.sm,
    borderBottomWidth: 0,
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
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    color: '#fff',
  },
  doneText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    color: '#fff',
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
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
    color: '#fff',
  },
  unsavedDot: {
    width: 7,
    height: 7,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: '#C9A46A',
    marginLeft: -Space.xs,
    marginTop: Space.xs + 2,
  },
  // ── Frame progress segments (quieter in editor) ──
  pageSegmentsContainer: {
    position: 'absolute',
    left: Space.sm,
    right: Space.sm,
    zIndex: 110,
  },
  pageSegmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageSegmentTarget: {
    flex: 1,
    height: 14,
    justifyContent: 'center',
  },
  pageSegmentTrack: {
    height: 2,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  pageSegmentFill: {
    height: 2,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  pageSegmentAdd: {
    width: 22,
    height: 22,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageSegmentToggle: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
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
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    color: 'rgba(255,255,255,0.45)',
    marginTop: Space.sm,
  },
  canvasEmptyHintBody: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
  },
  // ── Safe zone overlay ──
  safeZoneOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 45,
  },
  safeZoneTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(201,164,106,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,164,106,0.4)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  safeZoneBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(201,164,106,0.06)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,164,106,0.4)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  safeZoneContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: 'rgba(201,164,106,0.25)',
    borderStyle: 'dashed',
  },
  safeZoneLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  safeZoneLabelText: {
    fontFamily: FontFamily.medium,
    fontSize: 9,
    color: '#C9A46A',
    letterSpacing: 0.3,
  },
  // ── Bottom gradient scrim ──
  bottomScrimContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    zIndex: 95,
  },
  bottomScrim: {
    flex: 1,
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
  contextDivider: {
    width: 1,
    height: 28,
    marginHorizontal: Space.xs,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  opacityInline: {
    minWidth: 120,
  },
  // ── Bottom tool rail (default mode) ──
  bottomRailContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  bottomRailHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  bottomRailGlass: {
    flex: 1,
    borderTopLeftRadius: RadiusRoleValue.standalonePanel,
    borderTopRightRadius: RadiusRoleValue.standalonePanel,
    overflow: 'hidden',
    paddingVertical: Space.xs,
  },
  bottomRailContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    gap: Space.md,
  },
  frameCountBtn: {
    minWidth: 48,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameCountText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
    color: '#fff',
  },
  railDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  railMoreBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Overflow menu ──
  overflowContainer: {
    position: 'absolute',
    right: Space.sm,
    zIndex: 120,
  },
  overflowMenu: {
    borderRadius: RadiusRoleValue.standalonePanel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(20,20,22,0.95)',
    paddingVertical: Space.xs,
    minWidth: 200,
  },
  overflowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: Space.xs,
  },
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: -1,
  },
});
