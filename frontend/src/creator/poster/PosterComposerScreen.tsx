import React, { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Motion } from '../../theme/motionTokens';
import { useToast } from '../../context/ToastContext';
import { useCreator } from '../studio/CreatorContext';
import { type NativeStackNavigationProp, type RootStackParamList, type CreatorInitialMedia } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { usePosterEffects } from './usePosterEffects';
import { usePosterEntryTransition } from './usePosterEntryTransition';
import { usePosterTopBarActions } from './usePosterTopBarActions';
import { usePosterFrameNavigation } from './usePosterFrameNavigation';
import { usePosterPlayback } from './usePosterPlayback';
import { usePosterTimeline } from './usePosterTimeline';
import { CreatorEntryScreen } from '../studio/CreatorEntryScreen';
import { CreatorEntryEditorCrossfade } from '../studio/CreatorEntryEditorCrossfade';
// Performance monitoring — dev-only overlay + frame profiler hook
import { usePerformanceMonitor } from '../core/performance/usePerformanceMonitor';
// Extracted composer pieces (pure extraction — identical behavior):
import { createStyles } from './PosterComposerStyles';
import { buildFrameSwipeGesture } from './composer/posterGestures';
import { PosterEditorSurface } from './composer/PosterEditorSurface';
import { usePosterComposerUiState } from './composer/usePosterComposerUiState';
import { usePosterLayerEditFlow } from './composer/usePosterLayerEditFlow';
import { usePosterCropCutout } from './composer/usePosterCropCutout';
import { usePosterMultiSelectOps } from './composer/usePosterMultiSelectOps';
import { usePosterComposerKeys } from './composer/usePosterComposerKeys';
import { usePosterCanvasInteraction } from './composer/usePosterCanvasInteraction';
import { usePosterMediaDerived } from './composer/usePosterMediaDerived';
import { usePosterTimelineZoom } from './composer/usePosterTimelineZoom';
import { usePosterToolActions } from './composer/usePosterToolActions';
import { usePosterLayerSheetOps } from './composer/usePosterLayerSheetOps';
import { usePosterToolRail } from './composer/usePosterToolRail';

// ────────────────────────────────────────────────────────────────────
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
// ────────────────────────────────────────────────────────────────────

