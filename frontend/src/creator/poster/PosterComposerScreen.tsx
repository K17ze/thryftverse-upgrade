import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Keyboard,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Space, FontFamily, Radius, IconGrammar, EditorMaterial, EditorRadius, GlyphShadow, Scrim, Stroke, Type} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useCreator } from '../CreatorContext';
import type { CreatorInitialMedia } from '../../navigation/types';
import type { CreatorLayer, EffectNode } from '../composition';
import { hasFullBleedMedia } from '../composition';
import { layerTypeLabel } from '../shared/layerUtils';
import { makeStableId } from '../../utils/createStableId';
import { CreatorCanvas } from '../CreatorCanvas';
import { CreatorLayersSheet } from '../CreatorLayersSheet';
import { CreatorPublishSheet } from '../CreatorPublishSheet';
import { CreatorSettingsSheet } from '../CreatorSettingsSheet';
import { CreatorAssetPicker, type AssetPickerMode } from '../CreatorAssetPicker';
import { CreatorCropSheet } from '../CreatorCropSheet';
import { InlineTextEditor } from '../tools/text/InlineTextEditor';
import { CutoutPreviewSheet } from '../surfaces/CutoutPreviewSheet';
import { AccessibilityMoveSheet } from '../surfaces/AccessibilityMoveSheet';
import { AccessibilityZOrderSheet, type ZOrderLayer } from '../surfaces/AccessibilityZOrderSheet';
import { cutoutService, type CutoutResult } from '../core/cutout/CutoutService';
import { CreatorTemplateBrowser } from '../CreatorTemplateBrowser';
import { CreatorPreviewOverlay } from '../CreatorPreviewOverlay';
import { CreatorEntryScreen } from '../CreatorEntryScreen';
import { CreatorEntryEditorCrossfade, type CreatorContentTransform } from '../CreatorEntryEditorCrossfade';
import { PressScale } from '../CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';
import type { CaptureViewport } from '../capture/CaptureViewport';
import type { CreatorTemplate } from '../templates';
import { FrameTray } from '../studio/FrameTray';
import { PageMenu } from '../studio/PageMenu';
import { OverflowItem } from '../studio/OverflowMenu';
import { ContextToolRail } from '../surfaces/ContextToolRail';
import { HelpShortcutsSheet } from '../surfaces/HelpShortcutsSheet';
import { TrashZone } from '../surfaces/TrashZone';
import {
  type ToolContext,
  type ToolGroup,
  type ToolDefinition,
  getOverflowTools,
} from '../core/toolRegistry';
import { EffectPreviewRail, AdjustPanel, FILTER_PRESETS, AutoAdjustButton, computeAutoAdjust, isAutoAdjustNode } from '../tools/effects';
import type { AdjustNode } from '../tools/effects';
import {
  TimelineTrack,
  OverlayTrack,
  TimelineToolbar,
  TimelineRuler,
  WaveformTrack,
  type PosterClip,
  type OverlayLayer,
  type TimelineState,
  type TimelineOperation,
  computeTotalDuration,
  formatTimecode,
} from './timeline';
import { TransitionPreviewRail } from './transitions/TransitionPreviewRail';
import { TRANSITION_PRESETS } from './transitions/TransitionPresets';
import { KeyframeEditor } from './keyframes/KeyframeEditor';
import type { Keyframe } from './keyframes/KeyframeTypes';
import { SpeedCurveEditor } from './speedcurves/SpeedCurveEditor';
import { useActiveSheet } from './useActiveSheet';
import type { SpeedCurve } from './speedcurves/SpeedCurveTypes';
import { DEFAULT_SPEED_CURVE } from './speedcurves/SpeedCurveTypes';
import { ReverseToggle, FreezeFramePicker, AudioFadeControls } from './tools';
// Playback pipeline — single clock + timeline projector (Z5 timeline engine)
import { PlaybackClock, projectTimeline, findVisibleOverlays } from '../core/playback';
import type { PlaybackState } from '../core/playback';
// Performance monitoring — dev-only overlay + frame profiler hook
import { PerformanceOverlay } from '../core/performance/PerformanceOverlay';
import { usePerformanceMonitor } from '../core/performance/usePerformanceMonitor';

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

