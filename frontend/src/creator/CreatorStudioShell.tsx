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
  Platform,
  LayoutChangeEvent,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Space, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { useAppTheme } from '../theme/ThemeContext';
import { CreatorProvider, useCreator } from './CreatorContext';
import type { CreatorInitialMedia } from '../navigation/types';
import type { CreatorLayer } from './composition';
import { computeLookLayout } from './composition';
import { CreatorCanvas } from './CreatorCanvas';
import { CreatorLayersSheet } from './CreatorLayersSheet';
import { CreatorToolDock } from './CreatorToolDock';
import { CreatorPublishSheet } from './CreatorPublishSheet';
import { CreatorSettingsSheet } from './CreatorSettingsSheet';
import { CreatorAssetPicker, type AssetPickerMode } from './CreatorAssetPicker';
import { CreatorTemplateBrowser } from './CreatorTemplateBrowser';
import { CreatorPreviewOverlay } from './CreatorPreviewOverlay';
import { CreatorEntryScreen } from './CreatorEntryScreen';
import { CreatorCropSheet } from './CreatorCropSheet';
import { CreatorCutoutSheet } from './CreatorCutoutSheet';
import { PressScale } from './CreatorAnimations';
import { LiquidGlassBackdrop } from '../components/LiquidGlassBackdrop';
import { useHaptic } from '../hooks/useHaptic';
import { fetchLookByIdFromApi } from '../services/looksApi';
import { lookToDocument } from './viewerAdapters';
import type { CreatorTemplate } from './templates';
import { PageMenu } from './studio/PageMenu';
import { OverflowMenu } from './studio/OverflowMenu';
import { FrameTray } from './studio/FrameTray';

const { width: SCREEN_W } = Dimensions.get('window');

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