function PosterComposerInner({ onEntryTypeChange }: { onEntryTypeChange: (type: 'look' | 'poster' | 'moodboard') => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'CreatorStudio'>>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { show } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Performance monitoring (dev-only) ────────────────────────────
  // Starts the FrameProfiler on mount and renders the PerformanceOverlay
  // so developers can see real FPS / frame-time / jank metrics while
  // editing. The hook and overlay are no-ops in production builds.
  usePerformanceMonitor({ enabled: __DEV__ });
  const creator = useCreator();
  const {
    document,
    activePageIndex,
    setActivePageIndex,
    selectedLayerId,
    selectedLayerIds,
    selectLayer,
    selectLayers,
    toggleLayerInSelection,
    commitMultiLayerTransform,
    bringSelectedToFront,
    sendSelectedToBack,
    deleteMultiSelected,
    canUndo,
    canRedo,
    undo,
    redo,
    isDirty,
    removeLayer,
    duplicateLayer,
    reorderLayer,
    toggleLayerLock,
    updateLayer,
    updateLayerLive,
    addLayer,
    addPage,
    reorderPages,
    updateMetadataLive,
    isLoadingDraft,
    commitDocument,
    saveDraft,
    addPosterFrames,
  } = creator;

  // ── Sheet / overlay state (extracted to usePosterComposerUiState) ──
  // The hook owns the mutually-exclusive sheet union (useActiveSheet),
  // the text color picker + color history, the in-place text editing
  // target, manipulation/trash-zone shared values, frame-swipe gesture
  // shared values, the bottom-surface discriminator, the frame organizer
  // and page-menu flags, compare-to-original, the video player ref, the
  // transient timeline selection ids, and the autosave timestamp.
  const ui = usePosterComposerUiState({
    autosaveStatus: creator.autosaveStatus,
    openTemplates: Boolean(route.params?.openTemplates),
  });
  const {
    editingTextLayerId,
    setEditingTextLayerId,
    manipulationActiveSV,
    multiSelectMode,
    bottomSurface,
    selectedClipId,
    setSelectedClipId,
    selectedOverlayId,
    setSelectedOverlayId,
    openSheet,
  } = ui;

  // ── Top bar / chrome actions (extracted to usePosterTopBarActions) ──
  // The hook owns the back/discard confirmation sheet, live audio mute,
  // quick save, and undo/redo with transient selection reset.
  const topBar = usePosterTopBarActions({
    isDirty,
    navigation,
    saveDraft,
    canUndo,
    canRedo,
    undo,
    redo,
    haptic,
    show,
    videoPlayerRef: ui.videoPlayerRef,
    setSelectedClipId,
    setSelectedOverlayId,
  });

  const page = document.pages[activePageIndex];

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ── Edit-surface geometry ──────────────────────────────────────────
  // The authored canvas is immutable: it ALWAYS uses the document's
  // aspect ratio (9:16 for posters), never the physical screen height.
  // This guarantees "what I edit is what is exported" — the same document
  // produces the same canvas dimensions on every device, letterboxed
  // within the viewport when the screen is taller than the canvas.
  // Full-bleed media (width=1, height=1) describes how media fits INSIDE
  // this authored canvas via contentFit="cover" (cropping as needed); it
  // does not redefine the canvas geometry itself.
  const canvasWidth = screenWidth;
  const canvasHeight = useMemo(() => {
    const h = Math.floor(screenWidth / document.canvas.aspectRatio);
    return Math.min(h, screenHeight);
  }, [screenWidth, document.canvas.aspectRatio, screenHeight]);

  const canvasVerticalOffset = useMemo(() => {
    if (canvasHeight >= screenHeight) return 0;
    return Math.floor((screenHeight - canvasHeight) / 2);
  }, [canvasHeight, screenHeight]);

  // ── Multi-select mode ops (extracted to usePosterMultiSelectOps) ────
  // The hook owns the exit/delete handlers, the auto-exit effects (empty
  // selection, page change), and the shared useMultiSelect wiring (group
  // drag snapshot/commit, overlap cycle, bulk z-order, bounding-box
  // align).
  const multi = usePosterMultiSelectOps({
    page,
    activePageIndex,
    selectedLayerIds,
    multiSelectMode,
    setMultiSelectMode: ui.setMultiSelectMode,
    selectLayers,
    selectLayer,
    toggleLayerInSelection,
    commitMultiLayerTransform,
    bringSelectedToFront,
    sendSelectedToBack,
    deleteMultiSelected,
    haptic,
  });

  // ── Canvas interaction (extracted to usePosterCanvasInteraction) ───
  // The hook owns the canvas/layer press handlers, the selected-layer
  // derivation, and the floating context menu (visibility, anchor
  // position, action list).
  const canvas = usePosterCanvasInteraction({
    page,
    selectedLayerId,
    multiSelectMode,
    editingTextLayerId,
    canvasWidth,
    canvasHeight,
    canvasVerticalOffset,
    exitMultiSelect: multi.exitMultiSelect,
    selectLayer,
    toggleLayerInSelection,
    reorderLayer,
    duplicateLayer,
    toggleLayerLock,
    removeLayer,
    haptic,
  });
  const { selectedLayer } = canvas;

  // ── Crop / cutout sheet flow (extracted to usePosterCropCutout) ────
  // The hook owns the crop-mode flag, the true-cutout (segmentation)
  // preview target + capability probe, and the rail actions that open
  // the crop editor and cutout preview for the selected media layer.
  const crop = usePosterCropCutout({
    selectedLayer,
    haptic,
  });

  // ── Edit-layer / asset-picker flow (usePosterLayerEditFlow) ────────
  // The hook owns the picker mode / editing-layer state, the memoized
  // picker close + add-layer callbacks (including the relink merge that
  // preserves transform/z-order/timeRange and clears freezeFrameMs), and
  // the gated Edit handler routed via LAYER_TYPE_TO_PICKER_MODE.
  const edit = usePosterLayerEditFlow({
    updateLayer,
    addLayer,
    setEditingTextLayerId,
  });

  // ── Dismissal keys (extracted to usePosterComposerKeys) ────────────
  // The adapter maps the composer's hook groups onto usePosterDismissalKeys
  // (keyboard shortcuts + hardware back button, "dismiss the topmost
  // surface first, else deselect, else navigate back").
  usePosterComposerKeys({
    creator,
    ui,
    edit,
    crop,
    multi,
    topBar,
  });

  // ── Media-derived values (extracted to usePosterMediaDerived) ──────
  // The hook owns the background-media URI for draw-on-media, content
  // presence, video/audio detection, and the waveform audio URI.
  const media = usePosterMediaDerived({ document, page });

  // ── Entry / camera→editor crossfade (usePosterEntryTransition) ─────
  // The hook owns entry completion, pinned media for the crossfade, the
  // source content transform, the camera viewport ref, and the entry
  // screen callbacks. `showEntryScreen` is derived from entry completion,
  // content presence, and draft loading state.
  const entry = usePosterEntryTransition({
    startBlank: Boolean(route.params?.startBlank),
    hasContent: media.hasContent,
    isLoadingDraft,
    addPosterFrames,
    navigation,
  });

  // ── Chrome fade during manipulation ────────────────────────────────
  // Top bar and tool dock fade to a dimmed but visible opacity when the
  // user is actively dragging/pinching/rotating a layer, then spring back
  // on release. The canvas stays at full opacity — the chrome recedes,
  // not the content. 0.35 keeps controls discoverable during gestures.
  const chromeFadeStyle = useAnimatedStyle(() => ({
    opacity: withTiming(manipulationActiveSV.value === 1 ? 0.35 : 1, {
      duration: Motion.duration.railSwap,
      easing: Motion.easing.entrance,
    }),
  }));

  // -- Playback clock & transport (extracted to usePosterPlayback) ----
  // The hook owns the PlaybackClock instance, timeline projection,
  // playhead state, the per-tick video source-time mapping adapter,
  // video adapter registration, and transport controls (play/pause/seek/
  // setRate). `playbackClock` is passed to CreatorCanvas and the timeline
  // operation handler; `playbackState` drives the playhead, play/pause
  // button, and timecode display.
  const playback = usePosterPlayback({
    document,
    videoPlayerRef: ui.videoPlayerRef,
    activePageIndex,
    haptic,
    onPlayheadChange: (ms: number) => updateMetadataLive({ playheadMs: ms }),
  });

  // -- Timeline editing state & handlers (extracted to usePosterTimeline) --
  // The hook owns: timelineClips, clipPageIndices, clipTransitionIds,
  // timelineOverlays, timelineTotalDurationMs, selectedClip, timelineState,
  // handleTimelineOperation, handleSpeedCurveChange, handleTimelineTransitionTap.
  // selectedClipId/setSelectedClipId and selectedOverlayId/setSelectedOverlayId
  // are shared transient state owned by the screen (single source of truth).
  const timeline = usePosterTimeline({
    document,
    updateLayer,
    duplicateLayer,
    removeLayer,
    reorderPages,
    addLayer,
    commitDocument,
    haptic,
    show,
    playbackClock: playback.playbackClock,
    playbackState: playback.playbackState,
    selectedClipId,
    setSelectedClipId,
    selectedOverlayId,
    setSelectedOverlayId,
    selectedLayer,
    activePageIndex,
    selectLayer,
    setActivePageIndex,
    openSheet,
    setEditingLayer: edit.setEditingLayer,
    setPickerMode: edit.setPickerMode,
  });

  // -- Frame navigation (extracted to usePosterFrameNavigation) ------
  // The hook owns page-count derivation, multi-frame detection, page
  // boundary guards, and the canonical page-change handler (goToPage)
  // which resets transient selection (layer, clip, overlay) on every
  // navigation so a stale selection never leaks across pages.
  //
  // onNavigate seeks the playhead to the target page's clip start so
  // timeline position and displayed page never disagree — frame swipes
  // and page-dot taps are playhead moves, the same grammar CapCut and
  // Edits use (preview is always the frame under the playhead).
  const {
    goToPage,
    hasMultipleFrames,
    pageCount,
  } = usePosterFrameNavigation({
    document,
    activePageIndex,
    setActivePageIndex,
    selectLayer,
    setSelectedClipId,
    setSelectedOverlayId,
    haptic,
    onNavigate: (index: number) => {
      const pageId = document.pages[index]?.id;
      const clip = timeline.projectedTimeline.clips.find((c) => c.pageId === pageId);
      if (clip) {
        timeline.handleTimelineOperation({ type: 'seek', ms: clip.timelineStartMs });
      }
    },
  });

  // ── Timeline zoom / scroll / follow (usePosterTimelineZoom) ────────
  // The hook owns the clip-under-playhead derivation, timeline visibility,
  // the pinch-to-zoom shared values + gesture, the zoom indicator, the
  // edge auto-scroll ref/handler, playhead-follow and session persistence,
  // and the auto-expand effect that opens the timeline when video or a
  // second clip appears.
  const zoom = usePosterTimelineZoom({
    document,
    activePageIndex,
    selectedLayerId,
    setActivePageIndex,
    selectLayer,
    playbackState: playback.playbackState,
    projectedTimeline: timeline.projectedTimeline,
    timelineTotalDurationMs: timeline.timelineTotalDurationMs,
    timelineClipCount: timeline.timelineClips.length,
    hasVideoContent: media.hasVideoContent,
    bottomSurface,
    setBottomSurface: ui.setBottomSurface,
    setUserRequestedTimeline: ui.setUserRequestedTimeline,
    screenWidth,
  });

  // ── Playback tick is now handled by the PlaybackClock ──────────────
  // The clock uses requestAnimationFrame (or setInterval fallback) to
  // advance time at 60fps with coalesced seeks. The old 100ms setInterval
  // tick has been removed — the clock is the single authority for time.

  // ── Effects sheet — derived state & handlers (usePosterEffects) ────
  // The hook owns the effects subsystem: filter selection, manual
  // adjustments, auto-adjust, the live-preview revert effect, and the
  // swipe-to-filter HUD animation. It is called here (before the frame
  // swipe gesture) so the returned `cycleFilter` is in scope for the
  // single-frame swipe-to-filter gesture.
  const effects = usePosterEffects(selectedLayer, page, bottomSurface, updateLayer, updateLayerLive, haptic);

  // ── Frame navigation & Filter gesture (swipe horizontal) ───────────
  // One current frame fills the viewport.
  // When there are multiple frames, horizontal swipe navigates between them.
  // When editing a single frame (standard story/poster), horizontal swipe
  // cycles live Skia photo filters with an animated HUD pill (Instagram/Snapchat parity).

  const frameSwipeGesture = useMemo(() => {
    return buildFrameSwipeGesture({
      frameSwipeStartXSV: ui.frameSwipeStartXSV,
      frameSwipeStartYSV: ui.frameSwipeStartYSV,
      frameSwipeLockedDirSV: ui.frameSwipeLockedDirSV,
      screenWidth,
      hasMultipleFrames,
      activePageIndex,
      goToPage,
      cycleFilter: effects.cycleFilter,
    });
  }, [screenWidth, hasMultipleFrames, activePageIndex, goToPage, effects.cycleFilter, ui.frameSwipeStartXSV, ui.frameSwipeStartYSV, ui.frameSwipeLockedDirSV]);

  // ── Tool rail action handlers (extracted to usePosterToolActions) ──
  // The hook owns the object action handlers (delete/duplicate/reorder),
  // the default-rail handlers (text, stickers, product, draw, add frame),
  // the timeline toggle/done handlers, and the media actions that open
  // the effects sheet (add effects, adjust).
  const toolActions = usePosterToolActions({
    haptic,
    show,
    page,
    selectedLayer,
    timelineClipCount: timeline.timelineClips.length,
    hasContent: media.hasContent,
    removeLayer,
    duplicateLayer,
    reorderLayer,
    selectLayer,
    addLayer,
    addPage,
    setEditingTextLayerId,
    setPickerMode: edit.setPickerMode,
    setUserRequestedTimeline: ui.setUserRequestedTimeline,
    setBottomSurface: ui.setBottomSurface,
    setSelectedClipId,
  });

  // ── Layer sheet ops (extracted to usePosterLayerSheetOps) ──────────
  // The hook owns the transition handler (page transitionId via
  // commitDocument), the keyframe add/update/remove handlers over the
  // selected layer, and the selected media layer's speed-curve derivation.
  const sheetOps = usePosterLayerSheetOps({
    document,
    page,
    activePageIndex,
    selectedLayer,
    updateLayer,
    commitDocument,
    haptic,
  });

  // -- Tool groups for ContextToolRail (extracted to usePosterToolRail) --
  // The hook owns the toolGroups memo (buildPosterToolRail), the active
  // ToolContext resolution, the dynamic overflow tool list, the draft
  // export wiring (usePosterDraftExport), and the overflow sections memo.
  const toolRail = usePosterToolRail({
    haptic,
    openSheet,
    selectedLayer,
    updateLayer,
    show,
    navigation,
    pageCount,
    cutoutSupported: crop.cutoutSupported,
    showSafeZone: ui.showSafeZone,
    bottomSurface,
    onEntryTypeChange,
    setShowPreview: ui.setShowPreview,
    setShowSafeZone: ui.setShowSafeZone,
    setShowTemplates: ui.setShowTemplates,
    setSelectedClipId,
    setUserRequestedTimeline: ui.setUserRequestedTimeline,
    setBottomSurface: ui.setBottomSurface,
    setPickerMode: edit.setPickerMode,
    setShowTextColorPicker: ui.setShowTextColorPicker,
    handleAddText: toolActions.handleAddText,
    handleAddStickers: toolActions.handleAddStickers,
    handleAddProduct: toolActions.handleAddProduct,
    handleAddEffects: toolActions.handleAddEffects,
    handleDraw: toolActions.handleDraw,
    handleAddFrame: toolActions.handleAddFrame,
    handleTimelineToggle: toolActions.handleTimelineToggle,
    handleEditLayer: edit.handleEditLayer,
    handleReorderLayer: toolActions.handleReorderLayer,
    handleDuplicateLayer: toolActions.handleDuplicateLayer,
    handleDeleteLayer: toolActions.handleDeleteLayer,
    handleCropAction: crop.handleCropAction,
    handleCutoutAction: crop.handleCutoutAction,
    handleAdjustAction: toolActions.handleAdjustAction,
    handleAutoAdjust: effects.handleAutoAdjust,
    handleMultiFront: multi.handleMultiFront,
    handleMultiBack: multi.handleMultiBack,
    handleMultiDelete: multi.handleMultiDelete,
    handleMultiAlign: multi.handleMultiAlign,
    multiSelectMode,
    selectedLayerIds,
    hasVideoContent: media.hasVideoContent,
    hasMultipleFrames,
    setShowFrameTray: ui.setShowFrameTray,
    document,
    page,
  });

  // ── Camera → Editor crossfade ──────────────────────────────────────
  // Per the human-flow reconstruction spec, the captured/selected media
  // should appear to stay in place while editor chrome fades in around it.
  // Both the entry (camera) and editor are mounted simultaneously during a
  // 200ms crossfade so the media reads as continuous. See
  // CreatorEntryEditorCrossfade for the transition implementation.
  const entryContent = entry.showEntryScreen ? (
    <CreatorEntryScreen
      documentType="poster"
      onDocumentTypeChange={onEntryTypeChange}
      onClose={entry.handleEntryClose}
      onMediaSelected={entry.handleEntryMediaSelected}
      onBlankStart={entry.handleEntryBlankStart}
      onViewportChange={(vp) => { entry.cameraViewportRef.current = vp; }}
      onVisualSearchCapture={(uri: string) => {
        navigation.navigate('VisualSearch', { initialImageUri: uri });
      }}
    />
  ) : null;

  const editorContent = (
    <PosterEditorSurface
      styles={styles}
      colors={colors}
      insets={insets}
      route={route}
      screenWidth={screenWidth}
      screenHeight={screenHeight}
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      canvasVerticalOffset={canvasVerticalOffset}
      haptic={haptic}
      creator={creator}
      page={page}
      pageCount={pageCount}
      hasMultipleFrames={hasMultipleFrames}
      goToPage={goToPage}
      frameSwipeGesture={frameSwipeGesture}
      chromeFadeStyle={chromeFadeStyle}
      ui={ui}
      topBar={topBar}
      multi={multi}
      canvas={canvas}
      crop={crop}
      edit={edit}
      media={media}
      entry={entry}
      playback={playback}
      timeline={timeline}
      zoom={zoom}
      effects={effects}
      toolActions={toolActions}
      sheetOps={sheetOps}
      toolRail={toolRail}
    />
  );

  return (
    <CreatorEntryEditorCrossfade
      showEntry={entry.showEntryScreen}
      entryElement={entryContent}
      editorElement={editorContent}
      pinnedMediaUri={entry.entryPinnedUri}
      pinnedMediaKind={entry.entryPinnedKind}
      pinnedMediaDestination={{
        left: 0,
        top: canvasVerticalOffset,
        width: canvasWidth,
        height: canvasHeight,
      }}
      sourceContentTransform={entry.entrySourceTransform}
      destinationContentTransform={{
        frame: {
          left: 0,
          top: canvasVerticalOffset,
          width: canvasWidth,
          height: canvasHeight,
        },
      }}
    />
  );
}

// ── Screen wrapper — wraps in CreatorProvider (shared state) ──────────
export function PosterComposerScreen(props: {
  draftId?: string;
  templateId?: string;
  sourceDocumentId?: string;
  initialMediaUri?: string;
  initialMedia?: CreatorInitialMedia[];
  startBlank?: boolean;
  openTemplates?: boolean;
  onEntryTypeChange: (type: 'look' | 'poster' | 'moodboard') => void;
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
  onEntryTypeChange: (type: 'look' | 'poster' | 'moodboard') => void;
}) {
  // Lazy import to avoid circular dependency at module load time
  const { CreatorProvider } = require('../studio/CreatorContext');
  return (
    <CreatorProvider
      initialType="poster"
      draftId={props.draftId}
      templateId={props.templateId}
      sourceDocumentId={props.sourceDocumentId}
      initialMediaUri={props.initialMediaUri}
      initialMedia={props.initialMedia}
    >
      <PosterComposerInner onEntryTypeChange={props.onEntryTypeChange} />
    </CreatorProvider>
  );
}
