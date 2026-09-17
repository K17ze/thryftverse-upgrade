/**
 * PosterTimelineDock — the expandable clip timeline surface of the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no visual or
 * behavioral change). Owns the playback bar (play/pause, timecode,
 * undo/redo, Done), the pinch-to-zoom scrollable track region (time ruler,
 * clip track, overlay track, waveform track, zoom indicator), and the
 * clip-selected TimelineToolbar. Presentational only: all state, gestures,
 * shared values and callbacks arrive as props.
 *
 * PosterTimelineEmptyDock is the sibling empty state ("Add your first
 * clip") shown when the timeline surface is requested but no clips exist.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, type PinchGesture } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import type { AssetPickerMode } from '../../surfaces/CreatorAssetPicker';
import type { useHaptic } from '../../../hooks/useHaptic';
import type { ActiveSheet } from '../useActiveSheet';
import type { PlaybackState } from '../../core/playback';
import {
  TimelineTrack,
  OverlayTrack,
  TimelineToolbar,
  TimelineRuler,
  WaveformTrack,
  formatTimecode,
  type PosterClip,
  type OverlayLayer,
  type TimelineOperation,
} from '../timeline';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The scroll handler produced by `useAnimatedScrollHandler` — matches the
 * `onScroll` prop of Reanimated.ScrollView.
 */
type TimelineScrollHandler = React.ComponentProps<typeof Reanimated.ScrollView>['onScroll'];

/**
 * The subset of the screen's StyleSheet styles the timeline dock renders.
 * The parent passes its full `styles` object; only these keys are read.
 */
export interface PosterTimelineDockStyles {
  timelineContainer: ViewStyle;
  timelinePlaybackBar: ViewStyle;
  timelinePlayBtn: ViewStyle;
  timelineTimecode: TextStyle;
  timelinePlaybackSpacer: ViewStyle;
  timelineUndoRedoBtn: ViewStyle;
  timelineDoneBtn: ViewStyle;
  timelineDoneText: TextStyle;
  timelineScrollWrap: ViewStyle;
  timelineScroll: ViewStyle;
  timelineContent: ViewStyle;
  timelineZoomIndicatorWrap: ViewStyle;
  timelineZoomIndicator: TextStyle;
  timelineOverlayWrap: ViewStyle;
  timelineWaveformWrap: ViewStyle;
  timelineEmptyRow: ViewStyle;
  timelineEmptyText: TextStyle;
  timelineEmptyCta: ViewStyle;
  timelineEmptyCtaText: TextStyle;
}