function PosterComposerInner({ onEntryTypeChange }: { onEntryTypeChange: (type: 'look' | 'poster') => void }) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { show } = useToast();

  // ── Performance monitoring (dev-only) ──────────────────────────────
  // Starts the FrameProfiler on mount and renders the PerformanceOverlay
  // so developers can see real FPS / frame-time / jank metrics while
  // editing. The hook and overlay are no-ops in production builds.
  usePerformanceMonitor({ enabled: __DEV__ });
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
    updateLayerLive,
    addLayer,
    addPage,
    removePage,
    duplicatePage,
    updatePageDuration,
    reorderPages,
    commitLayerTransform,
    isLoadingDraft,
    setDocument,
    commitDocument,
    saveDraft,
    addPosterFrames,
    hasPendingRecovery,
    recoverCrashedProject,
    dismissRecovery,
  } = useCreator();

  // ── Sheet / overlay state ──────────────────────────────────────────
  // 13 mutually exclusive sheets consolidated into a single discriminated
  // union via useActiveSheet. This replaces 13 independent useState(false)
  // booleans with 1 useReducer, reducing re-renders and enforcing mutual
  // exclusivity at the type level (audit item-29 §5.5).
  const { activeSheet, open: openSheet, close: closeSheet } = useActiveSheet();
  const showLayers = activeSheet === 'layers';
  const showPublish = activeSheet === 'publish';
  const showSettings = activeSheet === 'settings';
  const showOverflow = activeSheet === 'overflow';
  const showHelp = activeSheet === 'help';
  const showA11yMove = activeSheet === 'a11yMove';
  const showA11yZOrder = activeSheet === 'a11yZOrder';
  const showTransitions = activeSheet === 'transitions';
  const showKeyframes = activeSheet === 'keyframes';
  const showSpeedCurve = activeSheet === 'speedCurve';
  const showReverse = activeSheet === 'reverse';
  const showFreezeFrame = activeSheet === 'freezeFrame';
  const showAudioFade = activeSheet === 'audioFade';
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);
  // ── In-place text content editing (Snapchat/Instagram pattern) ──────
  // When set, an InlineTextEditor renders AT the text layer's position on
  // the canvas so the user can type in place. The modal TextEditorSheet is
  // reserved for advanced styling, not for content editing.
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  // ── Chrome-recedes-during-manipulation (Snapchat/Instagram pattern) ──
  // When the user drags/pinches/rotates a layer, the top bar and tool dock
  // fade out so the canvas feels infinite. The shared value is set by
  // CreatorCanvas's gesture handlers (1 = manipulating, 0 = idle).
  const manipulationActiveSV = useSharedValue(0);
  const [isManipulating, setIsManipulating] = useState(false);
  // Drag-to-trash: set to 1 by CreatorCanvas while the dragged layer's
  // center is inside the bottom trash zone. Drives the TrashZone overlay
  // highlight.
  const isInTrashZoneSV = useSharedValue(0);
  // Frame-swipe gesture state. These MUST be shared values, not captured
  // `let` closure variables: react-native-worklets 0.10 captures closure
  // variables by value and cannot serialize `let` reassignment inside a
  // worklet — doing so produces "invalid assignment left-hand side" at
  // worklet compile time. Shared values are the canonical Reanimated 4
  // way to read/write mutable state from the UI thread.
  const frameSwipeStartXSV = useSharedValue(0);
  const frameSwipeStartYSV = useSharedValue(0);
  const frameSwipeLockedDirSV = useSharedValue<'horizontal' | 'vertical' | null>(null);
  const [showTemplates, setShowTemplates] = useState(Boolean(route.params?.openTemplates));
  const [showPreview, setShowPreview] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [entryComplete, setEntryComplete] = useState(Boolean(route.params?.startBlank));
  const [pageMenuIndex, setPageMenuIndex] = useState<number | null>(null);
  const [showFrameTray, setShowFrameTray] = useState(false);
  const [videoInfoFrameIndex, setVideoInfoFrameIndex] = useState<number | null>(null);
  // ── Mutually exclusive bottom surfaces (spec: one at a time) ──────
  // 'tools' = default tool rail (canvas dominant for single-photo)
  // 'timeline' = timeline expanded (video, multiple clips, or explicit)
  // 'effects' = effects/adjust bottom sheet
  // null = no bottom surface (full canvas)
  type BottomSurface = 'tools' | 'timeline' | 'effects' | null;
  const [bottomSurface, setBottomSurface] = useState<BottomSurface>('tools');
  // User explicitly requested the timeline (Edit Clip / Timeline button).
  // For single-photo posters the timeline is hidden by default; this flag
  // records the user's intent so the timeline stays open until dismissed.
  const [userRequestedTimeline, setUserRequestedTimeline] = useState(false);
  // ── True cutout (segmentation) state ───────────────────────────────
  // `cutoutPreviewTarget` holds the media layer being previewed in the
  // CutoutPreviewSheet (true segmentation). `cutoutSupported` is probed
  // once on mount so the overflow tool can honestly show "Cutout" when
  // the native backend is available.
  const [cutoutPreviewTarget, setCutoutPreviewTarget] = useState<CreatorLayer | null>(null);
  const [cutoutSupported, setCutoutSupported] = useState(false);
  useEffect(() => {
    const cap = cutoutService.getCapability();
    setCutoutSupported(cap.brushRefinement);
  }, []);
  const [cropMode, setCropMode] = useState(false);
  // ── Compare-to-original (Lightroom long-press pattern) ─────────────
  // While the user long-presses the canvas background, the selected media
  // layer renders without its effect stack — the user sees the original
  // ungraded image. Release restores the graded view. This is the
  // recognition-over-recall pattern: the user doesn't need to remember
  // what the original looked like; they hold to see it.
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const page = document.pages[activePageIndex];
  const pageCount = document.pages.length;
  const hasMultipleFrames = pageCount > 1;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ── Edit-surface geometry ──────────────────────────────────────────
  // The 9:16 aspect ratio is the EXPORT ratio, not the edit surface ratio.
  // When a full-bleed media layer exists (width=1, height=1), the edit
  // surface fills the entire screen — the media uses contentFit="cover"
  // to fill it (cropping if needed), matching Snapchat/Instagram where the
  // viewfinder fills the screen and edits float over it.
  // For documents WITHOUT full-bleed media (blank canvas, text-only),
  // keep the centered 9:16 canvas so the authoring surface matches export.
  const canvasWidth = screenWidth;
  const pageHasFullBleedMedia = hasFullBleedMedia(page);
  const canvasHeight = useMemo(() => {
    if (pageHasFullBleedMedia) return screenHeight;
    const h = Math.floor(screenWidth / document.canvas.aspectRatio);
    return Math.min(h, screenHeight);
  }, [pageHasFullBleedMedia, screenWidth, document.canvas.aspectRatio, screenHeight]);

  const canvasVerticalOffset = useMemo(() => {
    if (pageHasFullBleedMedia) return 0;
    if (canvasHeight >= screenHeight) return 0;
    return Math.floor((screenHeight - canvasHeight) / 2);
  }, [pageHasFullBleedMedia, canvasHeight, screenHeight]);

  // ── Auto-show frame tray on frame change (doc 04) ──────────────────
  // "show a bottom frame tray that appears when frame change occurs or
  // user adds another frame." Auto-collapses after 2.5s to restore
  // full-screen canvas — the frame tray is a transient navigation aid,
  // not permanent chrome.
  useEffect(() => {
    if (!hasMultipleFrames) return;
    setShowFrameTray(true);
    setVideoInfoFrameIndex(null);
    const timer = setTimeout(() => setShowFrameTray(false), 2500);
    return () => clearTimeout(timer);
  }, [hasMultipleFrames, activePageIndex, pageCount]);

  // ── Truthful back — Save Draft / Discard / Keep Editing ────────────
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
            onConfirm: () => {},
          });
        }
      },
    });
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
        if (editingTextLayerId) setEditingTextLayerId(null);
        else if (activeSheet) closeSheet();
        else if (bottomSurface === 'effects') setBottomSurface('tools');
        else if (bottomSurface === 'timeline') { setUserRequestedTimeline(false); setBottomSurface('tools'); }
        else if (cropMode) setCropMode(false);
        else if (cutoutPreviewTarget) setCutoutPreviewTarget(null);
        else if (pageMenuIndex !== null) setPageMenuIndex(null);
        else if (showPreview) setShowPreview(false);
        else if (showTemplates) setShowTemplates(false);
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
  }, [canUndo, canRedo, undo, redo, editingTextLayerId, activeSheet, closeSheet, bottomSurface, cropMode, cutoutPreviewTarget, pageMenuIndex, showPreview, showTemplates, pickerMode, selectedLayerId, selectLayer, removeLayer, handleBack]);

  // ── Hardware back button — intercept to close sheets first ─────────
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (editingTextLayerId) { setEditingTextLayerId(null); return true; }
        if (activeSheet) { closeSheet(); return true; }
        if (bottomSurface === 'effects') { setBottomSurface('tools'); return true; }
        if (bottomSurface === 'timeline') { setUserRequestedTimeline(false); setBottomSurface('tools'); return true; }
        if (cropMode) { setCropMode(false); return true; }
        if (cutoutPreviewTarget) { setCutoutPreviewTarget(null); return true; }
        if (pageMenuIndex !== null) { setPageMenuIndex(null); return true; }
        if (showPreview) { setShowPreview(false); return true; }
        if (showTemplates) { setShowTemplates(false); return true; }
        if (pickerMode) { setPickerMode(null); setEditingLayer(null); return true; }
        if (selectedLayerId) { selectLayer(null); return true; }
        return false;
      };
      return onBackPress;
    }, [editingTextLayerId, activeSheet, closeSheet, bottomSurface, cropMode, cutoutPreviewTarget, pageMenuIndex, showPreview, showTemplates, pickerMode, selectedLayerId, selectLayer])
  );

  // ── Memoized asset picker callbacks (audit item-29 §5.5) ───────────
  // These were inline arrows in the JSX, creating new function references
  // on every render and causing CreatorAssetPicker to re-render even when
  // nothing relevant changed. Memoizing them keeps the picker stable.
  const handlePickerClose = useCallback(() => {
    setPickerMode(null);
    setEditingLayer(null);
  }, []);

  const handlePickerAddLayer = useCallback((layer: CreatorLayer) => {
    if (editingLayer) {
      updateLayer(editingLayer.id, layer, 'Edit layer');
    } else {
      addLayer(layer);
    }
  }, [editingLayer, updateLayer, addLayer]);

  // Shared "Done" handler for effects sheets — haptic + close (audit item-29)
  const handleSheetDone = useCallback(() => {
    haptic.light();
    closeSheet();
  }, [haptic, closeSheet]);

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

  // ── Background media URI for draw-on-media ────────────────────────
  // The first (lowest-zIndex) media layer on the current page is the
  // "background" that the drawing workspace renders underneath strokes,
  // so the user draws directly ON the photo/video (Snapchat/Instagram
  // pattern) instead of on a blank canvas.
  const backgroundMediaUri = useMemo(() => {
    const mediaLayer = page?.layers
      .filter((l) => l.type === 'media' && !l.hidden)
      .sort((a, b) => a.zIndex - b.zIndex)[0];
    return mediaLayer?.type === 'media' ? mediaLayer.payload.mediaUri : undefined;
  }, [page]);

  const hasContent = document.pages.some((p) => p.layers.length > 0);
  const showEntryScreen = !entryComplete && !hasContent && !isLoadingDraft;

  // ── Chrome fade during manipulation ───────────────────────────────
  // Top bar and tool dock fade to ~0.15 opacity when the user is actively
  // dragging/pinching/rotating a layer, then spring back on release.
  // The canvas itself stays at full opacity — the chrome recedes, not the
  // content. This is the Snapchat/Instagram "infinite canvas" pattern.
  const chromeFadeStyle = useAnimatedStyle(() => ({
    opacity: withTiming(manipulationActiveSV.value === 1 ? 0.15 : 1, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    }),
  }));

  // ── Video detection — any page with video media ───────────────────
  // When video content exists, the editor enters "video mode": the
  // timeline appears below the canvas and the tool rail uses video
  // contexts. Photo-only documents use photo contexts.
  const hasVideoContent = useMemo(
    () =>
      document.pages.some((p) =>
        p.layers.some(
          (l) => l.type === 'media' && l.payload.mediaType === 'video',
        ),
      ),
    [document.pages],
  );

  // ── Audio detection — music layer or video with audio ──────────────
  // The waveform track renders when audio content exists: either an
  // explicit music layer or a video clip (which carries its own audio
  // track). Per AGENTS.md §11 we never fake waveform data — when no
  // real samples are available the WaveformTrack renders an honest flat
  // line and a "No audio waveform" label.
  const hasAudioContent = useMemo(
    () =>
      document.pages.some(
        (p) =>
          p.layers.some((l) => l.type === 'music') ||
          p.layers.some(
            (l) => l.type === 'media' && l.payload.mediaType === 'video',
          ),
      ),
    [document.pages],
  );

  // ── Playback clock — the single source of truth for timeline time ──
  // Per AGENTS.md §11 and the Zero-Gap audit, one playback clock drives:
  // active clip, video seek/play/pause, overlay visibility, text animation,
  // transitions, and keyframes. The clock owns wall-clock time and emits
  // snapshots via a subscriber model. UI state (playhead position, play/pause)
  // is derived from the clock — no separate isPlaying state that can desync.
  const playbackClock = useMemo(() => new PlaybackClock(), []);

  // Project the document into a canonical timeline (clips + overlays + total
  // duration). This replaces the legacy page-based derivation with correct
  // speed-adjusted clip durations and overlay time ranges.
  const projectedTimeline = useMemo(() => projectTimeline(document), [document]);

  // Set the clock's total duration whenever the projected timeline changes.
  useEffect(() => {
    playbackClock.setTotalDurationMs(projectedTimeline.totalDurationMs);
  }, [projectedTimeline.totalDurationMs, playbackClock]);

  // Subscribe to clock updates to drive UI state (playhead position, play/pause).
  // The clock emits on every frame during playback (RAF/interval) and on every
  // transport control call (play/pause/seek/scrub/setRate).
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentTimeMs: 0,
    totalDurationMs: 0,
    playbackRate: 1,
  });
  useEffect(() => {
    const unsubscribe = playbackClock.subscribe((state) => {
      setPlaybackState(state);
    });
    return unsubscribe;
  }, [playbackClock]);

  // Determine which overlays are visible at the current playback position.
  // The CreatorCanvas also handles temporal visibility internally via the
  // currentTimeMs prop (checking layer.timeRange), but this computed set
  // is available for timeline overlay track highlighting and future
  // features that need to know which overlays are active.
  const visibleOverlayIds = useMemo(
    () => new Set(findVisibleOverlays(projectedTimeline, playbackState.currentTimeMs).map((o) => o.layerId)),
    [projectedTimeline, playbackState.currentTimeMs],
  );

  // Register a video adapter so the clock can control video playback.
  // The CreatorCanvas already reads `playbackClock.isPlaying` to drive the
  // Video component's `shouldPlay` prop, and `currentTimeMs` drives temporal
  // visibility + keyframe evaluation. The adapter handles play/pause/seek
  // commands from the clock — for image-only posters these are no-ops
  // (backward compatible). The onSeek callback is coalesced by the clock
  // (max once per ~100ms) to avoid excessive native bridge traffic.
  useEffect(() => {
    playbackClock.registerVideoAdapter({
      onPlay: () => {
        // Video shouldPlay is driven by playbackClock.isPlaying in CreatorCanvas.
        // This callback is for any additional play-side effects (e.g. audio).
      },
      onPause: () => {
        // Video shouldPlay is driven by playbackClock.isPlaying in CreatorCanvas.
        // This callback is for any additional pause-side effects (e.g. audio).
      },
      onSeek: (_ms: number) => {
        // The seek target (ms) is the absolute timeline position. The
        // CreatorCanvas receives currentTimeMs as a prop and uses it for
        // temporal visibility and keyframe evaluation. The actual video
        // source-time seek is handled by the Video component's internal
        // playback, which follows the clock's isPlaying state. For future
        // precise frame-seeking, the Video component would need a ref-based
        // seek API exposed through CreatorCanvas.
      },
      onRateChange: (_rate: number) => {
        // Playback rate changes are handled by the clock's playbackRate.
        // The Video component's rate would be set via a ref in a future
        // enhancement.
      },
    });
    return () => {
      playbackClock.unregisterVideoAdapter();
    };
  }, [playbackClock]);

  // Dispose the clock on unmount to stop any running RAF/interval loops.
  useEffect(() => {
    return () => {
      playbackClock.dispose();
    };
  }, [playbackClock]);

  // ── Timeline state derivation ──────────────────────────────────────
  // Map pages with video media to PosterClip objects, and timed overlays
  // (text, stickers, music with time ranges) to OverlayLayer objects.
  // The timeline is a read-only projection of the document model for now —
  // clip/overlay mutations route through TimelineOperation handlers.
  // Playhead position and play/pause state are driven by the PlaybackClock
  // (the single authority) — no separate isPlaying state.
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  // ── Timeline clips + page-index mapping ────────────────────────────
  // Map pages with video media to PosterClip objects. We also track which
  // page each clip originated from (clipPageIndices) so the transition
  // icons between clips can resolve the source page's transitionId.
  // Both are derived in a single memo to avoid a ref-mutation-in-memo.
  const { timelineClips, clipPageIndices } = useMemo<{
    timelineClips: PosterClip[];
    clipPageIndices: number[];
  }>(() => {
    const clips: PosterClip[] = [];
    const pageIndices: number[] = [];
    for (let pageIdx = 0; pageIdx < document.pages.length; pageIdx++) {
      const p = document.pages[pageIdx];
      for (const layer of p.layers) {
        if (layer.type !== 'media' || layer.payload.mediaType !== 'video') continue;
        const payload = layer.payload;
        const trimStart = payload.trimStartMs ?? 0;
        const trimEnd =
          payload.trimEndMs ??
          payload.videoDurationMs ??
          p.durationMs ??
          5000;
        const rawDuration = Math.max(100, trimEnd - trimStart);
        const speed = payload.speed ?? 1.0;
        const durationMs = rawDuration / speed;
        clips.push({
          id: layer.id,
          assetId: layer.id,
          sourceUri: payload.mediaUri,
          trimStartMs: trimStart,
          trimEndMs: trimEnd,
          speed,
          volume: payload.volume ?? 1.0,
          thumbnailUri: payload.thumbnailUri,
          durationMs,
        });
        pageIndices.push(pageIdx);
      }
    }
    return { timelineClips: clips, clipPageIndices: pageIndices };
  }, [document.pages]);

  // ── Transition preset IDs for each clip boundary ───────────────────
  // Length = clips.length - 1. Index i is the transition between clip[i]
  // and clip[i+1], sourced from the source page of clip[i]
  // (page.transitionId). null means no transition is set — the timeline
  // renders a subtle "+" icon there. Only page-level transitions (where
  // clip[i+1] is on a later page) are surfaced; within-page clip cuts
  // have no page-level transition.
  const clipTransitionIds = useMemo<(string | null)[]>(() => {
    if (clipPageIndices.length < 2) return [];
    const result: (string | null)[] = [];
    for (let i = 0; i < clipPageIndices.length - 1; i++) {
      const srcPageIdx = clipPageIndices[i];
      const nextPageIdx = clipPageIndices[i + 1];
      if (nextPageIdx > srcPageIdx && srcPageIdx < document.pages.length) {
        result.push(document.pages[srcPageIdx].transitionId ?? null);
      } else {
        result.push(null);
      }
    }
    return result;
  }, [clipPageIndices, document.pages]);

  const timelineOverlays = useMemo<OverlayLayer[]>(() => {
    const overlays: OverlayLayer[] = [];
    let clipOffsetMs = 0;
    for (const p of document.pages) {
      const pageDuration = p.durationMs ?? 5000;
      for (const layer of p.layers) {
        if (layer.type === 'media' && layer.payload.mediaType === 'video') {
          // Skip video layers — they become clips, not overlays
          clipOffsetMs += pageDuration;
          break;
        }
        // Map timed overlay types to OverlayLayer
        let overlayType: OverlayLayer['type'] | null = null;
        let label = '';
        if (layer.type === 'text') {
          overlayType = 'text';
          label = layer.payload.text ?? 'Text';
        } else if (layer.type === 'decorative') {
          overlayType = 'sticker';
          label = 'Sticker';
        } else if (layer.type === 'product') {
          overlayType = 'product';
          label = layer.payload.snapshotTitle ?? 'Product';
        } else if (layer.type === 'music') {
          overlayType = 'music';
          label = layer.payload.trackName ?? 'Music';
        } else if (layer.type === 'draw') {
          overlayType = 'drawing';
          label = 'Drawing';
        }
        if (overlayType) {
          overlays.push({
            id: layer.id,
            type: overlayType,
            timeRange: { startMs: clipOffsetMs, endMs: clipOffsetMs + pageDuration },
            label,
          });
        }
      }
    }
    return overlays;
  }, [document.pages]);

  const timelineTotalDurationMs = useMemo(
    () => computeTotalDuration(timelineClips),
    [timelineClips],
  );

  // ── Timeline visibility (spec: one bottom surface at a time) ──────
  // The timeline is the bottom surface when bottomSurface === 'timeline'.
  // It replaces the tool rail — never stacks on top of it. The tool rail
  // is only rendered when bottomSurface === 'tools', and the effects sheet
  // only when bottomSurface === 'effects'. This enforces the spec's
  // "one bottom surface" constraint: tools, timeline, and effects are
  // mutually exclusive, not layered.
  const shouldShowTimeline = bottomSurface === 'timeline' && timelineClips.length > 0;

  // ── Auto-expand timeline when video or second clip is added ──────
  // When the composition transitions from single-photo to video or
  // multi-clip, the timeline auto-expands without requiring a user tap.
  // This sets bottomSurface to 'timeline' so the tool rail is replaced
  // (not stacked underneath) — one bottom surface at a time.
  useEffect(() => {
    if (hasVideoContent || timelineClips.length > 1) {
      setUserRequestedTimeline(true);
      setBottomSurface('timeline');
    }
  }, [hasVideoContent, timelineClips.length]);

  const timelineState: TimelineState = useMemo(
    () => ({
      clips: timelineClips,
      overlays: timelineOverlays,
      playheadMs: playbackState.currentTimeMs,
      totalDurationMs: timelineTotalDurationMs,
      isPlaying: playbackState.isPlaying,
    }),
    [timelineClips, timelineOverlays, playbackState.currentTimeMs, timelineTotalDurationMs, playbackState.isPlaying],
  );

  const selectedClip = useMemo(
    () => timelineClips.find((c) => c.id === selectedClipId) ?? null,
    [timelineClips, selectedClipId],
  );

  // ── Timeline operation handler ─────────────────────────────────────
  // Routes timeline operations to the document model. For now, trim/speed/
  // volume map to updateLayer on the underlying media layer.
  const handleTimelineOperation = useCallback(
    (op: TimelineOperation) => {
      switch (op.type) {
        case 'seek':
          playbackClock.seek(op.ms);
          break;
        case 'play':
          playbackClock.play();
          haptic.light();
          break;
        case 'pause':
          playbackClock.pause();
          haptic.light();
          break;
        case 'trim': {
          const clip = timelineClips.find((c) => c.id === op.clipId);
          if (!clip) return;
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.clipId);
          if (!layer || layer.type !== 'media') return;
          const newTrimStart = op.edge === 'start'
            ? Math.max(0, clip.trimStartMs + op.deltaMs)
            : clip.trimStartMs;
          const newTrimEnd = op.edge === 'end'
            ? Math.max(newTrimStart + 100, clip.trimEndMs + op.deltaMs)
            : clip.trimEndMs;
          updateLayer(op.clipId, {
            type: 'media',
            payload: { ...layer.payload, trimStartMs: newTrimStart, trimEndMs: newTrimEnd },
          }, 'Trim clip');
          break;
        }
        case 'speed': {
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.clipId);
          if (!layer || layer.type !== 'media') return;
          updateLayer(op.clipId, {
            type: 'media',
            payload: { ...layer.payload, speed: op.speed },
          }, 'Change speed');
          haptic.light();
          break;
        }
        case 'volume': {
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.clipId);
          if (!layer || layer.type !== 'media') return;
          updateLayer(op.clipId, {
            type: 'media',
            payload: { ...layer.payload, volume: op.volume },
          }, 'Change volume');
          haptic.light();
          break;
        }
        case 'split': {
          // Split the selected clip at the playhead position.
          // This creates two clips from one: the first keeps the original
          // trim range up to the split point, the second starts from the
          // split point to the original trim end.
          const clip = timelineClips.find((c) => c.id === op.clipId);
          if (!clip) return;

          // Find the clip's start position in the timeline (sum of all
          // previous clips' speed-adjusted durations).
          const clipIndex = timelineClips.indexOf(clip);
          let clipStartMs = 0;
          for (let i = 0; i < clipIndex; i++) {
            clipStartMs += timelineClips[i].durationMs;
          }

          // Calculate the offset within this clip (timeline time → source time)
          const offsetInClip = Math.max(0, op.atMs - clipStartMs);
          const splitPoint = clip.trimStartMs + offsetInClip * clip.speed;

          // Clamp the split point to be safely within the trim range
          const minSplit = clip.trimStartMs + 100; // min 100ms on each side
          const maxSplit = clip.trimEndMs - 100;
          if (splitPoint <= minSplit || splitPoint >= maxSplit) {
            haptic.light();
            show('Move the playhead within the clip to split', 'info');
            break;
          }

          // Find the original media layer
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.clipId);
          if (!layer || layer.type !== 'media') return;

          // 1. Update the original clip's trim end to the split point
          updateLayer(op.clipId, {
            type: 'media',
            payload: { ...layer.payload, trimEndMs: Math.round(splitPoint) },
          }, 'Split clip (first half)');

          // 2. Create a new media layer for the second half
          const newLayer: CreatorLayer = {
            ...layer,
            id: makeStableId('media'),
            zIndex: layer.zIndex + 1,
            payload: {
              ...layer.payload,
              trimStartMs: Math.round(splitPoint),
              trimEndMs: clip.trimEndMs,
            },
          };
          addLayer(newLayer);

          haptic.medium();
          break;
        }
        case 'duplicate':
          if (op.clipId) duplicateLayer(op.clipId);
          break;
        case 'delete':
          if (op.clipId) removeLayer(op.clipId);
          setSelectedClipId(null);
          break;
        case 'replace':
          setEditingLayer(
            document.pages.flatMap((p) => p.layers).find((l) => l.id === op.clipId) ?? null,
          );
          setPickerMode('media');
          break;
        case 'moveOverlay': {
          const layer = document.pages
            .flatMap((p) => p.layers)
            .find((l) => l.id === op.overlayId);
          if (!layer) return;
          updateLayer(op.overlayId, {
            timeRange: op.timeRange,
          }, 'Move overlay');
          haptic.light();
          break;
        }
        case 'reorder':
          // Clip reorder maps to page reorder
          if (op.fromIndex !== op.toIndex) {
            reorderPages(op.fromIndex, op.toIndex);
          }
          break;
      }
    },
    [timelineClips, timelineTotalDurationMs, document.pages, updateLayer, duplicateLayer, removeLayer, reorderPages, show, haptic, addLayer, playbackClock],
  );

  // ── Playback tick is now handled by the PlaybackClock ──────────────
  // The clock uses requestAnimationFrame (or setInterval fallback) to
  // advance time at 60fps with coalesced seeks. The old 100ms setInterval
  // tick has been removed — the clock is the single authority for time.

  // ── Entry screen media handling ────────────────────────────────────
  // For Poster, each asset becomes its own frame via addPosterFrames.
  // The first selected media URI is captured so the camera→editor crossfade
  // can pin it as a continuity layer (the media stays in place while editor
  // chrome fades in around it — see the creator-poster surface contract).
  const [entryPinnedUri, setEntryPinnedUri] = useState<string | null>(null);
  const [entryPinnedKind, setEntryPinnedKind] = useState<'image' | 'video'>('image');
  // Source content transform — the camera viewport guide rect captured at
  // the moment of capture. The transition animates the pinned media from
  // this frame to the editor canvas frame, preserving the focal point.
  const [entrySourceTransform, setEntrySourceTransform] = useState<CreatorContentTransform | null>(null);
  // The camera reports its measured viewport via onViewportChange so the
  // source transform is available when the capture commits.
  const cameraViewportRef = useRef<CaptureViewport | null>(null);
  const handleEntryMediaSelected = useCallback((media: CreatorInitialMedia[]) => {
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
          height: vp.viewRect.height,
        },
        aspectRatio: vp.authoredAspectRatio,
      });
    } else {
      setEntrySourceTransform(null);
    }
    addPosterFrames(media);
    setEntryComplete(true);
  }, [addPosterFrames]);

  const handleEntryBlankStart = useCallback(() => {
    setEntryPinnedUri(null);
    setEntryPinnedKind('image');
    setEntrySourceTransform(null);
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
    const DIRECTION_LOCK_THRESHOLD = 10;
    return Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        frameSwipeStartXSV.value = e.x;
        frameSwipeStartYSV.value = e.y;
        frameSwipeLockedDirSV.value = null;
      })
      .onUpdate((e) => {
        'worklet';
        // Directional lock: once the gesture commits to horizontal or
        // vertical, stay locked. This prevents diagonal jitter from
        // triggering frame swipe when the user is trying to interact
        // with a layer (which starts inside the selected object's bounds
        // and is handled by the canvas gesture, not this one).
        if (frameSwipeLockedDirSV.value === null) {
          const dx = Math.abs(e.absoluteX - frameSwipeStartXSV.value);
          const dy = Math.abs(e.absoluteY - frameSwipeStartYSV.value);
          if (dx > DIRECTION_LOCK_THRESHOLD || dy > DIRECTION_LOCK_THRESHOLD) {
            frameSwipeLockedDirSV.value = dx > dy ? 'horizontal' : 'vertical';
          }
        }
      })
      .onEnd((e) => {
        'worklet';
        // Only trigger frame swipe for horizontal-dominant gestures.
        // Vertical gestures (scroll, layer drag) are ignored.
        if (frameSwipeLockedDirSV.value !== 'horizontal') return;
        const dx = e.x - frameSwipeStartXSV.value;
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
  }, [screenWidth, activePageIndex, goToFrame, frameSwipeStartXSV, frameSwipeStartYSV, frameSwipeLockedDirSV]);

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
    if (layer.type === 'text') {
      // In-place text editing — no modal sheet (Snapchat/Instagram pattern)
      setEditingTextLayerId(layer.id);
      return;
    }
    setEditingLayer(layer);
    if (layer.type === 'media') setPickerMode('media');
    else if (layer.type === 'product') setPickerMode('product');
    else if (layer.type === 'mention') setPickerMode('mention');
  }, []);

  // ── Bottom tool rail handlers (default — no selection) ─────────────
  // Direct-on-canvas text placement (Snapchat/Instagram pattern):
  // tapping Text creates a text layer directly on the canvas — centered,
  // selected, with placeholder copy — then opens the text editor in EDIT
  // mode for that layer so the keyboard opens immediately. The text is
  // already on the canvas when the editor opens; dismissing the editor
  // without typing leaves the layer on the canvas for later editing. This
  // replaces the former "tap Text → open empty picker sheet → type →
  // confirm → layer appears" modal flow where the canvas was hidden and
  // the text only appeared after confirmation.
  const handleAddText = useCallback(() => {
    haptic.light();
    const newLayer: CreatorLayer = {
      id: makeStableId('text'),
      type: 'text',
      x: 0.5,
      y: 0.5,
      width: 0.7,
      height: 0.12,
      scale: 1,
      rotation: 0,
      zIndex: 10, // addLayerToPage re-assigns to maxZ + 1
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        text: 'Tap to edit',
        textStyle: 'clean',
        fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
        textColor: '#ffffff',
        alignment: 'center',
        opacity: 1,
      },
    } as CreatorLayer;
    addLayer(newLayer);
    // Enter in-place text editing immediately — the InlineTextEditor
    // renders AT the layer's position on the canvas so the user can type
    // in place (Snapchat/Instagram pattern). No modal sheet needed.
    setEditingTextLayerId(newLayer.id);
  }, [haptic, addLayer]);

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

  // ── Timeline toggle (spec: timeline expands on explicit request) ──
  // For single-photo posters the timeline is hidden by default. Tapping
  // "Timeline" in the tool rail expands it; tapping again collapses it.
  // For video posters the timeline auto-expands — this toggle still
  // allows the user to collapse it if desired.
  const handleTimelineToggle = useCallback(() => {
    haptic.light();
    setUserRequestedTimeline((prev) => {
      const next = !prev;
      setBottomSurface(next ? 'timeline' : 'tools');
      return next;
    });
  }, [haptic]);

  // ── Timeline Done — collapses the timeline, returns to canvas tools ──
  // Per spec: "Done returns to canvas tools." This is the exit from the
  // video state back to the default tool rail. The tool rail re-renders
  // because bottomSurface switches to 'tools'.
  const handleTimelineDone = useCallback(() => {
    haptic.light();
    setUserRequestedTimeline(false);
    setBottomSurface('tools');
    setSelectedClipId(null);
  }, [haptic]);

  // ── Effects handler ────────────────────────────────────────────────
  // Opens the effects bottom sheet for the selected media layer. The
  // sheet shows the EffectPreviewRail (filter thumbnails using the
  // layer's own media as the preview source) and the AdjustPanel
  // (fine-tuning sliders). Effect changes commit to the layer's
  // non-destructive `effects` array (EffectNode[]) via updateLayer.
  const handleAddEffects = useCallback(() => {
    const mediaLayer = selectedLayer?.type === 'media'
      ? selectedLayer
      : page.layers.find((layer) => layer.type === 'media');
    if (!mediaLayer) {
      haptic.light();
      show('Add a photo before applying effects', 'info');
      return;
    }
    haptic.medium();
    selectLayer(mediaLayer.id);
    setBottomSurface('effects');
  }, [selectedLayer, page.layers, haptic, selectLayer, show]);

  // ── Effects sheet — derived state & handlers ───────────────────────
  const selectedMediaLayer = selectedLayer?.type === 'media' ? selectedLayer : null;
  const effectsSourceUri = selectedMediaLayer?.payload.mediaUri ?? '';
  const currentEffects: EffectNode[] = selectedMediaLayer?.payload.effects ?? [];

  const selectedFilterId = useMemo(() => {
    const filterNode = currentEffects.find((n) => n.type === 'filter');
    return filterNode?.type === 'filter' ? filterNode.id : null;
  }, [currentEffects]);

  // ── Live filter preview (Snapchat/Instagram pattern) ─────────────────
  // While the user scrolls the effect rail, the centred filter is applied to
  // the full canvas as a TRANSIENT preview (no history entry) via
  // updateLayerLive. Tapping a thumbnail commits via handleEffectFilterSelect
  // (history entry) and clears the preview. When the effects sheet closes
  // without a commit, the preview is reverted to the last committed filter.
  // `committedFilterIdRef` captures the filter id that lives in the history
  // stack the moment the sheet opens — before any preview mutation — so we
  // can restore it on close.
  const [previewFilterId, setPreviewFilterId] = useState<string | null>(null);
  const previewFilterIdRef = useRef<string | null>(null);
  const committedFilterIdRef = useRef<string | null>(null);

  // Capture the committed filter id when the effects sheet opens; revert any
  // uncommitted preview when it closes.
  useEffect(() => {
    if (bottomSurface === 'effects') {
      // No preview has mutated the layer yet, so selectedFilterId is the
      // committed (history) value.
      committedFilterIdRef.current = selectedFilterId;
      previewFilterIdRef.current = null;
      setPreviewFilterId(null);
    } else {
      // Sheet closed — if a preview is active and differs from the committed
      // filter, restore the committed filter on the layer (no history entry).
      const activePreview = previewFilterIdRef.current;
      if (activePreview !== null && selectedMediaLayer) {
        const committedId = committedFilterIdRef.current;
        if (activePreview !== committedId) {
          const revertedEffects: EffectNode[] = [
            ...currentEffects.filter((n) => n.type !== 'filter'),
            ...(committedId
              ? [{ type: 'filter' as const, id: committedId, amount: 1 }]
              : []),
          ];
          updateLayerLive(selectedMediaLayer.id, {
            type: 'media',
            payload: { ...selectedMediaLayer.payload, effects: revertedEffects },
          });
        }
      }
      previewFilterIdRef.current = null;
      committedFilterIdRef.current = null;
      setPreviewFilterId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomSurface]);

  // Apply a transient (no-history) preview of the given filter to the full
  // canvas. Called by EffectPreviewRail as the user scrolls.
  const handleEffectPreview = useCallback(
    (id: string | null) => {
      if (!selectedMediaLayer) return;
      previewFilterIdRef.current = id;
      setPreviewFilterId(id);
      if (id === null) return;
      const previewEffects: EffectNode[] = [
        ...currentEffects.filter((n) => n.type !== 'filter'),
        { type: 'filter', id, amount: 1 },
      ];
      updateLayerLive(selectedMediaLayer.id, {
        type: 'media',
        payload: { ...selectedMediaLayer.payload, effects: previewEffects },
      });
    },
    [selectedMediaLayer, currentEffects, updateLayerLive],
  );

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
    // Commit ends the preview: clear preview state and record the new
    // committed filter so a subsequent panel close does not revert it.
    previewFilterIdRef.current = null;
    setPreviewFilterId(null);
    committedFilterIdRef.current = presetId;
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

  // ── Crop action for selected media ─────────────────────────────────
  // CreatorCropSheet performs a real pixel crop and returns a new local
  // asset. Moving/resizing the layer frame is layout, not cropping.
  const handleCropAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setCropMode(true);
  }, [selectedLayer, haptic]);

  // ── Cutout action for selected media (advanced, overflow only) ────
  // Opens true subject segmentation (CutoutPreviewSheet) when the native
  // backend is available. Per spec 07 §7: true cutout uses segmentation,
  // not a trace bounding box. Per AGENTS.md §11: never fake a cutout.
  // This is an advanced tool — it lives in the media-selected overflow,
  // not the primary rail.
  const handleCutoutAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setCutoutPreviewTarget(selectedLayer);
  }, [selectedLayer, haptic]);

  // ── Adjust action for selected media ───────────────────────────────
  // Opens the effects sheet with the AdjustPanel visible. The adjust
  // panel provides non-destructive exposure/brightness/contrast/saturation
  // adjustments — the same workflow used by LookComposerScreen.
  const handleAdjustAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setBottomSurface('effects');
  }, [selectedLayer, haptic]);

  // ── Transition handler ─────────────────────────────────────────────
  // Opens the transition preview rail for the current page. Selecting a
  // transition stores its preset id on the page's `transitionId` field.
  const currentTransitionId = page?.transitionId ?? null;
  const handleTransitionSelect = useCallback((presetId: string) => {
    const newPages = [...document.pages];
    newPages[activePageIndex] = {
      ...newPages[activePageIndex],
      transitionId: presetId,
    };
    commitDocument(
      { ...document, pages: newPages, updatedAt: new Date().toISOString() },
      'Apply transition',
    );
    haptic.selection();
  }, [activePageIndex, page, document, haptic]);

  // ── Transition icon tap (from the timeline clip boundary) ──────────
  // When the user taps a transition icon between two clips in the timeline,
  // navigate to the source page of that boundary and open the transition
  // drawer. This is the progressive-disclosure pattern: the transition is
  // visible as an icon between clips (only when 2+ clips exist) and opens
  // the same drawer as the overflow "Transitions" tool.
  const handleTimelineTransitionTap = useCallback(
    (boundaryIndex: number) => {
      const srcPageIdx = clipPageIndices[boundaryIndex];
      if (srcPageIdx == null) return;
      if (srcPageIdx !== activePageIndex) {
        selectLayer(null);
        setActivePageIndex(srcPageIdx);
      }
      openSheet('transitions');
    },
    [clipPageIndices, activePageIndex, selectLayer, setActivePageIndex, openSheet],
  );

  // ── Keyframe handlers ──────────────────────────────────────────────
  // Keyframes are stored on the layer's `keyframes` array. The editor
  // calls onAdd/onUpdate/onRemove to mutate the keyframe set.
  const selectedLayerKeyframes: Keyframe[] = (selectedLayer as { keyframes?: Keyframe[] })?.keyframes ?? [];

  const handleAddKeyframe = useCallback((kf: Omit<Keyframe, 'id'>) => {
    if (!selectedLayer) return;
    const newKf: Keyframe = { ...kf, id: makeStableId('kf') };
    const existing = (selectedLayer as { keyframes?: Keyframe[] }).keyframes ?? [];
    updateLayer(selectedLayer.id, {
      ...selectedLayer,
      keyframes: [...existing, newKf],
    } as Partial<CreatorLayer>, 'Add keyframe');
    haptic.light();
  }, [selectedLayer, updateLayer, haptic]);

  const handleUpdateKeyframe = useCallback((id: string, updates: Partial<Keyframe>) => {
    if (!selectedLayer) return;
    const existing = (selectedLayer as { keyframes?: Keyframe[] }).keyframes ?? [];
    const newKeyframes = existing.map((k) => k.id === id ? { ...k, ...updates } : k);
    updateLayer(selectedLayer.id, {
      ...selectedLayer,
      keyframes: newKeyframes,
    } as Partial<CreatorLayer>, 'Update keyframe');
  }, [selectedLayer, updateLayer]);

  const handleRemoveKeyframe = useCallback((id: string) => {
    if (!selectedLayer) return;
    const existing = (selectedLayer as { keyframes?: Keyframe[] }).keyframes ?? [];
    const newKeyframes = existing.filter((k) => k.id !== id);
    updateLayer(selectedLayer.id, {
      ...selectedLayer,
      keyframes: newKeyframes.length > 0 ? newKeyframes : undefined,
    } as Partial<CreatorLayer>, 'Remove keyframe');
    haptic.light();
  }, [selectedLayer, updateLayer, haptic]);

  // ── Speed curve handler ─────────────────────────────────────────────
  // Opens the speed curve editor for the selected media layer. The curve
  // is stored on the media layer's `speedCurve` field. When the user
  // clears the curve (back to constant), the field is removed.
  const selectedMediaSpeedCurve: SpeedCurve | null = useMemo(() => {
    if (selectedLayer?.type !== 'media') return null;
    return selectedLayer.payload.speedCurve ?? DEFAULT_SPEED_CURVE;
  }, [selectedLayer]);

  const handleSpeedCurveChange = useCallback((nextCurve: SpeedCurve) => {
    if (!selectedLayer || selectedLayer.type !== 'media') return;
    updateLayer(selectedLayer.id, {
      type: 'media',
      payload: { ...selectedLayer.payload, speedCurve: nextCurve },
    }, 'Edit speed curve');
  }, [selectedLayer, updateLayer]);

  // ── Tool groups for ContextToolRail ────────────────────────────────
  // Each context maps to a ToolGroup with up to 6 primary tools + overflow.
  // All onPress handlers wire to EXISTING handlers — no new actions.
  const toolGroups = useMemo<ToolGroup[]>(() => {
    const mk = (
      id: string,
      label: string,
      icon: ToolDefinition['icon'],
      onPress: () => void,
      accessibilityLabel: string,
      accessibilityHint?: string,
      glyph?: ToolDefinition['glyph'],
      active?: boolean,
      capabilityId?: string,
    ): ToolDefinition => ({
      id,
      label,
      icon,
      glyph,
      onPress,
      accessibilityLabel,
      accessibilityHint,
      active,
      capabilityId,
    });

    // Overflow tools shared across contexts (Layers, Preview, Safe Zone,
    // Templates, Drafts, Settings, Add Frame)
    const sharedOverflow: ToolDefinition[] = [
      mk('transitions', 'Transitions', 'swap-horizontal-outline', () => { haptic.light(); openSheet('transitions'); }, 'Transitions', 'Opens the transition picker for the current frame'),
      mk('layers', 'Layers', 'layers-outline', () => { openSheet('layers'); }, 'Layers', 'Opens the layers panel', 'layers'),
      mk('preview', 'Preview', 'eye-outline', () => { setShowPreview(true); }, 'Preview', 'Previews the story'),
      mk('safe-zone', 'Safe Zone', 'scan-outline', () => { setShowSafeZone((p) => !p); }, 'Safe Zone', 'Toggles the safe zone overlay', 'safe-zone', showSafeZone),
      mk('templates', 'Templates', 'grid-outline', () => { setShowTemplates(true); }, 'Templates', 'Opens the template browser'),
      mk('drafts', 'Drafts', 'document-text-outline', () => { navigation.navigate('CreatorDraftList'); }, 'Drafts', 'Opens saved drafts'),
      mk('settings', 'Settings', 'settings-outline', () => { openSheet('settings'); }, 'Settings', 'Opens composer settings'),
    ];

    const addFrameOverflow: ToolDefinition[] = pageCount < 10
      ? [mk('add-frame', 'Add Frame', 'add-circle-outline', handleAddFrame, 'Add frame', 'Adds a new frame')]
      : [];

    const productOverflow: ToolDefinition[] = [
      mk('product', 'Product', 'pricetag-outline', handleAddProduct, 'Add product', 'Opens the product picker', 'product-tag', undefined, 'stickerProduct'),
    ];

    // ── poster-photo-default: Text, Stickers, Product, Draw ──
    // 2026 flagship creator UX: ≤4 primary actions (Meta Edits / Instagram /
    // CapCut pattern). Draw and Timeline move to overflow — Draw is a
    // secondary creative tool, and Timeline is canvas-dominant for a single
    // photo (auto-hidden). The primary layer is ruthlessly guarded against
    // feature creep; the 4 most common creative actions are immediately
    // visible, everything else is one tap away under "More".
    //
    // Icons: purpose-built CreatorGlyph SVGs (not generic Ionicons) for
    // creative tools — this is the designed icon family for the creator
    // department. Universally understood actions (close, delete, etc.) still
    // use Ionicons.
    //
    // capabilityId gates each creation tool against the capability registry
    // (acceptance gate 6: tools generated from capability truth).
    const photoDefault: ToolGroup = {
      context: 'poster-photo-default',
      primary: [
        mk('text', 'Text', 'text', handleAddText, 'Add text', 'Opens the text picker', 'text', undefined, 'stickerText'),
        mk('stickers', 'Stickers', 'happy-outline', handleAddStickers, 'Add stickers', 'Opens the sticker picker', 'sticker'),
        ...productOverflow,
        mk('draw', 'Draw', 'brush-outline', handleDraw, 'Draw', 'Opens the drawing tool', 'drawing', undefined, 'layerDraw'),
      ],
      overflow: [
        mk('effects', 'Effects', 'color-filter-outline', handleAddEffects, 'Effects', 'Opens effects for the background photo', 'filter', undefined, 'imageFilter'),
        mk('timeline', 'Timeline', 'film-outline', handleTimelineToggle, 'Timeline', 'Expands the timeline for editing clip timing and overlays', undefined, bottomSurface === 'timeline'),
        ...addFrameOverflow,
        ...sharedOverflow,
      ],
    };

    // ── poster-video-default: Timeline, Text, Stickers, Product ──
    // Timeline stays primary for video (it is the job-to-be-done for video
    // editing). Stickers move to overflow — less frequently needed for video
    // than the core 4 of timeline + text + music + effects.
    const videoDefault: ToolGroup = {
      context: 'poster-video-default',
      primary: [
        mk('timeline', 'Timeline', 'film-outline', handleTimelineToggle, 'Timeline', 'Toggles the video timeline', undefined, bottomSurface === 'timeline'),
        mk('text', 'Text', 'text', handleAddText, 'Add text', 'Opens the text picker', 'text', undefined, 'stickerText'),
        mk('stickers', 'Stickers', 'happy-outline', handleAddStickers, 'Add stickers', 'Opens the sticker picker', 'sticker'),
        ...productOverflow,
      ],
      overflow: [
        mk('draw', 'Draw', 'brush-outline', handleDraw, 'Draw', 'Opens the drawing tool', 'drawing', undefined, 'layerDraw'),
        ...addFrameOverflow,
        ...sharedOverflow,
      ],
    };

    // ── poster-media-selected: Replace, Crop, Adjust, Effects ──
    // Per report §7.4: the 4 most relevant media-editing actions are
    // Replace, Crop, Adjust, Effects. Auto-enhance moves to overflow —
    // it's a one-tap convenience, not a primary editing mode. Advanced
    // tools (cutout, animation, speed curve, reverse, freeze frame,
    // audio fade) remain in overflow grouped under Edit.
    const isVideoMedia = selectedLayer?.type === 'media' && selectedLayer.payload.mediaType === 'video';
    const editClipTool = mk('edit-clip', 'Edit Clip', 'film-outline', () => {
      if (!selectedLayer) return;
      haptic.light();
      setSelectedClipId(selectedLayer.id);
      setUserRequestedTimeline(true);
      setBottomSurface('timeline');
    }, 'Edit clip', 'Expands the timeline to trim and adjust the video clip');
    const mediaSelected: ToolGroup = {
      context: 'poster-media-selected',
      primary: isVideoMedia
        ? [
            mk('replace', 'Replace', 'swap-horizontal-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Replace video', 'Replaces the selected video'),
            editClipTool,
            mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate clip', 'Duplicates the selected video clip'),
            mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete clip', 'Deletes the selected video clip'),
          ]
        : [
            mk('replace', 'Replace', 'swap-horizontal-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Replace photo', 'Replaces the selected photo'),
            mk('crop', 'Crop', 'crop-outline', handleCropAction, 'Crop', 'Opens the pixel crop editor', 'crop'),
            mk('adjust', 'Adjust', 'options-outline', handleAdjustAction, 'Adjust', 'Opens exposure and color controls', 'adjust'),
            mk('effects', 'Effects', 'color-filter-outline', handleAddEffects, 'Effects', 'Opens photo effects and filters', 'filter'),
          ],
      overflow: [
        ...(!isVideoMedia ? [
          mk('auto', 'Auto', 'bulb-outline', handleAutoAdjust, 'Auto', 'Applies one-tap color correction', 'enhance'),
          mk('cutout', cutoutSupported ? 'Cutout' : 'Crop', cutoutSupported ? 'cut-outline' : 'crop-outline', handleCutoutAction, cutoutSupported ? 'Cutout' : 'Crop', cutoutSupported ? 'Removes the photo background using on-device subject segmentation' : 'Crops the selected photo', cutoutSupported ? 'cutout' : 'crop'),
          mk('animation', 'Animation', 'analytics-outline', () => { haptic.light(); openSheet('keyframes'); }, 'Animation', 'Opens the keyframe editor for the selected layer', 'keyframe'),
        ] : [
          // ── Video-specific advanced tools (time context) ──
          // Per report §7.4: Split, Trim, Speed, Volume appear only when
          // a video clip is selected (via Edit Clip → timeline toolbar).
          // These advanced tools extend that set — they are grouped under
          // Edit in the overflow, not flat-dumped.
          mk('speed-curve', 'Speed Curve', 'analytics-outline', () => { haptic.light(); openSheet('speedCurve'); }, 'Speed curve', 'Opens the variable speed ramping editor'),
          mk('reverse', 'Reverse', 'play-skip-back-outline', () => { haptic.light(); openSheet('reverse'); }, 'Reverse', 'Reverses the video clip playback'),
          mk('freeze-frame', 'Freeze Frame', 'pause-outline', () => { haptic.light(); openSheet('freezeFrame'); }, 'Freeze frame', 'Adds a freeze frame at a specific point'),
          mk('audio-fade', 'Audio Fade', 'volume-mute-outline', () => { haptic.light(); openSheet('audioFade'); }, 'Audio fade', 'Sets audio fade in and out durations'),
        ]),
        mk('front', 'Front', 'arrow-up', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'forward'); }, 'Bring forward', 'Brings the layer forward'),
        mk('back', 'Back', 'arrow-down', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'backward'); }, 'Send backward', 'Sends the layer backward'),
        mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate', 'Duplicates the layer'),
        mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete', 'Deletes the layer'),
        ...sharedOverflow,
      ],
    };

    // ── poster-text-selected: Edit, Font, Color, Align, More ──
    // The Align tool's glyph is dynamic — it reflects the current alignment
    // state of the selected text layer. This is the Snapchat/Instagram pattern:
    // the icon shows the current state, not a generic "align" symbol.
    const currentAlignment = selectedLayer?.type === 'text'
      ? (selectedLayer.payload.alignment ?? 'center')
      : 'center';
    const alignGlyph: ToolDefinition['glyph'] =
      currentAlignment === 'left' ? 'align-left'
      : currentAlignment === 'right' ? 'align-right'
      : 'align-center';
    const textSelected: ToolGroup = {
      context: 'poster-text-selected',
      primary: [
        mk('edit', 'Edit', 'create-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Edit text', 'Opens the inline text editor'),
        mk('font', 'Font', 'text-outline', () => {
          if (!selectedLayer || selectedLayer.type !== 'text') return;
          haptic.light();
          // Cycle through font presets (matches InlineTextToolbar behavior)
          const presets = ['clean', 'headline', 'editorial', 'handwritten', 'bubble', 'deco', 'poster', 'squeeze', 'signature', 'compact'] as const;
          const currentIdx = presets.indexOf(selectedLayer.payload.textStyle ?? 'clean');
          const nextStyle = presets[(currentIdx + 1) % presets.length];
          updateLayer(selectedLayer.id, {
            type: 'text',
            payload: { ...selectedLayer.payload, textStyle: nextStyle },
          }, 'Change font style');
        }, 'Font', 'Cycles through font styles'),
        mk('color', 'Color', 'color-palette-outline', () => {
          if (!selectedLayer || selectedLayer.type !== 'text') return;
          haptic.light();
          // Cycle through curated colors (matches InlineTextToolbar behavior)
          const colors = ['#ffffff', '#000000', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA', '#34D399', '#F59E0B'];
          const currentColor = selectedLayer.payload.textColor ?? '#ffffff';
          const currentIdx = colors.indexOf(currentColor);
          const nextColor = colors[(currentIdx + 1) % colors.length];
          updateLayer(selectedLayer.id, {
            type: 'text',
            payload: { ...selectedLayer.payload, textColor: nextColor },
          }, 'Change text color');
        }, 'Color', 'Cycles through text colors'),
        mk('align', 'Align', 'text', () => {
          if (!selectedLayer || selectedLayer.type !== 'text') return;
          haptic.light();
          const current = selectedLayer.payload.alignment ?? 'center';
          const next = current === 'left' ? 'center' : current === 'center' ? 'right' : 'left';
          updateLayer(selectedLayer.id, {
            type: 'text',
            payload: { ...selectedLayer.payload, alignment: next },
          }, 'Change alignment');
        }, 'Align', 'Cycles text alignment', alignGlyph),
      ],
      overflow: [
        mk('front', 'Front', 'arrow-up', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'forward'); }, 'Bring forward', 'Brings the layer forward'),
        mk('back', 'Back', 'arrow-down', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'backward'); }, 'Send backward', 'Sends the layer backward'),
        mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate', 'Duplicates the layer'),
        mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete', 'Deletes the layer'),
        ...sharedOverflow,
      ],
    };

    // ── poster-sticker-selected: Edit, Replace, More ──
    const stickerSelected: ToolGroup = {
      context: 'poster-sticker-selected',
      primary: [
        mk('edit', 'Edit', 'create-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Edit sticker', 'Edits the selected sticker'),
        mk('replace', 'Replace', 'swap-horizontal-outline', () => { setPickerMode('stickers'); }, 'Replace sticker', 'Replaces the selected sticker'),
      ],
      overflow: [
        mk('front', 'Front', 'arrow-up', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'forward'); }, 'Bring forward', 'Brings the layer forward'),
        mk('back', 'Back', 'arrow-down', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'backward'); }, 'Send backward', 'Sends the layer backward'),
        mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate', 'Duplicates the layer'),
        mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete', 'Deletes the layer'),
        ...sharedOverflow,
      ],
    };

    // ── poster-product-selected: Item, Price, More ──
    const productSelected: ToolGroup = {
      context: 'poster-product-selected',
      primary: [
        mk('item', 'Item', 'pricetag-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Edit item', 'Edits the product item'),
        mk('price', 'Price', 'logo-usd', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Edit price', 'Edits the product price'),
      ],
      overflow: [
        mk('front', 'Front', 'arrow-up', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'forward'); }, 'Bring forward', 'Brings the layer forward'),
        mk('back', 'Back', 'arrow-down', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'backward'); }, 'Send backward', 'Sends the layer backward'),
        mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate', 'Duplicates the layer'),
        mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete', 'Deletes the layer'),
        ...sharedOverflow,
      ],
    };

    return [
      photoDefault,
      videoDefault,
      mediaSelected,
      textSelected,
      stickerSelected,
      productSelected,
    ];
  }, [
    handleAddText, handleAddStickers, handleAddProduct, handleAddEffects, handleDraw,
    handleAddFrame, handleTimelineToggle, handleEditLayer, handleReorderLayer, handleDuplicateLayer,
    handleDeleteLayer, handleCropAction, handleCutoutAction, handleAdjustAction, handleAutoAdjust,
    selectedLayer, updateLayer, haptic, show, navigation,
    pageCount, cutoutSupported, showSafeZone, bottomSurface, openSheet,
  ]);

  // ── Active context resolution ──────────────────────────────────────
  // Determine which tool context is active based on selection state and
  // whether the document contains video content.
  const activeToolContext: ToolContext = useMemo(() => {
    if (!selectedLayer) {
      return hasVideoContent ? 'poster-video-default' : 'poster-photo-default';
    }
    switch (selectedLayer.type) {
      case 'media':
        return 'poster-media-selected';
      case 'text':
        return 'poster-text-selected';
      case 'product':
        return 'poster-product-selected';
      case 'decorative':
        return 'poster-sticker-selected';
      default:
        // For other layer types (mention, look, vote, etc.), use the
        // sticker-selected context as a generic "object selected" fallback.
        return 'poster-sticker-selected';
    }
  }, [selectedLayer, hasVideoContent]);

  // ── Dynamic overflow tools for the active context ──────────────────
  // The overflow menu renders the actual overflow tools from the active
  // context's ToolGroup (not a hardcoded list). This ensures tools moved
  // to overflow (Draw, Timeline, Stickers, Effects, Cutout, Animation, etc.)
  // are actually accessible. Context-only items that aren't in the tool
  // groups (Accessibility, Help) are appended as persistent overflow items.
  const activeOverflowTools = useMemo(
    () => getOverflowTools(activeToolContext, toolGroups),
    [activeToolContext, toolGroups],
  );

  const overflowSections = useMemo(() => {
    const sectionFor = (id: string): 'Create' | 'Edit' | 'Arrange' | 'Project' => {
      if (['draw', 'stickers', 'product', 'add-frame', 'music'].includes(id)) return 'Create';
      if (['front', 'back', 'duplicate', 'delete', 'layers'].includes(id)) return 'Arrange';
      if (['preview', 'safe-zone', 'templates', 'drafts', 'settings'].includes(id)) return 'Project';
      return 'Edit';
    };
    return (['Create', 'Edit', 'Arrange', 'Project'] as const)
      .map((title) => ({
        title,
        tools: activeOverflowTools.filter((tool) => sectionFor(tool.id) === title),
      }))
      .filter((section) => section.tools.length > 0);
  }, [activeOverflowTools]);

  // ── Camera → Editor crossfade ─────────────────────────────────────
  // Per the human-flow reconstruction spec, the captured/selected media
  // should appear to stay in place while editor chrome fades in around it.
  // Both the entry (camera) and editor are mounted simultaneously during a
  // 200ms crossfade so the media reads as continuous. See
  // CreatorEntryEditorCrossfade for the transition implementation.
  const entryContent = showEntryScreen ? (
    <CreatorEntryScreen
      documentType="poster"
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
    <View style={styles.container}>
      {/* ── Crash recovery banner ────────────────────────────────────── */}
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
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
        </View>
      )}
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
                  // In-place content editing — the TextInput renders AT the
                  // layer's position on the canvas. The canvas stays visible.
                  setEditingTextLayerId(l.id);
                }
              }}
              onLayerLongPress={(layerId) => {
                selectLayer(layerId);
                openSheet('layers');
              }}
              onLayerDelete={removeLayer}
              onTrashZoneEnter={() => {
                // Medium haptic when the dragged layer enters the trash
                // zone — "you're about to delete" feedback.
                haptic.medium();
              }}
              playbackClock={playbackClock}
              currentTimeMs={playbackState.currentTimeMs}
              manipulationActiveSV={manipulationActiveSV}
              onManipulationChange={setIsManipulating}
              isInTrashZoneSV={isInTrashZoneSV}
              compareOriginal={compareOriginal}
              onCanvasLongPress={() => {
                // Only compare when a media layer with effects is selected.
                if (selectedLayer?.type === 'media' && (selectedLayer.payload.effects?.length ?? 0) > 0) {
                  setCompareOriginal(true);
                  haptic.light();
                }
              }}
              onCanvasLongPressEnd={() => setCompareOriginal(false)}
            />
            {/* Drag-to-trash overlay — fades in during layer drag, highlights
                when the dragged layer enters the bottom zone. Visual-only. */}
            <TrashZone
              manipulationActiveSV={manipulationActiveSV}
              isInTrashZoneSV={isInTrashZoneSV}
            />
          </View>

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
                    payload: { ...editingTextLayer.payload, text },
                  } as Partial<CreatorLayer>, 'Edit text content');
                }}
                onDismiss={() => setEditingTextLayerId(null)}
              />
            );
          })()}

          {/* Canvas loading overlay */}
          {isLoadingDraft && (
            <View style={styles.canvasLoadingOverlay} pointerEvents="none">
              <View style={styles.canvasLoadingPill}>
                <BlurView intensity={EditorMaterial.plate.blurIntensity} tint={EditorMaterial.plate.tint} style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.plate.overlay }]} />
                <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
                <Text style={[styles.canvasLoadingText, { color: colors.scrimTextPrimary }]}>Loading…</Text>
              </View>
            </View>
          )}

          {/* Empty frame hint */}
          {!hasContent && !isLoadingDraft && entryComplete && !selectedLayer && (
            <View style={styles.canvasEmptyHint} pointerEvents="none">
              <Text style={styles.canvasEmptyHintTitle}>Add content to start</Text>
            </View>
          )}

          {/* Safe zone overlay (advanced — behind More) */}
          {showSafeZone && (
            <View style={styles.safeZoneOverlay} pointerEvents="none">
              <View style={[styles.safeZoneTop, { top: 0, height: insets.top + 56 }]}>
                <View style={styles.safeZoneLabel}>
                  <Ionicons name="scan-outline" size={IconGrammar.badge} color={colors.antiqueGold} />
                  <Text style={[styles.safeZoneLabelText, { color: colors.antiqueGold }]}>Top chrome</Text>
                </View>
              </View>
              <View style={[styles.safeZoneBottom, { bottom: 0, height: insets.bottom + 120 }]}>
                <View style={styles.safeZoneLabel}>
                  <Ionicons name="scan-outline" size={IconGrammar.badge} color={colors.antiqueGold} />
                  <Text style={[styles.safeZoneLabelText, { color: colors.antiqueGold }]}>Tool dock</Text>
                </View>
              </View>
              <View style={[styles.safeZoneContent, { top: insets.top + 56, bottom: insets.bottom + 120 }]} />
            </View>
          )}
        </View>
      </GestureDetector>

      {/* ── Performance overlay (dev-only) ────────────────────────────── */}
      {/* Renders a semi-transparent FPS / frame-time / jank panel at the
          top-right corner. The overlay is gated on __DEV__ both here and
          inside PerformanceOverlay itself, so it never appears in
          production. pointerEvents="box-none" ensures it does not
          intercept canvas gestures except on its own toggle button. */}
      {__DEV__ && <PerformanceOverlay />}

      {/* ── Top bar — BlurView + gradient scrim (Stories pattern) ────── */}
      {/* Wrapped in Reanimated.View with chromeFadeStyle so the top bar
          recedes (fades to 0.15 opacity) during active layer manipulation,
          making the canvas feel infinite (Snapchat/Instagram pattern). */}
      <Reanimated.View style={[styles.topBarContainer, { paddingTop: insets.top }, chromeFadeStyle]} pointerEvents={isManipulating ? 'none' : 'auto'}>
        <BlurView intensity={40} tint="dark" style={styles.topBarScrim} />
        <LinearGradient
          colors={Scrim.top.colors}
          locations={Scrim.top.locations}
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
                    onPress={() => { haptic.light(); openSheet('overflow'); }}
                    style={styles.topBtn}
                    accessibilityLabel="More options"
                    accessibilityHint="Opens the overflow menu with undo, redo, preview and more"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={IconGrammar.standard} color={colors.scrimTextPrimary} />
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
                    <Ionicons name="close" size={IconGrammar.standard} color={colors.scrimTextPrimary} />
                  </PressScale>
                  {isDirty && <View style={[styles.unsavedDot, { backgroundColor: colors.antiqueGold }]} />}
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
                    <Ionicons name="arrow-undo" size={IconGrammar.standard} color={colors.scrimTextPrimary} />
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
                    <Ionicons name="arrow-redo" size={IconGrammar.standard} color={colors.scrimTextPrimary} />
                  </PressScale>
                </View>

                <View style={styles.topRightGroup}>
                  <PressScale
                    onPress={() => { haptic.medium(); openSheet('publish'); }}
                    style={[styles.publishBtn, { backgroundColor: colors.brand }]}
                    accessibilityLabel="Next"
                    accessibilityHint="Opens the publish sheet to review and publish your story"
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
                        backgroundColor: i <= activePageIndex ? colors.scrimTextPrimary : 'rgba(255,255,255,0.2)',
                      },
                    ]}
                  />
                </View>
              </Pressable>
            ))}
            {/* Frame tray toggle */}
            <PressScale
              onPress={() => { haptic.light(); setShowFrameTray((p) => !p); setVideoInfoFrameIndex(null); }}
              style={styles.pageSegmentToggle}
              accessibilityLabel="Toggle frame tray"
              accessibilityHint="Shows or hides the bottom frame thumbnail tray"
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Ionicons name="film-outline" size={IconGrammar.metadata} color={showFrameTray ? colors.scrimTextPrimary : colors.scrimTextSecondary} />
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
                <Ionicons name="add" size={IconGrammar.metadata} color={colors.scrimTextPrimary} />
              </PressScale>
            )}
          </View>
        </View>
      )}

      {/* ── Bottom gradient scrim ────────────────────────────────────── */}
      {/* Only rendered when the tool rail is the active bottom surface.
          The timeline has its own glass material; the effects sheet has
          its own backdrop. No scrim when no bottom surface is visible. */}
      {bottomSurface === 'tools' && (
        <View style={styles.bottomScrimContainer} pointerEvents="none">
          <LinearGradient
            colors={Scrim.bottom.colors}
            locations={Scrim.bottom.locations}
            style={styles.bottomScrim}
          />
        </View>
      )}

      {/* ── Poster timeline (conditional — spec: no permanent timeline for single photo) ── */}
      {/* The timeline expands for video, multiple clips, or explicit user
          request. For a single-photo poster the timeline is hidden by
          default so the canvas remains dominant. When another bottom
          surface (effects) is active, the timeline is suppressed. */}
      {shouldShowTimeline && timelineClips.length > 0 && (
        <View
          style={[
            styles.timelineContainer,
            { bottom: insets.bottom },
          ]}
        >
          {/* Glass rail material — translucent blur + overlay + hairline edge */}
          <BlurView intensity={EditorMaterial.rail.blurIntensity} tint={EditorMaterial.rail.tint} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.rail.overlay }]} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: EditorRadius.rail, borderWidth: StyleSheet.hairlineWidth, borderColor: EditorMaterial.rail.hairline }} />
          {/* ── Playback bar ── */}
          <View style={styles.timelinePlaybackBar}>
            <PressScale
              onPress={() => {
                handleTimelineOperation(
                  playbackState.isPlaying ? { type: 'pause' } : { type: 'play' },
                );
              }}
              style={styles.timelinePlayBtn}
              accessibilityLabel={playbackState.isPlaying ? 'Pause' : 'Play'}
              accessibilityHint="Plays or pauses the timeline"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={playbackState.isPlaying ? 'pause' : 'play'}
                size={IconGrammar.standard}
                color={colors.scrimTextPrimary}
              />
            </PressScale>

            <Text style={styles.timelineTimecode}>
              {formatTimecode(playbackState.currentTimeMs)} / {formatTimecode(timelineTotalDurationMs)}
            </Text>

            <View style={styles.timelinePlaybackSpacer} />

            <PressScale
              onPress={handleUndo}
              disabled={!canUndo}
              style={[styles.timelineUndoRedoBtn, { opacity: canUndo ? 1 : 0.3 }]}
              accessibilityLabel="Undo"
              accessibilityHint="Reverts the last edit"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canUndo }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Ionicons name="arrow-undo" size={IconGrammar.metadata} color={colors.scrimTextPrimary} />
            </PressScale>
            <PressScale
              onPress={handleRedo}
              disabled={!canRedo}
              style={[styles.timelineUndoRedoBtn, { opacity: canRedo ? 1 : 0.3 }]}
              accessibilityLabel="Redo"
              accessibilityHint="Reapplies the last undone edit"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canRedo }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Ionicons name="arrow-redo" size={IconGrammar.metadata} color={colors.scrimTextPrimary} />
            </PressScale>

            {/* Done — collapses the timeline, returns to canvas tools */}
            <PressScale
              onPress={handleTimelineDone}
              style={styles.timelineDoneBtn}
              accessibilityLabel="Done"
              accessibilityHint="Collapses the timeline and returns to canvas tools"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.timelineDoneText, { color: colors.antiqueGold }]}>Done</Text>
            </PressScale>
          </View>

          {/* ── Time ruler (above the clip track) ── */}
          <TimelineRuler
            totalDurationMs={timelineTotalDurationMs}
            trackWidth={screenWidth - Space.md * 2}
          />

          {/* ── Clip track ── */}
          <TimelineTrack
            clips={timelineClips}
            selectedClipId={selectedClipId}
            playheadMs={playbackState.currentTimeMs}
            totalDurationMs={timelineTotalDurationMs}
            onSelectClip={(id) => { setSelectedClipId(id); setSelectedOverlayId(null); }}
            onSeek={(ms) => handleTimelineOperation({ type: 'seek', ms })}
            onTrimClip={(clipId, edge, deltaMs) =>
              handleTimelineOperation({ type: 'trim', clipId, edge, deltaMs })
            }
            transitionIds={clipTransitionIds}
            onSelectTransition={handleTimelineTransitionTap}
          />

          {/* ── Overlay track (if overlays exist) ── */}
          {timelineOverlays.length > 0 && (
            <View style={styles.timelineOverlayWrap}>
              <OverlayTrack
                overlays={timelineOverlays}
                totalDurationMs={timelineTotalDurationMs}
                trackWidth={screenWidth - Space.md * 2}
                selectedId={selectedOverlayId}
                onSelect={(id) => { setSelectedOverlayId(id); setSelectedClipId(null); }}
                onMove={(id, timeRange) =>
                  handleTimelineOperation({ type: 'moveOverlay', overlayId: id, timeRange })
                }
              />
            </View>
          )}

          {/* ── Waveform track (audio present) ── */}
          {/* Rendered below the overlay track when audio content exists
              (music layer or video with audio). Per AGENTS.md §11 we
              never fake waveform data — the WaveformTrack shows an
              honest flat line until real samples are provided. */}
          {hasAudioContent && (
            <View style={styles.timelineWaveformWrap}>
              <WaveformTrack
                trackWidth={screenWidth - Space.md * 2}
                color={colors.antiqueGold}
              />
            </View>
          )}

          {/* ── Timeline toolbar (clip selected) ── */}
          {selectedClip && (
            <TimelineToolbar
              selectedClip={selectedClip}
              isPlaying={playbackState.isPlaying}
              currentTimeMs={playbackState.currentTimeMs}
              totalDurationMs={timelineTotalDurationMs}
              onPlayPause={() => handleTimelineOperation(playbackState.isPlaying ? { type: 'pause' } : { type: 'play' })}
              onSeek={(ms) => handleTimelineOperation({ type: 'seek', ms })}
              onSplit={() => handleTimelineOperation({ type: 'split', clipId: selectedClip.id, atMs: playbackState.currentTimeMs })}
              onDuplicate={() => handleTimelineOperation({ type: 'duplicate', clipId: selectedClip.id })}
              onDelete={() => handleTimelineOperation({ type: 'delete', clipId: selectedClip.id })}
              onReplace={() => handleTimelineOperation({ type: 'replace', clipId: selectedClip.id, newAssetId: '', newUri: '' })}
              onSpeedChange={(speed) => handleTimelineOperation({ type: 'speed', clipId: selectedClip.id, speed })}
              onVolumeChange={(volume) => handleTimelineOperation({ type: 'volume', clipId: selectedClip.id, volume })}
            />
          )}
        </View>
      )}

      {/* ── Bottom tool rail — ContextToolRail (context-sensitive) ────── */}
      {/* The ContextToolRail is the single bottom surface for both default
          and selection states. It adapts its visible tool set based on the
          active ToolContext (editor mode + selection state). Up to 6
          primary actions are always visible; additional tools (including
          Edit Clip for video, z-order, duplicate, delete, opacity) are
          revealed under the trailing "More" button. The legacy context
          toolbar was removed — it duplicated tools already in the rail
          and competed with the canvas per the surface budget constraint. */}
      {/* Replaces the static tool dock. The rail adapts its visible tool set
          based on the active ToolContext (editor mode + selection state).
          Up to 4 primary actions are always visible; additional tools are
          revealed under the trailing "More" button.
          Frame count indicator sits at the start when multiple frames. */}
      {/* ── Bottom tool rail — only when bottomSurface === 'tools' ────── */}
      {/* The tool rail is the default bottom surface. When the timeline or
          effects sheet is active, the tool rail is unmounted — one bottom
          surface at a time per the spec. The timeline has its own Done
          button to return here; the effects sheet has its own Done button. */}
      {bottomSurface === 'tools' && (
        <Reanimated.View style={[styles.bottomRailContainer, { paddingBottom: insets.bottom }, chromeFadeStyle]} pointerEvents={isManipulating ? 'none' : 'auto'}>
          <LinearGradient
            colors={Scrim.bottom.colors}
            locations={Scrim.bottom.locations}
            style={styles.bottomRailScrim}
            pointerEvents="none"
          />
          <View style={styles.bottomRailContent}>
            {/* Frame count — tappable to open frame tray */}
            {hasMultipleFrames && !selectedLayer && (
              <>
                <PressScale
                  onPress={() => { haptic.light(); setShowFrameTray((p) => !p); setVideoInfoFrameIndex(null); }}
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

            <ContextToolRail
              context={activeToolContext}
              groups={toolGroups}
              onOverflowPress={() => openSheet('overflow')}
              style={styles.contextRail}
            />
          </View>
        </Reanimated.View>
      )}

      {/* ── Frame tray (collapsible filmstrip) ───────────────────────── */}
      {/* Per doc 04: appears when frame change occurs or user adds another
          frame. Auto-collapses after 2.5s. Sits above the tool rail. */}
      {hasMultipleFrames && showFrameTray && (
        <FrameTray
          pages={document.pages}
          activePageIndex={activePageIndex}
          onSelectPage={(i) => { selectLayer(null); setActivePageIndex(i); }}
          onLongPressPage={(i) => setPageMenuIndex(i)}
          onAddPage={handleAddFrame}
          onCollapse={() => { setShowFrameTray(false); setVideoInfoFrameIndex(null); }}
          bottomOffset={insets.bottom + 120}
          onVideoBadgePress={(i) => {
            setVideoInfoFrameIndex((prev) => (prev === i ? null : i));
          }}
          videoInfoFrameIndex={videoInfoFrameIndex}
        />
      )}

      {/* ── Overflow menu (More) ─────────────────────────────────────── */}
      {/* Dynamic overflow: renders the actual overflow tools from the active
          context's ToolGroup (Draw, Timeline, Cutout, Animation, etc.) plus
          persistent items (Accessibility, Help) that aren't in the tool
          groups. This replaces the former hardcoded list that ignored the
          ContextToolRail's overflowTools array — tools moved to overflow are
          now actually accessible. */}
      {showOverflow && (
        <View style={styles.overflowContainer}>
          <Pressable
            style={styles.overflowBackdrop}
            onPress={closeSheet}
            accessibilityLabel="Close tools"
            accessibilityRole="button"
          />
          <View
            style={[
              styles.overflowMenu,
              { maxHeight: Math.min(screenHeight * 0.68, 620), paddingBottom: insets.bottom },
            ]}
            accessibilityViewIsModal
          >
            {/* Glass material — translucent blur + overlay + hairline edge */}
            <BlurView intensity={EditorMaterial.sheet.blurIntensity} tint={EditorMaterial.sheet.tint} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: EditorMaterial.sheet.hairline }} />
            <View style={styles.overflowHeader}>
              <Text style={styles.overflowTitle}>Tools</Text>
              <Pressable
                onPress={closeSheet}
                style={({ pressed }) => [styles.overflowClose, pressed && styles.overflowClosePressed]}
                accessibilityRole="button"
                accessibilityLabel="Close tools"
              >
                <Ionicons name="close" size={IconGrammar.standard} color={colors.scrimTextPrimary} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.overflowScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {overflowSections.map((section, sectionIndex) => (
                <View key={section.title}>
                  {sectionIndex > 0 && <View style={styles.overflowDivider} />}
                  <Text style={styles.overflowSectionLabel}>{section.title}</Text>
                  {section.tools.map((tool) => (
                    <OverflowItem
                      key={tool.id}
                      icon={tool.icon}
                      glyph={tool.glyph}
                      label={tool.label}
                      danger={tool.id === 'delete'}
                      selected={tool.active}
                      onPress={() => { tool.onPress(); closeSheet(); }}
                    />
                  ))}
                </View>
              ))}
              <View style={styles.overflowDivider} />
              <Text style={styles.overflowSectionLabel}>Access</Text>
              <OverflowItem
                icon="accessibility-outline"
                label="Move precisely"
                onPress={() => { openSheet('a11yMove'); closeSheet(); }}
              />
              <OverflowItem
                icon="swap-vertical-outline"
                label="Arrange precisely"
                onPress={() => { openSheet('a11yZOrder'); closeSheet(); }}
              />
              <OverflowItem
                icon="help-circle-outline"
                label="Help & shortcuts"
                onPress={() => { openSheet('help'); closeSheet(); }}
              />
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Sheets ────────────────────────────────────────────────────── */}
      <CreatorPreviewOverlay
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        onPublish={() => {
          setShowPreview(false);
          openSheet('publish');
        }}
      />
      <CreatorLayersSheet visible={showLayers} onClose={closeSheet} />
      <CreatorPublishSheet visible={showPublish} onClose={closeSheet} />
      <CreatorSettingsSheet visible={showSettings} onClose={closeSheet} />
      <HelpShortcutsSheet visible={showHelp} onClose={closeSheet} />

      {/* ── Accessibility sheets (drag alternatives) ─────────────────── */}
      {/* Per spec 09: keyboard/button-based alternatives for users who
          cannot perform drag gestures. onMove wires to updateLayer;
          onReorder wires to reorderLayer. */}
      <AccessibilityMoveSheet
        visible={showA11yMove}
        layerId={selectedLayerId}
        position={selectedLayer ? { x: selectedLayer.x, y: selectedLayer.y } : null}
        onClose={closeSheet}
        onMove={(x, y) => {
          if (selectedLayerId) updateLayer(selectedLayerId, { x, y }, 'Move layer');
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
        onClose={closeSheet}
        onReorder={(layerId, direction) => reorderLayer(layerId, direction)}
      />

      {/* ── Transitions sheet (Phase 9) ─────────────────────────────── */}
      {/* Shows the TransitionPreviewRail for the current page. Selecting
          a preset stores the transitionId on the page, which the renderer
          uses to animate the transition to the next page. */}
      {showTransitions && (
        <View style={styles.effectsSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            {/* Glass material — translucent blur + overlay + hairline edge */}
            <BlurView intensity={EditorMaterial.sheet.blurIntensity} tint={EditorMaterial.sheet.tint} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: EditorMaterial.sheet.hairline }} />
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Transitions</Text>
              <PressScale
                onPress={handleSheetDone}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                accessibilityHint="Closes the transitions panel"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.effectsSheetDoneText, { color: colors.antiqueGold }]}>Done</Text>
              </PressScale>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.effectsSheetScroll}
            >
              <Text style={styles.effectsSectionLabel}>Transition to next frame</Text>
              <TransitionPreviewRail
                presets={TRANSITION_PRESETS}
                selectedId={currentTransitionId}
                onSelect={handleTransitionSelect}
              />
              <View style={{ height: Space.md }} />
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Keyframe editor sheet (Phase 9) ─────────────────────────── */}
      {/* Shows the KeyframeEditor for the selected layer. Keyframes are
          stored on the layer's `keyframes` array and interpolated by the
          renderer over the layer's timeline. */}
      {showKeyframes && selectedLayer && (
        <View style={styles.effectsSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            {/* Glass material — translucent blur + overlay + hairline edge */}
            <BlurView intensity={EditorMaterial.sheet.blurIntensity} tint={EditorMaterial.sheet.tint} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: EditorMaterial.sheet.hairline }} />
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Animation</Text>
              <PressScale
                onPress={handleSheetDone}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                accessibilityHint="Closes the keyframe editor"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.effectsSheetDoneText, { color: colors.antiqueGold }]}>Done</Text>
              </PressScale>
            </View>
            <KeyframeEditor
              layerId={selectedLayer.id}
              totalDurationMs={page?.durationMs ?? 5000}
              keyframes={selectedLayerKeyframes}
              onAddKeyframe={handleAddKeyframe}
              onUpdateKeyframe={handleUpdateKeyframe}
              onRemoveKeyframe={handleRemoveKeyframe}
            />
          </View>
        </View>
      )}

      {/* ── Speed curve editor sheet ─────────────────────────────────── */}
      {/* Shows the SpeedCurveEditor for the selected media layer. The
          curve maps timeline position (0-1) to speed multiplier (0.25x-4x),
          enabling precise, dynamic speed ramping along a customizable curve
          (Instagram Edits parity, August 2026). */}
      {showSpeedCurve && selectedLayer && selectedLayer.type === 'media' && (
        <View style={styles.effectsSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            {/* Glass material — translucent blur + overlay + hairline edge */}
            <BlurView intensity={EditorMaterial.sheet.blurIntensity} tint={EditorMaterial.sheet.tint} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: EditorMaterial.sheet.hairline }} />
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Speed Curve</Text>
              <PressScale
                onPress={handleSheetDone}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                accessibilityHint="Closes the speed curve editor"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.effectsSheetDoneText, { color: colors.antiqueGold }]}>Done</Text>
              </PressScale>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.effectsSheetScroll}
            >
              <Text style={styles.effectsSectionLabel}>Variable speed ramping</Text>
              <SpeedCurveEditor
                curve={selectedMediaSpeedCurve ?? DEFAULT_SPEED_CURVE}
                onChange={handleSpeedCurveChange}
              />
              <View style={{ height: Space.md }} />
            </ScrollView>
          </View>
        </View>
      )}
      {/* ── Reverse toggle sheet ────────────────────────────────────── */}
      {showReverse && selectedLayer && selectedLayer.type === 'media' && (
        <View style={styles.effectsSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            {/* Glass material — translucent blur + overlay + hairline edge */}
            <BlurView intensity={EditorMaterial.sheet.blurIntensity} tint={EditorMaterial.sheet.tint} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: EditorMaterial.sheet.hairline }} />
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Reverse Clip</Text>
              <PressScale
                onPress={handleSheetDone}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.effectsSheetDoneText, { color: colors.antiqueGold }]}>Done</Text>
              </PressScale>
            </View>
            <View style={{ padding: Space.md, alignItems: 'center' }}>
              <ReverseToggle
                reversed={selectedLayer.payload.reversed ?? false}
                onToggle={(reversed) => {
                  updateLayer(selectedLayer.id, {
                    type: 'media',
                    payload: { ...selectedLayer.payload, reversed },
                  }, reversed ? 'Reverse clip' : 'Unreverse clip');
                  haptic.medium();
                }}
              />
            </View>
          </View>
        </View>
      )}
      {/* ── Freeze frame picker sheet ───────────────────────────────── */}
      {showFreezeFrame && selectedLayer && selectedLayer.type === 'media' && (
        <View style={styles.effectsSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            {/* Glass material — translucent blur + overlay + hairline edge */}
            <BlurView intensity={EditorMaterial.sheet.blurIntensity} tint={EditorMaterial.sheet.tint} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: EditorMaterial.sheet.hairline }} />
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Freeze Frame</Text>
              <PressScale
                onPress={handleSheetDone}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.effectsSheetDoneText, { color: colors.antiqueGold }]}>Done</Text>
              </PressScale>
            </View>
            <FreezeFramePicker
              clipDurationMs={selectedLayer.payload.videoDurationMs ?? 5000}
              freezeFrameMs={selectedLayer.payload.freezeFrameMs}
              freezeDurationMs={selectedLayer.payload.freezeDurationMs}
              onSetFreezeFrame={(freezeMs, freezeDurMs) => {
                updateLayer(selectedLayer.id, {
                  type: 'media',
                  payload: {
                    ...selectedLayer.payload,
                    freezeFrameMs: freezeMs,
                    freezeDurationMs: freezeDurMs,
                  },
                }, freezeMs ? 'Set freeze frame' : 'Clear freeze frame');
                haptic.medium();
              }}
            />
          </View>
        </View>
      )}
      {/* ── Audio fade controls sheet ───────────────────────────────── */}
      {showAudioFade && selectedLayer && selectedLayer.type === 'media' && (
        <View style={styles.effectsSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            {/* Glass material — translucent blur + overlay + hairline edge */}
            <BlurView intensity={EditorMaterial.sheet.blurIntensity} tint={EditorMaterial.sheet.tint} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: EditorMaterial.sheet.hairline }} />
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Audio Fade</Text>
              <PressScale
                onPress={handleSheetDone}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.effectsSheetDoneText, { color: colors.antiqueGold }]}>Done</Text>
              </PressScale>
            </View>
            <AudioFadeControls
              fadeInMs={selectedLayer.payload.fadeInMs ?? 0}
              fadeOutMs={selectedLayer.payload.fadeOutMs ?? 0}
              onChange={(fadeInMs, fadeOutMs) => {
                updateLayer(selectedLayer.id, {
                  type: 'media',
                  payload: {
                    ...selectedLayer.payload,
                    volume: selectedLayer.payload.volume ?? 1,
                    fadeInMs,
                    fadeOutMs,
                  },
                }, 'Set audio fade');
                haptic.medium();
              }}
            />
          </View>
        </View>
      )}
      {/* Pixel crop. The resulting local asset deliberately clears prior
          upload evidence so publish must upload/finalize the edited bytes. */}
      {cropMode && selectedLayer && selectedLayer.type === 'media' && (
        <CreatorCropSheet
          visible={cropMode}
          imageUri={selectedLayer.payload.mediaUri}
          onClose={() => setCropMode(false)}
          onCropComplete={(newUri) => {
            if (selectedLayer && selectedLayer.type === 'media') {
              updateLayer(selectedLayer.id, {
                type: 'media',
                payload: {
                  ...selectedLayer.payload,
                  mediaUri: newUri,
                  mediaFinalizationId: undefined,
                  mediaAssetId: undefined,
                },
              }, 'Crop media');
            }
            setCropMode(false);
          }}
        />
      )}
      {/* True cutout preview sheet — native subject segmentation.
          Opens when the user taps "Cutout" in the media-selected
          overflow and the native backend is available. Shows a
          before/after preview over a checkerboard. On confirm,
          replaces the media URI with the transparent PNG and stores
          the alpha mask reference on the layer (spec 07 §7). */}
      {cutoutPreviewTarget && cutoutPreviewTarget.type === 'media' && (
        <CutoutPreviewSheet
          visible={!!cutoutPreviewTarget}
          imageUri={cutoutPreviewTarget.payload.mediaUri}
          onClose={() => setCutoutPreviewTarget(null)}
          onConfirm={(result: CutoutResult) => {
            if (cutoutPreviewTarget && cutoutPreviewTarget.type === 'media') {
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
        backgroundUri={backgroundMediaUri}
        onClose={handlePickerClose}
        onAddLayer={handlePickerAddLayer}
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
      {/* ── Effects sheet ─────────────────────────────────────────────── */}
      {/* Bottom sheet showing the EffectPreviewRail (filter thumbnails
          rendered from the selected media layer's own source URI) and
          the AdjustPanel (fine-tuning sliders). Filter selection and
          adjustment changes commit to the layer's non-destructive
          `effects` array (EffectNode[]) via updateLayer. */}
      {bottomSurface === 'effects' && selectedMediaLayer && (
        <View style={styles.effectsSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setBottomSurface('tools')} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            {/* Glass material — translucent blur + overlay + hairline edge */}
            <BlurView intensity={EditorMaterial.sheet.blurIntensity} tint={EditorMaterial.sheet.tint} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: EditorMaterial.sheet.overlay, borderTopLeftRadius: EditorRadius.sheet, borderTopRightRadius: EditorRadius.sheet }]} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: EditorMaterial.sheet.hairline }} />
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Effects</Text>
              <PressScale
                onPress={() => { haptic.light(); setBottomSurface('tools'); }}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                accessibilityHint="Closes the effects panel"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.effectsSheetDoneText, { color: colors.antiqueGold }]}>Done</Text>
              </PressScale>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.effectsSheetScroll}
            >
              <Text style={styles.effectsSectionLabel}>Filters</Text>
              <EffectPreviewRail
                sourceUri={effectsSourceUri}
                presets={FILTER_PRESETS}
                selectedId={previewFilterId ?? selectedFilterId}
                onSelect={handleEffectFilterSelect}
                onPreview={handleEffectPreview}
              />
              <View style={styles.effectsAdjustWrap}>
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
                  onDragStateChange={(dragging) => {
                    // Lightroom flagship pattern: fade top-bar chrome while
                    // dragging an adjust slider so the user focuses on the
                    // image, not the controls. The effects sheet itself
                    // stays visible — only the top bar recedes.
                    manipulationActiveSV.value = dragging ? 1 : 0;
                  }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      )}
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
      pinnedMediaDestination={{
        left: 0,
        top: canvasVerticalOffset,
        width: canvasWidth,
        height: canvasHeight,
      }}
      sourceContentTransform={entrySourceTransform}
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

