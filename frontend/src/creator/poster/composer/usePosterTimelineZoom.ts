/**
 * usePosterTimelineZoom — timeline zoom / scroll / follow cluster for
 * the Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the pinch-to-zoom shared values + gesture, the zoom
 * indicator, the edge auto-scroll ref/handler, the playhead-follow and
 * session-persistence hook wiring, the clip-under-playhead derivation,
 * the timeline-visibility flag, and the auto-expand effect that opens
 * the timeline when video or a second clip appears.
 */
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { ScrollView } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedScrollHandler,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

import { Space } from '../../../theme/designTokens';
import { Motion } from '../../../theme/motionTokens';
import type { CreatorDocument } from '../../core/projectStore/composition';
import type { PlaybackState, ProjectedTimeline } from '../../core/playback';
import { usePosterSession } from '../usePosterSession';
import { usePosterPlayheadFollow } from '../usePosterPlayheadFollow';
import { buildTimelinePinchGesture } from './posterGestures';
import { findCanvasActiveClip } from './posterDerived';
import type { PosterBottomSurface } from './usePosterComposerUiState';

const ZOOM_INDICATOR_HIDE_DELAY_MS = 700;

export interface UsePosterTimelineZoomInput {
  /** The composition document. */
  document: CreatorDocument;
  /** The active page index (from CreatorContext). */
  activePageIndex: number;
  /** The selected layer id (from CreatorContext). */
  selectedLayerId: string | null;
  /** Setter for the active page index (from CreatorContext). */
  setActivePageIndex: (index: number) => void;
  /** Resets the selected layer (from CreatorContext.selectLayer). */
  selectLayer: (id: string | null) => void;
  /** Playback snapshot (from usePosterPlayback). */
  playbackState: PlaybackState;
  /** The projected timeline (from usePosterPlayback via usePosterTimeline). */
  projectedTimeline: ProjectedTimeline;
  /** Sum of all clip durations (speed-adjusted). */
  timelineTotalDurationMs: number;
  /** Number of projected timeline clips. */
  timelineClipCount: number;
  /** Whether any page carries video media. */
  hasVideoContent: boolean;
  /** The active bottom surface. */
  bottomSurface: PosterBottomSurface;
  /** Setter for the bottom surface. */
  setBottomSurface: Dispatch<SetStateAction<PosterBottomSurface>>;
  /** Setter for the user-requested-timeline flag. */
  setUserRequestedTimeline: Dispatch<SetStateAction<boolean>>;
  /** Viewport width in px. */
  screenWidth: number;
}

