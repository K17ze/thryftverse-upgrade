import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
  scrollTo,
  type SharedValue,
} from 'react-native-reanimated';
import { Space, FontFamily, Radius, Typography } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { formatTimecode, type PosterClip } from './TimelineTypes';

// ───────────────────────────────────────────────────────────────────────────
// ClipThumb — a single clip thumbnail on the timeline track.
//
// Width is proportional to the clip's (speed-adjusted) duration. The
// thumbnail fills the 64pt track height. When selected, a 2pt brand border
// (selection stroke grammar) wraps the clip and trim handles appear on the
// left/right edges. A duration label overlays the bottom edge.
//
// Trim gestures are 1:1 and UI-thread driven: a SharedValue accumulates the
// pixel delta and an animated style resizes the clip visually in the
// worklet. The parent mutation (onTrimCommit) fires once on gesture end —
// never per frame.
// ───────────────────────────────────────────────────────────────────────────

const CLIP_HEIGHT = 64;
const TRIM_HANDLE_WIDTH = 14;
const TRIM_HIT_WIDTH = 44;

export interface ClipThumbProps {
  clip: PosterClip;
  width: number;
  isSelected: boolean;
  onPress: () => void;
  /** Fired once when a trim gesture ends, with the total delta in ms. */
  onTrimCommit?: (edge: 'start' | 'end', deltaMs: number) => void;
  /**
   * Fired once when a slip drag ends, with the source-window shift in
   * source ms. Slip moves trimStart/trimEnd together — the clip's
   * wall-clock duration is unchanged while a different section of the
   * source plays. Only offered on selected video clips with headroom.
   */
  onSlipCommit?: (deltaMs: number) => void;
  /**
   * Index of this clip in the timeline. Used for drag-to-reorder.
   * When provided, a long-press + horizontal pan initiates a reorder drag.
   */
  clipIndex?: number;
  /**
   * Fired when a reorder drag ends. `translationX` is the total horizontal
   * drag delta in pixels (relative to the clip's original position).
   * The parent computes the target index from this delta.
   */
  onDragReorder?: (clipId: string, translationX: number) => void;
  /**
   * Edge auto-scroll plumbing (flagship editor behavior — CapCut/Edits/
   * Snap all scroll the track when a trim handle or reorder drag reaches
   * the viewport edge). `scrollRef` must be a Reanimated `useAnimatedRef`
   * on the timeline ScrollView; `scrollXSV` tracks its content offset via
   * `useAnimatedScrollHandler`; `viewportWidth` is the visible track width.
   * Consumed entirely on the UI thread inside the pan worklets — no JS hop.
   */
  edgeScroll?: {
    /** `useAnimatedRef` result — typed loosely here; cast at the scrollTo call. */
    scrollRef: unknown;
    scrollXSV: SharedValue<number>;
    viewportWidth: number;
  };
}

const DRAG_LIFT_SCALE = 1.06;
const DRAG_LONG_PRESS_MS = 300;
/** Distance from the viewport edge (px) where auto-scroll engages. */
const EDGE_SCROLL_ZONE = 44;
/** Scroll step per gesture frame while in the edge zone (px). */
const EDGE_SCROLL_STEP = 16;

