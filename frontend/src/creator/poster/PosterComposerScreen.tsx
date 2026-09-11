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

import type { VideoPlayer } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Space, FontFamily, Radius, IconGrammar, Stroke, Scrim } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Motion } from '../../theme/motionTokens';
import { useToast } from '../../context/ToastContext';
import { useCreator } from '../CreatorContext';
import { type NativeStackNavigationProp, type RootStackParamList, type CreatorInitialMedia } from '../../navigation/types';
import type { CreatorLayer } from '../composition';
import { makeStableId } from '../../utils/createStableId';
import { CreatorCanvas } from '../CreatorCanvas';
import type { AssetPickerMode } from '../CreatorAssetPicker';
import { InlineTextEditor } from '../tools/text/InlineTextEditor';
import { cutoutService } from '../core/cutout/CutoutService';
import { CreatorEntryScreen } from '../CreatorEntryScreen';
import { CreatorEntryEditorCrossfade } from '../CreatorEntryEditorCrossfade';
import { PressScale } from '../CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import { FrameTray } from '../studio/FrameTray';
import { OverflowItem } from '../studio/OverflowMenu';
import { ContextToolRail } from '../surfaces/ContextToolRail';
import { TrashZone } from '../surfaces/TrashZone';
import {
  type ToolContext,
  type ToolGroup,
  type ToolDefinition,
  getOverflowTools,
} from '../core/toolRegistry';
import {
  TimelineTrack,
  OverlayTrack,
  TimelineToolbar,
  TimelineRuler,
  WaveformTrack,
  formatTimecode,
} from './timeline';
import type { Keyframe } from './keyframes/KeyframeTypes';
import { usePosterEffects } from './usePosterEffects';
import { usePosterEntryTransition } from './usePosterEntryTransition';
import { usePosterTopBarActions } from './usePosterTopBarActions';
import { usePosterFrameNavigation } from './usePosterFrameNavigation';
import { usePosterPlayback } from './usePosterPlayback';
import { useCreatorColorHistory } from '../color';
import { useActiveSheet } from './useActiveSheet';
import { usePosterSession } from './usePosterSession';
import type { SpeedCurve } from './speedcurves/SpeedCurveTypes';
import { DEFAULT_SPEED_CURVE } from './speedcurves/SpeedCurveTypes';
import { usePosterTimeline } from './usePosterTimeline';
import { useTimelineZoom } from './useTimelineZoom';
import { buildPosterToolRail } from './posterToolRailConfig';
import { PosterTopBar } from './PosterTopBar';
import { PosterSheetStack } from './PosterSheetStack';
// Performance monitoring â€” dev-only overlay + frame profiler hook
import { PerformanceOverlay } from '../core/performance/PerformanceOverlay';
import { usePerformanceMonitor } from '../core/performance/usePerformanceMonitor';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Poster Composer V3 â€” Frame-Native Composer (spec 09)
//
// Poster is temporal: a sequence of frames. The composer shows ONE
// current frame filling the screen, with frame navigation appearing
// only because there are multiple frames â€” not because "page
// management" is a permanent toolbar concept.
//
// Default chrome: close, Next, media-specific sound/clip control,
// contextual actions (Text, Stickers, Product, Draw, More).
//
// Frame overview (filmstrip) is invoked intentionally for reorder,
// delete, duplicate, add, select â€” it does not permanently occupy
// the canvas.
//
// Layers, Safe zone, Z-index, Page duration, Opacity and template
// management live in More/Advanced, not the first-run path.
//
// This screen uses the shared CreatorContext (document model) but
// does NOT import from CreatorStudioShell â€” it is a dedicated
// frame-native composer.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ZOOM_INDICATOR_HIDE_DELAY_MS = 700;