export function usePosterTimelineZoom({
  document,
  activePageIndex,
  selectedLayerId,
  setActivePageIndex,
  selectLayer,
  playbackState,
  projectedTimeline,
  timelineTotalDurationMs,
  timelineClipCount,
  hasVideoContent,
  bottomSurface,
  setBottomSurface,
  setUserRequestedTimeline,
  screenWidth,
}: UsePosterTimelineZoomInput) {
  // The clip under the playhead — passed to CreatorCanvas so the media
  // layer can resolve clip-relative time (timed overlays, adjustment
  // scopes, audio fades) and activate the freeze-frame preview. Falls
  // back to the active page's clip when the playhead sits in a gap.
  const canvasActiveClip = useMemo(
    () => findCanvasActiveClip({ playbackState, projectedTimeline, document, activePageIndex }),
    [playbackState, projectedTimeline, document, activePageIndex],
  );

  // Timeline visibility (spec: one bottom surface at a time). The
  // timeline is the bottom surface when bottomSurface === 'timeline'. It
  // replaces the tool rail — never stacks on top of it. The tool rail is
  // only rendered when bottomSurface === 'tools', and the effects sheet
  // only when bottomSurface === 'effects'.
  const shouldShowTimeline = bottomSurface === 'timeline' && timelineClipCount > 0;

  // ── Timeline pinch-to-zoom (CapCut parity) ─────────────────────────
  // A two-finger pinch scales the timeline's pixels-per-ms so every track
  // (clip, ruler, overlay, waveform, playhead) expands/contracts together.
  // The live scale lives in a Reanimated shared value so the visual
  // transform runs on the UI thread — no React re-render per frame. The
  // scale is committed to React state only when the gesture ends, which
  // updates the ScrollView content width and the trackWidth props so the
  // real layout matches the preview. Clamped to 0.5x–4x.
  //
  // Source-of-truth: all tracks already derive their geometry from the
  // track width they receive or measure, so scaling the content width at
  // the parent scales every child uniformly — no per-child scale prop
  // needed (that would double-scale and break the playhead/trim math).
  const [timelineZoomScale, setTimelineZoomScale] = useState(1);
  const zoomIndicatorOpacitySV = useSharedValue(0);
  // UI-thread shared values for pinch-zoom. timelineScaleSV mirrors the
  // committed timelineZoomScale but updates on the UI thread during the
  // pinch gesture; pinchBaseScaleSV captures the scale at pinch begin so
  // the gesture is relative to the starting zoom (not absolute).
  const timelineScaleSV = useSharedValue(1);
  const pinchBaseScaleSV = useSharedValue(1);
  // UI-thread ruler-scrub position in ms (>= 0 while the ruler pan is
  // active, -1 idle). The Playhead reads it for 1:1 line tracking.
  const timelineScrubMsSV = useSharedValue(-1);
  // Edge auto-scroll: animated ref + offset tracker for the timeline
  // ScrollView. ClipThumb pan worklets call scrollTo() directly on the
  // UI thread when a trim handle or reorder drag reaches the viewport
  // edge — no JS hop, matches CapCut/Edits edge-scroll behavior.
  const timelineScrollRef = useAnimatedRef<ScrollView>();
  const timelineScrollXSV = useSharedValue(0);
  const timelineScrollHandler = useAnimatedScrollHandler((e) => {
    timelineScrollXSV.value = e.contentOffset.x;
  });


  const timelineBaseTrackWidth = screenWidth - Space.md * 2;
  const scaledTrackWidth = timelineBaseTrackWidth * timelineZoomScale;

  usePosterPlayheadFollow({
    playbackState,
    scaledTrackWidth,
    timelineTotalDurationMs,
    screenWidth,
    timelineScrollXSV,
    timelineScrollRef,
  });

  // Session-state persistence & restoration (usePosterSession). Persists
  // active page, selected layer, and timeline zoom to AsyncStorage
  // (debounced 500ms) and restores them on mount or when a different
  // document is loaded.
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

  // Pinch activates instantly by default (two fingers down → gesture
  // begins) and coexists with the ScrollView's one-finger horizontal pan —
  // pinch is a distinct two-finger gesture so the two never compete.
  const timelinePinchGesture = useMemo(
    () =>
      buildTimelinePinchGesture({
        pinchBaseScaleSV,
        timelineScaleSV,
        showZoomIndicator,
        fadeZoomIndicator,
        setTimelineZoomScale,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showZoomIndicator, fadeZoomIndicator],
  );

  // Live preview: during the pinch the content is visually scaled from the
  // committed scale to the shared-value scale, anchored at the left edge
  // (transformOrigin top-left) so the timeline grows from its start. On
  // commit the real layout takes over and the transform resets to 1x — no
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

  // ── Auto-expand timeline when video or second clip is added ────────
  // When the composition transitions from single-photo to video or
  // multi-clip, the timeline auto-expands without requiring a user tap.
  // This sets bottomSurface to 'timeline' so the tool rail is replaced
  // (not stacked underneath) — one bottom surface at a time.
  useEffect(() => {
    if (hasVideoContent || timelineClipCount > 1) {
      setUserRequestedTimeline(true);
      setBottomSurface('timeline');
    }
  }, [hasVideoContent, timelineClipCount, setUserRequestedTimeline, setBottomSurface]);

  return {
    canvasActiveClip,
    shouldShowTimeline,
    timelineZoomScale,
    timelineScaleSV,
    pinchBaseScaleSV,
    timelineScrubMsSV,
    timelineScrollRef,
    timelineScrollXSV,
    timelineScrollHandler,
    scaledTrackWidth,
    timelinePinchGesture,
    timelineContentAnimStyle,
    zoomIndicatorAnimStyle,
  };
}

export type PosterTimelineZoom = ReturnType<typeof usePosterTimelineZoom>;