function CreatorStudioInner() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { document, activePageIndex, setActivePageIndex, selectedLayerId, selectLayer, canUndo, canRedo, undo, redo, isDirty, removeLayer, duplicateLayer, reorderLayer, updateLayer, addLayer, addPage, removePage, duplicatePage, updatePageDuration, reorderPages, commitLayerTransform, isLoadingDraft, setDocument, saveDraft, addPosterFrames } = useCreator();

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
  const [cropTarget, setCropTarget] = useState<CreatorLayer | null>(null);
  const [cutoutTarget, setCutoutTarget] = useState<CreatorLayer | null>(null);
  const [pageMenuIndex, setPageMenuIndex] = useState<number | null>(null);
  const [editingLookId, setEditingLookId] = useState<string | null>(null);
  const [isLoadingSourceLook, setIsLoadingSourceLook] = useState(false);
  const [showFrameTray, setShowFrameTray] = useState(false);

  const sourceDocumentId = route.params?.sourceDocumentId as string | undefined;

  // ── Edit mode: load an existing published look for editing ────────
  // When sourceDocumentId refers to a published look (not a local draft),
  // fetch it from the API and load it into the canvas as the working
  // document. The remix path in CreatorContext handles local-draft
  // sourceDocumentIds via CreatorDraftService; a published look ID will
  // not be found there, so this effect picks it up from the API instead.
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

  // Show entry screen when document is empty and not loading a draft/template/source look
  const hasContent = document.pages.some((p) => p.layers.length > 0);
  const showEntryScreen = !entryComplete && !hasContent && !isLoadingDraft && !isLoadingSourceLook;

  const page = document.pages[activePageIndex];
  const isLook = document.type === 'look';
  const isPoster = document.type === 'poster';

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Auto-show the frame tray briefly when a new frame is added or when
  // the active page changes, so the user sees frame order. Per doc 04:
  // "show a bottom frame tray that appears when frame change occurs or
  // user adds another frame." The tray auto-collapses after 3.5s to
  // restore full-screen canvas.
  useEffect(() => {
    if (!isPoster || document.pages.length <= 1) return;
    setShowFrameTray(true);
    const timer = setTimeout(() => setShowFrameTray(false), 3500);
    return () => clearTimeout(timer);
  }, [isPoster, document.pages.length, activePageIndex]);

  // ── Full-screen immersive canvas (Instagram Stories pattern) ──────
  // The canvas fills the ENTIRE screen. Chrome floats over it with
  // gradient/blur overlays. No padding, no card, no reserved space.
  //
  // For Poster (9:16): canvas = full screen width, height = width / ratio.
  //   On most phones this fills the full height. The canvas IS the stage.
  // For Look (4:5): canvas = full screen width, height = width / ratio.
  //   4:5 is squarer, so there will be space above/below — the canvas
  //   centers vertically and the background fills the rest.
  const canvasWidth = screenWidth;
  const canvasHeight = useMemo(() => {
    const h = Math.floor(screenWidth / document.canvas.aspectRatio);
    // For 9:16 poster, cap at screen height so it doesn't overflow
    return Math.min(h, screenHeight);
  }, [screenWidth, document.canvas.aspectRatio, screenHeight]);

  // Canvas is vertically centered if shorter than screen
  const canvasVerticalOffset = useMemo(() => {
    if (canvasHeight >= screenHeight) return 0;
    return Math.floor((screenHeight - canvasHeight) / 2);
  }, [canvasHeight, screenHeight]);

  // Truthful back — offers Save Draft / Discard / Keep Editing when dirty.
  // This is honest: the draft is actually persisted to the draft service.
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

  // ── Undo/Redo with haptic feedback ────────────────────────────────
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

  // Autosave status for the top bar (saving / saved / failed with retry)
  const handleAutosaveRetry = useCallback(() => {
    saveDraft();
  }, [saveDraft]);

  // Handle media selection from entry screen. The entry screen now
  // returns a typed CreatorInitialMedia[] payload in tap/selection order.
  // For Poster, each asset becomes its own page (frame) via the semantic
  // addPosterFrames helper. For Look, each asset becomes an auto-arranged
  // media layer on page 0 — never N identical full-bleed overlaps.
  const handleEntryMediaSelected = useCallback((media: CreatorInitialMedia[]) => {
    if (document.type === 'poster') {
      addPosterFrames(media);
    } else {
      // Look: build auto-arranged layers and set the document in one
      // operation. This avoids multiple history entries from looping
      // addLayer, and ensures the canvas is immediately useful with
      // proper layout (hero, pair, dominant, or collage) per doc 05.
      const mediaLayers: CreatorLayer[] = media.map((asset, i) => ({
        id: `media_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
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
    }
    setEntryComplete(true);
  }, [document, addPosterFrames, setDocument]);

  const handleEntryBlankStart = useCallback(() => {
    setEntryComplete(true);
  }, []);

  const handleEntryClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  if (showEntryScreen) {
    return (
      <CreatorEntryScreen
        documentType={document.type}
        onClose={handleEntryClose}
        onMediaSelected={handleEntryMediaSelected}
        onBlankStart={handleEntryBlankStart}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Full-screen canvas ────────────────────────────────────────── */}
      {/* The canvas fills the entire screen. All chrome floats over it
          with gradient/blur overlays. This is the Instagram Stories
          pattern: media dominates, chrome recedes. */}
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

        {/* ── Canvas loading overlay ──────────────────────────────────── */}
        {/* Subtle progress indicator when loading a source look or draft.
            Instagram shows a thin progress bar; we use a centered spinner
            on the dark canvas — minimal, non-blocking, recedes once media
            is ready. */}
        {(isLoadingSourceLook || isLoadingDraft) && (
          <View style={styles.canvasLoadingOverlay} pointerEvents="none">
            <View style={styles.canvasLoadingPill}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.canvasLoadingText}>Loading…</Text>
            </View>
          </View>
        )}

        {/* ── Empty canvas hint ───────────────────────────────────────── */}
        {/* When the user starts blank, the canvas is empty. Instagram shows
            a subtle prompt to begin creating. This hint recedes the moment
            any layer is added. It sits behind all chrome (zIndex 40) and
            does not intercept touches. */}
        {!hasContent && !isLoadingSourceLook && !isLoadingDraft && entryComplete && !selectedLayer && (
          <View style={styles.canvasEmptyHint} pointerEvents="none">
            <Ionicons name="add-circle-outline" size={40} color="rgba(255,255,255,0.25)" />
            <Text style={styles.canvasEmptyHintTitle}>Start creating</Text>
            <Text style={styles.canvasEmptyHintBody}>
              Use the tools below to add text, stickers, and media
            </Text>
          </View>
        )}

        {/* ── Safe zone overlay ────────────────────────────────────────── */}
        {/* Toggled from the overflow menu. Shows the safe-zone guides so the
            creator can verify their composition won't be occluded by the
            top bar (BlurView + page segments), bottom tool dock, or device
            safe-area insets (notch / dynamic island / home indicator).
            The overlay is non-interactive (pointerEvents none) and uses
            dashed amber outlines so it reads as a guide, not a selection. */}
        {showSafeZone && (
          <View style={styles.safeZoneOverlay} pointerEvents="none">
            {/* Top safe zone — covers the BlurView top bar + page segments */}
            <View style={[styles.safeZoneTop, { top: 0, height: insets.top + 56 }]}>
              <View style={styles.safeZoneLabel}>
                <Ionicons name="shield-outline" size={10} color="#C9A46A" />
                <Text style={styles.safeZoneLabelText}>Top chrome</Text>
              </View>
            </View>
            {/* Bottom safe zone — covers the tool dock + home indicator */}
            <View style={[styles.safeZoneBottom, { bottom: 0, height: insets.bottom + 120 }]}>
              <View style={styles.safeZoneLabel}>
                <Ionicons name="shield-outline" size={10} color="#C9A46A" />
                <Text style={styles.safeZoneLabelText}>Tool dock</Text>
              </View>
            </View>
            {/* Safe content area indicator — dashed border on the safe region */}
            <View
              style={[
                styles.safeZoneContent,
                {
                  top: insets.top + 56,
                  bottom: insets.bottom + 120,
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* ── Top bar — BlurView backdrop + subtle gradient scrim (Snapchat 2026 / TikTok pattern) ── */}
      {/* Native blur on iOS makes canvas content visible underneath while keeping
          controls readable. On Android, BlurView falls back to a semi-transparent
          fill, so a subtle gradient overlay ensures legibility on both platforms. */}
      <View style={[styles.topBarContainer, { paddingTop: insets.top }]}>
        <BlurView
          intensity={20}
          tint="dark"
          style={styles.topBarScrim}
        />
        {/* Subtle gradient overlay for text legibility over bright canvas content */}
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']}
          style={styles.topBarScrimOverlay}
        />
        <View style={[styles.topBar, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}>
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
                  <Text style={[styles.doneText, { color: '#fff' }]}>Done</Text>
                </PressScale>

                <View style={styles.topCenter}>
                  <Text style={[styles.titleText, { color: '#fff' }]} numberOfLines={1}>
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
              /* Default: Close (X) · Undo · Redo · Next (Instagram minimalism) */
              <>
                <View style={styles.topLeftGroup}>
                  <PressScale
                    onPress={handleBack}
                    style={styles.topBtn}
                    accessibilityLabel="Close editor"
                    accessibilityHint="Closes the studio, offers to save draft if there are unsaved changes"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="close" size={26} color="#fff" />
                  </PressScale>
                  {/* Unsaved-changes dot — subtle indicator when the document
                      has unsaved edits. Appears next to the close button as a
                      small amber dot, communicating state without clutter. */}
                  {isDirty && (
                    <View style={styles.unsavedDot} />
                  )}
                </View>

                {/* Undo/Redo — spring scale on press, disabled at 0.3 opacity */}
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
                    accessibilityHint="Opens the publish sheet to review and publish your creation"
                    scale={0.97}
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  >
                    <Text style={[styles.publishBtnText, { color: '#fff' }]}>Next</Text>
                  </PressScale>
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      {/* ── Page segment bars (poster) — Instagram-style progress segments ── */}
      {/* Thin horizontal bars at the very top of the viewport, identical to
          Instagram Stories' story progress indicators. The active page is
          filled white; inactive pages are translucent. Tapping a segment
          switches pages; long-press opens page options. The add-page
          control is a compact + button at the end of the row. */}
      {isPoster && document.pages.length > 1 && (
        <View style={[styles.pageSegmentsContainer, { top: insets.top + 6 }]}>
          <View style={styles.pageSegmentsRow}>
            {document.pages.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => { haptic.light(); selectLayer(null); setActivePageIndex(i); }}
                onLongPress={() => setPageMenuIndex(i)}
                style={styles.pageSegmentTarget}
                accessibilityLabel={`Page ${i + 1}`}
                accessibilityHint="Switches to this page. Long press for page options."
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
                        backgroundColor: i <= activePageIndex ? '#fff' : 'rgba(255,255,255,0.3)',
                      },
                    ]}
                  />
                </View>
              </Pressable>
            ))}
            {/* Frame tray toggle — compact film icon that re-opens the
                collapsible frame filmstrip when it has auto-collapsed. */}
            <PressScale
              onPress={() => { haptic.light(); setShowFrameTray((p) => !p); }}
              style={styles.pageSegmentToggle}
              accessibilityLabel="Toggle frame tray"
              accessibilityHint="Shows or hides the bottom frame thumbnail tray"
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Ionicons name="film-outline" size={14} color={showFrameTray ? '#fff' : 'rgba(255,255,255,0.5)'} />
            </PressScale>
            {/* Add page — compact + at end of segment row */}
            {document.pages.length < 10 && (
              <PressScale
                onPress={() => { haptic.light(); selectLayer(null); addPage(); }}
                style={styles.pageSegmentAdd}
                accessibilityLabel="Add page"
                accessibilityHint="Adds a new page to the story"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="add" size={14} color="rgba(255,255,255,0.8)" />
              </PressScale>
            )}
          </View>
        </View>
      )}

      {/* ── Bottom gradient scrim — grounds the tool dock visually ─────── */}
      {/* A subtle dark-to-transparent gradient above the bottom rail so the
          glass dock feels anchored to the canvas, not floating arbitrarily.
          This mirrors the top scrim for visual symmetry. */}
      <View style={styles.bottomScrimContainer} pointerEvents="none">
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.6)']}
          style={styles.bottomScrim}
        />
      </View>

      {/* ── Floating bottom rail with Liquid Glass backdrop ──────────── */}
      {/* Premium glassmorphism: Liquid Glass on iOS 26+, BlurView fallback
          elsewhere. The tool dock sits on top of this glass surface. A
          hairline top border grounds the glass against the canvas. */}
      <View style={[styles.bottomRailContainer, { paddingBottom: insets.bottom }]}>
        <View style={styles.bottomRailHairline} />
        <LiquidGlassBackdrop intensity={50} tint="dark" absoluteFill={false} style={styles.bottomRailGlass}>
          {/* Opacity slider — appears when a layer is selected (Instagram pattern) */}
          {selectedLayer && (
            <OpacityBar
              value={selectedLayer.opacity ?? 1}
              onChange={(v) => updateLayer(selectedLayer.id, { opacity: v }, 'Adjust opacity')}
              onCommit={(v) => commitLayerTransform(selectedLayer.id, { opacity: v }, 'Adjust opacity')}
            />
          )}
          <CreatorToolDock
            selectedLayer={selectedLayer}
            onPublish={() => setShowPublish(true)}
            onSettings={() => setShowSettings(true)}
            onToolPress={(tool) => setPickerMode(tool)}
            onEditLayer={(layer) => {
              setEditingLayer(layer);
              if (layer.type === 'text') setPickerMode('text');
              else if (layer.type === 'media') setPickerMode('media');
              else if (layer.type === 'product') setPickerMode('product');
              else if (layer.type === 'mention') setPickerMode('mention');
              else if (layer.type === 'vote') setPickerMode('vote');
              else if (layer.type === 'quiz') setPickerMode('quiz');
              else if (layer.type === 'question') setPickerMode('question');
              else if (layer.type === 'emojiSlider') setPickerMode('emojiSlider');
              else if (layer.type === 'countdown') setPickerMode('countdown');
              else if (layer.type === 'draw') setPickerMode('draw');
              else if (layer.type === 'gif') setPickerMode('gif');
              else if (layer.type === 'music') setPickerMode('music');
              else if (layer.type === 'link') setPickerMode('link');
              else if (layer.type === 'location') setPickerMode('location');
              else if (layer.type === 'hashtag') setPickerMode('hashtag');
              else if (layer.type === 'time') setPickerMode('time');
              else if (layer.type === 'weather') setPickerMode('weather');
            }}
            onCropLayer={(layer) => setCropTarget(layer)}
            onCutoutLayer={(layer) => setCutoutTarget(layer)}
            onDeleteLayer={(id) => removeLayer(id)}
            onDuplicateLayer={(id) => duplicateLayer(id)}
            onReorderLayer={(id, dir) => reorderLayer(id, dir)}
            onMore={() => setShowOverflow(true)}
            floating={true}
            documentType={document.type}
            onAddPage={isPoster ? () => addPage() : undefined}
            onLayoutPresets={isLook ? () => setShowTemplates(true) : undefined}
          />
        </LiquidGlassBackdrop>
      </View>

      {/* ── Poster frame tray (collapsible filmstrip) ─────────────────── */}
      {/* Per doc 04: a bottom thumbnail tray that appears when frame change
          occurs or user adds another frame. Auto-collapses after 3.5s.
          Sits above the tool dock. Tapping the active frame collapses it. */}
      {isPoster && showFrameTray && document.pages.length > 1 && (
        <FrameTray
          pages={document.pages}
          activePageIndex={activePageIndex}
          onSelectPage={(i) => { selectLayer(null); setActivePageIndex(i); }}
          onLongPressPage={(i) => setPageMenuIndex(i)}
          onAddPage={() => { haptic.light(); selectLayer(null); addPage(); }}
          onCollapse={() => setShowFrameTray(false)}
          bottomOffset={insets.bottom + 120}
        />
      )}

      {/* ── Overflow menu ────────────────────────────────────────────── */}
      <OverflowMenu
        visible={showOverflow}
        onClose={() => setShowOverflow(false)}
        top={insets.top + 52}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => { undo(); setShowOverflow(false); }}
        onRedo={() => { redo(); setShowOverflow(false); }}
        onPreview={() => { setShowPreview(true); setShowOverflow(false); }}
        onMention={() => { setPickerMode('mention'); setShowOverflow(false); }}
        isLook={isLook}
        onLook={() => { setPickerMode('look'); setShowOverflow(false); }}
        onStickers={() => { setPickerMode('stickers'); setShowOverflow(false); }}
        onLayers={() => { setShowLayers(true); setShowOverflow(false); }}
        onTemplates={() => { setShowTemplates(true); setShowOverflow(false); }}
        onDrafts={() => { navigation.navigate('CreatorDraftList'); setShowOverflow(false); }}
        onSettings={() => { setShowSettings(true); setShowOverflow(false); }}
        safeZoneVisible={showSafeZone}
        onToggleSafeZone={() => { setShowSafeZone((p) => !p); setShowOverflow(false); }}
      />

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
        documentType={document.type}
        hasExistingWork={document.pages.some((p) => p.layers.length > 0)}
        onClose={() => setShowTemplates(false)}
        onApply={(template: CreatorTemplate) => {
          const doc = template.build();
          setDocument(doc);
        }}
      />
      {/* ── Crop sheet (Look mode — Instagram-style aspect ratio crop) ── */}
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
      {/* ── Cutout sheet (Look mode — Snapchat-style scissors cutout) ── */}
      {cutoutTarget && cutoutTarget.type === 'media' && (
        <CreatorCutoutSheet
          visible={!!cutoutTarget}
          imageUri={cutoutTarget.payload.mediaUri}
          onClose={() => setCutoutTarget(null)}
          onCutoutComplete={(newUri) => {
            if (cutoutTarget && cutoutTarget.type === 'media') {
              // Replace the media layer's URI with the cutout result
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
            updateLayer(editingLayer.id, layer, 'Edit layer');
          } else {
            addLayer(layer);
          }
        }}
      />
      {/* ── Page options sheet (duration + duplicate + reorder + delete) ── */}
      {pageMenuIndex !== null && (
        <PageMenu
          pageIndex={pageMenuIndex}
          pageCount={document.pages.length}
          currentDuration={document.pages[pageMenuIndex]?.durationMs ?? 5000}
          onClose={() => setPageMenuIndex(null)}
          onSetDuration={(ms) => { updatePageDuration(pageMenuIndex, ms); }}
          onDuplicate={() => { duplicatePage(pageMenuIndex); setPageMenuIndex(null); }}
          onDelete={() => { removePage(pageMenuIndex); setPageMenuIndex(null); }}
          onMoveLeft={() => { if (pageMenuIndex > 0) { reorderPages(pageMenuIndex, pageMenuIndex - 1); setActivePageIndex(pageMenuIndex - 1); } setPageMenuIndex(null); }}
          onMoveRight={() => { if (pageMenuIndex < document.pages.length - 1) { reorderPages(pageMenuIndex, pageMenuIndex + 1); setActivePageIndex(pageMenuIndex + 1); } setPageMenuIndex(null); }}
        />
      )}
    </View>
  );
}

// ── Opacity bar — drag-based slider for layer opacity (Instagram pattern) ──
// Migrated from PanResponder to Gesture.Pan() from react-native-gesture-handler
// for worklet-based, 60fps drag updates without setState during drag.
const OpacityBar = React.memo(function OpacityBar({ value, onChange, onCommit }: { value: number; onChange: (v: number) => void; onCommit: (v: number) => void }) {
  const widthSV = useSharedValue(0);
  const haptic = useHaptic();

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    widthSV.value = e.nativeEvent.layout.width;
  }, [widthSV]);

  // Gesture.Pan() — worklet-based, e.x is position relative to the gesture view
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        const w = widthSV.value;
        if (w <= 0) return;
        const ratio = Math.max(0, Math.min(1, e.x / w));
        const snapped = Math.round(ratio * 20) / 20; // snap to 5% increments
        runOnJS(haptic.selection)();
        runOnJS(onChange)(snapped);
      })
      .onChange((e) => {
        'worklet';
        const w = widthSV.value;
        if (w <= 0) return;
        const ratio = Math.max(0, Math.min(1, e.x / w));
        const snapped = Math.round(ratio * 20) / 20; // snap to 5% increments
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
        <View
          style={styles.opacitySliderTrack}
          onLayout={handleLayout}
        >
          <View style={styles.opacitySliderTrackBg} />
          <View style={[styles.opacitySliderFill, { width: `${pct}%` }]} />
          <View style={[styles.opacitySliderThumb, { left: `${pct}%` }]} />
        </View>
      </GestureDetector>
      <Text style={styles.opacityLabel}>{pct}%</Text>
    </View>
  );
});

export function CreatorStudioScreen() {
  const route = useRoute<any>();
  const initialType = route.params?.type === 'poster' ? 'poster' : 'look';
  const draftId = route.params?.draftId as string | undefined;
  const templateId = route.params?.templateId as string | undefined;
  const sourceDocumentId = route.params?.sourceDocumentId as string | undefined;
  const initialMediaUri = route.params?.initialMediaUri as string | undefined;
  const initialMedia = route.params?.initialMedia as CreatorInitialMedia[] | undefined;
  const startBlank = route.params?.startBlank as boolean | undefined;
  const openTemplates = route.params?.openTemplates as boolean | undefined;

  // ── Look V3: dedicated collage-native workspace ──────────────────
  // Per spec 10 (Look Architecture V3), Look gets its own screen that
  // expresses the spatial collage mental model — not a shared editor
  // with isLook branching. The LookComposerScreen wraps itself in
  // CreatorProvider, so we return it directly for Look documents.
  if (initialType === 'look') {
    const { LookComposerScreen } = require('./look/LookComposerScreen');
    return (
      <LookComposerScreen
        draftId={draftId}
        templateId={templateId}
        sourceDocumentId={sourceDocumentId}
        initialMediaUri={initialMediaUri}
        initialMedia={initialMedia}
        startBlank={startBlank}
        openTemplates={openTemplates}
      />
    );
  }

  // Poster: existing CreatorStudioInner (a parallel subagent is creating
  // a dedicated PosterComposerScreen for Poster).
  return (
    <CreatorProvider
      initialType={initialType}
      draftId={draftId}
      templateId={templateId}
      sourceDocumentId={sourceDocumentId}
      initialMediaUri={initialMediaUri}
      initialMedia={initialMedia}
    >
      <CreatorStudioInner />
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
  // ── Floating top bar (transparent, gradient scrim) ──
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
  // Subtle gradient overlay on top of BlurView for text legibility.
  // Lighter than the previous gradient — the BlurView provides the backdrop.
  topBarScrimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    zIndex: -1,
  },
  // ── Top bar row ──
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
  // ── Top bar groups (default mode) ──
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  // Center group for undo/redo buttons
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
  // Disabled state for undo/redo — 0.3 opacity per spec
  topBtnDisabled: {
    opacity: 0.3,
  },
  // ── Transparent floating top bar ──
  topBar: {
    height: 56,
    paddingHorizontal: Space.sm,
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },
  // ── Publish button (premium pill) ──
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
  },
  // ── Page segment bars (Instagram-style story progress) ──
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
    height: 3,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  pageSegmentFill: {
    height: 3,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  pageSegmentAdd: {
    width: 22,
    height: 22,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'rgba(255,255,255,0.15)',
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
  // ── Unsaved changes dot ──
  unsavedDot: {
    width: 7,
    height: 7,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: '#C9A46A',
    marginLeft: -Space.xs,
    marginTop: Space.xs + 2,
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
  // ── Floating bottom rail (Liquid Glass) ──
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
    paddingTop: Space.md,
  },
  // ── Safe zone overlay ──
  // Dashed amber outlines showing areas occluded by chrome (top bar, tool
  // dock) and the safe content region between them. Non-interactive.
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.25,
    elevation: 3,
  },
  opacityLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    color: 'rgba(255,255,255,0.8)',
    minWidth: 36,
    textAlign: 'right',
  },
});