export const ClipThumb = React.memo(function ClipThumb({
  clip,
  width,
  isSelected,
  onPress,
  onTrimCommit,
  onSlipCommit,
  clipIndex,
  onDragReorder,
  edgeScroll,
}: ClipThumbProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const trackWidthSV = useSharedValue(width);
  const [isPressed, setIsPressed] = useState(false);

  // ── Trim visual feedback (UI thread) ────────────────────────────────
  // Accumulates the pixel delta during a trim drag. The animated style
  // reads this on the UI thread to resize the clip 1:1 with the finger.
  // Reset to 0 on gesture end after committing the delta to the parent.
  const trimDeltaSV = useSharedValue(0);

  // ── Reorder drag state (UI thread) ──────────────────────────────────
  // dragXSV accumulates the horizontal translation during a reorder drag.
  // isDraggingSV drives the lift animation (scale + elevation). Both are
  // UI-thread only; the parent is notified once on gesture end.
  const dragXSV = useSharedValue(0);
  const isDraggingSV = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const canDrag = onDragReorder != null && clipIndex != null && !clip.locked;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthSV.value = e.nativeEvent.layout.width;
  }, [trackWidthSV]);

  // Convert a pixel delta to a millisecond delta using the clip's own
  // pixel-per-ms ratio. Used only on gesture end (in the worklet) to
  // compute the final committed delta.
  const pxToMs = useCallback((px: number) => {
    if (width <= 0 || clip.durationMs <= 0) return 0;
    return (px / width) * clip.durationMs;
  }, [width, clip.durationMs]);

  // ── Slip gesture state ──────────────────────────────────────────────
  // Slip shifts the source window [trimStart, trimEnd] without changing
  // wall-clock duration — a different section of media plays in the same
  // slot. The window is bounded by the source duration, so we convert
  // pixels to SOURCE ms (the window span), not speed-adjusted ms.
  const sourceWindowMs = clip.trimEndMs - clip.trimStartMs;
  const sourceDurationMs = clip.sourceDurationMs ?? 0;
  // Headroom on each side in source ms — used to clamp the worklet drag
  // so the visual preview can never imply media that doesn't exist.
  const slipHeadStartMs = clip.trimStartMs;
  const slipHeadEndMs = Math.max(0, sourceDurationMs - clip.trimEndMs);
  const canSlip =
    onSlipCommit != null
    && clip.mediaType === 'video'
    && !clip.locked
    && sourceDurationMs > sourceWindowMs + 1;

  const slipDeltaSV = useSharedValue(0); // px, clamped to available headroom

  // ── Trim gestures ───────────────────────────────────────────────────
  // Each gesture accumulates the pixel delta in trimDeltaSV on the UI
  // thread. The animated style resizes the clip visually. On end, the
  // accumulated delta is converted to ms and committed once.
  const startTrimGesture = React.useMemo(() =>
    Gesture.Pan()
      .minDistance(3)
      .onBegin(() => {
        'worklet';
        trimDeltaSV.value = 0;
      })
      .onChange((e) => {
        'worklet';
        // Dragging the start handle left = wider clip (earlier trim start).
        trimDeltaSV.value += -e.changeX;
        if (edgeScroll) {
          if (e.absoluteX < EDGE_SCROLL_ZONE) {
            scrollTo(edgeScroll.scrollRef as Parameters<typeof scrollTo>[0], Math.max(0, edgeScroll.scrollXSV.value - EDGE_SCROLL_STEP), 0, false);
          } else if (e.absoluteX > edgeScroll.viewportWidth - EDGE_SCROLL_ZONE) {
            scrollTo(edgeScroll.scrollRef as Parameters<typeof scrollTo>[0], edgeScroll.scrollXSV.value + EDGE_SCROLL_STEP, 0, false);
          }
        }
      })
      .onEnd(() => {
        'worklet';
        const deltaMs = pxToMs(trimDeltaSV.value);
        if (onTrimCommit) runOnJS(onTrimCommit)('start', deltaMs);
        runOnJS(haptic.light)();
        trimDeltaSV.value = 0;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pxToMs, onTrimCommit, haptic, trimDeltaSV, edgeScroll]
  );

  const endTrimGesture = React.useMemo(() =>
    Gesture.Pan()
      .minDistance(3)
      .onBegin(() => {
        'worklet';
        trimDeltaSV.value = 0;
      })
      .onChange((e) => {
        'worklet';
        // Dragging the end handle right = wider clip (later trim end).
        trimDeltaSV.value += e.changeX;
        if (edgeScroll) {
          if (e.absoluteX > edgeScroll.viewportWidth - EDGE_SCROLL_ZONE) {
            scrollTo(edgeScroll.scrollRef as Parameters<typeof scrollTo>[0], edgeScroll.scrollXSV.value + EDGE_SCROLL_STEP, 0, false);
          } else if (e.absoluteX < EDGE_SCROLL_ZONE) {
            scrollTo(edgeScroll.scrollRef as Parameters<typeof scrollTo>[0], Math.max(0, edgeScroll.scrollXSV.value - EDGE_SCROLL_STEP), 0, false);
          }
        }
      })
      .onEnd(() => {
        'worklet';
        const deltaMs = pxToMs(trimDeltaSV.value);
        if (onTrimCommit) runOnJS(onTrimCommit)('end', deltaMs);
        runOnJS(haptic.light)();
        trimDeltaSV.value = 0;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pxToMs, onTrimCommit, haptic, trimDeltaSV, edgeScroll]
  );

  // ── Slip gesture (dedicated chip, selected video clips only) ────────
  // A small centered ⇔ affordance on the selected clip — an unambiguous
  // slip target that can't be confused with tap-to-select, trim handles,
  // or long-press reorder. The drag shifts the source window: thumbnail
  // translates opposite the finger (content slides under a fixed window),
  // clamped to real headroom so the preview never implies phantom media.
  const slipGesture = React.useMemo(() => {
    if (!canSlip || width <= 0 || sourceWindowMs <= 0) return null;
    // Headroom in px: source-ms headroom mapped through the clip's
    // source-window scale.
    const msPerPx = sourceWindowMs / width;
    const minPx = -slipHeadStartMs / msPerPx;
    const maxPx = slipHeadEndMs / msPerPx;
    return Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-14, 14])
      // Visible chip is 40x22; extend the touch target to ~46pt vertical
      // so the control meets the 44pt minimum without growing the chrome.
      .hitSlop({ top: 12, bottom: 12, left: 4, right: 4 })
      .onBegin(() => {
        'worklet';
        slipDeltaSV.value = 0;
      })
      .onChange((e) => {
        'worklet';
        slipDeltaSV.value = Math.max(
          minPx,
          Math.min(maxPx, slipDeltaSV.value + e.changeX),
        );
      })
      .onEnd(() => {
        'worklet';
        const deltaMs = (slipDeltaSV.value / width) * sourceWindowMs;
        if (onSlipCommit && Math.abs(deltaMs) > 1) runOnJS(onSlipCommit)(deltaMs);
        runOnJS(haptic.light)();
        slipDeltaSV.value = 0;
      })
      .onFinalize(() => {
        'worklet';
        slipDeltaSV.value = 0;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSlip, width, sourceWindowMs, slipHeadStartMs, slipHeadEndMs, onSlipCommit, haptic, slipDeltaSV]);

  // The thumbnail slides opposite the finger while slipping — the clip
  // rect is the fixed window, the media moves beneath it.
  const slipThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -slipDeltaSV.value }],
  }));

  // ── Reorder drag gesture (long-press + horizontal pan) ─────────────
  // Snapchat-style direct manipulation: long-press lifts the clip, then a
  // horizontal drag reorders it. The lift (scale + opacity) is UI-thread
  // driven via isDraggingSV. The parent is notified once on gesture end
  // with the total horizontal translation; the parent computes the target
  // index from the cumulative clip widths.
  const reorderGesture = React.useMemo(() => {
    if (!canDrag) return null;
    return Gesture.Pan()
      .activateAfterLongPress(DRAG_LONG_PRESS_MS)
      .minDistance(6)
      .onStart(() => {
        'worklet';
        isDraggingSV.value = withSpring(1, { damping: 18, stiffness: 220 });
        dragStartX.value = dragXSV.value;
      })
      .onChange((e) => {
        'worklet';
        dragXSV.value = dragStartX.value + e.translationX;
        if (edgeScroll) {
          if (e.absoluteX > edgeScroll.viewportWidth - EDGE_SCROLL_ZONE) {
            scrollTo(edgeScroll.scrollRef as Parameters<typeof scrollTo>[0], edgeScroll.scrollXSV.value + EDGE_SCROLL_STEP, 0, false);
          } else if (e.absoluteX < EDGE_SCROLL_ZONE) {
            scrollTo(edgeScroll.scrollRef as Parameters<typeof scrollTo>[0], Math.max(0, edgeScroll.scrollXSV.value - EDGE_SCROLL_STEP), 0, false);
          }
        }
      })
      .onEnd(() => {
        'worklet';
        const totalDelta = dragXSV.value;
        isDraggingSV.value = withSpring(0, { damping: 18, stiffness: 220 });
        dragXSV.value = 0;
        if (onDragReorder) runOnJS(onDragReorder)(clip.id, totalDelta);
        runOnJS(haptic.light)();
      })
      .onFinalize(() => {
        'worklet';
        // Ensure drag state resets if gesture is interrupted/cancelled.
        isDraggingSV.value = 0;
        dragXSV.value = 0;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDrag, onDragReorder, clip.id, haptic, isDraggingSV, dragXSV, dragStartX, edgeScroll]);

  // ── Animated clip width (UI thread) ─────────────────────────────────
  // For end trim: width grows/shrinks from the right edge.
  // For start trim: width grows/shrinks and the clip translates to keep
  // the right edge stable (left edge moves).
  // During a reorder drag, the clip lifts (scale + opacity) and follows
  // the finger horizontally without resizing.
  const clipAnimStyle = useAnimatedStyle(() => {
    if (isDraggingSV.value > 0.01) {
      return {
        width: Math.max(24, width),
        transform: [
          { translateX: dragXSV.value },
          { scale: 1 + (DRAG_LIFT_SCALE - 1) * isDraggingSV.value },
        ],
        opacity: 1 - 0.25 * isDraggingSV.value,
        zIndex: 100,
      };
    }
    const visualWidth = width + trimDeltaSV.value;
    return {
      width: Math.max(24, visualWidth),
      transform: [{ translateX: -Math.max(0, trimDeltaSV.value) }],
    };
  });

  const uri = clip.thumbnailUri || clip.sourceUri;

  // ── Metadata badges ─────────────────────────────────────────────────
  const showSpeed = clip.speed !== 1;
  const showReversed = clip.reversed;
  const showFreeze = clip.freezeFrameMs != null;
  const showVolume = clip.volume !== 1;
  const showMuted = clip.volume === 0;
  const hasAudio = clip.mediaType === 'video';
  const showAudioBadge = hasAudio && (showMuted || showVolume);
  const hasBadges = showSpeed || showReversed || showFreeze || showAudioBadge;
  // Still-image clips have no source window to trim — their segment length
  // is the authored page hold time. Only video clips expose trim handles.
  // Locked clips suppress trim handles entirely (Edits clip-lock parity):
  // the timeline op router would reject the commit anyway, so showing the
  // handles would advertise an action that cannot succeed.
  const canTrim = clip.mediaType !== 'image' && !clip.locked;

  const clipContent = (
    <Reanimated.View
      onLayout={handleLayout}
      accessibilityLabel={`Clip, ${formatTimecode(clip.durationMs)}`}
      accessibilityRole="button"
      style={[
        clipAnimStyle,
        {
          height: CLIP_HEIGHT,
        },
      ]}
    >
      <Pressable
        onPress={() => { haptic.selection(); onPress(); }}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        accessibilityLabel={`Clip, ${formatTimecode(clip.durationMs)}`}
        accessibilityRole="button"
        style={[
          clipStyles.container,
          {
            width: '100%',
            height: '100%',
            borderColor: isSelected ? colors.brand : colors.border,
            borderWidth: isSelected ? 2 : 1,
            backgroundColor: colors.surface,
            opacity: isPressed ? 0.8 : 1,
          },
        ]}
      >
        <Reanimated.View style={[clipStyles.thumbWrap, slipThumbStyle]}>
          <ExpoImage
            source={{ uri }}
            style={clipStyles.thumb}
            contentFit="cover"
            recyclingKey={clip.id}
            placeholder={colors.surfaceAlt}
            transition={300}
          />
        </Reanimated.View>
        {/* Subtle scrim so the duration label stays legible over any media. */}
        <View style={[clipStyles.scrim, { backgroundColor: colors.mediaOverlayScrim }]} />
        {width > 60 && (
          <Text style={[clipStyles.durationLabel, { color: colors.scrimTextPrimary }]} numberOfLines={1}>
            {formatTimecode(clip.durationMs)}
          </Text>
        )}

        {clip.locked && width > 44 && (
          <View style={clipStyles.badgeRow} accessibilityLabel="Clip locked">
            <View style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="lock-closed" size={10} color={colors.textPrimary} />
            </View>
          </View>
        )}
        {width > 80 && hasBadges && (
          <View style={[clipStyles.badgeRow, clip.locked && { top: Space.xs + 14 }]}>
            {showSpeed && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel={`Speed ${clip.speed}x`}
              >
                <Text style={[clipStyles.badgeText, { color: colors.textPrimary }]}>
                  {clip.speed}x
                </Text>
              </View>
            )}
            {showReversed && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel="Reversed playback"
              >
                <Ionicons name="play-skip-back" size={10} color={colors.textPrimary} />
              </View>
            )}
            {showFreeze && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel="Freeze frame"
              >
                <Ionicons name="snow" size={10} color={colors.textPrimary} />
              </View>
            )}
            {showMuted && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel="Audio muted"
              >
                <Ionicons name="volume-mute" size={10} color={colors.textPrimary} />
              </View>
            )}
            {showAudioBadge && !showMuted && (
              <View
                style={[clipStyles.badge, { backgroundColor: colors.surfaceAlt }]}
                accessibilityLabel={`Volume ${Math.round(clip.volume * 100)} percent`}
              >
                <Ionicons name="volume-medium" size={10} color={colors.textPrimary} />
              </View>
            )}
          </View>
        )}

        {isSelected && canSlip && slipGesture && width > 72 && (
          <GestureDetector gesture={slipGesture}>
            <View
              style={[
                clipStyles.slipChip,
                { backgroundColor: colors.mediaOverlayScrim },
              ]}
              accessibilityLabel="Slip clip source window"
              accessibilityRole="adjustable"
              accessibilityHint="Drag left or right to change which part of the source media plays"
            >
              <Ionicons name="swap-horizontal" size={14} color={colors.scrimTextPrimary} />
            </View>
          </GestureDetector>
        )}
        {isSelected && onTrimCommit && canTrim && (
          <View style={clipStyles.trimHitStart}>
            <GestureDetector gesture={startTrimGesture}>
              <View
                style={[clipStyles.trimHandle, clipStyles.trimHandleStart, { backgroundColor: colors.brand }]}
                accessibilityLabel="Trim start"
                accessibilityRole="adjustable"
              />
            </GestureDetector>
          </View>
        )}
        {isSelected && onTrimCommit && canTrim && (
          <View style={clipStyles.trimHitEnd}>
            <GestureDetector gesture={endTrimGesture}>
              <View
                style={[clipStyles.trimHandle, clipStyles.trimHandleEnd, { backgroundColor: colors.brand }]}
                accessibilityLabel="Trim end"
                accessibilityRole="adjustable"
              />
            </GestureDetector>
          </View>
        )}
      </Pressable>
    </Reanimated.View>
  );

  if (reorderGesture) {
    return (
      <GestureDetector gesture={reorderGesture}>
        {clipContent}
      </GestureDetector>
    );
  }
  return clipContent;
});