function PosterComposerInner({ onEntryTypeChange }: { onEntryTypeChange: (type: 'look' | 'poster' | 'moodboard') => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'CreatorStudio'>>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { show } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // â”€â”€ Performance monitoring (dev-only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    addPage,
    removePage,
    duplicatePage,
    updatePageDuration,
    reorderPages,
    commitLayerTransform,
    isLoadingDraft,
    draftError,
    retryDraftLoad,
    setDocument,
    commitDocument,
    saveDraft,
    addPosterFrames,
    hasPendingRecovery,
    recoverCrashedProject,
    dismissRecovery,
  } = useCreator();

  // â”€â”€ Sheet / overlay state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 13 mutually exclusive sheets consolidated into a single discriminated
  // union via useActiveSheet. This replaces 13 independent useState(false)
  // booleans with 1 useReducer, reducing re-renders and enforcing mutual
  // exclusivity at the type level (audit item-29 Â§5.5).
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
  // â”€â”€ Text color picker sheet (local state â€” not in useActiveSheet) â”€â”€
  // Opens a CreatorColorPicker sheet for the selected text layer's fill
  // color. Replaces the former hardcoded palette cycling.
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const { recents: colorRecents, commitColor: commitRecentColor } = useCreatorColorHistory();
  const [pickerMode, setPickerMode] = useState<AssetPickerMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<CreatorLayer | null>(null);
  // â”€â”€ In-place text content editing (Snapchat/Instagram pattern) â”€â”€â”€â”€â”€â”€
  // When set, an InlineTextEditor renders AT the text layer's position on
  // the canvas so the user can type in place. The modal TextEditorSheet is
  // reserved for advanced styling, not for content editing.
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  // â”€â”€ Chrome-recedes-during-manipulation (Snapchat/Instagram pattern) â”€â”€
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
  // worklet â€” doing so produces "invalid assignment left-hand side" at
  // worklet compile time. Shared values are the canonical Reanimated 4
  // way to read/write mutable state from the UI thread.
  const frameSwipeStartXSV = useSharedValue(0);
  const frameSwipeStartYSV = useSharedValue(0);
  const frameSwipeLockedDirSV = useSharedValue<'horizontal' | 'vertical' | null>(null);
  const [showTemplates, setShowTemplates] = useState(Boolean(route.params?.openTemplates));
  const [showPreview, setShowPreview] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [pageMenuIndex, setPageMenuIndex] = useState<number | null>(null);
  const [showFrameTray, setShowFrameTray] = useState(false);
  const [videoInfoFrameIndex, setVideoInfoFrameIndex] = useState<number | null>(null);
  // â”€â”€ Mutually exclusive bottom surfaces (spec: one at a time) â”€â”€â”€â”€â”€â”€
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
  // â”€â”€ True cutout (segmentation) state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // â”€â”€ Compare-to-original (Lightroom long-press pattern) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // While the user long-presses the canvas background, the selected media
  // layer renders without its effect stack â€” the user sees the original
  // ungraded image. Release restores the graded view. This is the
  // recognition-over-recall pattern: the user doesn't need to remember
  // what the original looked like; they hold to see it.
  const [compareOriginal, setCompareOriginal] = useState(false);

  // â”€â”€ Video player ref (moved up for usePosterTopBarActions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The ref is set by whichever video layer is on the currently rendered
  // page (a poster page has at most one media layer, so there is no
  // ambiguity).
  const videoPlayerRef = useRef<VideoPlayer | null>(null);

  // â”€â”€ Transient timeline selection (moved up for usePosterTopBarActions) â”€â”€
  // Playhead position and play/pause state are driven by the PlaybackClock
  // (the single authority) â€” no separate isPlaying state.
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  // â”€â”€ Top bar / chrome actions (extracted to usePosterTopBarActions) â”€â”€
  // The hook owns the back/discard confirmation sheet, live audio mute,
  // quick save, and undo/redo with transient selection reset.
  const {
    handleBack,
    handleToggleAudioMute,
    handleQuickSaveDraft,
    handleUndo,
    handleRedo,
    isAudioMuted,
    isQuickSaving,
    confirmSheet,
    setConfirmSheet,
  } = usePosterTopBarActions({
    isDirty,
    navigation,
    saveDraft,
    canUndo,
    canRedo,
    undo,
    redo,
    haptic,
    show,
    videoPlayerRef,
    setSelectedClipId,
    setSelectedOverlayId,
  });

  const page = document.pages[activePageIndex];
  // -- Frame navigation (extracted to usePosterFrameNavigation) ------
  // The hook owns page-count derivation, multi-frame detection, page
  // boundary guards, and the canonical page-change handler (goToPage)
  // which resets transient selection (layer, clip, overlay) on every
  // navigation so a stale selection never leaks across pages.
  const {
    goToPage,
    hasMultipleFrames,
    pageCount,
    canGoToNextPage,
    canGoToPrevPage,
  } = usePosterFrameNavigation({
    document,
    activePageIndex,
    setActivePageIndex,
    selectLayer,
    setSelectedClipId,
    setSelectedOverlayId,
    haptic,
  });

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // â”€â”€ Edit-surface geometry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The authored canvas is immutable: it ALWAYS uses the document's
  // aspect ratio (9:16 for posters), never the physical screen height.
  // This guarantees "what I edit is what is exported" â€” the same document
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

  // â”€â”€ Frame organizer is transient â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Per Design.md: page dots (the top progress segments) are the persistent
  // location indicator. The FrameTray is a transient organizer for
  // reorder/duplicate/delete only â€” opened explicitly from the overflow
  // menu, never auto-shown on frame change. This removes the duplicate
  // navigation surfaces that competed with the canvas.

  // â”€â”€ Keyboard shortcuts (web/tablet only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        else if (showTextColorPicker) setShowTextColorPicker(false);
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
  }, [canUndo, canRedo, undo, redo, editingTextLayerId, showTextColorPicker, activeSheet, closeSheet, bottomSurface, cropMode, cutoutPreviewTarget, pageMenuIndex, showPreview, showTemplates, pickerMode, selectedLayerId, selectLayer, removeLayer, handleBack]);

  // â”€â”€ Hardware back button â€” intercept to close sheets first â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (editingTextLayerId) { setEditingTextLayerId(null); return true; }
        if (showTextColorPicker) { setShowTextColorPicker(false); return true; }
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
    }, [editingTextLayerId, showTextColorPicker, activeSheet, closeSheet, bottomSurface, cropMode, cutoutPreviewTarget, pageMenuIndex, showPreview, showTemplates, pickerMode, selectedLayerId, selectLayer])
  );

  // â”€â”€ Memoized asset picker callbacks (audit item-29 Â§5.5) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // These were inline arrows in the JSX, creating new function references
  // on every render and causing CreatorAssetPicker to re-render even when
  // nothing relevant changed. Memoizing them keeps the picker stable.
  const handlePickerClose = useCallback(() => {
    setPickerMode(null);
    setEditingLayer(null);
  }, []);

  const handlePickerAddLayer = useCallback((layer: CreatorLayer) => {
    if (editingLayer) {
      // Replace mode: preserve the existing layer's id, trim, speed, volume,
      // effects, zIndex, and other authored properties. Only the media
      // source (uri, type, duration) should change. Without this, the
      // picker's brand-new layer (with default trim/speed/volume) would
      // silently discard all the user's editing work.
      if (editingLayer.type === 'media' && layer.type === 'media') {
        const preserved: CreatorLayer = {
          ...editingLayer,
          // Keep the original id so selection and timeline stay valid.
          id: editingLayer.id,
          payload: {
            ...editingLayer.payload,
            // Update only the media source fields.
            mediaUri: layer.payload.mediaUri,
            mediaType: layer.payload.mediaType,
            videoDurationMs: layer.payload.videoDurationMs,
            // Clear the thumbnail so it regenerates for the new media.
            thumbnailUri: undefined,
          },
        };
        updateLayer(editingLayer.id, preserved, 'Replace clip media');
      } else {
        updateLayer(editingLayer.id, layer, 'Edit layer');
      }
    } else {
      addLayer(layer);
    }
  }, [editingLayer, updateLayer, addLayer]);

  // Shared "Done" handler for effects sheets â€” haptic + close (audit item-29)
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

  const selectedLayer = page?.layers.find((l) => l.id === selectedLayerId) ?? null;

  // â”€â”€ Background media URI for draw-on-media â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Entry / cameraâ†’editor crossfade (extracted to usePosterEntryTransition) â”€â”€
  // The hook owns entry completion, pinned media for the crossfade, the
  // source content transform, the camera viewport ref, and the entry
  // screen callbacks. `showEntryScreen` is derived from entry completion,
  // content presence, and draft loading state.
  const {
    entryComplete,
    entryPinnedUri,
    entryPinnedKind,
    entrySourceTransform,
    cameraViewportRef,
    handleEntryMediaSelected,
    handleEntryBlankStart,
    handleEntryClose,
    showEntryScreen,
  } = usePosterEntryTransition({
    startBlank: Boolean(route.params?.startBlank),
    hasContent,
    isLoadingDraft,
    addPosterFrames,
    navigation,
  });

  // â”€â”€ Chrome fade during manipulation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Top bar and tool dock fade to a dimmed but visible opacity when the
  // user is actively dragging/pinching/rotating a layer, then spring back
  // on release. The canvas stays at full opacity â€” the chrome recedes,
  // not the content. 0.35 keeps controls discoverable during gestures.
  const chromeFadeStyle = useAnimatedStyle(() => ({
    opacity: withTiming(manipulationActiveSV.value === 1 ? 0.35 : 1, {
      duration: Motion.duration.railSwap,
      easing: Motion.easing.entrance,
    }),
  }));

  // â”€â”€ Video detection â€” any page with video media â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Audio detection â€” music layer or video with audio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The waveform track renders when audio content exists: either an
  // explicit music layer or a video clip (which carries its own audio
  // track). Per AGENTS.md Â§11 we never fake waveform data â€” when no
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

  // â”€â”€ Audio URI for waveform extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Derive a single audio URI to feed the WaveformTrack. We prefer an
  // explicit music layer's previewUrl (the dedicated audio asset) and fall
  // back to the first video clip's mediaUri (video carries its own audio
  // track). When neither is present, audioUri stays undefined and the
  // WaveformTrack renders its honest flat-line empty state (AGENTS.md Â§11).
  const audioUri = useMemo(() => {
    for (const p of document.pages) {
      for (const l of p.layers) {
        if (l.type === 'music' && l.payload.previewUrl) {
          return l.payload.previewUrl;
        }
      }
    }
    for (const p of document.pages) {
      for (const l of p.layers) {
        if (l.type === 'media' && l.payload.mediaType === 'video') {
          return l.payload.mediaUri;
        }
      }
    }
    return undefined;
  }, [document.pages]);

  // -- Playback clock & transport (extracted to usePosterPlayback) ----
  // The hook owns the PlaybackClock instance, timeline projection,
  // playhead state, the per-tick video source-time mapping adapter,
  // video adapter registration, and transport controls (play/pause/seek/
  // setRate). `playbackClock` is passed to CreatorCanvas and the timeline
  // operation handler; `playbackState` drives the playhead, play/pause
  // button, and timecode display.
  const {
    playbackClock,
    playbackState,
    isPlaying,
    playheadPosition,
    clockRate,
    setClockRate,
    handlePlayPause,
    handleSeek,
  } = usePosterPlayback({
    document,
    videoPlayerRef,
    activePageIndex,
    haptic,
  });

  // -- Timeline editing state & handlers (extracted to usePosterTimeline) --
  // The hook owns: timelineClips, clipPageIndices, clipTransitionIds,
  // timelineOverlays, timelineTotalDurationMs, selectedClip, timelineState,
  // handleTimelineOperation, handleSpeedCurveChange, handleTimelineTransitionTap.
  // selectedClipId/setSelectedClipId and selectedOverlayId/setSelectedOverlayId
  // are shared transient state owned by the screen (single source of truth).
  const {
    timelineClips,
    clipPageIndices,
    clipTransitionIds,
    timelineOverlays,
    timelineTotalDurationMs,
    selectedClip,
    timelineState,
    handleTimelineOperation,
    handleSpeedCurveChange,
    handleTimelineTransitionTap,
  } = usePosterTimeline({
    document,
    updateLayer,
    duplicateLayer,
    removeLayer,
    reorderPages,
    addLayer,
    commitDocument,
    haptic,
    show,
    playbackClock,
    playbackState,
    selectedClipId,
    setSelectedClipId,
    selectedOverlayId,
    setSelectedOverlayId,
    selectedLayer,
    activePageIndex,
    selectLayer,
    setActivePageIndex,
    openSheet,
    setEditingLayer,
    setPickerMode,
  });

  // â”€â”€ Timeline visibility (spec: one bottom surface at a time) â”€â”€â”€â”€â”€â”€
  // The timeline is the bottom surface when bottomSurface === 'timeline'.
  // It replaces the tool rail â€” never stacks on top of it. The tool rail
  // is only rendered when bottomSurface === 'tools', and the effects sheet
  // only when bottomSurface === 'effects'. This enforces the spec's
  // "one bottom surface" constraint: tools, timeline, and effects are
  // mutually exclusive, not layered.
  const shouldShowTimeline = bottomSurface === 'timeline' && timelineClips.length > 0;

  // â”€â”€ Timeline pinch-to-zoom (CapCut parity) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // A two-finger pinch scales the timeline's pixels-per-ms so every track
  // (clip, ruler, overlay, waveform, playhead) expands/contracts together.
  // The live scale lives in a Reanimated shared value so the visual
  // transform runs on the UI thread â€” no React re-render per frame. The
  // scale is committed to React state only when the gesture ends, which
  // updates the ScrollView content width and the trackWidth props so the
  // real layout matches the preview. Clamped to 0.5xâ€“4x.
  //
  // Source-of-truth: all tracks already derive their geometry from the
  // track width they receive or measure, so scaling the content width at
  // the parent scales every child uniformly â€” no per-child scale prop
  // needed (that would double-scale and break the playhead/trim math).
  const [timelineZoomScale, setTimelineZoomScale] = useState(1);
  const zoomIndicatorOpacitySV = useSharedValue(0);
  const timelineBaseTrackWidth = screenWidth - Space.md * 2;
  const scaledTrackWidth = timelineBaseTrackWidth * timelineZoomScale;

  // â”€â”€ Session-state persistence & restoration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Extracted to usePosterSession hook. Persists active page, selected
  // layer, and timeline zoom to AsyncStorage (debounced 500ms) and
  // restores them on mount or when a different document is loaded.
  usePosterSession({
    documentId: document.id,
    pageCount: document.pages.length,
    activePageIndex,
    selectedLayerId,
    timelineZoomScale,
    setActivePageIndex,
    selectLayer,
    setTimelineZoomScale,
  });

  const showZoomIndicator = useCallback(() => {
    zoomIndicatorOpacitySV.value = withTiming(1, {
      duration: Motion.duration.fast,
      easing: Motion.easing.entrance,
    });
  }, [zoomIndicatorOpacitySV]);

  const fadeZoomIndicator = useCallback(() => {
    zoomIndicatorOpacitySV.value = withDelay(
      ZOOM_INDICATOR_HIDE_DELAY_MS,
      withTiming(0, { duration: Motion.duration.slower, easing: Motion.easing.entrance }),
    );
  }, [zoomIndicatorOpacitySV]);

  // Pinch activates instantly by default (two fingers down â†’ gesture
  // begins) and coexists with the ScrollView's one-finger horizontal pan â€”
  // pinch is a distinct two-finger gesture so the two never compete.
  const timelinePinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          'worklet';
          pinchBaseScaleSV.value = timelineScaleSV.value;
          runOnJS(showZoomIndicator)();
        })
        .onChange((e) => {
          'worklet';
          const next = pinchBaseScaleSV.value * e.scale;
          timelineScaleSV.value = Math.max(0.5, Math.min(4, next));
        })
        .onEnd(() => {
          'worklet';
          runOnJS(setTimelineZoomScale)(timelineScaleSV.value);
          runOnJS(fadeZoomIndicator)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showZoomIndicator, fadeZoomIndicator],
  );

  // Live preview: during the pinch the content is visually scaled from the
  // committed scale to the shared-value scale, anchored at the left edge
  // (transformOrigin top-left) so the timeline grows from its start. On
  // commit the real layout takes over and the transform resets to 1x â€” no
  // jump, because the committed width then equals the previewed width.
  const timelineContentAnimStyle = useAnimatedStyle(
    () => ({
      transform: [{ scaleX: timelineScaleSV.value / timelineZoomScale }],
    }),
    [timelineZoomScale],
  );

  const zoomIndicatorAnimStyle = useAnimatedStyle(() => ({
    opacity: zoomIndicatorOpacitySV.value,
  }));

  // â”€â”€ Auto-expand timeline when video or second clip is added â”€â”€â”€â”€â”€â”€
  // When the composition transitions from single-photo to video or
  // multi-clip, the timeline auto-expands without requiring a user tap.
  // This sets bottomSurface to 'timeline' so the tool rail is replaced
  // (not stacked underneath) â€” one bottom surface at a time.
  useEffect(() => {
    if (hasVideoContent || timelineClips.length > 1) {
      setUserRequestedTimeline(true);
      setBottomSurface('timeline');
    }
  }, [hasVideoContent, timelineClips.length]);


  // â”€â”€ Playback tick is now handled by the PlaybackClock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The clock uses requestAnimationFrame (or setInterval fallback) to
  // advance time at 60fps with coalesced seeks. The old 100ms setInterval
  // tick has been removed â€” the clock is the single authority for time.

  // â”€â”€ Effects sheet â€” derived state & handlers (extracted to usePosterEffects) â”€â”€
  // The hook owns the effects subsystem: filter selection, manual
  // adjustments, auto-adjust, the live-preview revert effect, and the
  // swipe-to-filter HUD animation. It is called here (before the frame
  // swipe gesture) so the returned `cycleFilter` is in scope for the
  // single-frame swipe-to-filter gesture.
  const {
    selectedMediaLayer,
    effectsSourceUri,
    selectedFilterId,
    currentAdjustments,
    autoAdjustActive,
    handleEffectFilterSelect,
    handleEffectAdjustChange,
    handleEffectReset,
    handleAutoAdjust,
    filterHudName,
    filterHudAnimatedStyle,
    cycleFilter,
  } = usePosterEffects(selectedLayer, page, bottomSurface, updateLayer, updateLayerLive, haptic);

  // â”€â”€ Frame navigation & Filter gesture (swipe horizontal) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // One current frame fills the viewport.
  // When there are multiple frames, horizontal swipe navigates between them.
  // When editing a single frame (standard story/poster), horizontal swipe
  // cycles live Skia photo filters with an animated HUD pill (Instagram/Snapchat parity).

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
        if (hasMultipleFrames) {
          if (dx < 0) {
            // Swipe left â†’ next frame
            runOnJS(goToPage)(activePageIndex + 1);
          } else {
            // Swipe right â†’ prev frame
            runOnJS(goToPage)(activePageIndex - 1);
          }
        } else {
          // Single-frame story/poster: swipe-to-filter (Instagram/Snapchat flagship pattern)
          runOnJS(cycleFilter)(dx < 0 ? 'next' : 'prev');
        }
      });
  }, [screenWidth, hasMultipleFrames, activePageIndex, goToPage, cycleFilter, frameSwipeStartXSV, frameSwipeStartYSV, frameSwipeLockedDirSV]);

  // â”€â”€ Object action handlers (context toolbar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      // In-place text editing â€” no modal sheet (Snapchat/Instagram pattern)
      setEditingTextLayerId(layer.id);
      return;
    }
    setEditingLayer(layer);
    if (layer.type === 'media') setPickerMode('media');
    else if (layer.type === 'product') setPickerMode('product');
    else if (layer.type === 'mention') setPickerMode('mention');
  }, []);

  // â”€â”€ Bottom tool rail handlers (default â€” no selection) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Direct-on-canvas text placement (Snapchat/Instagram pattern):
  // tapping Text creates a text layer directly on the canvas â€” centered,
  // selected, with placeholder copy â€” then opens the text editor in EDIT
  // mode for that layer so the keyboard opens immediately. The text is
  // already on the canvas when the editor opens; dismissing the editor
  // without typing leaves the layer on the canvas for later editing. This
  // replaces the former "tap Text â†’ open empty picker sheet â†’ type â†’
  // confirm â†’ layer appears" modal flow where the canvas was hidden and
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
        text: '',
        textStyle: 'clean',
        fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
        textColor: '#ffffff',
        alignment: 'center',
        opacity: 1,
      },
    } as CreatorLayer;
    addLayer(newLayer);
    // Enter in-place text editing immediately â€” the InlineTextEditor
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

  // â”€â”€ Timeline toggle (spec: timeline expands on explicit request) â”€â”€
  // For single-photo posters the timeline is hidden by default. Tapping
  // "Timeline" in the tool rail expands it; tapping again collapses it.
  // For video posters the timeline auto-expands â€” this toggle still
  // allows the user to collapse it if desired.
  const handleTimelineToggle = useCallback(() => {
    if (timelineClips.length === 0) {
      if (!hasContent) {
        show("Add a video to use the timeline", 'info');
        return;
      }
      haptic.light();
      setUserRequestedTimeline(true);
      setBottomSurface('timeline');
      return;
    }
    haptic.light();
    setUserRequestedTimeline((prev) => {
      const next = !prev;
      setBottomSurface(next ? 'timeline' : 'tools');
      return next;
    });
  }, [haptic, timelineClips.length, hasContent, show]);

  // â”€â”€ Timeline Done â€” collapses the timeline, returns to canvas tools â”€â”€
  // Per spec: "Done returns to canvas tools." This is the exit from the
  // video state back to the default tool rail. The tool rail re-renders
  // because bottomSurface switches to 'tools'.
  const handleTimelineDone = useCallback(() => {
    haptic.light();
    setUserRequestedTimeline(false);
    setBottomSurface('tools');
    setSelectedClipId(null);
  }, [haptic]);

  // â”€â”€ Effects handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Crop action for selected media â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Cutout action for selected media (advanced, overflow only) â”€â”€â”€â”€
  // Opens true subject segmentation (CutoutPreviewSheet) when the native
  // backend is available. Per spec 07 Â§7: true cutout uses segmentation,
  // not a trace bounding box. Per AGENTS.md Â§11: never fake a cutout.
  // This is an advanced tool â€” it lives in the media-selected overflow,
  // not the primary rail.
  const handleCutoutAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setCutoutPreviewTarget(selectedLayer);
  }, [selectedLayer, haptic]);

  // â”€â”€ Adjust action for selected media â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Opens the effects sheet with the AdjustPanel visible. The adjust
  // panel provides non-destructive exposure/brightness/contrast/saturation
  // adjustments â€” the same workflow used by LookComposerScreen.
  const handleAdjustAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'media') {
      haptic.light();
      return;
    }
    haptic.medium();
    setBottomSurface('effects');
  }, [selectedLayer, haptic]);

  // â”€â”€ Transition handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


  // â”€â”€ Keyframe handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Speed curve handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Opens the speed curve editor for the selected media layer. The curve
  // is stored on the media layer's `speedCurve` field. When the user
  // clears the curve (back to constant), the field is removed.
  const selectedMediaSpeedCurve: SpeedCurve | null = useMemo(() => {
    if (selectedLayer?.type !== 'media') return null;
    return selectedLayer.payload.speedCurve ?? DEFAULT_SPEED_CURVE;
  }, [selectedLayer]);


  // -- Tool groups for ContextToolRail (extracted to posterToolRailConfig) --
  // Pure config builder — no React hooks. All onPress handlers wire to
  // EXISTING handlers — no new actions.
  const toolGroups = useMemo<ToolGroup[]>(() => buildPosterToolRail({
    haptic,
    openSheet,
    selectedLayer,
    updateLayer,
    show,
    navigation,
    pageCount,
    cutoutSupported,
    showSafeZone,
    bottomSurface,
    onEntryTypeChange,
    setShowPreview,
    setShowSafeZone,
    setShowTemplates,
    setSelectedClipId,
    setUserRequestedTimeline,
    setBottomSurface,
    setPickerMode,
    setShowTextColorPicker,
    handleAddText,
    handleAddStickers,
    handleAddProduct,
    handleAddEffects,
    handleDraw,
    handleAddFrame,
    handleTimelineToggle,
    handleEditLayer,
    handleReorderLayer,
    handleDuplicateLayer,
    handleDeleteLayer,
    handleCropAction,
    handleCutoutAction,
    handleAdjustAction,
    handleAutoAdjust,
  }), [
    handleAddText, handleAddStickers, handleAddProduct, handleAddEffects, handleDraw,
    handleAddFrame, handleTimelineToggle, handleEditLayer, handleReorderLayer, handleDuplicateLayer,
    handleDeleteLayer, handleCropAction, handleCutoutAction, handleAdjustAction, handleAutoAdjust,
    selectedLayer, updateLayer, haptic, show, navigation,
    pageCount, cutoutSupported, showSafeZone, bottomSurface, openSheet, onEntryTypeChange,
  ]);

  // â”€â”€ Active context resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Dynamic overflow tools for the active context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The overflow menu renders the actual overflow tools from the active
  // context's ToolGroup (not a hardcoded list). This ensures tools moved
  // to overflow (Draw, Timeline, Stickers, Effects, Cutout, Animation, etc.)
  // are actually accessible. Context-only items that aren't in the tool
  // groups (Accessibility, Help) are appended as persistent overflow items.
  const activeOverflowTools = useMemo(
    () => getOverflowTools(activeToolContext, toolGroups),
    [activeToolContext, toolGroups],
  );

  const overflowDestructive = useMemo(
    () => activeOverflowTools.filter((tool) => tool.id === 'delete'),
    [activeOverflowTools],
  );

  const overflowSections = useMemo(() => {
    const sectionFor = (id: string): 'Advanced editing' | 'Accessibility' | 'Project' => {
      if (['draw', 'replace', 'crop', 'adjust', 'effects', 'auto', 'cutout', 'animation', 'speed-curve', 'reverse', 'freeze-frame', 'audio-fade', 'duplicate', 'delete', 'edit-clip'].includes(id)) {
        return 'Advanced editing';
      }
      if (['move-precisely', 'arrange-precisely', 'safe-zone', 'a11yMove', 'a11yZOrder', 'layers'].includes(id)) {
        return 'Accessibility';
      }
      return 'Project';
    };
    const tools: ToolDefinition[] = hasMultipleFrames
      ? [
          ...activeOverflowTools.filter((tool) => tool.id !== 'delete'),
          {
            id: 'manage-frames',
            label: 'Manage frames',
            icon: 'albums-outline',
            onPress: () => { setShowFrameTray(true); },
            accessibilityLabel: 'Manage frames',
            accessibilityHint: 'Opens the frame organizer',
          },
        ]
      : activeOverflowTools.filter((tool) => tool.id !== 'delete');
    return (['Advanced editing', 'Accessibility', 'Project'] as const)
      .map((title) => ({
        title,
        tools: tools.filter((tool) => sectionFor(tool.id) === title),
      }))
      .filter((section) => section.tools.length > 0);
  }, [activeOverflowTools, hasMultipleFrames]);

  // â”€â”€ Camera â†’ Editor crossfade â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      {/* â”€â”€ Crash recovery banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {hasPendingRecovery && (
        <View style={[styles.recoveryBanner, { borderLeftColor: colors.brand }]}>
          <Ionicons name="alert-circle-outline" size={IconGrammar.standard} color={colors.textPrimary} />
          <Text style={[styles.recoveryText, { color: colors.scrimTextPrimary }]}>Recover unsaved project?</Text>
          <PressScale
            onPress={() => { void recoverCrashedProject(); }}
            style={styles.recoveryBtn}
            accessibilityLabel="Recover project"
            accessibilityRole="button"
          >
            <Text style={[styles.recoveryBtnText, { color: colors.brand }]}>Recover</Text>
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
      {/* â”€â”€ Full-screen frame canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                  // In-place content editing â€” the TextInput renders AT the
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
                // zone â€” "you're about to delete" feedback.
                haptic.medium();
              }}
              playbackClock={playbackClock}
              currentTimeMs={playbackState.currentTimeMs}
              videoPlayerRef={videoPlayerRef}
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
            {/* Drag-to-trash overlay â€” fades in during layer drag, highlights
                when the dragged layer enters the bottom zone. Visual-only. */}
            <TrashZone
              manipulationActiveSV={manipulationActiveSV}
              isInTrashZoneSV={isInTrashZoneSV}
            />
          </View>

          {/* â”€â”€ Filter HUD pill (Instagram/Snapchat swipe-to-filter indicator) â”€â”€ */}
          {filterHudName && (
            <Reanimated.View
              style={[styles.filterHudPill, filterHudAnimatedStyle, { top: insets.top + 64 }]}
              pointerEvents="none"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.filterHudText}>{filterHudName}</Text>
            </Reanimated.View>
          )}

          {/* â”€â”€ In-place text content editor (Snapchat/Instagram pattern) â”€â”€ */}
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
                onCommit={(text, styleUpdates) => {
                  updateLayer(editingTextLayer.id, {
                    payload: { ...editingTextLayer.payload, text, ...(styleUpdates ?? {}) },
                  } as Partial<CreatorLayer>, 'Edit text content');
                }}
                onDismiss={() => setEditingTextLayerId(null)}
              />
            );
          })()}

          {/* Canvas loading overlay */}
          {isLoadingDraft && (
            <View style={styles.canvasLoadingOverlay} pointerEvents="none">
              <View style={[styles.canvasLoadingPill, { backgroundColor: colors.surfaceElevated }]}>
                <ActivityIndicator size="small" color={colors.textPrimary} />
                <Text style={[styles.canvasLoadingText, { color: colors.textPrimary }]}>Loadingâ€¦</Text>
              </View>
            </View>
          )}

          {/* Empty frame hint â€” authored two-line empty state */}
          {!hasContent && !isLoadingDraft && !draftError && entryComplete && !selectedLayer && (
            <View style={styles.canvasEmptyHint} pointerEvents="none">
              <Text style={[styles.canvasEmptyHintTitle, { color: colors.textSecondary }]}>
                Add media
              </Text>
              <Text style={styles.canvasEmptyHintSubtitle}>
                Add clips or capture video to start editing
              </Text>
            </View>
          )}

          {/* Draft load error overlay â€” visible when loading failed */}
          {!isLoadingDraft && draftError && (
            <View style={styles.canvasErrorOverlay}>
              <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
              <Text style={[styles.canvasErrorTitle, { color: colors.textPrimary }]}>
                Couldn't load draft
              </Text>
              <Text style={[styles.canvasErrorSubtitle, { color: colors.textSecondary }]}>
                Saved locally
              </Text>
              <Pressable
                onPress={() => {
                  const id = route.params?.draftId ?? route.params?.sourceDocumentId;
                  if (id) retryDraftLoad(id);
                }}
                style={styles.canvasErrorRetry}
                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                accessibilityLabel="Retry loading draft"
                accessibilityRole="button"
              >
                <Text style={[styles.canvasErrorRetryText, { color: colors.brand }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          )}

          {/* Safe zone overlay (advanced â€” behind More) */}
          {showSafeZone && (
            <View style={styles.safeZoneOverlay} pointerEvents="none">
              <View style={[styles.safeZoneTop, { top: 0, height: insets.top + 52 }]} />
              <View style={[styles.safeZoneBottom, { bottom: 0, height: insets.bottom + 120 }]} />
              <View style={[styles.safeZoneContent, { top: insets.top + 52, bottom: insets.bottom + 120 }]} />
            </View>
          )}
        </View>
      </GestureDetector>

      {/* â”€â”€ Performance overlay (dev-only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* Renders a semi-transparent FPS / frame-time / jank panel at the
          top-right corner. The overlay is gated on __DEV__ both here and
          inside PerformanceOverlay itself, so it never appears in
          production. pointerEvents="box-none" ensures it does not
          intercept canvas gestures except on its own toggle button. */}
      {__DEV__ && <PerformanceOverlay />}

      {/* â”€â”€ Top bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* Wrapped in Reanimated.View with chromeFadeStyle so the top bar
          recedes (fades to 0.15 opacity) during active layer manipulation,
          making the canvas feel infinite (Snapchat/Instagram pattern). */}
      <PosterTopBar
        styles={styles}
        colors={colors}
        topInset={insets.top}
        chromeFadeStyle={chromeFadeStyle}
        isManipulating={isManipulating}
        hasSelection={!!selectedLayer}
        haptic={haptic}
        selectLayer={selectLayer}
        openSheet={openSheet}
        handleBack={handleBack}
        isDirty={isDirty}
        hasAudioContent={hasAudioContent}
        hasVideoContent={hasVideoContent}
        handleToggleAudioMute={handleToggleAudioMute}
        isAudioMuted={isAudioMuted}
        handleQuickSaveDraft={handleQuickSaveDraft}
        isQuickSaving={isQuickSaving}
        handleUndo={handleUndo}
        canUndo={canUndo}
        undoLabel={undoLabel}
        handleRedo={handleRedo}
        canRedo={canRedo}
        redoLabel={redoLabel}
      />

      {/* â”€â”€ Frame progress segments (quieter in editor) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                onPress={() => goToPage(i)}
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
                        backgroundColor: i <= activePageIndex ? colors.textSecondary : colors.border,
                      },
                    ]}
                  />
                </View>
              </Pressable>
            ))}
            {/* Add frame â€” sits at the end of the page dots row */}
            {pageCount < 10 && (
              <PressScale
                onPress={handleAddFrame}
                style={styles.pageSegmentAdd}
                accessibilityLabel="Add frame"
                accessibilityHint="Adds a new frame to the story"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="add" size={IconGrammar.metadata} color={colors.textSecondary} />
              </PressScale>
            )}
          </View>
        </View>
      )}

      {/* â”€â”€ Poster timeline (conditional â€” spec: no permanent timeline for single photo) â”€â”€ */}
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
          {/* Solid surface material + top hairline */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} />
          {/* â”€â”€ Playback bar â”€â”€ */}
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
              accessibilityHint={undoLabel ? `Undo ${undoLabel}` : 'Reverts the last edit'}
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
              accessibilityHint={redoLabel ? `Redo ${redoLabel}` : 'Reapplies the last undone edit'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canRedo }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Ionicons name="arrow-redo" size={IconGrammar.metadata} color={colors.scrimTextPrimary} />
            </PressScale>

            {/* Done â€” collapses the timeline, returns to canvas tools */}
            <PressScale
              onPress={handleTimelineDone}
              style={styles.timelineDoneBtn}
              accessibilityLabel="Done"
              accessibilityHint="Collapses the timeline and returns to canvas tools"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.timelineDoneText, { color: colors.brand }]}>Done</Text>
            </PressScale>
          </View>

          {/* â”€â”€ Pinch-to-zoom + horizontally scrollable tracks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
              A GestureDetector (Pinch) wraps a horizontal ScrollView. All
              tracks share the same scaledTrackWidth so clip, ruler, overlay,
              waveform and playhead scale together. During the pinch an
              animated scaleX (left-anchored via transformOrigin) previews
              the zoom on the UI thread; on gesture end the scale commits to
              state and the real layout takes over. Pinch (2 fingers) and
              horizontal scroll (1 finger) coexist naturally. */}
          <GestureDetector gesture={timelinePinchGesture}>
            <View style={styles.timelineScrollWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEnabled={timelineZoomScale > 1}
                contentContainerStyle={{ width: scaledTrackWidth }}
                style={styles.timelineScroll}
              >
                <Reanimated.View
                  style={[
                    styles.timelineContent,
                    { width: scaledTrackWidth, transformOrigin: '0% 0%' },
                    timelineContentAnimStyle,
                  ]}
                >
                  {/* â”€â”€ Time ruler (above the clip track) â”€â”€ */}
                  <TimelineRuler
                    totalDurationMs={timelineTotalDurationMs}
                    trackWidth={scaledTrackWidth}
                  />

                  {/* â”€â”€ Clip track â”€â”€ */}
                  <TimelineTrack
                    clips={timelineClips}
                    selectedClipId={selectedClipId}
                    playheadMs={playbackState.currentTimeMs}
                    totalDurationMs={timelineTotalDurationMs}
                    onSelectClip={(id) => {
                      setSelectedClipId(id);
                      setSelectedOverlayId(null);
                      // Sync activePageIndex to the clip's owning page so
                      // subsequent mutations (trim/speed/split/delete) target
                      // the correct page. Without this, edits can silently
                      // target the wrong page when the selected clip is on a
                      // different page than the active one.
                      const clipIdx = timelineClips.findIndex((c) => c.id === id);
                      if (clipIdx >= 0 && clipPageIndices[clipIdx] !== activePageIndex) {
                        setActivePageIndex(clipPageIndices[clipIdx]);
                      }
                    }}
                    onSeek={(ms) => handleTimelineOperation({ type: 'seek', ms })}
                    onTrimClip={(clipId, edge, deltaMs) =>
                      handleTimelineOperation({ type: 'trim', clipId, edge, deltaMs })
                    }
                    transitionIds={clipTransitionIds}
                    onSelectTransition={handleTimelineTransitionTap}
                    onReorderClip={(clipId, translationX) => {
                      // Compute target index from drag translation.
                      // Each clip's width is proportional to its duration.
                      // A drag of one clip-width moves the clip by one position.
                      const fromIndex = timelineClips.findIndex((c) => c.id === clipId);
                      if (fromIndex < 0) return;
                      const clipWidth = Math.max(24, timelineClips[fromIndex].durationMs * (scaledTrackWidth > 0 && timelineTotalDurationMs > 0 ? scaledTrackWidth / timelineTotalDurationMs : 0) - 8);
                      const positionsMoved = Math.round(translationX / clipWidth);
                      const toIndex = Math.max(0, Math.min(timelineClips.length - 1, fromIndex + positionsMoved));
                      if (toIndex !== fromIndex) {
                        handleTimelineOperation({ type: 'reorder', fromIndex, toIndex });
                      }
                    }}
                  />

                  {/* â”€â”€ Overlay track (if overlays exist) â”€â”€ */}
                  {timelineOverlays.length > 0 && (
                    <View style={styles.timelineOverlayWrap}>
                      <OverlayTrack
                        overlays={timelineOverlays}
                        totalDurationMs={timelineTotalDurationMs}
                        trackWidth={scaledTrackWidth}
                        selectedId={selectedOverlayId}
                        onSelect={(id) => { setSelectedOverlayId(id); setSelectedClipId(null); }}
                        onMove={(id, timeRange) =>
                          handleTimelineOperation({ type: 'moveOverlay', overlayId: id, timeRange })
                        }
                      />
                    </View>
                  )}

                  {/* â”€â”€ Waveform track (audio present) â”€â”€ */}
                  {hasAudioContent && (
                    <View style={styles.timelineWaveformWrap}>
                      <WaveformTrack
                        trackWidth={scaledTrackWidth}
                        color={colors.brand}
                        audioUri={audioUri}
                      />
                    </View>
                  )}
                </Reanimated.View>
              </ScrollView>

              {/* â”€â”€ Zoom indicator â€” fades in on pinch, out after release â”€â”€ */}
              <Reanimated.View
                style={[styles.timelineZoomIndicatorWrap, zoomIndicatorAnimStyle]}
                pointerEvents="none"
              >
                <Text style={[styles.timelineZoomIndicator, { color: colors.textMuted }]}>
                  {`${timelineZoomScale.toFixed(1)}x`}
                </Text>
              </Reanimated.View>
            </View>
          </GestureDetector>

          {/* â”€â”€ Timeline toolbar (clip selected) â”€â”€ */}
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
              onOpenSpeedCurve={() => { haptic.light(); openSheet('speedCurve'); }}
            />
          )}
        </View>
      )}

      {bottomSurface === 'timeline' && timelineClips.length === 0 && hasContent && (
        <View style={[styles.timelineContainer, { bottom: insets.bottom }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} />
          <View style={styles.timelineEmptyRow}>
            <Text style={styles.timelineEmptyText}>Add your first clip</Text>
            <Pressable
              onPress={() => { haptic.light(); setPickerMode('media'); }}
              style={styles.timelineEmptyCta}
              accessibilityLabel="Add media"
              accessibilityHint="Opens the library to add your first clip"
              accessibilityRole="button"
            >
              <Text style={[styles.timelineEmptyCtaText, { color: colors.brand }]}>Add</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* â”€â”€ Bottom tool rail â€” ContextToolRail (context-sensitive) â”€â”€â”€â”€â”€â”€ */}
      {/* The ContextToolRail is the single bottom surface for both default
          and selection states. It adapts its visible tool set based on the
          active ToolContext (editor mode + selection state). Up to 4
          primary actions are always visible; additional tools (including
          Edit Clip for video, z-order, duplicate, delete, opacity) are
          revealed under the trailing "More" button. The legacy context
          toolbar was removed â€” it duplicated tools already in the rail
          and competed with the canvas per the surface budget constraint. */}
      {/* Replaces the static tool dock. The rail adapts its visible tool set
          based on the active ToolContext (editor mode + selection state).
          Up to 4 primary actions are always visible; additional tools are
          revealed under the trailing "More" button.
          Frame count indicator sits at the start when multiple frames. */}
      {/* â”€â”€ Bottom tool rail â€” only when bottomSurface === 'tools' â”€â”€â”€â”€â”€â”€ */}
      {/* The tool rail is the default bottom surface. When the timeline or
          effects sheet is active, the tool rail is unmounted â€” one bottom
          surface at a time per the spec. The timeline has its own Done
          button to return here; the effects sheet has its own Done button. */}
      {bottomSurface === 'tools' && (
        <Reanimated.View style={[styles.bottomRailContainer, { paddingBottom: insets.bottom }, chromeFadeStyle]} pointerEvents={isManipulating ? 'none' : 'auto'}>
          <LinearGradient
            colors={Scrim.bottom.colors}
            locations={Scrim.bottom.locations}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.bottomRailContent}>
            {/* Frame position label â€” non-interactive; page dots at top
                handle navigation. The frame organizer is in the More menu. */}
            {hasMultipleFrames && !selectedLayer && (
              <View style={styles.frameBadgePill}>
                <Text style={styles.frameCountText}>
                  {activePageIndex + 1}/{pageCount}
                </Text>
              </View>
            )}

            <View style={styles.bottomRailGlassDock}>
              <ContextToolRail
                context={activeToolContext}
                groups={toolGroups}
                onOverflowPress={() => openSheet('overflow')}
                style={styles.contextRail}
              />
            </View>

            {/* Direct 1-tap Send / Story action (Snapchat / Instagram flagship pattern) */}
            <PressScale
              onPress={() => { haptic.medium(); openSheet('publish'); }}
              style={[styles.bottomStoryPostBtn, { backgroundColor: colors.brand }]}
              accessibilityLabel="Share story"
              accessibilityHint="Opens publish sheet to share your story"
              scale={0.94}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="paper-plane" size={17} color={colors.textInverse} />
            </PressScale>
          </View>
        </Reanimated.View>
      )}

      {/* â”€â”€ Frame organizer (transient) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* Per Design.md: the frame organizer is a transient surface for
          reorder/duplicate/delete. It opens from the overflow menu or
          long-press on page dots, not as a persistent navigation aid.
          Page dots at the top are the persistent position indicator. */}
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

      {/* â”€â”€ Overflow menu (More) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* Dynamic overflow: renders the actual overflow tools from the active
          context's ToolGroup (Draw, Timeline, Cutout, Animation, etc.) plus
          persistent items (Accessibility, Help) that aren't in the tool
          groups. This replaces the former hardcoded list that ignored the
          ContextToolRail's overflowTools array â€” tools moved to overflow are
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
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceElevated, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl }]} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
            <View style={styles.overflowHeader}>
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
                <View
                  key={section.title}
                  style={[styles.overflowGroup, sectionIndex > 0 && styles.overflowGroupGap]}
                >
                  <Text style={[styles.overflowSectionTitle, { color: colors.textMuted }]}>
                    {section.title}
                  </Text>
                  {section.tools.map((tool) => (
                    <OverflowItem
                      key={tool.id}
                      icon={tool.icon}
                      glyph={tool.glyph}
                      label={tool.label}
                      selected={tool.active}
                      onPress={() => { tool.onPress(); closeSheet(); }}
                    />
                  ))}
                </View>
              ))}
              <View style={[styles.overflowGroup, styles.overflowGroupGap]}>
                <Text style={[styles.overflowSectionTitle, { color: colors.textMuted }]}>Accessibility</Text>
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
              </View>
              <View style={[styles.overflowGroup, styles.overflowGroupGap]}>
                <Text style={[styles.overflowSectionTitle, { color: colors.textMuted }]}>Project</Text>
                <OverflowItem
                  icon="help-circle-outline"
                  label="Help & shortcuts"
                  onPress={() => { openSheet('help'); closeSheet(); }}
                />
              </View>
              {overflowDestructive.length > 0 && (
                <View style={[styles.overflowGroup, styles.overflowGroupGap]}>
                  <Text style={[styles.overflowSectionTitle, { color: colors.textMuted }]}>Advanced editing</Text>
                  {overflowDestructive.map((tool) => (
                    <OverflowItem
                      key={tool.id}
                      icon={tool.icon}
                      glyph={tool.glyph}
                      label={tool.label}
                      danger
                      onPress={() => { tool.onPress(); closeSheet(); }}
                    />
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Sheets ────────────────────────────────────────────────── */}
      <PosterSheetStack
        styles={styles}
        colors={colors}
        bottomInset={insets.bottom}
        haptic={haptic}
        closeSheet={closeSheet}
        openSheet={openSheet}
        manipulationActiveSV={manipulationActiveSV}
        selectedLayerId={selectedLayerId}
        selectedLayer={selectedLayer}
        page={page}
        document={document}
        updateLayer={updateLayer}
        reorderLayer={reorderLayer}
        showPreview={showPreview}
        showLayers={showLayers}
        showPublish={showPublish}
        showSettings={showSettings}
        showHelp={showHelp}
        showA11yMove={showA11yMove}
        showA11yZOrder={showA11yZOrder}
        showTransitions={showTransitions}
        showKeyframes={showKeyframes}
        showSpeedCurve={showSpeedCurve}
        showReverse={showReverse}
        showFreezeFrame={showFreezeFrame}
        showAudioFade={showAudioFade}
        showTextColorPicker={showTextColorPicker}
        showTemplates={showTemplates}
        setShowPreview={setShowPreview}
        currentTransitionId={currentTransitionId}
        handleTransitionSelect={handleTransitionSelect}
        selectedLayerKeyframes={selectedLayerKeyframes}
        handleAddKeyframe={handleAddKeyframe}
        handleUpdateKeyframe={handleUpdateKeyframe}
        handleRemoveKeyframe={handleRemoveKeyframe}
        selectedMediaSpeedCurve={selectedMediaSpeedCurve}
        handleSpeedCurveChange={handleSpeedCurveChange}
        setShowTextColorPicker={setShowTextColorPicker}
        colorRecents={colorRecents}
        commitRecentColor={commitRecentColor}
        cropMode={cropMode}
        setCropMode={setCropMode}
        cutoutPreviewTarget={cutoutPreviewTarget}
        setCutoutPreviewTarget={setCutoutPreviewTarget}
        setShowTemplates={setShowTemplates}
        setDocument={setDocument}
        pickerMode={pickerMode}
        editingLayer={editingLayer}
        backgroundMediaUri={backgroundMediaUri}
        handlePickerClose={handlePickerClose}
        handlePickerAddLayer={handlePickerAddLayer}
        pageMenuIndex={pageMenuIndex}
        pageCount={pageCount}
        setPageMenuIndex={setPageMenuIndex}
        updatePageDuration={updatePageDuration}
        duplicatePage={duplicatePage}
        removePage={removePage}
        reorderPages={reorderPages}
        setActivePageIndex={setActivePageIndex}
        showEffectsSheet={bottomSurface === 'effects'}
        selectedMediaLayer={selectedMediaLayer}
        effectsSourceUri={effectsSourceUri}
        selectedFilterId={selectedFilterId}
        handleEffectFilterSelect={handleEffectFilterSelect}
        autoAdjustActive={autoAdjustActive}
        handleAutoAdjust={handleAutoAdjust}
        currentAdjustments={currentAdjustments}
        handleEffectAdjustChange={handleEffectAdjustChange}
        handleEffectReset={handleEffectReset}
        setBottomSurface={setBottomSurface}
        confirmSheet={confirmSheet}
        setConfirmSheet={setConfirmSheet}
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

// â”€â”€ Screen wrapper â€” wraps in CreatorProvider (shared state) â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // â”€â”€ Crash recovery banner (inline utility notification, not a card) â”€â”€
  // Calm utility: surfaceAlt background + brand left accent. Reads as a
  // quiet system notice, not a premium accent.
  recoveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    paddingTop: 50,
    zIndex: 100,
    backgroundColor: colors.surfaceAlt,
    opacity: 0.8,
    borderLeftWidth: 2,
  },
  recoveryText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    color: colors.textPrimary,
    marginLeft: 8,
  },
  recoveryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  recoveryBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
  },
  recoveryDismiss: {
    padding: 8,
    marginLeft: 4,
  },
  // â”€â”€ Full-screen canvas stage â”€â”€
  canvasStage: {
    ...StyleSheet.absoluteFill,
  },
  // â”€â”€ Filter HUD pill (Instagram/Snapchat swipe-to-filter indicator) â”€â”€
  filterHudPill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.mediaOverlayScrim,
    paddingHorizontal: Space.md,
    paddingVertical: 7,
    borderRadius: RadiusRoleValue.pillAvatar,
    zIndex: 150,
  },
  filterHudText: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    letterSpacing: 1.6,
    color: colors.scrimTextPrimary,
    textAlign: 'center',
  },
  // â”€â”€ Top bar â”€â”€
  topBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topBar: {
    height: 52,
    paddingHorizontal: Space.sm,
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
  doneText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    color: colors.textPrimary,
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
    height: 36,
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingHorizontal: Space.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
  },
  unsavedDot: {
    width: 7,
    height: 7,
    borderRadius: RadiusRoleValue.pillAvatar,
    marginLeft: -Space.xs,
    marginTop: Space.xs + 2,
  },
  // â”€â”€ Frame progress segments (quieter in editor) â”€â”€
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
    backgroundColor: colors.border,
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
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // â”€â”€ Canvas loading overlay â”€â”€
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
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  canvasLoadingText: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
  },
  // â”€â”€ Empty canvas hint â€” authored two-line empty state â”€â”€
  canvasEmptyHint: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 40,
    gap: Space.sm,
  },
  canvasEmptyHintTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    color: colors.textSecondary,
  },
  canvasEmptyHintSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    color: colors.textMuted,
  },
  // â”€â”€ Draft load error overlay â”€â”€
  canvasErrorOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 55,
    gap: Space.xs,
    paddingHorizontal: Space.lg,
  },
  canvasErrorTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    marginTop: Space.sm,
  },
  canvasErrorSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    textAlign: 'center',
  },
  canvasErrorRetry: {
    marginTop: Space.sm,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
  },
  canvasErrorRetryText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
  },
  // â”€â”€ Safe zone overlay â”€â”€
  safeZoneOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 45,
  },
  safeZoneTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.brandSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.brand,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  safeZoneBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.brandSubtle,
    borderTopWidth: 1,
    borderTopColor: colors.brand,
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
    borderColor: colors.brand,
    borderStyle: 'dashed',
  },
  safeZoneLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.mediaOverlayScrim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  safeZoneLabelText: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    letterSpacing: 0.3,
  },
  // â”€â”€ Bottom tool rail (default mode) â”€â”€
  bottomRailContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  bottomRailContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    gap: Space.xs,
    paddingVertical: Space.xs,
    backgroundColor: 'transparent',
  },
  bottomRailGlassDock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.mediaOverlayScrim,
    borderRadius: Radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  frameBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.lg,
    backgroundColor: colors.mediaOverlayScrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  frameCountText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextPrimary,
  },
  bottomStoryPostBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  // â”€â”€ Overflow menu â”€â”€
  overflowContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 220,
    justifyContent: 'flex-end',
  },
  overflowMenu: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  overflowHeader: {
    minHeight: 56,
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.scrimTextTertiary,
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
  // â”€â”€ Overflow groups â€” spacing-only separation, no labels â”€â”€
  overflowGroup: {
    gap: Space.sm,
  },
  overflowGroupGap: {
    marginTop: Space.md,
  },
  overflowSectionTitle: {
    marginLeft: Space.sm,
    marginBottom: Space.xs,
    fontSize: 11,
    letterSpacing: 0.08,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.mediaOverlayScrim,
  },
  // â”€â”€ ContextToolRail inline â”€â”€
  contextRail: {
    flex: 1,
  },
  // â”€â”€ Timeline â”€â”€
  timelineContainer: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    zIndex: 96,
    borderRadius: Radius.lg,
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
    backgroundColor: colors.scrimTextTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineTimecode: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextPrimary,
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
  // â”€â”€ Pinch-to-zoom scroll region â”€â”€
  timelineScrollWrap: {
    position: 'relative',
  },
  timelineScroll: {
    width: '100%',
  },
  timelineContent: {
    // Width is set inline (scaledTrackWidth). Tracks stack vertically
    // (default flexDirection: column) and each fills the content width.
  },
  timelineZoomIndicatorWrap: {
    position: 'absolute',
    top: 2,
    right: Space.xs,
  },
  timelineZoomIndicator: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontVariant: ['tabular-nums'],
  },
  timelineEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  timelineEmptyText: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  timelineEmptyCta: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
  },
  timelineEmptyCtaText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
  },
  // Truthful note for edits the native preview cannot reflect (reverse,
  // freeze-frame). Uses the meta typography scale + secondary text color
  // so it reads as supportive metadata, not a primary label.
  previewNotReflectedNote: {
    marginTop: Space.sm,
    paddingHorizontal: Space.sm,
    textAlign: 'center',
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // â”€â”€ Effects sheet â”€â”€
  effectsSheetScroll: {
    paddingVertical: Space.sm,
  },
  effectsAdjustWrap: {
    marginTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.scrimTextTertiary,
    paddingTop: Space.xs,
  },
  effectsAutoRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
});
}