export interface PosterTimelineDockProps {
  /** Screen styles (the parent's full createStyles() object). */
  styles: PosterTimelineDockStyles;
  /** Theme colors. */
  colors: ThemeColors;
  /** Bottom safe-area inset (positions the dock above home chrome). */
  bottomInset: number;
  screenWidth: number;
  /** Playback snapshot (isPlaying, currentTimeMs) — transport + playhead. */
  playbackState: PlaybackState;
  /** Routes timeline ops (play/pause/seek/trim/split/etc.) to the document. */
  handleTimelineOperation: (op: TimelineOperation) => void;
  handleUndo: () => void;
  canUndo: boolean;
  undoLabel: string | null;
  handleRedo: () => void;
  canRedo: boolean;
  redoLabel: string | null;
  /** Collapses the timeline back to the tool rail ("Done returns to canvas tools"). */
  handleTimelineDone: () => void;
  /** Two-finger pinch zoom gesture (UI-thread scale preview). */
  timelinePinchGesture: PinchGesture;
  /** Animated ref on the track ScrollView (UI-thread edge auto-scroll). */
  timelineScrollRef: AnimatedRef<ScrollView>;
  /** Committed zoom scale (drives scrollEnabled + the indicator text). */
  timelineZoomScale: number;
  /** UI-thread scroll handler feeding timelineScrollXSV. */
  timelineScrollHandler: TimelineScrollHandler;
  /** Committed track width in px (base × zoom). */
  scaledTrackWidth: number;
  /** Live scaleX preview style during the pinch gesture. */
  timelineContentAnimStyle: ReturnType<typeof useAnimatedStyle>;
  /** Zoom indicator fade style. */
  zoomIndicatorAnimStyle: ReturnType<typeof useAnimatedStyle>;
  timelineTotalDurationMs: number;
  /** UI-thread ruler-scrub position in ms (>= 0 active, -1 idle). */
  timelineScrubMsSV: SharedValue<number>;
  /** UI-thread horizontal scroll offset for edge auto-scroll. */
  timelineScrollXSV: SharedValue<number>;
  timelineClips: PosterClip[];
  /** Which page each clip originated from (clip → pageIndex). */
  clipPageIndices: number[];
  /** Transition preset IDs for each clip boundary. */
  clipTransitionIds: (string | null)[];
  /** Clip-anchored overlay resolution (timed overlay layers). */
  timelineOverlays: OverlayLayer[];
  /** The PosterClip matching the transient selectedClipId, or null. */
  selectedClip: PosterClip | null;
  selectedClipId: string | null;
  selectedOverlayId: string | null;
  setSelectedClipId: (id: string | null) => void;
  setSelectedOverlayId: (id: string | null) => void;
  activePageIndex: number;
  setActivePageIndex: (index: number) => void;
  /** Navigates to a clip boundary's source page and opens transitions. */
  handleTimelineTransitionTap: (boundaryIndex: number) => void;
  hasAudioContent: boolean;
  audioUri: string | undefined;
  haptic: Haptic;
  /** Opens a mutually-exclusive sheet (speed curve editor). */
  openSheet: (sheet: Exclude<ActiveSheet, null>) => void;
  /** Toggles `locked` on the media layer owning a clip. */
  toggleClipLock: (clipId: string) => void;
}

export interface PosterTimelineEmptyDockProps {
  /** Screen styles (the parent's full createStyles() object). */
  styles: PosterTimelineDockStyles;
  /** Theme colors. */
  colors: ThemeColors;
  /** Bottom safe-area inset. */
  bottomInset: number;
  /** Haptic engine (light on the Add CTA). */
  haptic: Haptic;
  /** Opens the media asset picker. */
  setPickerMode: (mode: AssetPickerMode | null) => void;
}

