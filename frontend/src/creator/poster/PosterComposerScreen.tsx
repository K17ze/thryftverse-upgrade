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
import { Space, FontFamily, Radius, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useCreator } from '../CreatorContext';
import type { CreatorInitialMedia } from '../../navigation/types';
import type { CreatorLayer, EffectNode } from '../composition';
import { makeStableId } from '../../utils/createStableId';
import { CreatorCanvas } from '../CreatorCanvas';
import { CreatorLayersSheet } from '../CreatorLayersSheet';
import { CreatorPublishSheet } from '../CreatorPublishSheet';
import { CreatorSettingsSheet } from '../CreatorSettingsSheet';
import { CreatorAssetPicker, type AssetPickerMode } from '../CreatorAssetPicker';
import { InCanvasCropOverlay } from '../surfaces/InCanvasCropOverlay';
import { CutoutPreviewSheet } from '../surfaces/CutoutPreviewSheet';
import { AccessibilityMoveSheet } from '../surfaces/AccessibilityMoveSheet';
import { AccessibilityZOrderSheet, type ZOrderLayer } from '../surfaces/AccessibilityZOrderSheet';
import { isCutoutSupportedAsync, type CutoutResult } from '../core/cutout/CutoutService';
import { CreatorTemplateBrowser } from '../CreatorTemplateBrowser';
import { CreatorPreviewOverlay } from '../CreatorPreviewOverlay';
import { CreatorEntryScreen } from '../CreatorEntryScreen';
import { CreatorEntryEditorCrossfade } from '../CreatorEntryEditorCrossfade';
import { PressScale } from '../CreatorAnimations';
import { LiquidGlassBackdrop } from '../../components/LiquidGlassBackdrop';
import { useHaptic } from '../../hooks/useHaptic';
import type { CreatorTemplate } from '../templates';
import { FrameTray } from '../studio/FrameTray';
import { PageMenu } from '../studio/PageMenu';
import { OverflowItem } from './PosterComposerParts';
import { ContextToolRail } from '../surfaces/ContextToolRail';
import { HelpShortcutsSheet } from '../surfaces/HelpShortcutsSheet';
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
  const [showLayers, setShowLayers] = useState(false);  const [showPublish, setShowPublish] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);
  const [showTemplates, setShowTemplates] = useState(Boolean(route.params?.openTemplates));
  const [showOverflow, setShowOverflow] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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
  const [showA11yMove, setShowA11yMove] = useState(false);
  const [showA11yZOrder, setShowA11yZOrder] = useState(false);
  const [showTransitions, setShowTransitions] = useState(false);
  const [showKeyframes, setShowKeyframes] = useState(false);
  const [showSpeedCurve, setShowSpeedCurve] = useState(false);
  const [showReverse, setShowReverse] = useState(false);
  const [showFreezeFrame, setShowFreezeFrame] = useState(false);
  const [showAudioFade, setShowAudioFade] = useState(false);
  // ── True cutout (segmentation) state ───────────────────────────────
  // `cutoutPreviewTarget` holds the media layer being previewed in the
  // CutoutPreviewSheet (true segmentation). `cutoutSupported` is probed
  // once on mount so the overflow tool can honestly show "Cutout" when
  // the native backend is available.
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
  const [cropMode, setCropMode] = useState(false);

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
        if (showHelp) setShowHelp(false);
        else if (showA11yMove) setShowA11yMove(false);
        else if (showA11yZOrder) setShowA11yZOrder(false);
        else if (bottomSurface === 'effects') setBottomSurface('tools');
        else if (userRequestedTimeline) { setUserRequestedTimeline(false); setBottomSurface('tools'); }
        else if (showTransitions) setShowTransitions(false);
        else if (showKeyframes) setShowKeyframes(false);
        else if (showSpeedCurve) setShowSpeedCurve(false);
        else if (showReverse) setShowReverse(false);
        else if (showFreezeFrame) setShowFreezeFrame(false);
        else if (showAudioFade) setShowAudioFade(false);
        else if (cropMode) setCropMode(false);
        else if (cutoutPreviewTarget) setCutoutPreviewTarget(null);
        else if (pageMenuIndex !== null) setPageMenuIndex(null);
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
  }, [canUndo, canRedo, undo, redo, showHelp, showA11yMove, showA11yZOrder, bottomSurface, userRequestedTimeline, showTransitions, showKeyframes, showSpeedCurve, showReverse, showFreezeFrame, showAudioFade, cropMode, cutoutPreviewTarget, pageMenuIndex, showPreview, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, selectedLayerId, selectLayer, removeLayer, handleBack]);

  // ── Hardware back button — intercept to close sheets first ─────────
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showHelp) { setShowHelp(false); return true; }
        if (showA11yMove) { setShowA11yMove(false); return true; }
        if (showA11yZOrder) { setShowA11yZOrder(false); return true; }
        if (bottomSurface === 'effects') { setBottomSurface('tools'); return true; }
        if (userRequestedTimeline) { setUserRequestedTimeline(false); setBottomSurface('tools'); return true; }
        if (showTransitions) { setShowTransitions(false); return true; }
        if (showKeyframes) { setShowKeyframes(false); return true; }
        if (showSpeedCurve) { setShowSpeedCurve(false); return true; }
        if (showReverse) { setShowReverse(false); return true; }
        if (showFreezeFrame) { setShowFreezeFrame(false); return true; }
        if (showAudioFade) { setShowAudioFade(false); return true; }
        if (cropMode) { setCropMode(false); return true; }
        if (cutoutPreviewTarget) { setCutoutPreviewTarget(null); return true; }
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
    }, [showHelp, showA11yMove, showA11yZOrder, bottomSurface, userRequestedTimeline, showTransitions, showKeyframes, showSpeedCurve, showReverse, showFreezeFrame, showAudioFade, cropMode, cutoutPreviewTarget, pageMenuIndex, showPreview, showOverflow, showPublish, showTemplates, showLayers, showSettings, pickerMode, selectedLayerId, selectLayer])
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

  const timelineClips = useMemo<PosterClip[]>(() => {
    const clips: PosterClip[] = [];
    for (const p of document.pages) {
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
      }
    }
    return clips;
  }, [document.pages]);

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

  // ── Timeline visibility (spec: no permanent timeline for single photo) ──
  // The timeline expands only when:
  //   a) There's a video clip (hasVideoContent)
  //   b) There are multiple clips (timelineClips.length > 1)
  //   c) The user explicitly tapped "Timeline" / "Edit Clip"
  // It is suppressed when another bottom surface (effects) is active so
  // only one bottom surface occupies the canvas edge at a time.
  const shouldShowTimeline =
    (hasVideoContent || timelineClips.length > 1 || userRequestedTimeline) &&
    bottomSurface !== 'effects' &&
    bottomSurface !== null;

  // ── Auto-expand timeline when video or second clip is added ──────
  // When the composition transitions from single-photo to video or
  // multi-clip, the timeline auto-expands without requiring a user tap.
  useEffect(() => {
    if (hasVideoContent || timelineClips.length > 1) {
      setUserRequestedTimeline(true);
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
    let startY = 0;
    let lockedDirection: 'horizontal' | 'vertical' | null = null;
    const DIRECTION_LOCK_THRESHOLD = 10;
    return Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        startX = e.x;
        startY = e.y;
        lockedDirection = null;
      })
      .onUpdate((e) => {
        'worklet';
        // Directional lock: once the gesture commits to horizontal or
        // vertical, stay locked. This prevents diagonal jitter from
        // triggering frame swipe when the user is trying to interact
        // with a layer (which starts inside the selected object's bounds
        // and is handled by the canvas gesture, not this one).
        if (lockedDirection === null) {
          const dx = Math.abs(e.absoluteX - startX);
          const dy = Math.abs(e.absoluteY - startY);
          if (dx > DIRECTION_LOCK_THRESHOLD || dy > DIRECTION_LOCK_THRESHOLD) {
            lockedDirection = dx > dy ? 'horizontal' : 'vertical';
          }
        }
      })
      .onEnd((e) => {
        'worklet';
        // Only trigger frame swipe for horizontal-dominant gestures.
        // Vertical gestures (scroll, layer drag) are ignored.
        if (lockedDirection !== 'horizontal') return;
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

  // ── Music handler (video mode) ─────────────────────────────────────
  const handleAddMusic = useCallback(() => {
    haptic.light();
    setPickerMode('stickers');
  }, [haptic]);

  // ── Effects handler ────────────────────────────────────────────────
  // Opens the effects bottom sheet for the selected media layer. The
  // sheet shows the EffectPreviewRail (filter thumbnails using the
  // layer's own media as the preview source) and the AdjustPanel
  // (fine-tuning sliders). Effect changes commit to the layer's
  // non-destructive `effects` array (EffectNode[]) via updateLayer.
  const handleAddEffects = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      show('Select a photo or video to apply effects', 'info');
      return;
    }
    haptic.medium();
    setBottomSurface('effects');
  }, [selectedLayer, haptic, show]);

  // ── Effects sheet — derived state & handlers ───────────────────────
  const selectedMediaLayer = selectedLayer?.type === 'media' ? selectedLayer : null;
  const effectsSourceUri = selectedMediaLayer?.payload.mediaUri ?? '';
  const currentEffects: EffectNode[] = selectedMediaLayer?.payload.effects ?? [];

  const selectedFilterId = useMemo(() => {
    const filterNode = currentEffects.find((n) => n.type === 'filter');
    return filterNode?.type === 'filter' ? filterNode.id : null;
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

  // ── Crop action for selected media ─────────────────────────────────
  // Enters in-canvas crop mode — the composition stays visible while
  // crop handles render directly over the selected layer (spec 04 §1).
  // The old CreatorCropSheet remains as a fallback path.
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
    ): ToolDefinition => ({
      id,
      label,
      icon,
      onPress,
      accessibilityLabel,
      accessibilityHint,
    });

    // Overflow tools shared across contexts (Layers, Preview, Safe Zone,
    // Templates, Drafts, Settings, Add Frame)
    const sharedOverflow: ToolDefinition[] = [
      mk('transitions', 'Transitions', 'swap-horizontal-outline', () => { haptic.light(); setShowTransitions(true); }, 'Transitions', 'Opens the transition picker for the current frame'),
      mk('layers', 'Layers', 'layers-outline', () => { setShowLayers(true); }, 'Layers', 'Opens the layers panel'),
      mk('preview', 'Preview', 'eye-outline', () => { setShowPreview(true); }, 'Preview', 'Previews the story'),
      mk('safe-zone', 'Safe Zone', 'shield-outline', () => { setShowSafeZone((p) => !p); }, 'Safe Zone', 'Toggles the safe zone overlay'),
      mk('templates', 'Templates', 'grid-outline', () => { setShowTemplates(true); }, 'Templates', 'Opens the template browser'),
      mk('drafts', 'Drafts', 'document-text-outline', () => { navigation.navigate('CreatorDraftList'); }, 'Drafts', 'Opens saved drafts'),
      mk('settings', 'Settings', 'settings-outline', () => { setShowSettings(true); }, 'Settings', 'Opens composer settings'),
    ];

    const addFrameOverflow: ToolDefinition[] = pageCount < 10
      ? [mk('add-frame', 'Add Frame', 'add-circle-outline', handleAddFrame, 'Add frame', 'Adds a new frame')]
      : [];

    const productOverflow: ToolDefinition[] = [
      mk('product', 'Product', 'pricetag-outline', handleAddProduct, 'Add product', 'Opens the product picker'),
    ];

    // ── poster-photo-default: Text, Stickers, Music, Effects ──
    // 2026 flagship creator UX: ≤4 primary actions (Meta Edits / Instagram /
    // CapCut pattern). Draw and Timeline move to overflow — Draw is a
    // secondary creative tool, and Timeline is canvas-dominant for a single
    // photo (auto-hidden). The primary layer is ruthlessly guarded against
    // feature creep; the 4 most common creative actions are immediately
    // visible, everything else is one tap away under "More".
    const photoDefault: ToolGroup = {
      context: 'poster-photo-default',
      primary: [
        mk('text', 'Text', 'text', handleAddText, 'Add text', 'Opens the text picker'),
        mk('stickers', 'Stickers', 'happy-outline', handleAddStickers, 'Add stickers', 'Opens the sticker picker'),
        mk('music', 'Music', 'musical-notes-outline', handleAddMusic, 'Add music', 'Opens the music picker'),
        mk('effects', 'Effects', 'sparkles-outline', handleAddEffects, 'Effects', 'Opens the effects panel for the selected media'),
      ],
      overflow: [
        mk('draw', 'Draw', 'brush-outline', handleDraw, 'Draw', 'Opens the drawing tool'),
        mk('timeline', 'Timeline', 'film-outline', handleTimelineToggle, 'Timeline', 'Expands the timeline for editing clip timing and overlays'),
        ...productOverflow,
        ...addFrameOverflow,
        ...sharedOverflow,
      ],
    };

    // ── poster-video-default: Timeline, Text, Music, Effects ──
    // Timeline stays primary for video (it is the job-to-be-done for video
    // editing). Stickers move to overflow — less frequently needed for video
    // than the core 4 of timeline + text + music + effects.
    const videoDefault: ToolGroup = {
      context: 'poster-video-default',
      primary: [
        mk('timeline', 'Timeline', 'film-outline', handleTimelineToggle, 'Timeline', 'Toggles the video timeline'),
        mk('text', 'Text', 'text', handleAddText, 'Add text', 'Opens the text picker'),
        mk('music', 'Music', 'musical-notes-outline', handleAddMusic, 'Add music', 'Opens the music picker'),
        mk('effects', 'Effects', 'sparkles-outline', handleAddEffects, 'Effects', 'Opens the effects panel for the selected media'),
      ],
      overflow: [
        mk('stickers', 'Stickers', 'happy-outline', handleAddStickers, 'Add stickers', 'Opens the sticker picker'),
        ...productOverflow,
        ...addFrameOverflow,
        ...sharedOverflow,
      ],
    };

    // ── poster-media-selected: Replace, Crop, Auto, Adjust ──
    // Effects moves to overflow — it's already accessible from the default
    // rail, and the 4 most relevant media-editing actions (replace, crop,
    // auto-enhance, adjust) are the job-to-be-done when a media layer is
    // selected. Advanced tools (cutout, animation, speed curve, etc.) remain
    // in overflow.
    const isVideoMedia = selectedLayer?.type === 'media' && selectedLayer.payload.mediaType === 'video';
    const editClipOverflow: ToolDefinition[] = isVideoMedia
      ? [mk('edit-clip', 'Edit Clip', 'film-outline', () => {
          if (!selectedLayer) return;
          haptic.light();
          setSelectedClipId(selectedLayer.id);
          setUserRequestedTimeline(true);
          setBottomSurface('timeline');
        }, 'Edit clip', 'Expands the timeline to trim and adjust the video clip')]
      : [];
    const mediaSelected: ToolGroup = {
      context: 'poster-media-selected',
      primary: [
        mk('replace', 'Replace', 'swap-horizontal-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Replace media', 'Replaces the selected media'),
        mk('crop', 'Crop', 'crop-outline', handleCropAction, 'Crop', 'Opens in-canvas crop with direct pan, zoom, and precise handles'),
        mk('auto', 'Auto', 'bulb-outline', handleAutoAdjust, 'Auto', 'Applies one-tap intelligent color correction'),
        mk('adjust', 'Adjust', 'color-wand-outline', handleAdjustAction, 'Adjust', 'Opens the adjust panel for exposure and color'),
      ],
      overflow: [
        mk('effects', 'Effects', 'sparkles-outline', handleAddEffects, 'Effects', 'Opens the effects panel for the selected media'),
        ...editClipOverflow,
        mk('cutout', cutoutSupported ? 'Cutout' : 'Crop', cutoutSupported ? 'sparkles-outline' : 'crop-outline', handleCutoutAction, cutoutSupported ? 'Cutout' : 'Crop', cutoutSupported ? 'Removes the background using on-device subject segmentation' : 'Crops the selected media to a rectangle'),
        mk('animation', 'Animation', 'analytics-outline', () => { haptic.light(); setShowKeyframes(true); }, 'Animation', 'Opens the keyframe editor for the selected layer'),
        mk('speed-curve', 'Speed Curve', 'speedometer-outline', () => { haptic.light(); setShowSpeedCurve(true); }, 'Speed Curve', 'Opens the speed curve editor for variable speed ramping'),
        mk('reverse', 'Reverse', 'swap-horizontal-outline', () => { haptic.light(); setShowReverse(true); }, 'Reverse', 'Reverses the clip so it plays from end to start'),
        mk('freeze-frame', 'Freeze Frame', 'pause-outline', () => { haptic.light(); setShowFreezeFrame(true); }, 'Freeze Frame', 'Holds a frame for dramatic emphasis'),
        mk('audio-fade', 'Audio Fade', 'volume-low-outline', () => { haptic.light(); setShowAudioFade(true); }, 'Audio Fade', 'Sets fade in/out for audio'),
        mk('front', 'Front', 'arrow-up', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'forward'); }, 'Bring forward', 'Brings the layer forward'),
        mk('back', 'Back', 'arrow-down', () => { if (selectedLayer) handleReorderLayer(selectedLayer.id, 'backward'); }, 'Send backward', 'Sends the layer backward'),
        mk('duplicate', 'Duplicate', 'copy-outline', () => { if (selectedLayer) handleDuplicateLayer(selectedLayer.id); }, 'Duplicate', 'Duplicates the layer'),
        mk('delete', 'Delete', 'trash-outline', () => { if (selectedLayer) handleDeleteLayer(selectedLayer.id); }, 'Delete', 'Deletes the layer'),
        ...sharedOverflow,
      ],
    };

    // ── poster-text-selected: Edit, Font, Color, Align, More ──
    const textSelected: ToolGroup = {
      context: 'poster-text-selected',
      primary: [
        mk('edit', 'Edit', 'create-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Edit text', 'Opens the text editor'),
        mk('font', 'Font', 'text-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Font', 'Changes the font style'),
        mk('color', 'Color', 'color-palette-outline', () => { if (selectedLayer) handleEditLayer(selectedLayer); }, 'Color', 'Changes the text color'),
        mk('align', 'Align', 'remove', () => {
          if (!selectedLayer || selectedLayer.type !== 'text') return;
          haptic.light();
          const current = selectedLayer.payload.alignment ?? 'center';
          const next = current === 'left' ? 'center' : current === 'center' ? 'right' : 'left';
          updateLayer(selectedLayer.id, {
            type: 'text',
            payload: { ...selectedLayer.payload, alignment: next },
          }, 'Change alignment');
        }, 'Align', 'Cycles text alignment'),
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
    handleAddText, handleAddStickers, handleAddProduct, handleAddMusic, handleAddEffects, handleDraw,
    handleAddFrame, handleTimelineToggle, handleEditLayer, handleReorderLayer, handleDuplicateLayer,
    handleDeleteLayer, handleCropAction, handleCutoutAction, handleAdjustAction, handleAutoAdjust,
    selectedLayer, updateLayer, haptic, show, navigation,
    pageCount, cutoutSupported,
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

  // ── Camera → Editor crossfade ─────────────────────────────────────
  // Per the human-flow reconstruction spec, the captured/selected media
  // should appear to stay in place while editor chrome fades in around it.
  // Both the entry (camera) and editor are mounted simultaneously during a
  // 200ms crossfade so the media reads as continuous. See
  // CreatorEntryEditorCrossfade for the transition implementation.
  const entryContent = showEntryScreen ? (
    <CreatorEntryScreen
      documentType="poster"
      onClose={handleEntryClose}
      onMediaSelected={handleEntryMediaSelected}
      onBlankStart={handleEntryBlankStart}
    />
  ) : null;

  const editorContent = (
    <View style={styles.container}>
      {/* ── Crash recovery banner ────────────────────────────────────── */}
      {hasPendingRecovery && (
        <View style={styles.recoveryBanner}>
          <Ionicons name="alert-circle-outline" size={IconGrammar.standard} color={colors.textPrimary} />
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
                  setEditingLayer(l);
                  setPickerMode('text');
                }
              }}
              onLayerLongPress={(layerId) => {
                selectLayer(layerId);
                setShowLayers(true);
              }}
              playbackClock={playbackClock}
              currentTimeMs={playbackState.currentTimeMs}
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
              <Text style={styles.canvasEmptyHintTitle}>Add content to start</Text>
            </View>
          )}

          {/* Safe zone overlay (advanced — behind More) */}
          {showSafeZone && (
            <View style={styles.safeZoneOverlay} pointerEvents="none">
              <View style={[styles.safeZoneTop, { top: 0, height: insets.top + 56 }]}>
                <View style={styles.safeZoneLabel}>
                  <Ionicons name="shield-outline" size={IconGrammar.badge} color="#C9A46A" />
                  <Text style={styles.safeZoneLabelText}>Top chrome</Text>
                </View>
              </View>
              <View style={[styles.safeZoneBottom, { bottom: 0, height: insets.bottom + 120 }]}>
                <View style={styles.safeZoneLabel}>
                  <Ionicons name="shield-outline" size={IconGrammar.badge} color="#C9A46A" />
                  <Text style={styles.safeZoneLabelText}>Tool dock</Text>
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
                    <Ionicons name="ellipsis-horizontal" size={IconGrammar.standard} color="#fff" />
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
                    <Ionicons name="close" size={IconGrammar.standard} color="#fff" />
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
                    <Ionicons name="arrow-undo" size={IconGrammar.standard} color="#fff" />
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
                    <Ionicons name="arrow-redo" size={IconGrammar.standard} color="#fff" />
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
              onPress={() => { haptic.light(); setShowFrameTray((p) => !p); setVideoInfoFrameIndex(null); }}
              style={styles.pageSegmentToggle}
              accessibilityLabel="Toggle frame tray"
              accessibilityHint="Shows or hides the bottom frame thumbnail tray"
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Ionicons name="film-outline" size={IconGrammar.metadata} color={showFrameTray ? '#fff' : 'rgba(255,255,255,0.5)'} />
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
                <Ionicons name="add" size={IconGrammar.metadata} color="rgba(255,255,255,0.8)" />
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

      {/* ── Poster timeline (conditional — spec: no permanent timeline for single photo) ── */}
      {/* The timeline expands for video, multiple clips, or explicit user
          request. For a single-photo poster the timeline is hidden by
          default so the canvas remains dominant. When another bottom
          surface (effects) is active, the timeline is suppressed. */}
      {shouldShowTimeline && timelineClips.length > 0 && (
        <View
          style={[
            styles.timelineContainer,
            { bottom: insets.bottom + 76 },
          ]}
        >
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
                color="#fff"
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
              <Ionicons name="arrow-undo" size={18} color="#fff" />
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
              <Ionicons name="arrow-redo" size={18} color="#fff" />
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
          Up to 6 primary actions are always visible; additional tools are
          revealed under the trailing "More" button.
          Frame count indicator sits at the start when multiple frames. */}
      <View style={[styles.bottomRailContainer, { paddingBottom: insets.bottom }]}>
        <View style={styles.bottomRailHairline} />
        <LiquidGlassBackdrop intensity={50} tint="dark" absoluteFill={false} style={styles.bottomRailGlass}>
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
              onOverflowPress={() => { haptic.selection(); setShowOverflow(true); }}
              style={styles.contextRail}
            />
          </View>
        </LiquidGlassBackdrop>
      </View>

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
        <View style={[styles.overflowContainer, { top: insets.top + 52 }]}>
          <View style={styles.overflowMenu}>
            {/* Dynamic context overflow tools */}
            {activeOverflowTools.map((tool) => (
              <OverflowItem
                key={tool.id}
                icon={tool.icon}
                label={tool.label}
                onPress={() => { tool.onPress(); setShowOverflow(false); }}
              />
            ))}
            {/* Persistent items not in the tool groups */}
            <View style={styles.overflowDivider} />
            <OverflowItem
              icon="accessibility-outline"
              label="Accessibility Move"
              onPress={() => { setShowA11yMove(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="accessibility-outline"
              label="Accessibility Arrange"
              onPress={() => { setShowA11yZOrder(true); setShowOverflow(false); }}
            />
            <OverflowItem
              icon="help-circle-outline"
              label="Help & Shortcuts"
              onPress={() => { setShowHelp(true); setShowOverflow(false); }}
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
      <HelpShortcutsSheet visible={showHelp} onClose={() => setShowHelp(false)} />

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
        onClose={() => setShowA11yZOrder(false)}
        onReorder={(layerId, direction) => reorderLayer(layerId, direction)}
      />

      {/* ── Transitions sheet (Phase 9) ─────────────────────────────── */}
      {/* Shows the TransitionPreviewRail for the current page. Selecting
          a preset stores the transitionId on the page, which the renderer
          uses to animate the transition to the next page. */}
      {showTransitions && (
        <View style={styles.effectsSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTransitions(false)} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Transitions</Text>
              <PressScale
                onPress={() => { haptic.light(); setShowTransitions(false); }}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                accessibilityHint="Closes the transitions panel"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.effectsSheetDoneText}>Done</Text>
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
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowKeyframes(false)} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Animation</Text>
              <PressScale
                onPress={() => { haptic.light(); setShowKeyframes(false); }}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                accessibilityHint="Closes the keyframe editor"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.effectsSheetDoneText}>Done</Text>
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
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSpeedCurve(false)} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Speed Curve</Text>
              <PressScale
                onPress={() => { haptic.light(); setShowSpeedCurve(false); }}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                accessibilityHint="Closes the speed curve editor"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.effectsSheetDoneText}>Done</Text>
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
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowReverse(false)} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Reverse Clip</Text>
              <PressScale
                onPress={() => { haptic.light(); setShowReverse(false); }}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.effectsSheetDoneText}>Done</Text>
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
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFreezeFrame(false)} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Freeze Frame</Text>
              <PressScale
                onPress={() => { haptic.light(); setShowFreezeFrame(false); }}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.effectsSheetDoneText}>Done</Text>
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
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAudioFade(false)} />
          <View style={[styles.effectsSheet, { paddingBottom: insets.bottom + Space.sm }]}>
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Audio Fade</Text>
              <PressScale
                onPress={() => { haptic.light(); setShowAudioFade(false); }}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.effectsSheetDoneText}>Done</Text>
              </PressScale>
            </View>
            <AudioFadeControls
              fadeInMs={0}
              fadeOutMs={0}
              onChange={(fadeInMs, fadeOutMs) => {
                updateLayer(selectedLayer.id, {
                  type: 'media',
                  payload: { ...selectedLayer.payload, volume: selectedLayer.payload.volume ?? 1 },
                }, 'Set audio fade');
                haptic.medium();
              }}
            />
          </View>
        </View>
      )}
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
              // Apply the crop rect as normalized bounds on the layer.
              // The crop is non-destructive until commit — here we
              // commit by updating the layer's transform bounds.
              updateLayer(selectedLayer.id, {
                x: cropRect.x,
                y: cropRect.y,
                width: cropRect.width,
                height: cropRect.height,
              }, 'Crop media');
            }
            setCropMode(false);
          }}
          onCancel={() => setCropMode(false)}
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
            <View style={styles.effectsSheetHeader}>
              <Text style={styles.effectsSheetTitle}>Effects</Text>
              <PressScale
                onPress={() => { haptic.light(); setBottomSurface('tools'); }}
                style={styles.effectsSheetDone}
                accessibilityLabel="Done"
                accessibilityHint="Closes the effects panel"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.effectsSheetDoneText}>Done</Text>
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
                selectedId={selectedFilterId}
                onSelect={handleEffectFilterSelect}
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
                />
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <CreatorEntryEditorCrossfade
      showEntry={showEntryScreen}
      entryElement={entryContent}
      editorElement={editorContent}
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
    zIndex: 100,
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
    borderRadius: Radius.md,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: RadiusRoleValue.compactControl,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    gap: Space.xs,
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
  timelineOverlayWrap: {
    marginTop: Space.xxs,
  },
  timelineWaveformWrap: {
    marginTop: Space.xxs,
  },
  // ── Effects sheet ──
  effectsSheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    justifyContent: 'flex-end',
  },
  effectsSheet: {
    backgroundColor: '#141416',
    borderTopLeftRadius: RadiusRoleValue.standalonePanel,
    borderTopRightRadius: RadiusRoleValue.standalonePanel,
    maxHeight: '85%',
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
    color: '#C9A46A',
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
