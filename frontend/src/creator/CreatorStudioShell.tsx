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
  Platform,
  PanResponder,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { CreatorProvider, useCreator } from './CreatorContext';
import type { CreatorLayer } from './composition';
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
import { PressScale, SheetContainer } from './CreatorAnimations';
import { LiquidGlassBackdrop } from '../components/LiquidGlassBackdrop';
import { useHaptic } from '../hooks/useHaptic';
import { fetchLookByIdFromApi } from '../services/looksApi';
import { lookToDocument } from './viewerAdapters';
import type { CreatorTemplate } from './templates';

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
  const { document, activePageIndex, setActivePageIndex, selectedLayerId, selectLayer, canUndo, canRedo, undo, redo, isDirty, removeLayer, duplicateLayer, reorderLayer, updateLayer, addLayer, addPage, removePage, duplicatePage, updatePageDuration, reorderPages, commitLayerTransform, isLoadingDraft, setDocument, saveDraft } = useCreator();

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
  const [pageMenuIndex, setPageMenuIndex] = useState<number | null>(null);
  const [editingLookId, setEditingLookId] = useState<string | null>(null);
  const [isLoadingSourceLook, setIsLoadingSourceLook] = useState(false);

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
              Alert.alert('Could not save draft', 'Please try again.');
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
  }, [selectLayer]);

  const handleLayerPress = useCallback((layerId: string) => {
    selectLayer(layerId);
  }, [selectLayer]);

  const selectedLayer = page?.layers.find((l) => l.id === selectedLayerId) ?? null;

  // Autosave status for the top bar (saving / saved / failed with retry)
  const handleAutosaveRetry = useCallback(() => {
    saveDraft();
  }, [saveDraft]);

  // Handle media selection from entry screen — add all layers to the
  // first page, then enter the editor.
  const handleEntryMediaSelected = useCallback((layers: CreatorLayer[]) => {
    layers.forEach((layer) => addLayer(layer));
    setEntryComplete(true);
  }, [addLayer]);

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
      </View>

      {/* ── Top bar — transparent floating, gradient scrim (Instagram pattern) ── */}
      <View style={[styles.topBarContainer, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0)']}
          style={styles.topBarScrim}
        />
        <View style={[styles.topBar, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}>
          <View style={styles.topBarRow}>
            {selectedLayer ? (
              /* During selection: Done · object name · More */
              <>
                <PressScale
                  onPress={() => selectLayer(null)}
                  style={styles.topBtn}
                  accessibilityLabel="Done"
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
                    onPress={() => setShowOverflow(true)}
                    style={styles.topBtn}
                    accessibilityLabel="More options"
                  >
                    <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
                  </PressScale>
                </View>
              </>
            ) : (
              /* Default: Close (X) · spacer · Next (Instagram minimalism) */
              <>
                <View style={styles.topLeftGroup}>
                  <PressScale
                    onPress={handleBack}
                    style={styles.topBtn}
                    accessibilityLabel="Close editor"
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

                <View style={styles.topRightGroup}>
                  <PressScale
                    onPress={() => setShowPublish(true)}
                    style={[styles.publishBtn, { backgroundColor: colors.brand }]}
                    accessibilityLabel="Next"
                    scale={0.97}
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
                onPress={() => { selectLayer(null); setActivePageIndex(i); }}
                onLongPress={() => setPageMenuIndex(i)}
                style={styles.pageSegmentTarget}
                accessibilityLabel={`Page ${i + 1}`}
                accessibilityState={{ selected: i === activePageIndex }}
                hitSlop={{ top: 8, bottom: 8 }}
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
            {/* Add page — compact + at end of segment row */}
            {document.pages.length < 10 && (
              <PressScale
                onPress={() => { selectLayer(null); addPage(); }}
                style={styles.pageSegmentAdd}
                accessibilityLabel="Add page"
                hitSlop={8}
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

      {/* ── Overflow menu ────────────────────────────────────────────── */}
      {showOverflow && (
        <Pressable
          style={styles.overflowBackdrop}
          onPress={() => setShowOverflow(false)}
        >
          <View
            style={[
              styles.overflowMenu,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                top: insets.top + 52,
                right: 12,
              },
            ]}
          >
            <OverflowItem
              icon="arrow-undo"
              label="Undo"
              disabled={!canUndo}
              colors={colors}
              onPress={() => { undo(); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="arrow-redo"
              label="Redo"
              disabled={!canRedo}
              colors={colors}
              onPress={() => { redo(); setShowOverflow(false); }}
            />
            <View style={[styles.overflowDivider, { backgroundColor: colors.border }]} />
            <OverflowItem
              icon="eye-outline"
              label="Preview"
              colors={colors}
              onPress={() => { setShowPreview(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="at-outline"
              label="Mention"
              colors={colors}
              onPress={() => { setPickerMode('mention'); setShowOverflow(false); }}
            />
            {isLook ? (
              <OverflowItem
                icon="shirt-outline"
                label="Look"
                colors={colors}
                onPress={() => { setPickerMode('look'); setShowOverflow(false); }}
              />
            ) : (
              <OverflowItem
                icon="happy-outline"
                label="Stickers"
                colors={colors}
                onPress={() => { setPickerMode('stickers'); setShowOverflow(false); }}
              />
            )}
            <View style={[styles.overflowDivider, { backgroundColor: colors.border }]} />
            <OverflowItem
              icon="layers-outline"
              label="Layers"
              colors={colors}
              onPress={() => { setShowLayers(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="grid-outline"
              label="Templates"
              colors={colors}
              onPress={() => { setShowTemplates(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="document-text-outline"
              label="Drafts"
              colors={colors}
              onPress={() => { navigation.navigate('CreatorDraftList'); setShowOverflow(false); }}
            />
            <View style={[styles.overflowDivider, { backgroundColor: colors.border }]} />
            <OverflowItem
              icon="settings-outline"
              label="Settings"
              colors={colors}
              onPress={() => { setShowSettings(true); setShowOverflow(false); }}
            />
          </View>
        </Pressable>
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
        <PageOptionsSheet
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

// ── Overflow menu item ─────────────────────────────────────────────

interface OverflowItemProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  onPress: () => void;
  disabled?: boolean;
}

const OverflowItem = React.memo(function OverflowItem({ icon, label, colors, onPress, disabled }: OverflowItemProps) {
  const haptic = useHaptic();
  return (
    <PressScale
      onPress={() => {
        if (disabled) return;
        haptic.selection();
        onPress();
      }}
      disabled={disabled}
      style={[styles.overflowItem, disabled ? { opacity: 0.4 } : {}]}
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={12}
    >
      <Ionicons
        name={icon}
        size={22}
        color={disabled ? colors.textMuted : colors.textPrimary}
      />
      <Text
        style={[
          styles.overflowItemText,
          { color: disabled ? colors.textMuted : colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </PressScale>
  );
});

// ── Opacity bar — drag-based slider for layer opacity (Instagram pattern) ──
const OpacityBar = React.memo(function OpacityBar({ value, onChange, onCommit }: { value: number; onChange: (v: number) => void; onCommit: (v: number) => void }) {
  const trackRef = useRef<View | null>(null);
  const draggingRef = useRef(false);
  const haptic = useHaptic();

  const updateFromTouch = useCallback((locationX: number, width: number) => {
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / width));
    const snapped = Math.round(ratio * 20) / 20; // snap to 5% increments
    if (snapped !== value) {
      haptic.selection();
      onChange(snapped);
    }
  }, [value, onChange, haptic]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      draggingRef.current = true;
      trackRef.current?.measure((x, y, w, h, pageX) => {
        updateFromTouch(e.nativeEvent.pageX - pageX, w);
      });
    },
    onPanResponderMove: (e) => {
      trackRef.current?.measure((x, y, w, h, pageX) => {
        updateFromTouch(e.nativeEvent.pageX - pageX, w);
      });
    },
    onPanResponderRelease: () => {
      draggingRef.current = false;
      onCommit(value);
    },
    onPanResponderTerminate: () => {
      draggingRef.current = false;
      onCommit(value);
    },
  }), [updateFromTouch, onCommit, value]);

  const pct = Math.round(value * 100);

  return (
    <View style={styles.opacityBar}>
      <Ionicons name="contrast-outline" size={16} color="rgba(255,255,255,0.7)" />
      <View
        ref={trackRef}
        style={styles.opacitySliderTrack}
        {...panResponder.panHandlers}
      >
        <View style={styles.opacitySliderTrackBg} />
        <View style={[styles.opacitySliderFill, { width: `${pct}%` }]} />
        <View style={[styles.opacitySliderThumb, { left: `${pct}%` }]} />
      </View>
      <Text style={styles.opacityLabel}>{pct}%</Text>
    </View>
  );
});

// ── Page options sheet ─────────────────────────────────────────────
// Replaces the old Alert.alert-based page menu with a proper designed
// sheet: segmented duration control, duplicate, move left/right, delete.
function PageOptionsSheet({
  pageIndex,
  pageCount,
  currentDuration,
  onClose,
  onSetDuration,
  onDuplicate,
  onDelete,
  onMoveLeft,
  onMoveRight,
}: {
  pageIndex: number;
  pageCount: number;
  currentDuration: number;
  onClose: () => void;
  onSetDuration: (ms: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const DURATIONS = [
    { label: '3s', ms: 3000 },
    { label: '5s', ms: 5000 },
    { label: '7s', ms: 7000 },
    { label: '10s', ms: 10000 },
    { label: '15s', ms: 15000 },
  ];
  const canMoveLeft = pageIndex > 0;
  const canMoveRight = pageIndex < pageCount - 1;
  const canDelete = pageCount > 1;

  return (
    <SheetContainer visible={true} onClose={onClose} maxHeight={0.6}>
      <View style={styles.pageSheetHeader}>
        <Text style={[styles.pageSheetTitle, { color: colors.textPrimary }]}>Page {pageIndex + 1}</Text>
        <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close page options">
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </PressScale>
      </View>
      <View style={styles.pageSheetBody}>
        {/* Duration — segmented control */}
        <Text style={[styles.pageSheetLabel, { color: colors.textSecondary }]}>Duration</Text>
        <View style={styles.pageSheetDurationRow}>
          {DURATIONS.map((d) => {
            const isActive = currentDuration === d.ms;
            return (
              <Pressable
                key={d.ms}
                onPress={() => { haptic.selection(); onSetDuration(d.ms); }}
                style={[styles.pageSheetDurationBtn, isActive && { backgroundColor: colors.brand }]}
                accessibilityLabel={`Set duration to ${d.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.pageSheetDurationText, isActive && { color: colors.textInverse }]}>
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Reorder */}
        <Text style={[styles.pageSheetLabel, { color: colors.textSecondary, marginTop: Space.md }]}>Order</Text>
        <View style={styles.pageSheetActions}>
          <Pressable
            onPress={() => { if (canMoveLeft) { haptic.selection(); onMoveLeft(); } }}
            disabled={!canMoveLeft}
            style={[styles.pageSheetActionBtn, !canMoveLeft && { opacity: 0.35 }]}
            accessibilityLabel="Move page left"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canMoveLeft }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            <Text style={[styles.pageSheetActionLabel, { color: colors.textPrimary }]}>Move Left</Text>
          </Pressable>
          <Pressable
            onPress={() => { if (canMoveRight) { haptic.selection(); onMoveRight(); } }}
            disabled={!canMoveRight}
            style={[styles.pageSheetActionBtn, !canMoveRight && { opacity: 0.35 }]}
            accessibilityLabel="Move page right"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canMoveRight }}
          >
            <Ionicons name="arrow-forward" size={20} color={colors.textPrimary} />
            <Text style={[styles.pageSheetActionLabel, { color: colors.textPrimary }]}>Move Right</Text>
          </Pressable>
        </View>

        {/* Duplicate + Delete */}
        <View style={styles.pageSheetActions}>
          <Pressable
            onPress={() => { haptic.medium(); onDuplicate(); }}
            style={styles.pageSheetActionBtn}
            accessibilityLabel="Duplicate page"
            accessibilityRole="button"
          >
            <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.pageSheetActionLabel, { color: colors.textPrimary }]}>Duplicate</Text>
          </Pressable>
          <Pressable
            onPress={() => { if (canDelete) { haptic.medium(); onDelete(); } }}
            disabled={!canDelete}
            style={[styles.pageSheetActionBtn, !canDelete && { opacity: 0.35 }]}
            accessibilityLabel="Delete page"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canDelete }}
          >
            <Ionicons name="trash-outline" size={20} color={canDelete ? colors.danger : colors.textMuted} />
            <Text style={[styles.pageSheetActionLabel, { color: canDelete ? colors.danger : colors.textMuted }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </SheetContainer>
  );
}

export function CreatorStudioScreen() {
  const route = useRoute<any>();
  const initialType = route.params?.type === 'poster' ? 'poster' : 'look';
  const draftId = route.params?.draftId as string | undefined;
  const templateId = route.params?.templateId as string | undefined;
  const sourceDocumentId = route.params?.sourceDocumentId as string | undefined;
  const initialMediaUri = route.params?.initialMediaUri as string | undefined;

  return (
    <CreatorProvider initialType={initialType} draftId={draftId} templateId={templateId} sourceDocumentId={sourceDocumentId} initialMediaUri={initialMediaUri}>
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
    borderRadius: Radius.full,
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
    color: '#fff',
  },
  doneText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
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
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
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
    borderRadius: Radius.full,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
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
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  pageSegmentFill: {
    height: 3,
    borderRadius: Radius.full,
  },
  pageSegmentAdd: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  canvasLoadingText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
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
    color: 'rgba(255,255,255,0.45)',
    marginTop: Space.sm,
  },
  canvasEmptyHintBody: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
  },
  // ── Unsaved changes dot ──
  unsavedDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
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
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
    paddingTop: Space.md,
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
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  opacitySliderFill: {
    height: 4,
    borderRadius: Radius.sm,
    backgroundColor: '#C9A46A',
  },
  opacitySliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    marginLeft: -9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.25,
    elevation: 3,
  },
  opacityLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: 'rgba(255,255,255,0.8)',
    minWidth: 36,
    textAlign: 'right',
  },
  // ── Overflow menu ──
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
  },
  overflowMenu: {
    position: 'absolute',
    minWidth: 220,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 48,
  },
  overflowItemText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.bodyEmphasis.size,
  },
  overflowDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xs,
  },
  // ── Page options sheet ──
  pageSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  pageSheetTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  pageSheetBody: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    gap: Space.xs,
  },
  pageSheetLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pageSheetDurationRow: {
    flexDirection: 'row',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  pageSheetDurationBtn: {
    flex: 1,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  pageSheetDurationText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: '#fff',
  },
  pageSheetActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  pageSheetActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pageSheetActionLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: '#fff',
  },
});