export function PosterTimelineDock({
  styles,
  colors,
  bottomInset,
  screenWidth,
  playbackState,
  handleTimelineOperation,
  handleUndo,
  canUndo,
  undoLabel,
  handleRedo,
  canRedo,
  redoLabel,
  handleTimelineDone,
  timelinePinchGesture,
  timelineScrollRef,
  timelineZoomScale,
  timelineScrollHandler,
  scaledTrackWidth,
  timelineContentAnimStyle,
  zoomIndicatorAnimStyle,
  timelineTotalDurationMs,
  timelineScrubMsSV,
  timelineScrollXSV,
  timelineClips,
  clipPageIndices,
  clipTransitionIds,
  timelineOverlays,
  selectedClip,
  selectedClipId,
  selectedOverlayId,
  setSelectedClipId,
  setSelectedOverlayId,
  activePageIndex,
  setActivePageIndex,
  handleTimelineTransitionTap,
  hasAudioContent,
  audioUri,
  haptic,
  openSheet,
  toggleClipLock,
}: PosterTimelineDockProps) {
  return (
    <View
      style={[
        styles.timelineContainer,
        { bottom: bottomInset },
      ]}
    >
      {/* Solid surface material + top hairline */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} />
      {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Playback bar ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
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

        {/* Done ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â collapses the timeline, returns to canvas tools */}
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

      {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Pinch-to-zoom + horizontally scrollable tracks ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
          A GestureDetector (Pinch) wraps a horizontal ScrollView. All
          tracks share the same scaledTrackWidth so clip, ruler, overlay,
          waveform and playhead scale together. During the pinch an
          animated scaleX (left-anchored via transformOrigin) previews
          the zoom on the UI thread; on gesture end the scale commits to
          state and the real layout takes over. Pinch (2 fingers) and
          horizontal scroll (1 finger) coexist naturally. */}
      <GestureDetector gesture={timelinePinchGesture}>
        <View style={styles.timelineScrollWrap}>
          <Reanimated.ScrollView
            ref={timelineScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={timelineZoomScale > 1}
            onScroll={timelineScrollHandler}
            scrollEventThrottle={16}
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
              {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Time ruler (above the clip track) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
              <TimelineRuler
                totalDurationMs={timelineTotalDurationMs}
                trackWidth={scaledTrackWidth}
                onSeek={(ms) => handleTimelineOperation({ type: 'seek', ms })}
                scrubMsSV={timelineScrubMsSV}
              />

              {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Clip track ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
              <TimelineTrack
                clips={timelineClips}
                selectedClipId={selectedClipId}
                playheadMs={playbackState.currentTimeMs}
                totalDurationMs={timelineTotalDurationMs}
                scrubMsSV={timelineScrubMsSV}
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
                onTrimClip={(clipId, edge, deltaMs) =>
                  handleTimelineOperation({ type: 'trim', clipId, edge, deltaMs })
                }
                onSlipClip={(clipId, deltaMs) =>
                  handleTimelineOperation({ type: 'slip', clipId, deltaMs })
                }
                transitionIds={clipTransitionIds}
                onSelectTransition={handleTimelineTransitionTap}
                edgeScroll={{ scrollRef: timelineScrollRef, scrollXSV: timelineScrollXSV, viewportWidth: screenWidth }}
                onReorderClip={(clipId, translationX) => {
                  // Resolve the drop index against CUMULATIVE clip
                  // boundaries — clip widths are proportional to duration,
                  // so dividing by the dragged clip's own width miscounts
                  // across variable-width clips. The dragged clip's center
                  // is placed at (its start edge + translation); the target
                  // slot is whichever clip boundary range contains it.
                  const fromIndex = timelineClips.findIndex((c) => c.id === clipId);
                  if (fromIndex < 0) return;
                  const pxPerMs = scaledTrackWidth > 0 && timelineTotalDurationMs > 0
                    ? scaledTrackWidth / timelineTotalDurationMs
                    : 0;
                  const widthOf = (i: number) =>
                    Math.max(24, timelineClips[i].durationMs * pxPerMs - 8);
                  let startEdge = 0;
                  for (let i = 0; i < fromIndex; i++) startEdge += widthOf(i);
                  const droppedCenter = startEdge + widthOf(fromIndex) / 2 + translationX;
                  let acc = 0;
                  let toIndex = timelineClips.length - 1;
                  for (let i = 0; i < timelineClips.length; i++) {
                    acc += widthOf(i);
                    if (droppedCenter < acc) { toIndex = i; break; }
                  }
                  toIndex = Math.max(0, Math.min(timelineClips.length - 1, toIndex));
                  if (toIndex !== fromIndex) {
                    handleTimelineOperation({ type: 'reorder', fromIndex, toIndex });
                  }
                }}
              />

              {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Overlay track (if overlays exist) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
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

              {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Waveform track (audio present) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
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
          </Reanimated.ScrollView>

          {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Zoom indicator ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â fades in on pinch, out after release ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
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

      {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Timeline toolbar (clip selected) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
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
          isLocked={!!selectedClip.locked}
          onToggleLock={() => toggleClipLock(selectedClip.id)}
        />
      )}
    </View>
  );
}

export function PosterTimelineEmptyDock({
  styles,
  colors,
  bottomInset,
  haptic,
  setPickerMode,
}: PosterTimelineEmptyDockProps) {
  return (
    <View style={[styles.timelineContainer, { bottom: bottomInset }]}>
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
  );
}