const CLIP_GAP = Space.xxs; // 1pt-ish gap between clips (see TimelineTrack)

const clipStyles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: RadiusRoleValue.mediaThumbnail,
    overflow: 'hidden',
    marginRight: CLIP_GAP,
  },
  thumbWrap: {
    width: '100%',
    height: '100%',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  slipChip: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -11,
    width: 40,
    height: 22,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 20,
  },
  durationLabel: {
    position: 'absolute',
    left: Space.xs,
    bottom: 3,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontVariant: ['tabular-nums'],
  },
  trimHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: TRIM_HANDLE_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trimHitStart: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: TRIM_HIT_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trimHitEnd: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: TRIM_HIT_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trimHandleStart: {
    left: 0,
    borderTopLeftRadius: RadiusRoleValue.mediaThumbnail,
    borderBottomLeftRadius: RadiusRoleValue.mediaThumbnail,
  },
  trimHandleEnd: {
    right: 0,
    borderTopRightRadius: RadiusRoleValue.mediaThumbnail,
    borderBottomRightRadius: RadiusRoleValue.mediaThumbnail,
  },
  badgeRow: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    flexDirection: 'row',
    gap: Space.xxs,
  },
  badge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: FontFamily.semibold,
    fontSize: Typography.size.micro,
    lineHeight: 12,
  },
});