// ── Screen wrapper — wraps in CreatorProvider (shared state) ─────────
export function PosterComposerScreen(props: {
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
  onEntryTypeChange: (type: 'look' | 'poster') => void;
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
      <PosterComposerInner onEntryTypeChange={props.onEntryTypeChange} />
    </CreatorProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // ── Crash recovery banner (inline notification, not a card) ──
  // Calm but noticeable: soft tinted background + left accent bar gives the
  // banner proper visual hierarchy (accent → text → action) without heavy chrome.
  recoveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    paddingTop: 50,
    zIndex: 100,
    backgroundColor: 'rgba(201, 164, 106, 0.08)',
    borderLeftWidth: 3,
  },
  recoveryText: {
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
  },
  recoveryBtn: {
    backgroundColor: 'rgba(201, 164, 106, 0.15)',
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  recoveryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  recoveryDismiss: {
    padding: 8,
    marginLeft: 4,
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
    ...GlyphShadow.title,
  },
  doneText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    color: '#fff',
    ...GlyphShadow.glyph,
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
  },
  unsavedDot: {
    width: 7,
    height: 7,
    borderRadius: RadiusRoleValue.pillAvatar,
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
    borderRadius: EditorRadius.plate,
    overflow: 'hidden',
  },
  canvasLoadingText: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
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
    borderWidth: Stroke.standard,
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
    fontSize: Type.meta.size,
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
  // ── Bottom tool rail (default mode) ──
  bottomRailContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  bottomRailScrim: {
    position: 'absolute',
    top: -80,
    left: 0,
    right: 0,
    height: 80,
    zIndex: -1,
  },
  bottomRailContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    gap: Space.md,
    paddingVertical: Space.xs,
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
    ...GlyphShadow.glyph,
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
    ...StyleSheet.absoluteFill,
    zIndex: 220,
    justifyContent: 'flex-end',
  },
  overflowMenu: {
    borderTopLeftRadius: EditorRadius.sheet,
    borderTopRightRadius: EditorRadius.sheet,
    overflow: 'hidden',
  },
  overflowHeader: {
    minHeight: 56,
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  overflowTitle: {
    flex: 1,
    color: '#fff',
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
  },
  overflowClose: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowClosePressed: {
    opacity: 0.56,
  },
  overflowScrollContent: {
    paddingTop: Space.xs,
    paddingBottom: Space.sm,
  },
  overflowSectionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  overflowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: Space.xs,
  },
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  // ── ContextToolRail inline ──
  contextRail: {
    flex: 1,
  },
  // ── Timeline ──
  timelineContainer: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    zIndex: 96,
    borderRadius: EditorRadius.rail,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    gap: Space.xs,
    overflow: 'hidden',
  },
  timelinePlaybackBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xxs,
  },
  timelinePlayBtn: {
    width: 36,
    height: 36,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineTimecode: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    color: 'rgba(255,255,255,0.85)',
    fontVariant: ['tabular-nums'],
  },
  timelinePlaybackSpacer: {
    flex: 1,
  },
  timelineUndoRedoBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDoneBtn: {
    minWidth: 44,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    marginLeft: Space.xs,
  },
  timelineDoneText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
  },
  timelineOverlayWrap: {
    marginTop: Space.xxs,
  },
  timelineWaveformWrap: {
    marginTop: Space.xxs,
  },
  // ── Effects sheet ──
  effectsSheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    zIndex: 200,
    justifyContent: 'flex-end',
  },
  effectsSheet: {
    borderTopLeftRadius: EditorRadius.sheet,
    borderTopRightRadius: EditorRadius.sheet,
    maxHeight: '50%',
    overflow: 'hidden',
  },
  effectsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  effectsSheetTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    color: '#fff',
  },
  effectsSheetDone: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  effectsSheetDoneText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
  },
  effectsSheetScroll: {
    paddingVertical: Space.sm,
  },
  effectsSectionLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    color: 'rgba(255,255,255,0.5)',
    paddingHorizontal: Space.md,
    marginBottom: Space.xs,
    marginTop: Space.xs,
  },
  effectsAdjustWrap: {
    marginTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: Space.xs,
  },
  effectsAutoRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
});
